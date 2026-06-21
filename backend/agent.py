"""Agent loop: retrieve -> ground -> answer with citations, or refuse.

Guardrail: if retrieval recall is weak, refuse rather than hallucinate.
Uses the Anthropic Claude API. Set ANTHROPIC_API_KEY in the environment.
"""
from __future__ import annotations
import os
from .rag import Retriever

SYSTEM = (
    "You answer questions about regulated documents. "
    "Use ONLY the provided context. Cite the doc_id for every claim. "
    "If the context does not contain the answer, say you cannot answer from the "
    "available documents. Never invent citations."
)


def answer_with_citations(question: str, retriever: Retriever, top_k: int = 5) -> dict:
    hits = retriever.retrieve(question, top_k=top_k)

    # Guardrail: no usable context -> refuse (this is the anti-hallucination signal).
    if not hits:
        return {
            "answer": "I can't answer that from the available documents.",
            "citations": [],
            "refused": True,
            "input_tokens": 0,
            "output_tokens": 0,
        }

    context = "\n\n".join(f"[{h.doc_id}]\n{h.text}" for h in hits)
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
        in_tok = msg.usage.input_tokens
        out_tok = msg.usage.output_tokens
    except Exception:
        # Offline fallback so the scaffold runs without a key (clearly labeled).
        text = "[offline stub] Set ANTHROPIC_API_KEY to get a real grounded answer."
        in_tok = out_tok = 0

    return {
        "answer": text,
        "citations": [{"doc_id": h.doc_id, "snippet": h.text[:200]} for h in hits],
        "refused": False,
        "input_tokens": in_tok,
        "output_tokens": out_tok,
    }
