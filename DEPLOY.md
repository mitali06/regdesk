# RegDesk — Deploy Runbook

A step-by-step path from this repo to a live, public demo you can link on your resume,
LinkedIn, and GitHub. Steps marked **[you]** need your accounts/credentials; everything
else is already done in this repo.

---

## 0. What you need

| Item | Have it? | Notes |
|------|----------|-------|
| GitHub account | ✅ yes | We push the repo here first. |
| Anthropic API key | ⬜ get one | Free to create; pay-per-use. Needed for real answers (the app runs in a labeled offline stub without it). |
| Render **or** Fly.io account | ⬜ optional | Fastest free public URL. Sign in with GitHub. |
| AWS account | ⬜ optional | Use this path if you want the "deployed on AWS" resume signal. |

> The app already runs and passes tests **without any key** (offline stub), so you can
> push and even deploy first, then add the key to switch on real Claude answers.

---

## 1. Push to GitHub  **[you]**

The repo is already git-initialized with a first commit. Create an empty repo on GitHub
named `regdesk` (no README/license — this repo has them), then:

```bash
cd regdesk-starter
git remote add origin https://github.com/<your-username>/regdesk.git
git branch -M main
git push -u origin main
```

CI (`.github/workflows/ci.yml`) runs tests + the eval scorecard on every push — a green
check badge is its own hiring signal.

---

## 2. Run it locally (sanity check)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
pytest -q                      # 4 tests pass
uvicorn backend.app:app --reload   # http://localhost:8000/health
# new terminal:
cd frontend && npm install && npm run dev   # http://localhost:5173
```

---

## 3. Get an Anthropic API key  **[you]**

1. Go to console.anthropic.com → sign up → Billing → add a small credit (a few dollars
   is plenty for a demo).
2. API keys → Create key → copy it.
3. Locally: `cp .env.example .env` and paste the key into `.env` (already git-ignored).
4. In any host below, set `ANTHROPIC_API_KEY` as a **secret**, never in code.

---

## 4. Deploy — pick ONE host

### Option A — Render (fastest free public URL)  **[you]**
1. render.com → sign in with GitHub → **New > Blueprint** → pick your `regdesk` repo.
   It reads `infra/render.yaml` and creates the service.
2. In the service's **Environment**, add `ANTHROPIC_API_KEY` (mark as secret).
3. Deploy. You get a URL like `https://regdesk-api.onrender.com`. Test `/health`.

### Option B — Fly.io  **[you]**
```bash
brew install flyctl && fly auth login
fly launch --dockerfile infra/Dockerfile --no-deploy   # accept defaults
fly secrets set ANTHROPIC_API_KEY=sk-ant-...
fly deploy
```

### Option C — AWS App Runner (the "deployed on AWS" signal)  **[you]**
1. Create an AWS account (free tier). Install the AWS CLI and `aws configure`.
2. Push the image to ECR:
   ```bash
   aws ecr create-repository --repository-name regdesk
   ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
   REGION=us-east-1
   aws ecr get-login-password --region $REGION | docker login --username AWS \
     --password-stdin $ACCOUNT.dkr.ecr.$REGION.amazonaws.com
   docker build -t regdesk -f infra/Dockerfile .
   docker tag regdesk:latest $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/regdesk:latest
   docker push $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/regdesk:latest
   ```
3. App Runner → Create service → from ECR image → set port `8000`.
4. Store the key in **AWS Secrets Manager** and reference it as the `ANTHROPIC_API_KEY`
   env var (do not paste it plaintext).
5. Note the public URL; test `/health`.

---

## 5. Deploy the frontend  **[you]**
Vercel or Netlify, both free and GitHub-connected:
1. Import the repo, set the project root to `frontend/`.
2. Add env var `VITE_API_URL` = your deployed API URL from step 4.
3. Deploy → you get a public UI URL.

---

## 6. Turn the deployment into profile assets
- **GitHub:** ensure the README shows the live URL and a screenshot/GIF of a real query.
- **Demo:** record a 2–3 min Loom (ask a question → grounded answer + citations → show the
  eval scorecard). Link it in the README. (Cheap insurance if you later tear the host down.)
- **Retro:** fill in `docs/deployment-retro-TEMPLATE.md` with real numbers — this is your
  FDE case-study story.
- **Resume / LinkedIn:** "Built and deployed a grounded RAG + agent system over regulated
  documents (TypeScript/FastAPI on AWS), with an eval harness measuring groundedness,
  citation accuracy, and cost/latency." Link the repo + demo.

---

## 7. Cost & teardown
- Render/Fly free tiers idle to zero; App Runner bills while running — pause or delete the
  service after capturing your demo.
- Anthropic is pay-per-token; a demo costs cents. Set a low billing cap to be safe.
