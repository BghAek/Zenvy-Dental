import { z } from 'zod';
import { patientSourceSchema } from './enums';
import {
  blankToUndefined,
  isoDateTimeSchema,
  paginated,
  paginationQuerySchema,
  phoneE164Schema,
  phoneInputSchema,
  requiredText,
} from './primitives';

// Contracts for docs/api/patients.md (S1-1). clinicId never crosses the
// boundary — tenancy is derived from the session (docs/03-api-conventions.md).

const nameSchema = requiredText(100);
const tagSchema = requiredText(50, 'Étiquette vide.');
const tagsSchema = z.array(tagSchema).max(20, '20 étiquettes maximum.');
const notesSchema = z.string().trim().max(2000, '2000 caractères maximum.');

export const patientSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: phoneE164Schema,
  tags: z.array(z.string()),
  notes: z.string().nullable(),
  source: patientSourceSchema,
  optOut: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Patient = z.infer<typeof patientSchema>;

// Patient as embedded in other resources (conversations, appointments): who they
// are, how to reach them, and whether outbound is blocked. Nothing else travels.
export const patientSummarySchema = patientSchema.pick({
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  optOut: true,
});
export type PatientSummary = z.infer<typeof patientSummarySchema>;

// POST /patients — source defaults to MANUAL, optOut to false, server-side.
export const createPatientRequestSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneInputSchema,
  tags: tagsSchema.default([]),
  notes: notesSchema.optional(),
});
export type CreatePatientRequest = z.infer<typeof createPatientRequestSchema>;

// PATCH /patients/:id — any subset; notes: null clears them.
export const updatePatientRequestSchema = z
  .object({
    firstName: nameSchema,
    lastName: nameSchema,
    phone: phoneInputSchema,
    tags: tagsSchema,
    notes: notesSchema.nullable(),
    optOut: z.boolean(),
  })
  .partial();
export type UpdatePatientRequest = z.infer<typeof updatePatientRequestSchema>;

// GET /patients — search: case-insensitive substring on firstName/lastName;
// terms containing a digit are also normalizePhone'd and matched against the
// stored E.164 phone, so "06 12 34 56 78" finds "+33612345678". tag: exact
// match. Sorted createdAt desc. Blank params ('' from a cleared box) = unset.
export const listPatientsQuerySchema = paginationQuerySchema.extend({
  search: z.preprocess(blankToUndefined, z.string().trim().max(100).optional()),
  tag: z.preprocess(blankToUndefined, tagSchema.optional()),
});
export type ListPatientsQuery = z.infer<typeof listPatientsQuerySchema>;

export const patientListResponseSchema = paginated(patientSchema);
