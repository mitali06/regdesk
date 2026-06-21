"""Eval harness: score grounded answers on a labeled set.

This file is the single most important hiring signal in the repo. It shows you can
DESIGN, RUN, and REASON about evals — the thing that separates 'built with LLMs'
from 'watched a tutorial'.

Metrics:
  - retrieval_recall@k : did we retrieve the gold doc_id?
  - citation_accuracy  : did the answer cite the gold doc_id?
  - refusal_correct    : did we (correctly) refuse when no gold doc exists?
Run: python backend/eval/eval_harness.py
"""
from __future__ import annotations
import json
import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from backend.rag import Retriever
from backend.agent import answer_with_citations

HERE = os.path.dirname(__file__)
DATASET = os.path.join(HERE, "dataset.sample.jsonl")


def load(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def main() -> None:
    rows = load(DATASET)
    retriever = Retriever.from_corpus("data/corpus")
    n = len(rows)
    recall = cite = refusal = 0

    for row in rows:
        q, gold = row["question"], row.get("gold_doc_id")
        hits = retriever.retrieve(q, top_k=5)
        hit_ids = {h.doc_id.split("#")[0] for h in hits}
        result = answer_with_citations(q, retriever)

        if gold is None:  # should refuse
            refusal += int(result["refused"])
            continue
        recall += int(gold in hit_ids)
        cited = {c["doc_id"].split("#")[0] for c in result["citations"]}
        cite += int(gold in cited)

    answerable = sum(1 for r in rows if r.get("gold_doc_id") is not None)
    unanswerable = n - answerable
    print("=== RegDesk eval scorecard ===")
    print(f"examples: {n}  (answerable={answerable}, unanswerable={unanswerable})")
    if answerable:
        print(f"retrieval recall@5 : {recall/answerable:.0%}")
        print(f"citation accuracy  : {cite/answerable:.0%}")
    if unanswerable:
        print(f"refusal correctness: {refusal/unanswerable:.0%}")
    print("\nNow write down WHY a number is low and what you'd change. That's the skill.")


if __name__ == "__main__":
    main()
