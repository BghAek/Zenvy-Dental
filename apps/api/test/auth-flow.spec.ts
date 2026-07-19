import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { basePrisma } from '../src/prisma/client';

// End-to-end over the real pipeline (Better Auth handler → session middleware
// → RBAC guard): the S0-5 "auth'd hello route" deliverable.
describe('auth flow', () => {
  let app: INestApplication;
  const email = `s05-test-${Date.now()}@zenvy.test`;

  beforeAll(async () => {
    const { createApp } = await import('../src/app');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await basePrisma.user.deleteMany({ where: { email } });
    await app.close();
    await basePrisma.$disconnect();
  });

  it('serves /health publicly', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });

  it('rejects /api/v1/hello without a session (401)', async () => {
    await request(app.getHttpServer()).get('/api/v1/hello').expect(401);
  });

  it('signs up, gets a session cookie, and reaches the hello route', async () => {
    const signUp = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .send({ email, password: 'MotDePasse123!', name: 'Docteur Test' })
      .expect(200);

    const cookies = signUp.get('Set-Cookie');
    expect(cookies?.some((c) => c.includes('session_token'))).toBe(true);

    const hello = await request(app.getHttpServer())
      .get('/api/v1/hello')
      .set('Cookie', cookies!)
      .expect(200);

    expect(hello.body).toEqual({
      message: 'Bonjour Docteur Test !',
      role: 'CLINIC_STAFF',
      clinicId: null,
    });
  });

  it('rejects a client-supplied role at sign-up (mass-assignment defense)', async () => {
    const forgedEmail = `s05-forged-${Date.now()}@zenvy.test`;
    // role/clinicId are input:false — a body trying to set them is invalid.
    await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .send({
        email: forgedEmail,
        password: 'MotDePasse123!',
        name: 'Intrus',
        role: 'SUPER_ADMIN',
      })
      .expect(400);

    const user = await basePrisma.user.findUnique({ where: { email: forgedEmail } });
    expect(user).toBeNull();
  });
});
