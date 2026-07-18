# @zenvy/api

The single backend and source of truth: NestJS + Prisma + BullMQ. All external services (Meta WhatsApp, Stripe, OpenAI, DB) are reached only through this API — frontends never call them directly. Module map in `docs/01-architecture.md`; conventions in `docs/03-api-conventions.md`.

Currently a skeleton — first real endpoint arrives with S0-2 (docker hello-world) and S0-5 (auth).

## Commands

```sh
pnpm --filter @zenvy/api start:dev   # watch mode on :3001
pnpm --filter @zenvy/api build
```
