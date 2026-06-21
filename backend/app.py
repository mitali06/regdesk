"""FastAPI backend for RegDesk.

Exposes POST /ask -> grounded answer with citations.
Tracks latency + tokens per request (observability hook).
"""
from __future__ import annotations
import time
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .rag import Retriever
from .agent import answer_with_citations

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("regdesk")

app = FastAPI(title="RegDesk", version="0.1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

retriever = Retriever.from_corpus("data/corpus")  # TODO: point at your docs


class AskRequest(BaseModel):
    question: str
    top_k: int = 5


class Citation(BaseModel):
    doc_id: str
    snippet: str


class AskResponse(BaseModel):
    answer: str
    citations: list[Citation]
    refused: bool
    latency_ms: int
    input_tokens: int
    output_tokens: int


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/ask", response_model=AskResponse)
def ask(req: AskRequest) -> AskResponse:
    if not req.question.strip():
        raise HTTPException(400, "Empty question")
    t0 = time.time()
    try:
        result = answer_with_citations(req.question, retriever, top_k=req.top_k)
    except Exception as e:  # surface a clean error; never leak a stack trace to the UI
        log.exception("ask failed")
        raise HTTPException(500, "Internal error answering question") from e
    latency_ms = int((time.time() - t0) * 1000)
    # Observability: emit a structured line you can ship to Datadog/Langfuse.
    log.info(
        "ask q_len=%d k=%d refused=%s latency_ms=%d in_tok=%d out_tok=%d",
        len(req.question), req.top_k, result["refused"], latency_ms,
        result["input_tokens"], result["output_tokens"],
    )
    return AskResponse(latency_ms=latency_ms, **result)
