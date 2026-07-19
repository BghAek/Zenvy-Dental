# @zenvy/shared

Shared contracts between the API and the frontends. Contract-first rule: schemas land here (plus `docs/api/`) **before** either side implements. See `docs/03-api-conventions.md`.

## Contents

- `errors.ts` — generic error codes (`ERROR_CODES` with default HTTP statuses), the error-envelope Zod schema, `ApiError`. Module-specific codes are added with each contract task.
- `enums.ts` — Zod mirrors of the Prisma enums (`apps/api/prisma/schema.prisma` is the source of truth; keep in sync).
- `primitives.ts` — `phoneE164Schema`, cursor `paginationQuerySchema` (limit ≤ 100, default 20), `paginated(item)` response envelope.
- `client.ts` — `createApiClient(baseUrl)`: thin typed `fetch` wrapper (`/api/v1`, cookie credentials, Zod-parsed responses, throws `ApiError`). Both frontends consume it via `src/lib/api.ts`.

Validation error messages in schemas are **French** — they can surface directly in the UI.

## Commands

```sh
pnpm --filter @zenvy/shared build
pnpm --filter @zenvy/shared test   # zero-dependency selftest (node, no framework)
```
