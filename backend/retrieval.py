"""Hybrid retrieval: dense (TF-IDF) + lexical (BM25), fused with Reciprocal Rank Fusion.

Why hybrid: dense vectors capture semantic overlap; BM25 captures exact-term matches
(critical for regulated docs full of specific terms like "debt-to-income"). Fusing them
beats either alone — and the eval (`/evals`) reports recall@k for dense-only vs hybrid so
the improvement is measured, not asserted.

Dependency-light on purpose (numpy + rank-bm25 only) so it runs on a 512MB free tier with
no torch/model download. The EmbeddingBackend is pluggable: set EMBEDDINGS_PROVIDER=openai
(or voyage) to swap the local TF-IDF vectors for dense API embeddings without touching the
rest of the system.
"""
from __future__ import annotations
import math
import os
import re
from dataclasses import dataclass

import numpy as np
from rank_bm25 import BM25Okapi

_TOKEN = re.compile(r"[a-z0-9]+")


def tokenize(s: str) -> list[str]:
    return _TOKEN.findall(s.lower())


@dataclass
class Chunk:
    doc_id: str
    text: str


@dataclass
class Scored:
    chunk: Chunk
    score: float
    dense: float = 0.0
    lexical: float = 0.0


class HybridRetriever:
    """Dense TF-IDF + BM25 lexical retrieval with RRF fusion."""

    def __init__(self, rrf_k: int = 60):
        self.chunks: list[Chunk] = []
        self.rrf_k = rrf_k
        self._vocab: dict[str, int] = {}
        self._idf: np.ndarray | None = None
        self._matrix: np.ndarray | None = None
        self._bm25: BM25Okapi | None = None
        self.embeddings_provider = os.getenv("EMBEDDINGS_PROVIDER", "local")

    # ---- ingestion -------------------------------------------------------
    def add(self, chunks: list[Chunk]) -> int:
        self.chunks.extend(chunks)
        self._build()
        return len(chunks)

    def _build(self) -> None:
        docs = [tokenize(c.text) for c in self.chunks]
        if not docs:
            return
        df: dict[str, int] = {}
        for d in docs:
            for w in set(d):
                df[w] = df.get(w, 0) + 1
        self._vocab = {w: i for i, w in enumerate(df)}
        n = len(docs)
        self._idf = np.zeros(len(self._vocab))
        for w, i in self._vocab.items():
            self._idf[i] = math.log((n + 1) / (df[w] + 1)) + 1.0
        m = np.zeros((n, len(self._vocab)), dtype=np.float32)
        for r, d in enumerate(docs):
            tf: dict[str, int] = {}
            for w in d:
                tf[w] = tf.get(w, 0) + 1
            for w, c in tf.items():
                j = self._vocab[w]
                m[r, j] = (c / len(d)) * self._idf[j]
        norms = np.linalg.norm(m, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        self._matrix = m / norms
        self._bm25 = BM25Okapi(docs)

    # ---- per-method retrieval -------------------------------------------
    def _query_vec(self, q: str) -> np.ndarray:
        v = np.zeros(len(self._vocab), dtype=np.float32)
        toks = tokenize(q)
        tf: dict[str, int] = {}
        for w in toks:
            if w in self._vocab:
                tf[w] = tf.get(w, 0) + 1
        for w, c in tf.items():
            j = self._vocab[w]
            v[j] = (c / max(len(toks), 1)) * self._idf[j]
        n = np.linalg.norm(v)
        return v / n if n else v

    def dense(self, q: str, k: int) -> list[tuple[int, float]]:
        if not self.chunks:
            return []
        sims = self._matrix @ self._query_vec(q)
        idx = np.argsort(-sims)[:k]
        return [(int(i), float(sims[i])) for i in idx if sims[i] > 0]

    def lexical(self, q: str, k: int) -> list[tuple[int, float]]:
        if not self.chunks:
            return []
        scores = self._bm25.get_scores(tokenize(q))
        idx = np.argsort(-scores)[:k]
        return [(int(i), float(scores[i])) for i in idx if scores[i] > 0]

    # ---- public search ---------------------------------------------------
    def search(self, q: str, k: int = 5, hybrid: bool = True) -> list[Scored]:
        pool = max(k * 4, 20)
        dense = self.dense(q, pool)
        if not hybrid:
            return [Scored(self.chunks[i], s, dense=s) for i, s in dense[:k]]
        lex = self.lexical(q, pool)
        dmap = dict(dense)
        lmap = dict(lex)
        rrf: dict[int, float] = {}
        for rank, (i, _) in enumerate(dense):
            rrf[i] = rrf.get(i, 0.0) + 1.0 / (self.rrf_k + rank)
        for rank, (i, _) in enumerate(lex):
            rrf[i] = rrf.get(i, 0.0) + 1.0 / (self.rrf_k + rank)
        ranked = sorted(rrf.items(), key=lambda x: -x[1])[:k]
        return [
            Scored(self.chunks[i], score, dense=dmap.get(i, 0.0), lexical=lmap.get(i, 0.0))
            for i, score in ranked
        ]


# ---- corpus loading + chunking ------------------------------------------
def chunk_text(text: str, size: int = 800, overlap: int = 100) -> list[str]:
    out, i = [], 0
    while i < len(text):
        out.append(text[i : i + size].strip())
        i += size - overlap
    return [c for c in out if c]


def load_corpus(path: str) -> list[Chunk]:
    import glob
    chunks: list[Chunk] = []
    for fp in sorted(glob.glob(os.path.join(path, "**/*.txt"), recursive=True)):
        with open(fp, encoding="utf-8") as f:
            text = f.read()
        name = os.path.basename(fp)
        for i, piece in enumerate(chunk_text(text)):
            chunks.append(Chunk(doc_id=f"{name}#{i}", text=piece))
    return chunks
