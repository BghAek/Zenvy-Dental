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

The global NestJS exception filter (and BullMQ failed-job handler) writes every `error`-level event to the `ErrorLog` table: correlationId, clinicId, userId, module, severity, message, stack, context JSON. Owner portal error viewer = filterable table over this (by clinic, module, severity, date) + detail drawer. <!-- ponytail: Postgres as the error store; ship to a real APM (Sentry) when volume or alerting needs demand it -->

## External-call hygiene

Meta / Stripe / OpenAI calls: timeouts set, retries with backoff where idempotent (BullMQ handles job retry), every failure logged `warn` (retryable) or `error` (final) with the provider's error payload in context. A final WhatsApp send failure surfaces on the conversation in the dashboard — the clinic must never believe a message was sent when it wasn't.

## Frontend errors

- React error boundary per app → friendly French fallback + correlation id if API-originated.
- API error envelope's `message` renders directly; `code` drives special handling (401 → login redirect, 429 → retry hint).
- Frontend crash reporting: v2 (Sentry). V1: reproduce from ErrorLog + user reports.

## Health & uptime

- `GET /health`: DB ping, Redis ping, BullMQ queue depth → `{status, checks}`. Nginx exposes it for a free uptime monitor (UptimeRobot) hitting production.
- System-health dashboard UI in owner portal: v2 (the endpoint exists from v1).
