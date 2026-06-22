"""Tests for RegDesk. Run: pytest -q  (fully offline; no API key needed)."""
import io
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from backend.retrieval import HybridRetriever, load_corpus, chunk_text
from backend.agent import answer_with_citations
from backend.evals import run_scorecard
from backend.app import app

client = TestClient(app)


def _r():
    r = HybridRetriever()
    r.add(load_corpus("data/corpus"))
    return r


def test_chunking_overlaps():
    chunks = chunk_text("x" * 2000, size=800, overlap=100)
    assert len(chunks) >= 2 and all(len(c) <= 800 for c in chunks)


def test_hybrid_retrieves_right_domain():
    r = _r()
    hits = r.search("maximum debt-to-income ratio for approval", k=3, hybrid=True)
    assert hits and "credit_policy" in hits[0].chunk.doc_id


def test_refuses_out_of_corpus_question():
    """Guardrail: a question with no semantic match must refuse, not fabricate."""
    r = _r()
    res = answer_with_citations("How do I bake sourdough bread?", r)
    assert res["refused"] is True and res["citations"] == []


def test_answer_has_scored_citations():
    r = _r()
    res = answer_with_citations("HbA1c level to diagnose diabetes", r)
    assert res["refused"] is False and res["citations"]
    assert {"doc_id", "snippet", "score", "dense", "lexical"} <= set(res["citations"][0])


def test_scorecard_shape():
    card = run_scorecard(_r())
    assert card["refusal_correctness"] == 1.0
    assert card["citation_accuracy"] == 1.0
    assert isinstance(card["recall_at_k"], list) and card["recall_at_k"][0]["k"] == 1


def test_api_ask_and_health_and_root():
    assert client.get("/").json()["service"] == "RegDesk"
    assert client.get("/health").json()["status"] == "ok"
    r = client.post("/ask", json={"question": "minimum FICO score for standard products"})
    assert r.status_code == 200 and r.json()["citations"]
    assert client.post("/ask", json={"question": ""}).status_code == 400


def test_api_upload_adds_chunks():
    before = client.get("/health").json()["chunks_indexed"]
    files = {"file": ("note.txt", io.BytesIO(b"Refund window is 14 days for returns."), "text/plain")}
    r = client.post("/upload", files=files)
    assert r.status_code == 200 and r.json()["chunks_added"] >= 1
    assert client.get("/health").json()["chunks_indexed"] > before


def test_api_evals_endpoint():
    card = client.get("/evals").json()
    assert "recall_at_k" in card and card["citation_accuracy"] is not None
