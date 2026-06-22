"""CLI eval. Run: python backend/eval/eval_harness.py

Prints the same scorecard the /evals endpoint serves. The headline number is
recall@k for dense-only vs hybrid — proof the reranker improves retrieval.
"""
from __future__ import annotations
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.retrieval import HybridRetriever, load_corpus
from backend.evals import run_scorecard


def main() -> None:
    r = HybridRetriever()
    r.add(load_corpus("data/corpus"))
    card = run_scorecard(r)
    print("=== RegDesk eval scorecard ===")
    print(json.dumps(card, indent=2))
    for row in card["recall_at_k"]:
        print(f"recall@{row['k']}: dense-only {row['dense_only']:.0%} -> hybrid {row['hybrid']:.0%}")
    print("Reason about any low number and what you'd change — that's the skill.")


if __name__ == "__main__":
    main()
