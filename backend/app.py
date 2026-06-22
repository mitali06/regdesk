"""FastAPI backend for RegDesk.

Routes:
  GET  /          - service info (no more bare-URL 404)
  GET  /health    - liveness
  POST /ask       - grounded answer with citations (or refusal)
  POST /upload    - ingest a .txt/.md/.pdf into the live corpus
  GET  /evals     - scorecard: dense-only vs hybrid recall, citation acc, refusal, latency
Observability: each /ask logs latency + tokens as a structured line.
"""
from __future__ import annotations
import io
import logging
import time

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .retrieval import HybridRetriever, load_corpus, chunk_text, Chunk
from .agent import answer_with_citations
from .evals import run_scorecard

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("regdesk")

app = FastAPI(title="RegDesk", version="0.2.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

retriever = HybridRetriever()
retriever.add(load_corpus("data/corpus"))


class AskRequest(BaseModel):
    question: str
    top_k: int = 5
    hybrid: bool = True


class Citation(BaseModel):
    doc_id: str
    snippet: str
    score: float
    dense: float
    lexical: float


class AskResponse(BaseModel):
    answer: str
    citations: list[Citation]
    refused: bool
    latency_ms: int
    input_tokens: int
    output_tokens: int


@app.get("/")
def root() -> dict:
    return {
        "service": "RegDesk",
        "what": "Grounded RAG + agent over regulated documents (hybrid retrieval).",
        "chunks_indexed": len(retriever.chunks),
        "endpoints": ["/health", "/ask (POST)", "/upload (POST)", "/evals", "/docs"],
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "chunks_indexed": len(retriever.chunks)}


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest) -> AskResponse:
    if not req.question.strip():
        raise HTTPException(400, "Empty question")
    t0 = time.time()
    try:
        result = answer_with_citations(
            req.question, retriever, top_k=req.top_k, hybrid=req.hybrid
        )
    except Exception as e:
        log.exception("ask failed")
        raise HTTPException(500, "Internal error answering question") from e
    latency_ms = int((time.time() - t0) * 1000)
    log.info(
        "ask q_len=%d k=%d hybrid=%s refused=%s latency_ms=%d in_tok=%d out_tok=%d",
        len(req.question), req.top_k, req.hybrid, result["refused"], latency_ms,
        result["input_tokens"], result["output_tokens"],
    )
    return AskResponse(latency_ms=latency_ms, **result)


def _extract_text(filename: str, raw: bytes) -> str:
    name = filename.lower()
    if name.endswith(".pdf"):
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(raw))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    return raw.decode("utf-8", errors="ignore")


@app.post("/upload")
async def upload(file: UploadFile = File(...)) -> dict:
    if not file.filename:
        raise HTTPException(400, "No file")
    allowed = (".txt", ".md", ".pdf")
    if not file.filename.lower().endswith(allowed):
        raise HTTPException(400, f"Unsupported type. Allowed: {', '.join(allowed)}")
    raw = await file.read()
    if len(raw) > 5_000_000:
        raise HTTPException(413, "File too large (max 5MB for this demo)")
    text = _extract_text(file.filename, raw)
    if not text.strip():
        raise HTTPException(422, "Could not extract any text from the file")
    chunks = [Chunk(doc_id=f"{file.filename}#{i}", text=p)
              for i, p in enumerate(chunk_text(text))]
    added = retriever.add(chunks)
    log.info("upload file=%s chunks=%d", file.filename, added)
    return {"filename": file.filename, "chunks_added": added,
            "total_chunks": len(retriever.chunks)}


@app.get("/evals")
def evals() -> dict:
    return run_scorecard(retriever)
