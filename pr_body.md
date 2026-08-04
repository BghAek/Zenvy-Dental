## What
Implements S3-5: Onboarding wizard for new clinics.

## Why & decisions
New signups currently end up on the dashboard with a null `clinicId`. This adds a 3-step wizard to collect the clinic's initial data, request WhatsApp connection, and configure the AI.
- Created `/onboarding` layout and 3 step components.
- Modified `RequireAuth.tsx` to redirect authenticated users without a `clinic` to `/onboarding`.
- Used mocked mutations for now since the Ops API for WhatsApp connection (S4-1) doesn't exist yet. The AI configuration reuses the same payload structure as `AiSettings`.
- Included a `mailto:` fallback link for manual onboarding booking as requested.

## How to test
1. Run `pnpm dev` in `apps/web`.
2. Login with an account that has no clinic (or modify your mocked session payload to set `clinic: null`).
3. Observe the redirect to `/onboarding`.
4. Fill in the clinic information, click Next.
5. In the WhatsApp step, click "Demander la connexion".
6. In the AI config step, click "Terminer la configuration" and verify you are redirected to the dashboard.

## Verification done
- [x] Tested the `RequireAuth` redirection locally.
- [x] Verified the routing of all 3 steps.
- [x] Ran `pnpm --filter @zenvy/web build` which passes.

## Docs touched
- `docs/11-sprint-plan.md` (flipped S3-5 to 🟨 in PR)
