import path from 'node:path';

// Runtime mirror of prisma.config.ts: loads the repo-root .env for bare
// `pnpm start:dev`. loadEnvFile never overrides variables already present in
// the environment (docker/CI/inline values win), so this is unconditional —
// gating it on one variable would skip the file when only that one is set.
// Imported first in main.ts so module-level reads (Prisma, Better Auth) see it.
try {
  process.loadEnvFile(path.join(__dirname, '../../../.env'));
} catch {
  // No .env — variables must come from the environment.
}
