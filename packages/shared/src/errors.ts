import { z } from 'zod';

// Generic error codes with their default HTTP status (docs/03-api-conventions.md).
// Module-specific codes (e.g. PATIENT_NOT_FOUND) are added with each contract task.
export const ERROR_CODES = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  DOMAIN_RULE_VIOLATION: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  // Auth / clinic / staff invites (docs/api/auth.md)
  EMAIL_NOT_VERIFIED: 403,
  USER_ALREADY_IN_CLINIC: 409,
  // One code for invalid, expired, or used token — no token probing.
  INVITE_INVALID: 400,
  // Patients (docs/api/patients.md)
  PATIENT_NOT_FOUND: 404,
  PATIENT_PHONE_EXISTS: 409,
  // Conversations (docs/api/conversations.md)
  CONVERSATION_NOT_FOUND: 404,
  // Staff must take the conversation over before replying by hand.
  CONVERSATION_NOT_TAKEN_OVER: 422,
  // Meta's 24h customer-service window closed — templates only (S3-1).
  OUTSIDE_24H_WINDOW: 422,
  // Patient sent STOP (or was opted out by hand): no outbound, ever.
  PATIENT_OPTED_OUT: 422,
  // Appointments (docs/api/appointments.md)
  APPOINTMENT_NOT_FOUND: 404,
  // Billing (docs/api/billing.md)
  // Trial over, payment failed, or subscription cancelled — the clinic must
  // pay before the feature routes answer again.
  SUBSCRIPTION_INACTIVE: 402,
  // Portal asked for before any checkout ever completed: no Stripe customer.
  BILLING_NO_CUSTOMER: 409,
  // Stripe keys absent from the environment — a deployment gap, not user error.
  BILLING_UNAVAILABLE: 503,
  // Ops / support (docs/api/ops.md)
  ERROR_LOG_NOT_FOUND: 404,
  ONBOARDING_REQUEST_NOT_FOUND: 404,
  SUPPORT_THREAD_NOT_FOUND: 404,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

// The one error envelope every API error uses. `message` is French and safe to render.
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    correlationId: z.string().optional(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
