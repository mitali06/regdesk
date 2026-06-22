"""Eval scorecard: the core hiring signal — measured, not asserted.

Reports, on a labeled set:
  - recall@k for DENSE-only vs HYBRID retrieval (shows the reranker earns its keep)
  - citation accuracy (did the grounded answer cite the gold doc?)
  - refusal correctness (did we refuse the unanswerable questions?)
  - average answer latency
"""
from __future__ import annotations
import json
import os
import time

from .retrieval import HybridRetriever

HERE = os.path.dirname(__file__)
DATASET = os.path.join(HERE, "eval", "dataset.sample.jsonl")


def _load(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def _recall(retriever: HybridRetriever, rows: list[dict], k: int, hybrid: bool) -> float:
    answerable = [r for r in rows if r.get("gold_doc_id")]
    if not answerable:
        return 0.0
    hit = 0
    for r in answerable:
        results = retriever.search(r["question"], k=k, hybrid=hybrid)
        ids = {s.chunk.doc_id.split("#")[0] for s in results}
        hit += int(r["gold_doc_id"] in ids)
    return round(hit / len(answerable), 3)


def run_scorecard(retriever: HybridRetriever, k: int = 5) -> dict:
    from .agent import answer_with_citations
    rows = _load(DATASET)
    answerable = [r for r in rows if r.get("gold_doc_id")]
    unanswerable = [r for r in rows if not r.get("gold_doc_id")]

    cite_hit, refuse_hit, lat = 0, 0, []
    for r in answerable:
        t0 = time.time()
        res = answer_with_citations(r["question"], retriever, top_k=k)
        lat.append((time.time() - t0) * 1000)
        cited = {c["doc_id"].split("#")[0] for c in res["citations"]}
        cite_hit += int(r["gold_doc_id"] in cited)
    for r in unanswerable:
        res = answer_with_citations(r["question"], retriever, top_k=k)
        refuse_hit += int(res["refused"])

    return {
        "examples": len(rows),
        "answerable": len(answerable),
        "unanswerable": len(unanswerable),
        "recall_at_k": [
            {"k": kk,
             "dense_only": _recall(retriever, rows, kk, hybrid=False),
             "hybrid": _recall(retriever, rows, kk, hybrid=True)}
            for kk in (1, 3, 5)
        ],
        "citation_accuracy": round(cite_hit / len(answerable), 3) if answerable else None,
        "refusal_correctness": round(refuse_hit / len(unanswerable), 3) if unanswerable else None,
        "avg_latency_ms": round(sum(lat) / len(lat), 1) if lat else None,
    }
