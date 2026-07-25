import { z } from 'zod';
import { appointmentStatusSchema, scheduledMessageKindSchema, scheduledMessageStatusSchema } from './enums';
import { patientSummarySchema } from './patients';
import {
  blankToUndefined,
  isoDateTimeSchema,
  paginated,
  paginationQuerySchema,
  requiredText,
} from './primitives';

// Contracts for docs/api/appointments.md (S2-1). clinicId never crosses the
// boundary — tenancy is derived from the session (docs/03-api-conventions.md).

// 5 min to 8 h — anything outside is a typo, not a dental appointment.
const durationSchema = z
  .number()
  .int()
  .min(5, 'Durée minimale : 5 minutes.')
  .max(480, 'Durée maximale : 480 minutes.');

const typeSchema = requiredText(100);

// Reminder/follow-up rows the appointment lifecycle owns (S2-4), read-only from
// the API's point of view — clinics see them, they don't edit them.
export const appointmentReminderSchema = z.object({
  id: z.string(),
  kind: scheduledMessageKindSchema,
  sendAt: isoDateTimeSchema,
  status: scheduledMessageStatusSchema,
});
export type AppointmentReminder = z.infer<typeof appointmentReminderSchema>;

export const appointmentSchema = z.object({
  id: z.string(),
  patient: patientSummarySchema,
  startsAt: isoDateTimeSchema,
  durationMin: durationSchema,
  type: z.string(),
  status: appointmentStatusSchema,
  reminders: z.array(appointmentReminderSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Appointment = z.infer<typeof appointmentSchema>;

// POST /appointments — status defaults to SCHEDULED. patientId is fixed at
// creation: moving an appointment to another patient = delete + re-create.
export const createAppointmentRequestSchema = z.object({
  patientId: z.string().min(1, 'Patient requis.'),
  startsAt: isoDateTimeSchema,
  durationMin: durationSchema,
  type: typeSchema,
  status: appointmentStatusSchema.default('SCHEDULED'),
});
export type CreateAppointmentRequest = z.infer<typeof createAppointmentRequestSchema>;

// PATCH /appointments/:id — any subset; each change re-runs the reminder rules.
export const updateAppointmentRequestSchema = z
  .object({
    startsAt: isoDateTimeSchema,
    durationMin: durationSchema,
    type: typeSchema,
    status: appointmentStatusSchema,
  })
  .partial();
export type UpdateAppointmentRequest = z.infer<typeof updateAppointmentRequestSchema>;

// GET /appointments — sorted startsAt asc (then id asc). from/to bound startsAt
// (from inclusive, to exclusive); blank params ('' from a cleared filter) = unset.
export const listAppointmentsQuerySchema = paginationQuerySchema.extend({
  from: z.preprocess(blankToUndefined, isoDateTimeSchema.optional()),
  to: z.preprocess(blankToUndefined, isoDateTimeSchema.optional()),
  patientId: z.preprocess(blankToUndefined, z.string().optional()),
  status: z.preprocess(blankToUndefined, appointmentStatusSchema.optional()),
});
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;

export const appointmentListResponseSchema = paginated(appointmentSchema);
