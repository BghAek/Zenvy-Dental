# @zenvy/api

The single backend and source of truth: NestJS + Prisma + BullMQ. All external services (Meta WhatsApp, Stripe, OpenAI, DB) are reached only through this API — frontends never call them directly. Module map in `docs/01-architecture.md`; conventions in `docs/03-api-conventions.md`.

Routes: `GET /health` (static ok — S0-2); everything else lives under `/api/v1` (global prefix). Auth arrives with S0-5.

## Commands

```sh
pnpm --filter @zenvy/api start:dev   # watch mode on :3001
pnpm --filter @zenvy/api build
```
