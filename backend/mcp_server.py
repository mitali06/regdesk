"""MCP server exposing RegDesk retrieval as a tool.

Any MCP client (Claude Desktop, an agent framework, etc.) can call `regdesk_search`.
This is the 2026-standard interoperability signal: one server, every framework.
Run: python backend/mcp_server.py
"""
from __future__ import annotations
from mcp.server.fastmcp import FastMCP
from .rag import Retriever

mcp = FastMCP("regdesk")
_retriever = Retriever.from_corpus("data/corpus")


@mcp.tool()
def regdesk_search(query: str, top_k: int = 5) -> list[dict]:
    """Search the regulated-document corpus and return grounded snippets with doc ids."""
    hits = _retriever.retrieve(query, top_k=top_k)
    return [{"doc_id": h.doc_id, "text": h.text} for h in hits]


if __name__ == "__main__":
    mcp.run()
