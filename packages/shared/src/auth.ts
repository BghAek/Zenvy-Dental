import { z } from 'zod';
import {
  clinicOnboardingStatusSchema,
  planSchema,
  roleSchema,
  subscriptionStatusSchema,
} from './enums';
import {
  blankToUndefined,
  isoDateTimeSchema,
  phoneInputSchema,
  requiredText,
} from './primitives';

// Contracts for docs/api/auth.md (S1-1). Better Auth owns the /auth/* routes
// and their request/response shapes — these schemas cover only our custom
// identity endpoints (/me, /clinics, /staff-invites).

export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  emailVerified: z.boolean(),
  role: roleSchema,
  clinicId: z.string().nullable(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

// aiConfig is deliberately absent until its contract lands (S3-4).
export const clinicSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  timezone: z.string(),
  locale: z.string(),
  onboardingStatus: clinicOnboardingStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Clinic = z.infer<typeof clinicSchema>;

export const subscriptionSchema = z.object({
  id: z.string(),
  plan: planSchema,
  status: subscriptionStatusSchema,
  trialEndsAt: isoDateTimeSchema.nullable(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

// GET /me — session identity + tenant context in one round trip.
// clinic/subscription are null until the user creates or joins a clinic.
export const meResponseSchema = z.object({
  user: sessionUserSchema,
  clinic: clinicSchema.nullable(),
  subscription: subscriptionSchema.nullable(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

// IANA zone check without a dependency: Intl throws on unknown zones and
// canonicalizes the rest ("europe/paris" → "Europe/Paris").
const timeZoneSchema = z.string().transform((tz, ctx) => {
  try {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Fuseau horaire invalide.' });
    return z.NEVER;
  }
});

// POST /clinics — slug is server-generated from name; the 14-day no-card trial
// starts server-side (Subscription TRIALING, trialEndsAt = now + 14 days).
// Blank optional fields ('' from empty form inputs) count as absent.
export const createClinicRequestSchema = z.object({
  name: requiredText(100, 'Le nom du cabinet est requis.'),
  phone: z.preprocess(blankToUndefined, phoneInputSchema.optional()),
  address: z.preprocess(blankToUndefined, requiredText(300).optional()),
  timezone: z.preprocess(blankToUndefined, timeZoneSchema.default('Europe/Paris')),
});
export type CreateClinicRequest = z.infer<typeof createClinicRequestSchema>;

export const createClinicResponseSchema = z.object({
  clinic: clinicSchema,
  subscription: subscriptionSchema,
});
export type CreateClinicResponse = z.infer<typeof createClinicResponseSchema>;

// POST /staff-invites (CLINIC_OWNER only).
export const createStaffInviteRequestSchema = z.object({
  email: z.email('Adresse e-mail invalide.'),
});
export type CreateStaffInviteRequest = z.infer<typeof createStaffInviteRequestSchema>;

export const staffInviteSchema = z.object({
  id: z.string(),
  email: z.string(),
  expiresAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
});
export type StaffInvite = z.infer<typeof staffInviteSchema>;

// POST /staff-invites/accept — invitee is authenticated, verified, clinic-less.
// Responds with the updated MeResponse so the frontend refreshes in one call.
export const acceptStaffInviteRequestSchema = z.object({
  token: z.string().min(1),
});
export type AcceptStaffInviteRequest = z.infer<typeof acceptStaffInviteRequestSchema>;
