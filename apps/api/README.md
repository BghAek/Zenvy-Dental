# @zenvy/api

The single backend and source of truth: NestJS + Prisma + BullMQ. All external services (Meta WhatsApp, Stripe, OpenAI, DB) are reached only through this API — frontends never call them directly. Module map in `docs/01-architecture.md`; conventions in `docs/03-api-conventions.md`.

Routes: `GET /health` (public, static ok — S0-2); Better Auth under `/api/v1/auth/*` (S0-5); everything else lives under `/api/v1`, requires a session cookie and an explicit `@Roles()` allow-list (deny by default). Tenant isolation is enforced centrally by the Prisma extension in `src/tenancy/` — business code imports the scoped `prisma` client from `src/prisma/client.ts`, never the base client.

## Commands

```sh
pnpm --filter @zenvy/api start:dev   # watch mode on :3001 (needs BETTER_AUTH_SECRET, see docs/13-local-dev.md)
pnpm --filter @zenvy/api build       # prisma generate + nest build
pnpm --filter @zenvy/api test        # vitest — DB suites need DATABASE_URL (docs/13-local-dev.md §Tests)
```
