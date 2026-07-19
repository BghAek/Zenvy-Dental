// The DB-backed suites create and delete rows — never let them silently fall
// back to the repo-root .env (which may point at a shared Neon dev branch).
// CI and docs/13-local-dev.md §Tests both provide DATABASE_URL explicitly.
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL must be set explicitly to a disposable test database (docs/13-local-dev.md §Tests)',
  );
}

// The suite needs no real secret — sessions are minted and consumed in-process.
process.env.BETTER_AUTH_SECRET ??= 'zenvy-test-secret';
