# RegDesk — Grounded RAG + Agent for Regulated-Document Workflows

A deployable, evaluation-instrumented assistant that answers questions over messy
regulated documents (credit policies, insurance contracts, clinical guidelines) with
**citations**, **guardrails**, and a **measured groundedness score** — then exposes the
same retrieval capability as an **MCP server** any agent can call.

> Built as a Forward-Deployed-Engineer-style artifact: take an ambiguous, regulated,
> customer-shaped problem, ship a working full-stack system into a real deployment, and
> prove it works with evals and observability — not a notebook.

## Why this project exists (the hiring signal)

FDE / applied-AI teams in 2026 screen for **production deployment evidence** and
**eval literacy** before anything else. This repo is designed to demonstrate, in one
place, the exact skills that show up in those job descriptions:

| FDE / Applied-AI requirement        | Where this repo proves it                          |
|--------------------------------------|----------------------------------------------------|
| Python production backend            | `backend/app.py` (FastAPI, typed, error handling)  |
| TypeScript full-stack                | `frontend/` (TS + React chat UI)                   |
| RAG with retrieval + grounding       | `backend/rag.py`                                   |
| **Evaluation layer (key signal)**    | `backend/eval/eval_harness.py`                     |
| AI agent with tool use               | `backend/agent.py`                                 |
| **MCP server (2026 standard)**       | `backend/mcp_server.py`                            |
| Cloud + containers (AWS, Docker/K8s) | `infra/`                                           |
| Observability / cost tracking        | latency + token logging hooks in `app.py`          |
| Guardrails / safety                  | citation-required answers, refusal on low recall   |
| Regulated-domain depth (fin/health)  | sample corpus + eval set                            |
| Customer-facing communication        | `docs/deployment-retro-TEMPLATE.md`                |

## Architecture

```
                ┌─────────────┐     /ask      ┌──────────────────────┐
  TS React UI ──►   FastAPI    ├──────────────►   Agent (Claude)      │
  (frontend/)  ◄──┤  backend   │◄──────────────┤  tool-use loop       │
                └──────┬──────┘   answer+cites └──────────┬───────────┘
                       │                                   │ retrieve()
                       │                          ┌────────▼─────────┐
                       │                          │  RAG: chunk →     │
                       │                          │  embed → vector   │
                       │                          │  store → rerank   │
                       │                          └──────────────────┘
            ┌──────────▼───────────┐     same retrieve() exposed as a tool
            │  MCP server          │◄───────────────────────────────────►  any MCP client
            │  (backend/mcp_server)│
            └──────────────────────┘
```

## Evaluation methodology (read this part in interviews)

Every answer is scored on a labeled eval set (`backend/eval/dataset.sample.jsonl`):

- **Groundedness / faithfulness** — is every claim supported by a retrieved chunk?
- **Citation accuracy** — do the cited chunks actually contain the answer?
- **Retrieval recall@k** — did we retrieve the gold chunk at all?
- **Refusal correctness** — does the system decline when recall is low (no hallucinating)?
- **Cost & latency** — tokens and p50/p95 per query, tracked over time.

Run: `python backend/eval/eval_harness.py` → prints a scorecard you can paste into your
write-up. The point is not a high score; it is that you can *measure and reason about* one.

## Quickstart

```bash
# backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-...           # do NOT commit this
uvicorn backend.app:app --reload

# frontend
cd frontend && npm install && npm run dev

# evals
python backend/eval/eval_harness.py
```

## Deploy

See `infra/deploy-aws.md` for a containerized AWS path (ECS/Fargate or App Runner) and
`infra/docker-compose.yml` for local. Once deployed, fill in `docs/deployment-retro-TEMPLATE.md`
and link it from your resume — that retro is the FDE story.

## Roadmap / TODOs (good first commits)

- [ ] Swap the in-memory vector store for pgvector or a managed store
- [ ] Add a reranker and measure recall@k before/after
- [ ] Add per-tenant data isolation (regulated-data residency angle)
- [ ] Wire structured-output validation (Pydantic) on the agent response
- [ ] Add Langfuse for traces + eval dashboards
- [ ] Publish the MCP server to a registry

## License

MIT — see `LICENSE`.
