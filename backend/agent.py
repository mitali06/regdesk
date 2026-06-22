"""Agent: retrieve (hybrid) -> ground -> answer with citations, or refuse.

Guardrails for regulated workflows:
  - Refuse (don't guess) when retrieval is empty or the top fused score is too weak.
  - Every claim must cite a doc_id; the system prompt forbids uncited answers.

Uses the Anthropic Claude API when ANTHROPIC_API_KEY is set; otherwise returns a clearly
labeled offline stub so the app and tests run with zero external dependencies.
"""
from __future__ import annotations
import os

from .retrieval import HybridRetriever

SYSTEM = (
    "You answer questions about regulated documents. Use ONLY the provided context. "
    "Cite the doc_id in brackets for every claim. If the context does not contain the "
    "answer, say you cannot answer from the available documents. Never invent citations."
)

# Refuse when the best DENSE (semantic) match is too weak — i.e. the question is
# out-of-corpus. Tuned on the sample set (answerable >=0.31, off-topic ~0.26);
# override with REFUSAL_MIN_DENSE.
MIN_DENSE = float(os.getenv("REFUSAL_MIN_DENSE", "0.28"))


def answer_with_citations(question: str, retriever: HybridRetriever, top_k: int = 5,
                          hybrid: bool = True) -> dict:
    hits = retriever.search(question, k=top_k, hybrid=hybrid)
    top_dense = max((h.dense for h in hits), default=0.0)
    strong = hits if top_dense >= MIN_DENSE else []

    if not strong:
        return {
            "answer": "I can't answer that from the available documents.",
            "citations": [],
            "refused": True,
            "input_tokens": 0,
            "output_tokens": 0,
        }

    context = "\n\n".join(f"[{h.chunk.doc_id}]\n{h.chunk.text}" for h in strong)
    prompt = f"Context:\n{context}\n\nQuestion: {question}"

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=600,
            system=SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in msg.content if b.type == "text")
        in_tok, out_tok = msg.usage.input_tokens, msg.usage.output_tokens
    except Exception:
        top = strong[0]
        text = (
            "[offline stub - set ANTHROPIC_API_KEY for a real grounded answer] "
            f"Most relevant passage [{top.chunk.doc_id}]: {top.chunk.text[:240]}"
        )
        in_tok = out_tok = 0

    return {
        "answer": text,
        "citations": [
            {
                "doc_id": h.chunk.doc_id,
                "snippet": h.chunk.text[:240],
                "score": round(h.score, 4),
                "dense": round(h.dense, 4),
                "lexical": round(h.lexical, 4),
            }
            for h in strong
        ],
        "refused": False,
        "input_tokens": in_tok,
        "output_tokens": out_tok,
    }
