.PHONY: install run mcp test eval docker fmt
install:
	python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt -r requirements-dev.txt
run:
	uvicorn backend.app:app --reload
mcp:
	python backend/mcp_server.py
test:
	pytest -q
eval:
	python backend/eval/eval_harness.py
docker:
	docker build -t regdesk -f infra/Dockerfile .
