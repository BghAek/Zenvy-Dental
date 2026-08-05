import { z } from 'zod';
import {
  clinicOnboardingStatusSchema,
  errorSeveritySchema,
  onboardingRequestStatusSchema,
  planSchema,
  roleSchema,
  subscriptionStatusSchema,
  supportThreadStatusSchema,
} from './enums';
import {
  blankToUndefined,
  isoDateTimeSchema,
  paginated,
  paginationQuerySchema,
  requiredText,
} from './primitives';

// Contracts for docs/api/ops.md (S4-1): owner-portal endpoints, SUPER_ADMIN
// only. These are the one place where `clinicId` legitimately crosses the
// boundary — the founder is explicitly cross-tenant (docs/04-security.md).
// Support threads are the exception in the other direction: the same shapes
// serve the clinic-facing `/support-threads` routes, where tenancy is implicit.

/** Which client a cross-tenant row belongs to — enough to label a table row. */
export const clinicRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});
export type ClinicRef = z.infer<typeof clinicRefSchema>;

// ---------- Clients ----------

// One row of the owner portal's client list. Read-only by design: subscription
// state belongs to Stripe and clinic data to the clinic (decision D35).
export const opsClientSchema = clinicRefSchema.extend({
  phone: z.string().nullable(),
  onboardingStatus: clinicOnboardingStatusSchema,
  subscription: z
    .object({
      status: subscriptionStatusSchema,
      plan: planSchema,
      trialEndsAt: isoDateTimeSchema.nullable(),
    })
    .nullable(),
  // True once a WhatsApp number is attached and verified — the single fact the
  // founder checks while running a manual onboarding.
  whatsappConnected: z.boolean(),
  counts: z.object({
    patients: z.number().int(),
    conversations: z.number().int(),
    users: z.number().int(),
  }),
  createdAt: isoDateTimeSchema,
});
export type OpsClient = z.infer<typeof opsClientSchema>;

export const listOpsClientsQuerySchema = paginationQuerySchema.extend({
  search: z.preprocess(blankToUndefined, z.string().max(100).optional()),
  subscriptionStatus: z.preprocess(blankToUndefined, subscriptionStatusSchema.optional()),
  onboardingStatus: z.preprocess(blankToUndefined, clinicOnboardingStatusSchema.optional()),
});
export type ListOpsClientsQuery = z.infer<typeof listOpsClientsQuerySchema>;

export const opsClientListResponseSchema = paginated(opsClientSchema);

// ---------- Error log ----------

// List row: no stack, no context — the viewer fetches those per row.
export const opsErrorSummarySchema = z.object({
  id: z.string(),
  correlationId: z.string().nullable(),
  clinic: clinicRefSchema.nullable(),
  userId: z.string().nullable(),
  module: z.string(),
  severity: errorSeveritySchema,
  message: z.string(),
  createdAt: isoDateTimeSchema,
});
export type OpsErrorSummary = z.infer<typeof opsErrorSummarySchema>;

export const opsErrorSchema = opsErrorSummarySchema.extend({
  stack: z.string().nullable(),
  context: z.unknown().nullable(),
});
export type OpsError = z.infer<typeof opsErrorSchema>;

// The support flow (docs/06-observability.md): a clinic reports the reference
// code from its error screen, the founder pastes it into `correlationId`.
export const listOpsErrorsQuerySchema = paginationQuerySchema.extend({
  clinicId: z.preprocess(blankToUndefined, z.string().optional()),
  correlationId: z.preprocess(blankToUndefined, z.string().optional()),
  module: z.preprocess(blankToUndefined, z.string().max(100).optional()),
  severity: z.preprocess(blankToUndefined, errorSeveritySchema.optional()),
  since: z.preprocess(blankToUndefined, isoDateTimeSchema.optional()),
  until: z.preprocess(blankToUndefined, isoDateTimeSchema.optional()),
});
export type ListOpsErrorsQuery = z.infer<typeof listOpsErrorsQuerySchema>;

export const opsErrorListResponseSchema = paginated(opsErrorSummarySchema);

// ---------- Onboarding queue ----------

export const opsOnboardingRequestSchema = z.object({
  id: z.string(),
  clinic: clinicRefSchema,
  status: onboardingRequestStatusSchema,
  notes: z.string().nullable(),
  scheduledCallAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type OpsOnboardingRequest = z.infer<typeof opsOnboardingRequestSchema>;

export const listOpsOnboardingRequestsQuerySchema = paginationQuerySchema.extend({
  status: z.preprocess(blankToUndefined, onboardingRequestStatusSchema.optional()),
  clinicId: z.preprocess(blankToUndefined, z.string().optional()),
});
export type ListOpsOnboardingRequestsQuery = z.infer<typeof listOpsOnboardingRequestsQuerySchema>;

export const opsOnboardingRequestListResponseSchema = paginated(opsOnboardingRequestSchema);

// PATCH — every field optional; `null` clears notes / the scheduled call.
export const updateOpsOnboardingRequestSchema = z.object({
  status: onboardingRequestStatusSchema.optional(),
  notes: z.string().max(2000).nullable().optional(),
  scheduledCallAt: isoDateTimeSchema.nullable().optional(),
});
export type UpdateOpsOnboardingRequest = z.infer<typeof updateOpsOnboardingRequestSchema>;

// ---------- Support threads (both sides) ----------

const supportBodySchema = requiredText(4000, 'Message vide.');

// `authorName` is null for support replies: the clinic sees the role, never the
// founder's personal name (and the founder gains nothing from seeing their own).
export const supportMessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  authorRole: roleSchema.nullable(),
  authorName: z.string().nullable(),
  body: z.string(),
  createdAt: isoDateTimeSchema,
});
export type SupportMessage = z.infer<typeof supportMessageSchema>;

export const supportThreadSummarySchema = z.object({
  id: z.string(),
  clinic: clinicRefSchema,
  subject: z.string().nullable(),
  status: supportThreadStatusSchema,
  lastMessageAt: isoDateTimeSchema.nullable(),
  // Last message body truncated to 140 chars server-side.
  lastMessagePreview: z.string().nullable(),
  messageCount: z.number().int(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type SupportThreadSummary = z.infer<typeof supportThreadSummarySchema>;

export const supportThreadSchema = supportThreadSummarySchema.extend({
  messages: z.array(supportMessageSchema),
});
export type SupportThread = z.infer<typeof supportThreadSchema>;

// `clinicId` filter is accepted on the ops route only; the clinic-facing route
// ignores it — its tenant comes from the session, never from a query string.
export const listSupportThreadsQuerySchema = paginationQuerySchema.extend({
  status: z.preprocess(blankToUndefined, supportThreadStatusSchema.optional()),
  clinicId: z.preprocess(blankToUndefined, z.string().optional()),
});
export type ListSupportThreadsQuery = z.infer<typeof listSupportThreadsQuerySchema>;

export const supportThreadListResponseSchema = paginated(supportThreadSummarySchema);

// POST /support-threads — opening a thread carries its first message.
export const createSupportThreadRequestSchema = z.object({
  subject: z.preprocess(blankToUndefined, z.string().max(200).optional()),
  body: supportBodySchema,
});
export type CreateSupportThreadRequest = z.infer<typeof createSupportThreadRequestSchema>;

export const createSupportMessageRequestSchema = z.object({
  body: supportBodySchema,
});
export type CreateSupportMessageRequest = z.infer<typeof createSupportMessageRequestSchema>;

// PATCH /ops/support-threads/:id — close or reopen by hand.
export const updateSupportThreadRequestSchema = z.object({
  status: supportThreadStatusSchema,
});
export type UpdateSupportThreadRequest = z.infer<typeof updateSupportThreadRequestSchema>;
