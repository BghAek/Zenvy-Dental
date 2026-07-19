import path from 'node:path';

// Runtime mirror of prisma.config.ts: real environment (docker/CI) wins; bare
// `pnpm start:dev` falls back to the repo-root .env. Imported first in main.ts
// so module-level reads (Prisma client, Better Auth) see the variables.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(path.join(__dirname, '../../../.env'));
  } catch {
    // No .env — variables must come from the environment.
  }
}
