# API contract — Conversations & messages (S2-1)

Implemented by S2-2 (webhook + persistence) and S2-3 (AI engine), consumed by S2-5 (inbox). Conventions in `docs/03-api-conventions.md`; schemas in `packages/shared/src/conversations.ts`; AI behaviour in `docs/05-ai-policy.md`. All routes under `/api/v1`, session-cookie auth, any clinic role (`CLINIC_OWNER` and `CLINIC_STAFF` — the inbox is daily operations). Tenancy: `clinicId` comes from the session — it never appears in requests or responses.

## Model

One conversation per `(clinicId, waContactPhone)` — enforced by a unique index (migration `20260725210000_conversation_contact_unique`). A closed thread reopens on the next inbound message; a contact never has two threads.

`status` drives who answers:

| Status | Meaning | AI replies? |
|---|---|---|
| `AI` | Default. The assistant handles the thread. | yes |
| `HUMAN` | Staff took over (or the engine handed off per 05-ai-policy). | no |
| `CLOSED` | Archived by staff. Hidden from the default list. | no — until a new inbound message reopens it as `AI` |

`urgentFlag` is set by the emergency classifier (S2-3) and cleared by `takeover` or `close` — acting on the thread *is* the acknowledgement, so there is no separate "clear flag" endpoint.

`windowExpiresAt` (detail only) = last **inbound** message + 24h, or `null` if the contact has never written. Past it, Meta forbids free-form replies (`docs/05-ai-policy.md` §24h rule) and the API refuses the send; approved templates land in S3-1.

## Endpoints

### GET /conversations

Cursor-paginated thread list, sorted `lastMessageAt desc` (nulls last, then `createdAt desc`).

- Query → `listConversationsQuerySchema`: `cursor?`, `limit?` (≤100, default 20), `status?` (`AI` | `HUMAN` | `CLOSED`). Blank params (`?status=` from a cleared filter) count as unset; **unset excludes `CLOSED`** — the inbox shows live threads by default.
- **200** → `conversationListResponseSchema`: `{ items: ConversationSummary[], nextCursor }`. Each item carries `patient` (summary or `null`), `waContactPhone`, `status`, `urgentFlag`, `lastMessageAt`, `lastMessagePreview` (last body, truncated to 140 chars server-side), `lastMessageAuthor`.

### GET /conversations/:id

- **200** → `conversationSchema` (summary fields + `windowExpiresAt`, `updatedAt`) · **404** `CONVERSATION_NOT_FOUND` (unknown or other clinic's id — indistinguishable by design).

### GET /conversations/:id/messages

Cursor-paginated, sorted `createdAt desc` (newest first; the UI reverses for display).

- Query → `listMessagesQuerySchema`: `cursor?`, `limit?` (≤100, default 20).
- **200** → `messageListResponseSchema`. `waMessageId` is never exposed — it is Meta bookkeeping, not clinic data.
- **404** `CONVERSATION_NOT_FOUND`.

### POST /conversations/:id/messages

Staff reply, sent through the Graph API and stored as `direction=OUT, author=STAFF`.

- Body → `sendMessageRequestSchema`: `{ body }` (1–4096 chars, trimmed).
- **201** → `messageSchema` with `deliveryStatus=PENDING`; delivery receipts update it asynchronously (see §Webhook internals).
- **422** `CONVERSATION_NOT_TAKEN_OVER` — status is not `HUMAN`. Sending never implicitly takes over: the AI must be stopped deliberately, or two authors race on the same thread.
- **422** `OUTSIDE_24H_WINDOW` — `windowExpiresAt` is null or past.
- **422** `PATIENT_OPTED_OUT` — the linked patient opted out; opt-out blocks *all* outbound including manual (`docs/05-ai-policy.md`).
- **404** `CONVERSATION_NOT_FOUND`.

### POST /conversations/:id/takeover

`AI` | `CLOSED` → `HUMAN`, clears `urgentFlag`, writes an `AuditLog` entry (`action=conversation.takeover`).

- **200** → `conversationSchema`. Idempotent: already `HUMAN` → current state, no second audit row.
- **404** `CONVERSATION_NOT_FOUND`.

### POST /conversations/:id/release

`HUMAN` → `AI` — « Rendre la main à l'IA ». Writes `AuditLog` (`action=conversation.release`). The AI answers the *next* inbound message; releasing does not generate a reply.

- **200** → `conversationSchema`. Idempotent on an already-`AI` thread.
- **404** `CONVERSATION_NOT_FOUND`.

### POST /conversations/:id/close

Any status → `CLOSED`, clears `urgentFlag`. Archive only — messages are kept, and a new inbound message reopens the thread as `AI`.

- **200** → `conversationSchema` · **404** `CONVERSATION_NOT_FOUND`.

No `PATCH /conversations/:id`: every mutable field (`status`, `urgentFlag`, `patientId`) is owned by an action route or by the webhook. <!-- ponytail: no generic patch, add one when a field needs free-form editing -->

## Webhook internals (S2-2)

Public endpoint, no session: `POST /api/v1/webhooks/whatsapp`. Setup and the GET verification handshake are in `docs/api/meta-setup.md`.

**Request path (synchronous, must stay under Meta's timeout):**

1. Verify `X-Hub-Signature-256` (HMAC-SHA256 of the **raw** body with `META_APP_SECRET`) — before parsing anything. Mismatch → **403**, nothing enqueued.
2. Enqueue the raw parsed payload on the BullMQ queue `whatsapp-inbound`.
3. Respond **200** immediately. No DB work, no Graph call, no AI on this path.

**Job payload** (one job per webhook delivery; Meta batches `entry[].changes[].value`):

```jsonc
{ "phoneNumberId": "123456", "receivedAt": "2026-07-25T09:00:00.000Z", "value": { /* raw Meta change value */ } }
```

**Worker steps, per message in `value.messages[]`:**

1. **Tenant routing** — `WhatsAppAccount.phoneNumberId` (globally unique) → `clinicId`. Unknown id → `ErrorLog` at `WARN` and drop the job: an unrouted event has no tenant, so there is nothing to isolate it to.
2. **Dedup** — `Message.waMessageId` is unique; an already-stored id is a no-op. Meta retries for up to 36h, so this is the only thing standing between a retry storm and duplicate AI replies.
3. **Patient resolution** — normalize `value.contacts[].wa_id` to E.164, then match `(clinicId, phone)`:
   - active patient → link;
   - soft-deleted patient → restore it (same rule as `POST /patients`, `docs/api/patients.md`);
   - no match → **create** `Patient { source: WHATSAPP_INBOUND, firstName: contacts[].profile.name (or « Contact WhatsApp »), lastName: '—', phone }`. Founder decision 2026-07-25 (D17): an inbound number becomes a patient immediately, so the AI has context and the clinic sees one list. Junk contacts are removed like any other patient (soft delete).
   - The profile name is **attacker-controlled**: trim, cap at 100 chars (the same bound as `patientSchema`), and fall back to « Contact WhatsApp » when it is empty after trimming. It is stored as data and rendered as text — never interpolated into the AI prompt outside the delimited untrusted block (`docs/05-ai-policy.md`).
4. **Conversation upsert** — on `(clinicId, waContactPhone)`; `CLOSED` reopens as `AI`; set `lastMessageAt`.
5. **Message insert** — `direction=IN, author=PATIENT, body`, `deliveryStatus=null` (inbound has none).
6. **Non-text messages** (`image`, `audio`, `document`, `location`, …) — stored with a French placeholder body (« [Message vocal reçu] », « [Image reçue] », …) and the conversation is forced to `HUMAN`. The v1 assistant is text-only; a human reads what it cannot.
7. **Hand off to the AI engine** (S2-3) only when status is `AI`.

**Abuse bound:** patient auto-creation (step 3) is writeable by anyone who can message the clinic's number, so the worker caps it per clinic per hour; over the cap, the conversation and message are still stored but the patient stays unlinked and an `ErrorLog` at `WARN` is written. Number and enforcement point are S2-2's call, reviewed in S2-7. <!-- ponytail: fixed hourly cap, revisit if a real clinic hits it -->

**Status events** (`value.statuses[]`): map `sent|delivered|read|failed` onto `Message.deliveryStatus` by `waMessageId`; unknown ids are ignored (a receipt for a message we never stored). `failed` also writes an `ErrorLog` at `WARN` with Meta's error code.

**Tenancy note:** the webhook has no session, so the tenant Prisma extension has no clinic to scope to. The worker resolves `clinicId` in step 1 and passes it explicitly to a scoped client — the only place in the API where `clinicId` is not session-derived, and therefore the one to audit in S2-7.

## Tests required (S2-2 / S2-3)

Cross-tenant test (clinic A reading/acting on clinic B's conversation → 404) is mandatory per `docs/04-security.md`, plus: invalid signature → 403 with nothing enqueued; duplicate `waMessageId` → one message row; unknown `phoneNumberId` → no writes; unknown number → patient created and linked; send outside the 24h window → 422; send on an `AI` thread → 422.
