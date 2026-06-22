# RegDesk — Grounded RAG + Agent for Regulated-Document Workflows

A deployable, **evaluation-instrumented** assistant that answers questions over messy
regulated documents (credit policies, insurance contracts, clinical guidelines) with
**citations**, **guardrails**, and **measured retrieval quality** — and lets users
**upload their own documents** to query. The same retrieval is exposed as an **MCP server**
any agent can call.

> Built as a Forward-Deployed-Engineer-style artifact: take an ambiguous, regulated,
> customer-shaped problem, ship a working full-stack system, and prove it works with evals
> and observability — not a notebook.

## What it does

- **Hybrid retrieval** — dense (TF-IDF vectors, cosine) + lexical (BM25), fused with
  Reciprocal Rank Fusion. Dependency-light (numpy + rank-bm25) so it runs on a 512MB free
  tier with no model download. Pluggable to API embeddings via `EMBEDDINGS_PROVIDER`.
- **Grounded, cited answers** — every claim cites a `doc_id`; the agent **refuses** rather
  than hallucinate when the best semantic match is too weak (tuned, env-configurable).
- **Document upload** — drop in a `.txt`, `.md`, or `.pdf`; it's chunked and indexed live.
- **Evals dashboard** — recall@k for dense-only vs hybrid, citation accuracy, refusal
  correctness, and average latency, served from `/evals` and rendered in the UI.
- **Observability** — every `/ask` logs latency + token usage as a structured line.

## Skills this repo demonstrates (the hiring signal)

| FDE / Applied-AI requirement      | Where it lives                                   |
|-----------------------------------|--------------------------------------------------|
| Python production backend         | `backend/app.py` (FastAPI, typed, error handling)|
| TypeScript full-stack             | `frontend/` (React + Vite, polished UI)          |
| Retrieval engineering             | `backend/retrieval.py` (hybrid + RRF)            |
| **Eval literacy (key signal)**    | `backend/evals.py`, `/evals`, Evals tab          |
| AI agent + guardrails             | `backend/agent.py` (cite-or-refuse)              |
| MCP server (2026 standard)        | `backend/mcp_server.py`                          |
| Cloud + containers                | `infra/` (Dockerfile, render.yaml, AWS notes)    |
| Tests + CI                        | `tests/`, `.github/workflows/ci.yml`             |

## API

| Method | Path      | Purpose                                            |
|--------|-----------|----------------------------------------------------|
| GET    | `/`       | service info                                       |
| GET    | `/health` | liveness + chunk count                             |
| GET    | `/documents` | list indexed source documents (for the UI)      |
| POST   | `/ask`    | grounded answer with scored citations (or refusal) |
| POST   | `/upload` | ingest a .txt/.md/.pdf into the live corpus        |
| GET    | `/evals`  | scorecard JSON                                     |
| GET    | `/docs`   | interactive Swagger UI (built into FastAPI)        |

## Quickstart

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
pytest -q                              # 8 tests pass, fully offline
uvicorn backend.app:app --reload       # http://localhost:8000/docs

# frontend (separate terminal)
cd frontend && npm install && npm run dev   # http://localhost:5173

# evals from the CLI
python backend/eval/eval_harness.py
```

Set `ANTHROPIC_API_KEY` for real Claude answers; without it the agent returns a clearly
labeled stub so everything still runs. The frontend reads optional `VITE_GITHUB_URL` and
`VITE_LINKEDIN_URL` to show portfolio links in the footer (set them in Vercel).

## Honest notes (read these in interviews)

- On the bundled 3-document sample corpus, dense and hybrid retrieval both hit ~100% recall
  because the domains are cleanly separated. The hybrid advantage shows on larger, noisier
  corpora — upload more documents and re-run `/evals` to watch the numbers move.
- The refusal threshold is tuned on the sample set and is env-configurable
  (`REFUSAL_MIN_DENSE`). "Right document retrieved but answer absent" refusal is the LLM's
  job and needs the API key.
- Uploaded docs live in memory and reset on restart (fine for a demo; swap in a persistent
  vector store as the next step).

## Deploy

See `DEPLOY.md` for GitHub push, Render (free), and AWS App Runner paths, plus turning the
deployment into resume assets (demo video, deployment retro).

## License

MIT — see `LICENSE`.
