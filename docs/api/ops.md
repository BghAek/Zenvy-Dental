# API contract — Owner portal ops + support (S4-1)

Implemented by S4-1, consumed by S4-2 (owner portal). Conventions in `docs/03-api-conventions.md`; schemas in `packages/shared/src/ops.ts`. All routes under `/api/v1`, session-cookie auth.

Two families live here:

| Family | Path | Role | Tenancy |
|---|---|---|---|
| Ops | `/ops/*` | `SUPER_ADMIN` only | **Cross-tenant by design** — `clinicId` crosses the boundary as a filter and in responses (docs/04-security.md) |
| Support (clinic side) | `/support-threads/*` | `CLINIC_OWNER`, `CLINIC_STAFF` | Implicit, from the session — a `clinicId` in the query is ignored |

The clinic side is exempt from subscription gating (`@NoSubscription`): a clinic whose payment failed must still be able to ask for help — that is exactly when it needs to. Ops routes bypass gating already (a SUPER_ADMIN owns no clinic).

Every `/ops` list is cursor-paginated (`?cursor=&limit=` ≤100, default 20), sorted `createdAt desc` with `id` breaking ties.

## Ops — clients

### GET /ops/clients

The client list. **Read-only** (decision D35): subscription state belongs to Stripe, clinic data to the clinic.

- Query → `listOpsClientsQuerySchema`: `cursor?`, `limit?`, `search?` (case-insensitive substring on name or slug), `subscriptionStatus?`, `onboardingStatus?`.
- **200** → `opsClientListResponseSchema`: `{ items: OpsClient[], nextCursor }`, each item `{ id, name, slug, phone, onboardingStatus, subscription: { status, plan, trialEndsAt } | null, whatsappConnected, counts: { patients, conversations, users }, createdAt }`.
- `whatsappConnected` is true when the clinic has at least one **verified** `WhatsAppAccount` — the fact the founder checks during a manual onboarding.
- `counts.patients` excludes soft-deleted patients.

## Ops — error log

The store is the `ErrorLog` table, written by the global exception filter (every 5xx), the BullMQ job handlers, and the AI/WhatsApp paths (docs/06-observability.md).

### GET /ops/errors

- Query → `listOpsErrorsQuerySchema`: `cursor?`, `limit?`, `clinicId?`, `correlationId?`, `module?`, `severity?`, `since?`, `until?` (ISO-8601, `createdAt >= since`, `< until`).
- **200** → `opsErrorListResponseSchema`. List rows carry no `stack` and no `context` — the viewer fetches those per row.
- The support flow: the clinic reports the reference code from its error screen → the founder filters on `correlationId`.

### GET /ops/errors/:id

- **200** → `opsErrorSchema` (list row + `stack`, `context`) · **404** `ERROR_LOG_NOT_FOUND`.

## Ops — onboarding queue

One `OnboardingRequest` is created for every clinic at clinic-creation time (S1-2 flow): in v1 every WhatsApp number is connected by hand ("nous le connectons pour vous"), so a signup **is** a queue item. Status flow: `PENDING → CALL_SCHEDULED → DONE`, or `CANCELLED`.

### GET /ops/onboarding-requests

- Query → `listOpsOnboardingRequestsQuerySchema`: `cursor?`, `limit?`, `status?`, `clinicId?`.
- **200** → `opsOnboardingRequestListResponseSchema`, each item `{ id, clinic: { id, name, slug }, status, notes, scheduledCallAt, createdAt, updatedAt }`.

### PATCH /ops/onboarding-requests/:id

- Body → `updateOpsOnboardingRequestSchema`: any subset of `{ status, notes, scheduledCallAt }`; `null` clears `notes` / `scheduledCallAt`.
- **200** → `opsOnboardingRequestSchema` · **404** `ONBOARDING_REQUEST_NOT_FOUND`.
- Deliberately **not** coupled to `Clinic.onboardingStatus`: that field tracks the clinic's own wizard progress (S3-5), this one tracks the founder's manual work.

## Support threads

Same shapes on both sides (`supportThreadSchema`, `supportMessageSchema`), so `apps/owner` and `apps/web` share one contract.

`authorName` is `null` on any message written by a `SUPER_ADMIN`: the clinic sees `authorRole: "SUPER_ADMIN"` and renders "Support ZenvyDental", never the founder's personal name.

A thread's detail response returns **all** its messages, oldest first. <!-- ponytail: support threads are short; paginate if one ever isn't -->

### Clinic side

| Route | Body / query | Result |
|---|---|---|
| `GET /support-threads` | `listSupportThreadsQuerySchema` (`status?`; a `clinicId` here is ignored) | **200** `supportThreadListResponseSchema` — own threads only |
| `POST /support-threads` | `createSupportThreadRequestSchema`: `{ subject?, body }` | **201** `supportThreadSchema` — creates the thread and its first message in one call |
| `GET /support-threads/:id` | — | **200** `supportThreadSchema` · **404** `SUPPORT_THREAD_NOT_FOUND` |
| `POST /support-threads/:id/messages` | `createSupportMessageRequestSchema`: `{ body }` | **201** `supportMessageSchema` · **404** `SUPPORT_THREAD_NOT_FOUND` |

A reply to a `CLOSED` thread **reopens** it (status → `OPEN`) rather than failing — a closed thread is never a dead end for the clinic.

### Ops side

| Route | Body / query | Result |
|---|---|---|
| `GET /ops/support-threads` | `listSupportThreadsQuerySchema` (`status?`, `clinicId?`) | **200** `supportThreadListResponseSchema` — all clinics, sorted by last activity |
| `GET /ops/support-threads/:id` | — | **200** `supportThreadSchema` · **404** `SUPPORT_THREAD_NOT_FOUND` |
| `POST /ops/support-threads/:id/messages` | `createSupportMessageRequestSchema` | **201** `supportMessageSchema` — founder reply; does **not** change status |
| `PATCH /ops/support-threads/:id` | `updateSupportThreadRequestSchema`: `{ status }` | **200** `supportThreadSchema` — close or reopen by hand |

Threads are sorted by last activity (`updatedAt desc`), so a clinic's new message surfaces at the top of the founder's list.

## Tenancy note (why `SupportMessage` is special)

`SupportMessage` has no `clinicId`, so it is listed in the tenant extension's `NON_TENANT_MODELS` — **the extension does not scope it**. Every clinic-facing read or write therefore goes through its `SupportThread` first (`prisma.supportThread.findFirst({ where: { id } })`, which *is* scoped): the thread lookup is what proves ownership, and a thread belonging to another clinic returns 404 before any message query runs. Never query `prisma.supportMessage` by `threadId` from a clinic-facing path.

## Tests required (S4-1)

- Cross-tenant: clinic A reading/replying to clinic B's thread → 404 (mandatory per docs/04-security.md).
- RBAC: a `CLINIC_OWNER` on any `/ops/*` route → 403; a `SUPER_ADMIN` on `/support-threads` → 403.
- Gating: a clinic with a `CANCELED` subscription can still open and read support threads (402 everywhere else).
- Error viewer: filters (`clinicId`, `severity`, `correlationId`, date window) and the list/detail split.
- Onboarding queue: created by clinic creation, status transitions persist.
- The global exception filter writes an `ErrorLog` row for a 5xx and none for a 4xx.
