# API contract — Appointments (S2-1)

Implemented by S2-4, consumed by S2-6. Conventions in `docs/03-api-conventions.md`; schemas in `packages/shared/src/appointments.ts`. All routes under `/api/v1`, session-cookie auth, any clinic role. Tenancy: `clinicId` comes from the session — it never appears in requests or responses.

Appointments are entered by the clinic, not by patients or the AI: v1's assistant answers, reminds and hands off, it does not book (`docs/00-vision.md` §v1 scope). ZenvyDental is a communication layer, not a PMS (decision D1) — no availability engine, no double-booking check, no resource calendar. Overlapping slots are the clinic's call and are accepted as entered. <!-- ponytail: no overlap validation, add when a clinic asks for it -->

## Endpoints

### GET /appointments

Cursor-paginated, sorted `startsAt asc` (then `id asc` — the cursor resolves to that pair, so pages stay stable when two appointments share a start time).

- Query → `listAppointmentsQuerySchema`: `cursor?`, `limit?` (≤100, default 20), `from?`, `to?` (ISO-8601 UTC, bounding `startsAt`: `from` inclusive, `to` exclusive), `patientId?`, `status?`. Blank params count as unset. The calendar-lite view passes the visible week as `from`/`to`.
- **200** → `appointmentListResponseSchema`: `{ items: Appointment[], nextCursor }`.

### POST /appointments

- Body → `createAppointmentRequestSchema`: `{ patientId, startsAt, durationMin (5–480), type, status? }`. `status` defaults to `SCHEDULED`. `type` is free text (« Détartrage », « Contrôle annuel ») — a fixed list would need a per-clinic catalogue nobody asked for.
- Past `startsAt` is allowed: clinics back-fill appointments they already honoured. Reminder rows are simply not created for a start that has passed.
- **201** → `appointmentSchema` · **404** `PATIENT_NOT_FOUND` (unknown, soft-deleted, or other clinic's patient).

### GET /appointments/:id

- **200** → `appointmentSchema` · **404** `APPOINTMENT_NOT_FOUND`.

### PATCH /appointments/:id

- Body → `updateAppointmentRequestSchema`: any subset of `{ startsAt, durationMin, type, status }`. `patientId` is immutable — moving an appointment to another patient is a delete plus a create, which keeps the reminder trail honest.
- Every accepted change re-runs the reminder rules below.
- **200** → `appointmentSchema` · **404** `APPOINTMENT_NOT_FOUND`.

### DELETE /appointments/:id

Hard delete — appointments are not soft-deleted (only `Patient` is, `docs/02-database.md`). Pending reminder rows cascade away with it. A cancellation the clinic wants to *keep* is `status=CANCELLED`, not a delete.

- **204** (no body) · **404** `APPOINTMENT_NOT_FOUND`.

## Reminder lifecycle (S2-4)

Appointment writes emit `ScheduledMessage` rows; the sending is S3-2 (§Sending, below). Rows are visible on the appointment as `reminders: [{ id, kind, sendAt, status }]` so S2-6 can show « Rappel 24h — envoyé ».

| Event | Effect |
|---|---|
| Created with `status` `SCHEDULED`/`CONFIRMED` | `REMINDER_24H` at `startsAt − 24h` and `REMINDER_2H` at `startsAt − 2h` |
| `startsAt` changed | pending rows are recomputed against the new time; already-sent rows are left alone |
| `status` → `CANCELLED` / `NO_SHOW` | pending rows → `CANCELLED` |
| `status` → `DONE` | `FOLLOWUP` at `startsAt + 24h` (J+1) |
| Deleted | rows cascade-deleted |

Rules applied to every row creation: skip if `sendAt` is in the past, and skip if the patient has `optOut` (opt-out blocks all outbound, `docs/05-ai-policy.md`). `templateName` is set to the catalogue name (`reminder_24h_fr`, `reminder_2h_fr`, `followup_fr`) — the bodies and their variables are in `docs/api/whatsapp-templates.md` (S3-1). The sender is S3-2, so the rows exist and nothing leaves yet.

Three consequences of applying those rules on *every* write (S2-4, `appointments/reminders.ts`):

- A recompute that pushes `sendAt` into the past cancels the pending row instead of leaving it to fire late — moving an appointment to « dans une heure » cancels its 24h reminder, it does not send one.
- An opted-out patient cancels the appointment's pending rows, not just future ones: the block is retroactive, so opting out after booking silences the reminders already queued.
- A status that comes back (`CANCELLED` → `CONFIRMED`) re-arms the reminders as new rows; the cancelled ones stay as the trail of what was called off.

Rows already `SENT` are never re-timed, cancelled or duplicated — the send happened, rewriting its record would lie.

## Sending (S3-2)

The schedule stays in Postgres; Redis only carries the send (D25). Every minute the API sweeps `ScheduledMessage` rows that are `PENDING` with `sendAt` in the past (200 per pass, oldest first) and gives each one a BullMQ job whose id is the row id — so a row already in flight is not enqueued twice, and `jobId` on the row marks that it left the sweep.

The job re-reads its row under the row's own clinic and re-checks everything before calling Meta, because minutes may have passed and a retry replays the same job:

| Condition at send time | Row becomes | Sent? |
|---|---|---|
| not `PENDING`, or `sendAt` back in the future | untouched | no |
| `Patient.optOut` or patient soft-deleted | `CANCELLED` | no |
| a reminder whose appointment has already started (never the J+1 follow-up) | `CANCELLED` | no |
| no catalogue template for the kind (`CUSTOM`), or missing variables | `FAILED` + `ErrorLog` | no |
| clinic has no `WhatsAppAccount` | `FAILED` + `ErrorLog` | no |
| Meta accepted | `SENT` + `Message` row on the patient's thread | yes |
| Meta or the network failed | stays `PENDING`, retried 3× with exponential backoff from 1 min; then `FAILED` + `ErrorLog` | no |

That third row is the outage rule: S2-4 already drops rows whose `sendAt` slips into the past when it re-times them, and a worker that was down for hours gets the same treatment — « votre rendez-vous a lieu aujourd'hui à 14h30 » sent at 18h is not a late reminder, it is a wrong one.

Template variables are filled **at send time**, not at scheduling time — the patient's first name, the clinic name and the appointment time can all move in the days between. They are rendered in the clinic's `timezone` (`Intl`, `fr-FR`): « mardi 4 août », « 14h30 ». Parameter order is the catalogue's (`docs/api/whatsapp-templates.md`); a count that does not match the registered template fails the row instead of letting Meta reject it.

Reminders leave when the 24h customer-service window is usually shut, which is why they are templates and only templates — the free-form paths (AI engine, staff send) keep their own window checks. What the patient sees is stored on their conversation, so their reply reopens the window and lands back on the AI engine (`docs/api/conversations.md`).

## Tests required (S2-4)

Cross-tenant test (clinic A reading/mutating clinic B's appointment → 404) is mandatory per `docs/04-security.md`, plus: create → two reminder rows at the right offsets; reschedule → pending rows follow; cancel → pending rows cancelled; `DONE` → follow-up row; opted-out patient → no rows; past `startsAt` → no rows.

For the sender (`test/scheduled-sends.spec.ts`, Graph API stubbed): the sweep returns due rows only; each kind sends its template with the catalogue parameters in order; the filled body lands on the patient's thread as `SYSTEM`; opt-out cancels instead of sending; a reminder for an appointment that already started is cancelled while the follow-up still fires; an already-`SENT` or not-yet-due row does nothing; a clinic with no number fails the row; a Graph failure throws (so BullMQ retries) and leaves the row `PENDING`; and a job run under clinic A cannot send clinic B's row. « STOP » itself is covered in `test/whatsapp-inbound.spec.ts`.
