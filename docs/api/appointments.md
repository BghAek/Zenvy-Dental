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

Appointment writes emit `ScheduledMessage` rows; the actual sending is S3-2. Rows are visible on the appointment as `reminders: [{ id, kind, sendAt, status }]` so S2-6 can show « Rappel 24h — envoyé ».

| Event | Effect |
|---|---|
| Created with `status` `SCHEDULED`/`CONFIRMED` | `REMINDER_24H` at `startsAt − 24h` and `REMINDER_2H` at `startsAt − 2h` |
| `startsAt` changed | pending rows are recomputed against the new time; already-sent rows are left alone |
| `status` → `CANCELLED` / `NO_SHOW` | pending rows → `CANCELLED` |
| `status` → `DONE` | `FOLLOWUP` at `startsAt + 24h` (J+1) |
| Deleted | rows cascade-deleted |

Rules applied to every row creation: skip if `sendAt` is in the past, and skip if the patient has `optOut` (opt-out blocks all outbound, `docs/05-ai-policy.md`). `templateName` is set to the catalogue name (`reminder_24h_fr`, `reminder_2h_fr`, `followup_fr`) — the templates themselves are registered with Meta in S3-1, so until then the rows exist but nothing sends.

## Tests required (S2-4)

Cross-tenant test (clinic A reading/mutating clinic B's appointment → 404) is mandatory per `docs/04-security.md`, plus: create → two reminder rows at the right offsets; reschedule → pending rows follow; cancel → pending rows cancelled; `DONE` → follow-up row; opted-out patient → no rows; past `startsAt` → no rows.
