import '../src/env';

// The suite needs no real secret — sessions are minted and consumed in-process.
process.env.BETTER_AUTH_SECRET ??= 'zenvy-test-secret';
