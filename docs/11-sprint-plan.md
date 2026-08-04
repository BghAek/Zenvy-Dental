# 11 — Sprint Plan (v1)

Five 2-week sprints. Owners: **[C]** Claude Code (persona in parens), **[A]** Antigravity. A task starts only when its dependencies are **merged**. Contract tasks (`packages/shared`, Prisma) land first in each sprint. Detailed API contracts are written into `docs/api/` as part of each contract task.

Status legend: each task gets `⬜ todo / 🟨 in PR / ✅ merged` — update this file as tasks land.

## Sprint 0 — Foundation (nothing user-visible, everything load-bearing)

| ID | Task | Owner | Depends | Deliverable |
|---|---|---|---|---|
| S0-1 ✅ | Monorepo scaffold: pnpm workspaces, root ESLint/Prettier/tsconfig, apps+packages skeletons, README per app | [C] Architect | — | `pnpm i && pnpm build` green on empty apps |
| S0-2 ✅ | docker-compose (api, redis, nginx) + .env.example + local dev guide | [C] DevOps | S0-1 | `docker compose up` serves hello-world API |
| S0-3 ✅ | CI: GitHub Actions — lint/typecheck/test/build per workspace on PR | [C] DevOps | S0-1 | Red/green checks on a test PR |
| S0-4 ✅ | Prisma schema v1 (all core entities, 02-database) + migrations + seed skeleton | [C] DB Architect | S0-1 | `prisma migrate dev` + seed runs |
| S0-5 ✅ | Better Auth integration + session middleware + RBAC guards + tenant Prisma extension + cross-tenant test harness | [C] Security | S0-4 | Auth'd hello route; tenant-isolation tests green |
| S0-6 ✅ | `packages/shared` foundations: error codes, enums, Zod primitives (phone E.164, pagination), typed API client wrapper | [C] Architect | S0-1 | Both frontends import & compile |
| S0-7 ✅ | Design system: tokens (colors/type/spacing), Tailwind config, shadcn theme, motion language; documented in `docs/design/design-system.md` | [A] UI/UX Designer | S0-1 | Tokens PR + doc; sample styled page |
| S0-8 ✅ | Landing skeleton: Next.js static export in monorepo, nav, footer, empty routes (/, /tarifs, /demo), deploys via nginx | [A] Frontend | S0-1, S0-7 | Static build served locally |
| S0-9 ✅ | Meta setup (founder+Claude pairing): dev app, WhatsApp test number, webhook URL + token config documented in `docs/api/meta-setup.md` | [C] Backend | — | Test message reaches a logged webhook |

## Sprint 1 — Identity & shell (a dentist can sign up and see a real dashboard)

| ID | Task | Owner | Depends | Deliverable |
|---|---|---|---|---|
| S1-1 ✅ | Contracts: auth/clinic/trial + patients CRUD (`docs/api/auth.md`, `patients.md`; shared Zod schemas) | [C] Architect | S0-5, S0-6 | Merged contracts |
| S1-2 ✅ | API: register → verify email → create clinic → trial starts (14d, no card); invite staff | [C] Backend | S1-1 | Flow passes integration tests |
| S1-3 ✅ | API: patients module (CRUD, tags, E.164 normalize, soft delete, cursor pagination) | [C] Backend | S1-1 | Tenant-isolation + CRUD tests green |
| S1-4 ✅ | Web: auth screens (register/login/verify/reset) FR copy, per design system | [A] Frontend | S1-1, S0-7 | Screens against real API |
| S1-5 ✅ | Web: dashboard shell — sidebar nav, header, empty states, error boundary, loading patterns | [A] Frontend | S0-7 ✅ | Shell with placeholder routes |
| S1-6 ✅ | Web: patients pages (list/search/detail/create/edit) | [A] Frontend | S1-3, S1-5 | Full CRUD in UI |
| S1-7 ✅ | Landing: hero (3D, R3F) + value props + pricing page (€20 anchor / €399 + trial CTA) | [A] Frontend | S0-8 | Lighthouse ≥90 perf/SEO |
| S1-8 ✅ | Review pass: Frontend Reviewer on S1-4/5/6/7 | [C] FE Reviewer | those PRs | Findings addressed pre-merge |

## Sprint 2 — Conversations (the product's heart: WhatsApp in, AI out)

| ID | Task | Owner | Depends | Deliverable |
|---|---|---|---|---|
| S2-1 ✅ | Contracts: conversations/messages/appointments + webhook internals | [C] Architect | S1 merged | `docs/api/conversations.md`, `appointments.md` |
| S2-2 ✅ | API: WhatsApp webhook (signature, fast-200, BullMQ ingest), conversation/message persistence, tenant routing by phone_number_id | [C] Backend | S2-1, S0-9 | Real test-number message → DB row |
| S2-3 ✅ | API: AI engine v1 — context builder, LlmService (OpenAI), FR system prompt, emergency classifier, guardrails, handoff state machine + eval set | [C] Backend + QA | S2-2 | Evals green; test conversation works end-to-end |
| S2-4 ✅ | API: appointments module + lifecycle events emitting ScheduledMessage rows | [C] Backend | S2-1 | Booking creates reminder rows |
| S2-5 ✅ | Web: inbox — thread list, conversation view, send box, AI/human status, takeover button, urgent flag, 5s polling | [A] Frontend | S2-1, S1-5 | Live chat with test number from UI |
| S2-6 ✅ | Web: appointments pages (list/calendar-lite/create/edit, reminder status) | [A] Frontend | S2-1, S1-5 | CRUD + reminder visibility |
| S2-7 ✅ | Security review: webhook + AI input path (prompt injection, signature, rate limits) | [C] Security | S2-2, S2-3 | /security-review findings fixed → `docs/reviews/s2-7-security-review.md` |

## Sprint 3 — Automation & money (Premium becomes real)

| ID | Task | Owner | Depends | Deliverable |
|---|---|---|---|---|
| S3-1 ✅ | WhatsApp template catalog (FR reminder/follow-up templates) registered on test number + `whatsapp-templates.md` | [C] Backend | S2 merged | Templates approved & documented |
| S3-2 ✅ | API: BullMQ senders — reminder_24h/2h, follow-up J+1, 24h-window enforcement, opt-out (STOP), retry/backoff | [C] Backend | S3-1, S2-4 | Scheduled sends fire correctly in test |
| S3-3 🟨 | API: billing — Stripe test checkout, subscription webhooks (idempotent), trial→active→past_due states, feature gating middleware | [C] Backend | S1-2 | State transitions tested |
| S3-4 🟨 | Web: settings pages — clinic profile, AI config (tone/services/prices/hours/FAQ), staff, subscription page (plan, trial countdown, checkout) | [A] Frontend | S3-3 contracts | Config round-trips to AI behavior |
| S3-5 🟨 | Web: onboarding wizard — post-signup steps (clinic info → WhatsApp "we connect it for you" request → AI config), fallback booking for manual onboarding | [A] Frontend | S1-2 | New signup lands in owner queue |
| S3-6 ✅ | AI hardening: expand evals (injection, anger, edge FR dialects), token budget guard, cost logging | [C] QA | S2-3 | Eval suite ≥95% pass in CI |
| S3-7 | Security review: billing + gating | [C] Security | S3-3 | Findings fixed |

## Sprint 4 — Operate & polish (demo-ready, deployed)

| ID | Task | Owner | Depends | Deliverable |
|---|---|---|---|---|
| S4-1 | API: ops module — clients list, error-log query, onboarding queue actions, support threads | [C] Backend | S3 merged | `docs/api/ops.md` + endpoints |
| S4-2 | Owner portal: client list, error viewer (filter/detail), onboarding queue, support chat | [A] Frontend | S4-1 | Founder can operate v1 clinics |
| S4-3 | Landing: demo page — product videos, animated component showcases, "book a demo" CTA | [A] Frontend | S1-7 | The sales asset |
| S4-4 | Demo clinic seed: rich French data — patients, appointments, believable conversation histories | [C] Backend | S3 merged | One-command demo environment |
| S4-5 | E2E: Playwright — signup→trial, inbox round-trip, reminder schedule, takeover | [C] QA | S3 merged | E2E in CI |
| S4-6 | Production deploy: Contabo hardening, nginx TLS subdomains, deploy script, backup cron (pg_dump), UptimeRobot | [C] DevOps | S0-2 | zenvydental.fr live |
| S4-7 | French copy QA + premium-polish pass on all three apps (with founder) | [A]+[C] | all UI merged | Zero English strings, zero dead ends |
| S4-8 | Full-platform review: /code-review + /security-review + /ponytail-audit | [C] all personas | everything | Findings triaged: fix now vs v2 |

## v2 backlog (designed, not scheduled)

Analytics/reports · notification center · lead scoring · routing rules · Standard plan checkout · self-serve WhatsApp onboarding (embedded signup, post-LLC + Meta verification) · audit-log viewer · feature flags · revenue dashboard · system-health UI · SSE inbox · Sentry · i18n.
