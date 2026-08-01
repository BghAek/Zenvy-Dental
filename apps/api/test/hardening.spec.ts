import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { basePrisma } from '../src/prisma/client';

// S2-7 platform hardening (docs/04-security.md §Platform hardening): the
// security headers and the rate limits are wired into the pipeline every
// process uses, so they are asserted against the real app, not a unit.

describe('platform hardening (S2-7)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const { createApp } = await import('../src/app');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await basePrisma.$disconnect();
  });

  it('sends helmet security headers', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    // Helmet also drops the framework fingerprint.
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('answers cross-origin requests with no allowlist configured', async () => {
    // CORS_ORIGINS is unset here, as in the same-origin production deploy: the
    // browser gets no allow header and blocks the response.
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rate-limits the auth path against brute force', async () => {
    const signIn = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/email')
        .send({ email: `s2-7-${Math.random()}@example.test`, password: 'wrong-password' });

    // The limiter is the only thing that can answer 429 here — the credentials
    // are wrong on every attempt, so success is never the reason it stops.
    let last = await signIn();
    for (let attempt = 0; attempt < 40 && last.status !== 429; attempt += 1) {
      last = await signIn();
    }
    expect(last.status).toBe(429);
  });
});
