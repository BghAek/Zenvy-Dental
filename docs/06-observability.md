# 06 — Error Handling & Observability

Every error must: (1) show a friendly French message with a reference code, (2) produce one structured log line, (3) be queryable in the owner portal. No silent failures, no raw stack traces to users.

## Correlation IDs

- Middleware assigns `correlationId` (`req_` + nanoid) to every request; async jobs get `job_` ids; webhook-triggered chains inherit the originating id.
- The id travels: request context → all log lines → ErrorLog row → API error envelope → rendered in the UI error state ("Code de référence : req_abc123").
- Support flow: clinic reports code → founder searches it in owner portal → full context.

## Structured logging (pino)

Every line JSON with: `level, time, correlationId, clinicId?, userId?, module, msg`, plus event-specific fields. Levels: `error` (broken, needs attention), `warn` (degraded/retrying), `info` (business events: clinic created, subscription started, conversation escalated), `debug` (local only).

No `console.log` in committed code — ESLint rule enforces.

## ErrorLog persistence

The global NestJS exception filter (and BullMQ failed-job handler) writes every `error`-level event to the `ErrorLog` table: correlationId, clinicId, userId, module, severity, message, stack, context JSON. Owner portal error viewer = filterable table over this (by clinic, module, severity, date, correlation id) + detail drawer — `GET /ops/errors` (S4-1, `docs/api/ops.md`). <!-- ponytail: Postgres as the error store; ship to a real APM (Sentry) when volume or alerting needs demand it -->

From the filter, **5xx only** (`module: 'http'`, severity `ERROR`, the raw exception message and stack, `{ method, path, status }` as context): a 4xx is the caller's mistake, and logging those would drown real breakage in validation noise. The row is written **before** the response goes out, so the reference code the user reads is already queryable when they report it; a failed write is logged and never blocks the response.

## AI cost logging (S3-6)

Every LLM call the engine makes writes one `AiUsage` row — model, prompt/completion tokens, and the price in micro-euros computed at write time (a `gpt-4o-mini` call rounds to zero in cents, and a later rate change must not rewrite history). Rows are tenant-scoped, so per-clinic spend is one `sum` over `(clinicId, createdAt)`.

The same table is the **daily token budget guard**: before the first paid call of an inbound message, the engine sums the clinic's last 24h and stops answering past `AI_DAILY_TOKEN_BUDGET` (default 300 000 tokens, D31). Exhaustion writes a `warn` ErrorLog row for `module: ai` — that row *is* the owner-portal alert, since the error viewer already filters by clinic and module. Failing to record usage never blocks a reply: the call is paid for either way, so the miss is logged and the patient is answered. <!-- ponytail: row per call, roll up to daily totals if the table gets big -->

## External-call hygiene

Meta / Stripe / OpenAI calls: timeouts set, retries with backoff where idempotent (BullMQ handles job retry), every failure logged `warn` (retryable) or `error` (final) with the provider's error payload in context. A final WhatsApp send failure surfaces on the conversation in the dashboard — the clinic must never believe a message was sent when it wasn't.

## Frontend errors

- React error boundary per app → friendly French fallback + correlation id if API-originated.
- API error envelope's `message` renders directly; `code` drives special handling (401 → login redirect, 429 → retry hint).
- Frontend crash reporting: v2 (Sentry). V1: reproduce from ErrorLog + user reports.

## Health & uptime

- `GET /health`: DB ping, Redis ping, BullMQ queue depth → `{ status, checks: { db, redis, queueDepth } }`. Nginx exposes it at `api.zenvydental.fr/health` for a free uptime monitor (UptimeRobot) hitting production — a **keyword** monitor on `"status":"ok"`, because the endpoint answers **200 even when degraded** (D41). Probes connect per call and time out at 5 s: a health check that hangs is a monitor that never alerts.
- System-health dashboard UI in owner portal: v2 (the endpoint exists from v1).
