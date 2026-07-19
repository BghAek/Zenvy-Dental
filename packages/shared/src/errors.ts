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
