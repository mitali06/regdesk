# Deploying RegDesk on AWS

Goal: a public HTTPS endpoint, containerized, with the API key in a secret store.
This is the "I deployed it on a major cloud" proof that closes the AWS gap.

## Option A — AWS App Runner (fastest)
1. Build & push the image to ECR:
   ```bash
   aws ecr create-repository --repository-name regdesk
   docker build -t regdesk -f infra/Dockerfile .
   # tag + push to the ECR URI from the previous command
   ```
2. Create an App Runner service from the ECR image.
3. Add `ANTHROPIC_API_KEY` via AWS Secrets Manager (never bake it into the image).
4. Note the public URL; point the frontend `VITE_API_URL` at it.

## Option B — ECS on Fargate (more to show)
- Task definition referencing the ECR image, 0.5 vCPU / 1 GB.
- Application Load Balancer + HTTPS via ACM.
- Secrets via Secrets Manager; logs to CloudWatch.
- (Stretch) add an EKS/Kubernetes variant to cover the K8s gap.

## What to capture for your portfolio
- The live URL (or a short Loom demo if you tear it down to save cost).
- A screenshot of CloudWatch logs showing latency + token lines.
- Cost per 1k queries — FDE teams care about unit economics.
