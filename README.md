# TeamTask Manager

TeamTask is a collaborative task management platform with a Node.js backend, a Vite/React frontend, and production-grade observability. The repo is designed for fast local setup with Docker Compose and automated deployment via GitHub Actions over SSH.

## Highlights
- Team, board, list, task, comment, and group management.
- Real-time chat via sockets.
- AI-assisted workflows (backend metrics included).
- Observability with Prometheus + Grafana (HTTP and AI metrics).
- CI/CD pipeline with automated deploy to production.

## Architecture
- Backend: Node.js/Express, Prisma, PostgreSQL.
- Frontend: Vite + React + TypeScript.
- Reverse proxy: Nginx.
- Observability: Prometheus + Grafana.
- Delivery: Docker Compose (dev/prod) + GitHub Actions.

## Tech stack
- Backend: Node.js 20, Express, Prisma, PostgreSQL.
- Frontend: Vite, React, TypeScript.
- DevOps: Docker, Docker Compose, GitHub Actions, Nginx.
- Observability: Prometheus, Grafana.

## Repository layout
```
src/                 # Backend
frontend/            # Frontend (Vite)
prisma/              # Prisma schema + migrations
nginx/               # Nginx config
prometheus/          # Prometheus config
grafana/             # Grafana provisioning
.github/workflows/   # CI/CD workflows
```

## Requirements
- Node.js 20+
- Docker + Docker Compose
- PostgreSQL (only if running backend outside Docker)

## Environment configuration
The project uses `.env.docker` for Docker Compose. Core variables:

```env
POSTGRES_DB=teamtask
POSTGRES_USER=teamtask
POSTGRES_PASSWORD=teamtaskpw
JWT_SECRET=change-me-in-real-usage
```

SMTP variables are injected during deploy (see CI/CD section):

```env
SMTP_PROVIDER=gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_pass
FROM_EMAIL=you@example.com
FROM_NAME=TaskManager
```

## Local run (Docker Compose)
### Development (full stack + monitoring)
```bash
docker compose -f docker-compose.dev.yml up -d --build
```

Defaults:
- Frontend dev: http://localhost:5173
- Backend: http://localhost:5001
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000 (admin/admin)

### Production-like (compose prod)
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Nginx exposes port 80.

## Run without Docker
Backend:
```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm test
npm run dev
```

Frontend:
```bash
cd frontend
npm ci
npm run dev
```

## Tests
```bash
npm test
```

## Observability
The monitoring stack is ready with Prometheus + Grafana. The backend is instrumented with custom metrics via `prom-client`.

### Key metrics
- `teamtask_http_requests_total`: total HTTP requests by `method`, `route`, `status_code`.
- `teamtask_http_request_duration_ms`: HTTP latency histogram.
- `teamtask_ai_requests_total`: total AI requests by `method`, `endpoint`, `status_code`.
- `teamtask_ai_request_duration_ms`: AI latency histogram.
- `teamtask_ai_request_errors_total`: total AI errors (`status_code >= 400`).

### PromQL examples
HTTP RPS:
```promql
sum(rate(teamtask_http_requests_total[5m]))
```

HTTP Error Rate (%):
```promql
100 * ((sum(increase(teamtask_http_requests_total{status_code=~"[45].."}[$__range])) or on() vector(0)) / clamp_min((sum(increase(teamtask_http_requests_total[$__range])) or on() vector(0)), 1))
```

HTTP p95 Latency:
```promql
histogram_quantile(0.95, sum by (le) (rate(teamtask_http_request_duration_ms_bucket[$__rate_interval])))
```

AI RPS:
```promql
sum(rate(teamtask_ai_requests_total[5m]))
```

AI Error Rate (%):
```promql
100 * ((sum(increase(teamtask_ai_requests_total{status_code=~"[45].."}[$__range])) or on() vector(0)) / clamp_min((sum(increase(teamtask_ai_requests_total[$__range])) or on() vector(0)), 1))
```

AI p95 Latency:
```promql
histogram_quantile(0.95, sum by (le) (rate(teamtask_ai_request_duration_ms_bucket[$__rate_interval])))
```

## CI/CD (GitHub Actions)
Workflow location: [.github/workflows/cicd.yml](.github/workflows/cicd.yml).

### Backend CI
- Provision PostgreSQL service.
- `npm ci`
- `npx prisma generate`
- `npx prisma migrate deploy`
- `npm test`

### Frontend CI
- `npm ci --prefix frontend`
- `npm run build --prefix frontend`

### Deploy (production)
Runs only on push to `main`. The pipeline SSHes into the server, pulls code, updates `.env.docker`, runs Docker Compose, and applies DB migrations.

Required secrets:
- `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PATH`
- `SMTP_USER`, `SMTP_PASS`

Main deploy commands:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T backend npm run migrate:deploy
```

## Docker Compose (dev vs prod)
### Dev
- Backend port mapping: `${DOCKER_BACKEND_PORT:-5001}:5000`
- Frontend dev server: `5173:5173`
- Prometheus + Grafana enabled

### Prod
- Frontend built in container
- Nginx reverse proxy on `80:80`

## Nginx
Production routes are defined in `nginx/prod.conf` to serve frontend and proxy backend APIs.

## Safe deploy notes
- Run DB migrations after `docker compose up`.
- If deploy fails, inspect logs:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --no-color
```

## Troubleshooting
- Backend fails to start: check DB healthcheck and `DATABASE_URL`.
- Frontend cannot call API: check `VITE_API_BASE_URL` and Nginx config.
- Missing metrics: check backend metrics endpoint and `prometheus.yml`.

## References
- Prisma schema: `prisma/schema.prisma`
- Backend entry: `src/server.js`
- Frontend entry: `frontend/src/main.tsx`
