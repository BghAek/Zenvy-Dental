# 03 — API Conventions & Contracts

REST over HTTPS, JSON only. Base path `/api/v1`. Detailed per-module contracts are added to this file's companion folder (`docs/api/`) sprint by sprint — **contract first, then implementation**: the endpoint's request/response Zod schema lands in `packages/shared` before either agent builds against it.

## Conventions

- **Resources:** plural kebab-case: `/api/v1/patients`, `/api/v1/appointments`, `/api/v1/conversations/:id/messages`.
- **Verbs:** GET (read), POST (create/actions), PATCH (partial update), DELETE. Actions that aren't CRUD are POST subroutes: `POST /conversations/:id/takeover`.
- **Auth:** Better Auth session cookie. Every route requires auth except `/auth/*`, `/webhooks/*`, `/health`.
- **Tenancy:** clinic is derived from the session — **never** from a client-supplied clinicId. Owner-portal routes live under `/api/v1/ops/*` and require SUPER_ADMIN.
- **Validation:** every request body/query parsed with the shared Zod schema in a NestJS pipe. Unknown fields stripped. No `any` crossing the boundary.
- **Pagination:** cursor-based: `?cursor=<id>&limit=<n≤100>` → `{ items, nextCursor }`. Sorted stable (usually `createdAt desc`).

## Response envelope

Success: plain resource JSON (no wrapper).
Error (always this shape, from the global exception filter):

```json
{
  "error": {
    "code": "PATIENT_NOT_FOUND",
    "message": "Patient introuvable.",
    "correlationId": "req_abc123"
  }
}
```

- `code`: stable SCREAMING_SNAKE machine code, enumerated in `packages/shared`.
- `message`: **French**, human-friendly, safe to render directly in the UI.
- `correlationId`: matches the structured log + ErrorLog row (see 06-observability).
- HTTP status: 400 validation, 401 unauthenticated, **402 subscription inactive** (trial over, payment failed, cancelled — S3-3 gating), 403 forbidden/tenant, 404, 409 conflict, 422 domain rule, 429 rate limit, 500 unexpected (message is generic; details only in logs), 503 dependency unconfigured/unavailable.

## Webhooks (inbound to us)

- `POST /webhooks/whatsapp` — Meta signature (`X-Hub-Signature-256`) verified before parsing; respond 200 fast, process async via BullMQ.
- `POST /webhooks/stripe` — Stripe signature verified; idempotent by event id (`StripeEvent` ledger). The only writer of subscription state — see `docs/api/billing.md`.

## Frontend data layer

- TanStack Query only — no ad-hoc fetch. One typed API client in `packages/shared` (thin `fetch` wrapper typed by the Zod schemas); both `web` and `owner` consume it.
- Mutations invalidate their query keys; optimistic updates only where UX demands (inbox send).
- Real-time inbox in v1: **polling via TanStack Query refetchInterval (5s on inbox views)**. SSE/WebSocket is a v2 upgrade if polling feels laggy in the demo. <!-- ponytail: polling, upgrade to SSE when demo proves it insufficient -->
