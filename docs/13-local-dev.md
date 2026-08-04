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

Postgres is Neon (external, serverless) — no local container (01-architecture §Environments). Put your Neon dev-branch URL in `DATABASE_URL` (repo-root `.env`; the Prisma CLI reads it via `apps/api/prisma.config.ts`).

- Apply schema/migrations: `pnpm --filter @zenvy/api prisma migrate dev`
- Regenerate the client (output is gitignored at `apps/api/src/generated/prisma`): `pnpm --filter @zenvy/api prisma generate`
- Seed (SUPER_ADMIN + demo clinic « Cabinet Dentaire Lumière », idempotent): `pnpm --filter @zenvy/api prisma db seed`

## Auth (S0-5)

The API refuses to boot without `BETTER_AUTH_SECRET` (generate one: `openssl rand -base64 32`); `BETTER_AUTH_URL` defaults to `http://localhost:3001`. Both live in the repo-root `.env` (see `.env.example`) — docker compose forwards them via `env_file`.

Auth endpoints are served by Better Auth under `/api/v1/auth/*` (e.g. `POST /api/v1/auth/sign-up/email`, `sign-in/email`, `sign-out`). Every other route requires a session cookie plus an explicit `@Roles()` allow-list — routes without one fail closed.

## Tests

`pnpm --filter @zenvy/api test` (vitest). The tenant-isolation and auth-flow suites hit a real Postgres via `DATABASE_URL` — point it at a migrated throwaway container, e.g.:

```bash
docker run -d --name zenvy-pg -e POSTGRES_PASSWORD=zenvy -e POSTGRES_DB=zenvy -p 5433:5432 postgres:16
DATABASE_URL=postgresql://postgres:zenvy@localhost:5433/zenvy pnpm --filter @zenvy/api prisma migrate dev
DATABASE_URL=postgresql://postgres:zenvy@localhost:5433/zenvy pnpm --filter @zenvy/api test
```

CI runs the same suites against a Postgres service container.

### Evals (S2-3)

`test/ai-evals.spec.ts` has two halves (decision D18). The deterministic half runs above with everything else. The live half — the same French corpus against the real model — is skipped unless a key is present, so run it by hand before any PR touching `apps/api/src/ai/`:

```bash
OPENAI_API_KEY=sk-... DATABASE_URL=postgresql://postgres:zenvy@localhost:5433/zenvy \
  pnpm --filter @zenvy/api exec vitest run test/ai-evals.spec.ts
```

Each case costs two `gpt-4o-mini` calls at most (the whole corpus is a fraction of a cent). The live half passes at **≥95% of the corpus** (D32) and a failure lists the case ids that missed, from `apps/api/src/ai/evals/cases.ts`; the deterministic half must be green case by case.

`AI_DAILY_TOKEN_BUDGET` (default 300 000) caps what one clinic's assistant spends in a rolling 24h — set it low in a local `.env` to watch a thread flip to `HUMAN` on budget exhaustion.

### Stripe webhook (S3-3)

Stripe cannot reach `localhost`, so the CLI forwards for you. The printed `whsec_…` is the `STRIPE_WEBHOOK_SECRET` for that session:

```bash
stripe login
stripe listen --forward-to localhost:3001/api/v1/webhooks/stripe
stripe trigger customer.subscription.updated
```

Test cards: `4242 4242 4242 4242` succeeds, `4000 0000 0000 0341` fails after attaching (drives the clinic to `PAST_DUE`). Everything stays in Stripe **test mode** (decision D5). `test/billing.spec.ts` needs none of this — it signs events locally.

## Troubleshooting

- 502 from nginx right after `up` → the API container is still booting; retry in a few seconds.
- Port already in use → stop the conflicting process or edit the host-side port in `docker-compose.yml`.
- API code changes not visible in Docker → rebuild: `docker compose up --build api`.
- Compose fails on missing `.env` → `cp .env.example .env`.
- `migrate dev` fails with a shadow-database error on Neon → the role can't create databases; point `PRISMA_SHADOW_DATABASE_URL`-style config at a second Neon branch, or run migrations against a throwaway local Postgres container.
