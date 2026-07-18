# 13 — Local Development Guide

How to run ZenvyDental on a dev machine. Mirrors production topology (01-architecture §Deployment) minus TLS/subdomains.

## Prerequisites

- Node 22+, pnpm 8.15 (`npm i -g pnpm@8.15.0`)
- Docker Desktop (or any Docker Engine with Compose v2)

## One-time setup

```bash
pnpm install
cp .env.example .env   # fill in real values as sprints require them
```

## Full stack via Docker

```bash
docker compose up --build
```

| Service | Image | Port | What |
|---|---|---|---|
| api | built from `apps/api/Dockerfile` | 3001 | NestJS API |
| redis | redis:7-alpine (appendonly) | 6379 | cache + BullMQ |
| nginx | nginx:1.27-alpine | 8080 | reverse proxy: `/health` + `/api/*` → api; `/` → landing static build |

Smoke test:

```bash
curl http://localhost:8080/health   # {"status":"ok"} via nginx
curl http://localhost:3001/health   # same, direct to the API container
```

Nginx serves `apps/landing/out/` at `/` — run `pnpm --filter @zenvy/landing build` first if you want the landing page locally (the API works without it).

## Day-to-day dev (hot reload)

Docker is for the stack around the code; run the app you're editing on the host:

```bash
docker compose up redis        # backing services only
pnpm --filter @zenvy/api start:dev      # API on :3001, watch mode
pnpm --filter @zenvy/web dev            # dashboard (Vite)
pnpm --filter @zenvy/owner dev          # owner portal (Vite)
pnpm --filter @zenvy/landing dev        # landing (Next.js)
```

`.env` is read by the API; `REDIS_URL=redis://localhost:6379` reaches the compose redis from the host.

## Database

Postgres is Neon (external, serverless) — no local container (01-architecture §Environments). Put your Neon dev-branch URL in `DATABASE_URL`. From S0-4: `pnpm --filter @zenvy/api prisma migrate dev`.

## Troubleshooting

- 502 from nginx right after `up` → the API container is still booting; retry in a few seconds.
- Port already in use → stop the conflicting process or edit the host-side port in `docker-compose.yml`.
- API code changes not visible in Docker → rebuild: `docker compose up --build api`.
- Compose fails on missing `.env` → `cp .env.example .env`.
