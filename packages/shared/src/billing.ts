import { z } from 'zod';

// Contracts for docs/api/billing.md (S3-3). Both billing endpoints answer with
// a Stripe-hosted URL the browser is sent to — no card data ever touches us,
// and no request body is accepted (success/cancel URLs are server-derived, so
// a client can never turn checkout into an open redirect).
export const billingSessionResponseSchema = z.object({
  url: z.url(),
});
export type BillingSessionResponse = z.infer<typeof billingSessionResponseSchema>;
