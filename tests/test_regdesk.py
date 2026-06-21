"""Tests for RegDesk. Run: pytest -q

These run fully offline (no ANTHROPIC_API_KEY needed): the agent falls back to a
labeled stub, so CI is deterministic.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.rag import Retriever, _chunk
from backend.agent import answer_with_citations


def _retriever():
    return Retriever.from_corpus("data/corpus")


def test_chunking_overlaps():
    chunks = _chunk("x" * 2000, size=800, overlap=100)
    assert len(chunks) >= 2
    assert all(len(c) <= 800 for c in chunks)


def test_retrieval_finds_gold_doc():
    r = _retriever()
    hits = r.retrieve("maximum debt-to-income ratio for approval", top_k=5)
    assert hits, "expected at least one hit"
    assert any("credit_policy" in h.doc_id for h in hits)


def test_refuses_when_no_context():
    """Guardrail: empty retrieval must refuse, never fabricate."""
    empty = Retriever(chunks=[])
    result = answer_with_citations("anything at all", empty)
    assert result["refused"] is True
    assert result["citations"] == []


def test_answer_shape_has_citations():
    r = _retriever()
    result = answer_with_citations("income verification for self-employed", r)
    assert "answer" in result and isinstance(result["answer"], str)
    assert isinstance(result["citations"], list)
    assert result["refused"] is False
