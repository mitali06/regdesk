"""Minimal RAG retriever. Replace the in-memory store with pgvector/Qdrant for prod.

The point of the scaffold is the *interface* and the *eval hooks*, not the index.
"""
from __future__ import annotations
import os
import glob
from dataclasses import dataclass


@dataclass
class Chunk:
    doc_id: str
    text: str


class Retriever:
    def __init__(self, chunks: list[Chunk]):
        self.chunks = chunks
        # TODO: build embeddings here (e.g. voyage/openai) + a vector index.

    @classmethod
    def from_corpus(cls, path: str) -> "Retriever":
        chunks: list[Chunk] = []
        for fp in glob.glob(os.path.join(path, "**/*.txt"), recursive=True):
            with open(fp, encoding="utf-8") as f:
                text = f.read()
            for i, piece in enumerate(_chunk(text)):
                chunks.append(Chunk(doc_id=f"{os.path.basename(fp)}#{i}", text=piece))
        return cls(chunks)

    def retrieve(self, query: str, top_k: int = 5) -> list[Chunk]:
        """Naive keyword overlap so the scaffold runs with zero deps.
        Swap for vector similarity + a reranker, then measure recall@k in the eval."""
        q = set(query.lower().split())
        scored = [
            (len(q & set(c.text.lower().split())), c) for c in self.chunks
        ]
        scored.sort(key=lambda x: x[0], reverse=True)
        return [c for s, c in scored[:top_k] if s > 0]


def _chunk(text: str, size: int = 800, overlap: int = 100) -> list[str]:
    out, i = [], 0
    while i < len(text):
        out.append(text[i : i + size])
        i += size - overlap
    return out
