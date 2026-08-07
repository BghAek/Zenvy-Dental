import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { basePrisma } from '../src/prisma/client';

// S4-6 (docs/06-observability.md §Health & uptime): the uptime monitor keyword-
// matches `"status":"ok"`, so what matters is that a broken dependency actually
// changes that word — a probe that answers "ok" whatever happens is decoration.

describe('health endpoint (S4-6)', () => {
  let app: INestApplication;
  const realRedisUrl = process.env.REDIS_URL;

  beforeAll(async () => {
    const { createApp } = await import('../src/app');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    if (realRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = realRedisUrl;
    await app.close();
    await basePrisma.$disconnect();
  });

  it('reports the database it can actually query', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.checks.db).toBe('ok');
  });

  it('reports degraded when Redis is unreachable', async () => {
    // Port 1 refuses instantly: the probe must answer "down", not hang.
    process.env.REDIS_URL = 'redis://127.0.0.1:1';
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({
      status: 'degraded',
      checks: { redis: 'down', queueDepth: null },
    });
  });
});
