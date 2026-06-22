# Architecture notes

- **Frontend** (TypeScript/React): thin chat client; shows answer, citations, latency.
- **API** (FastAPI): validates input, calls the agent, emits structured observability logs.
- **RAG** (`rag.py`): chunk -> embed -> vector store -> (rerank). Scaffold ships a keyword
  fallback so it runs with zero deps; swap in real embeddings + a store and re-measure.
- **Agent** (`agent.py`): grounds on retrieved context, cites every claim, refuses on low recall.
- **MCP server** (`mcp_server.py`): exposes retrieval as a tool to any MCP client.
- **Evals** (`eval/`): recall@k, citation accuracy, refusal correctness, cost/latency.

## Design decisions worth defending in an interview
1. **Refuse over hallucinate.** Low retrieval recall returns a refusal, not a guess —
   the right default for regulated workflows.
2. **Citations are mandatory.** The system prompt forbids uncited claims; evals check it.
3. **Observability from day one.** Every request logs latency + tokens, so cost and
   p95 are measurable, not anecdotal.
4. **MCP, not a bespoke API only.** Interoperability is the 2026 expectation.
