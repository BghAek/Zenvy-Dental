import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 CLI no longer auto-loads .env; pull DATABASE_URL from the repo-root
// .env (see .env.example) unless the environment already provides it.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(path.join(__dirname, '../../.env'));
  } catch {
    // No .env — DATABASE_URL must come from the environment (e.g. CI).
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // env() defers the read and gives a clear error if the variable is missing.
    url: env('DATABASE_URL'),
  },
});
