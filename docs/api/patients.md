# API contract — Patients CRUD (S1-1)

Implemented by S1-3, consumed by S1-6. Conventions in `docs/03-api-conventions.md`; schemas in `packages/shared/src/patients.ts`. All routes under `/api/v1`, session-cookie auth, any clinic role (`CLINIC_OWNER` and `CLINIC_STAFF` — patients are daily operations, docs/04-security.md). Tenancy: `clinicId` comes from the session via the Prisma tenant extension — it never appears in requests or responses.

## Phone normalization

All phone input goes through `phoneInputSchema` (shared): separators stripped, `00…` → `+…`, French national `0…` → `+33…`, then E.164-validated. Frontends use the same schema in forms, so what the user sees accepted is what the API stores.

## Endpoints

### GET /patients

Cursor-paginated list, sorted `createdAt desc`, soft-deleted rows excluded.

- Query → `listPatientsQuerySchema`: `cursor?`, `limit?` (≤100, default 20), `search?`, `tag?` (exact match). Blank params (`?search=` from a cleared box) count as unset.
- Search semantics: case-insensitive substring on firstName / lastName; a term containing a digit is **also** run through `normalizePhone` and matched as a substring of the stored E.164 phone — so `06 12 34 56 78` (as printed on a chart) finds `+33612345678`.
- **200** → `patientListResponseSchema`: `{ items: Patient[], nextCursor }`.

### POST /patients

- Body → `createPatientRequestSchema`: `{ firstName, lastName, phone, tags?, notes? }`. `source` is set server-side to `MANUAL`; `optOut` starts `false`.
- Duplicate phone within the clinic:
  - active patient with that phone → **409** `PATIENT_PHONE_EXISTS`;
  - **soft-deleted** patient with that phone → the row is **restored** with the submitted data (same `id`, `deletedAt` cleared) and returned as **201** — the `(clinicId, phone)` unique index is full, not partial (see schema comment on `Patient`).
- **201** → `patientSchema`.

### GET /patients/:id

- **200** → `patientSchema` · **404** `PATIENT_NOT_FOUND` (unknown, soft-deleted, or other clinic's id — indistinguishable by design).

### PATCH /patients/:id

- Body → `updatePatientRequestSchema`: any subset of `{ firstName, lastName, phone, tags, notes, optOut }`; `notes: null` clears notes. `optOut` is manually togglable here; automated STOP handling lands in S3-2.
- **200** → `patientSchema` · **404** `PATIENT_NOT_FOUND` · **409** `PATIENT_PHONE_EXISTS` (phone change collides with an active patient).

### DELETE /patients/:id

Soft delete (`deletedAt = now`) — clinics expect undo (docs/02-database.md); the row disappears from all reads and its phone slot stays reserved until restored via re-create.

- **204** (no body) · **404** `PATIENT_NOT_FOUND`.

## Tests required (S1-3)

Cross-tenant test (clinic A reading/mutating clinic B's patient → 404) is mandatory per docs/04-security.md, plus CRUD + restore-on-create + pagination coverage.
