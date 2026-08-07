import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import {
  API_PORT,
  BETTER_AUTH_SECRET,
  META_APP_SECRET,
  META_STUB_PORT,
  WEB_PORT,
  WEB_URL,
} from './support/env';

// S4-5 end-to-end suite (docs/07 §Testing philosophy): one happy path per
// critical flow, driven through the stack that actually ships — the built
// dashboard, the built API, Postgres, Redis. Nothing in the product is mocked;
// the only stand-in is the local Meta Graph stub, because a CI run has no
// WhatsApp number to send from.
//
// The dashboard is served by `vite preview`, whose /api proxy puts it on the
// same origin as the API — the production topology (nginx, docs/01 §Deploy).

const repoRoot = path.resolve(__dirname, '../..');

// The suite needs the demo seed, and that seed deletes and rebuilds clinics.
// Same guard as the API's vitest setup, for the same reason: never let a run
// fall back to the repo-root .env and rebuild someone's shared Neon branch.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL must be set explicitly to a seeded, disposable database (docs/13-local-dev.md §E2E)',
  );
}

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  // The inbox polls every 5s, so an assertion that waits on a WhatsApp message
  // has to outlast one poll plus the queue hop.
  expect: { timeout: 15_000 },
  // One worker: every spec drives the same seeded clinic.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // The HTML report carries the traces CI uploads on a red run.
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: WEB_URL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node packages/e2e/meta-stub.mjs',
      url: `http://localhost:${META_STUB_PORT}/`,
      cwd: repoRoot,
      env: { PORT: String(META_STUB_PORT) },
      reuseExistingServer: false,
    },
    {
      // The built API, started exactly like production (main.ts also boots the
      // BullMQ workers, which the inbound message depends on).
      command: 'node apps/api/dist/main.js',
      url: `http://localhost:${API_PORT}/health`,
      cwd: repoRoot,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: databaseUrl,
        REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
        PORT: String(API_PORT),
        BETTER_AUTH_SECRET,
        // Public origin is the dashboard's: preview proxies /api, so cookies
        // and the links Better Auth builds are same-origin, as behind nginx.
        BETTER_AUTH_URL: WEB_URL,
        APP_WEB_URL: WEB_URL,
        META_APP_SECRET,
        META_VERIFY_TOKEN: 'e2e-verify-token',
        META_ACCESS_TOKEN: 'e2e-access-token',
        META_GRAPH_BASE_URL: `http://localhost:${META_STUB_PORT}`,
        // Keeps the assistant silent (docs/05 §Cost guard reads the same flag):
        // an inbound message is stored and left in AI status, which is what the
        // takeover test needs. With a real key every inbox assertion would hang
        // on a model's wording. Set explicitly because the API loads the
        // repo-root .env, where a developer's real key may well sit.
        OPENAI_API_KEY: 'CHANGE_ME',
        // The mailer refuses to log verification links in production.
        NODE_ENV: 'test',
      },
    },
    {
      command: `pnpm --filter @zenvy/web preview --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      cwd: repoRoot,
      reuseExistingServer: false,
    },
  ],
});
