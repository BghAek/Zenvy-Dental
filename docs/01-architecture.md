# 01 — System Architecture

## Repository layout (one monorepo, pnpm workspaces)

```
zenvy-dental/
├─ apps/
│  ├─ landing/      # Next.js (static export) — public marketing site, SEO-first
│  ├─ web/          # React + Vite SPA — dentist dashboard (auth required)
│  ├─ owner/        # React + Vite SPA — SaaS-owner ops portal (SUPER_ADMIN only)
│  └─ api/          # NestJS — the single backend, source of truth
├─ packages/
│  └─ shared/       # API types, Zod schemas, constants, enums
├─ docs/            # THIS documentation — permanent source of truth
├─ docker-compose.yml
├─ CLAUDE.md        # Claude Code operating rules
└─ AGENTS.md        # Antigravity operating rules
```

## Runtime topology

```
Patient (WhatsApp) ──► Meta Cloud API ──► webhook ──┐
                                                    ▼
Landing (static) ─┐                            NestJS API ◄──── Stripe webhooks
Dashboard SPA ────┼──── HTTPS/Nginx ─────────► (apps/api)
Owner SPA ────────┘                                 │
                                     ┌──────────────┼──────────────┐
                                     ▼              ▼              ▼
                               Neon Postgres   Redis (VPS)    OpenAI API
                               (Prisma)        cache + BullMQ
```

Rules that must never be violated:

1. **Frontends talk only to the NestJS API.** Never directly to Meta, Stripe, OpenAI, or the DB.
2. **The API is the source of truth** for all business data and all external-service orchestration.
3. **No n8n.** Automation = NestJS services + BullMQ jobs (decision 2026-07-18, see 12-risks-decisions). If a future peripheral automation genuinely needs n8n, it must be proposed as an ADR first.

## apps/api module map (NestJS)

| Module | Responsibility |
|---|---|
| `auth` | Better Auth integration, sessions, RBAC guards |
| `tenancy` | Clinic (tenant) lifecycle, tenant-context middleware, Prisma tenant extension |
| `patients` | Lightweight patient records + tags |
| `appointments` | Appointments for communication purposes (reminders/follow-ups) |
| `conversations` | Threads, messages, inbox state, human takeover |
| `whatsapp` | Meta Graph API client, webhook receiver + signature check, template registry |
| `ai` | Conversation engine: context builder, LLM calls, guardrails, escalation (see 05-ai-policy) |
| `automation` | BullMQ queues: reminders, follow-ups, trial-expiry, scheduled sends |
| `billing` | Stripe: checkout, subscription state, trial logic, webhooks |
| `support` | Owner↔clinic support threads |
| `ops` | Owner portal endpoints: clients, error logs, onboarding queue — plus both sides of support chat (`docs/api/ops.md`) |
| `observability` | pino logging, correlation IDs, ErrorLog persistence, global exception filter |

## Frontend stacks

- **web / owner:** React 18+, TypeScript, Vite, Tailwind, shadcn/ui, TanStack Query, React Hook Form + Zod (schemas imported from `packages/shared`), Framer Motion. React Router.
- **landing:** Next.js static export (`output: 'export'`), React Three Fiber for the 3D hero, Framer Motion. No API calls except public ones (none in v1 — signup links into `apps/web`).

## Infrastructure

- **Contabo VPS** — Docker Compose: `api`, `redis`, `nginx` (serves the three built frontends as static files + reverse-proxies `/api`). The frontends are built into the nginx image, so the server needs only Docker and git (S4-6, D40).
- **Neon Postgres** (external, serverless). **Redis** runs on the VPS (BullMQ requires real Redis).
- Nginx + Let's Encrypt on `zenvydental.fr`: `/` → landing, `app.` → web, `ops.` → owner, `api.` → NestJS. One certificate covers all five names; each SPA vhost proxies `/api` on its own origin, so cookies stay same-origin and CORS stays empty.
- CI: GitHub Actions — lint, typecheck, test, build on every PR. Deploy: SSH + `infra/deploy.sh` (manual trigger in v1). Full runbook — bootstrap, DNS, TLS, backups, uptime: **docs/14-deploy.md**.

## Environments

| Env | DB | Stripe | WhatsApp | Where |
|---|---|---|---|---|
| local | Neon dev branch or local Postgres | test mode | Meta test number | dev machines |
| production | Neon main | test mode until LLC, then live | test number → verified number post-LLC | Contabo |

Logged risk: Contabo/Neon are not HDS-certified hosts (French health-data rule). Accepted by founder 2026-07-18; Prisma + Docker keep a future migration cheap. See 12-risks-decisions.
