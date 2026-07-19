import { prismaAdapter } from '@better-auth/prisma-adapter';
import { betterAuth } from 'better-auth';
import { basePrisma } from '../prisma/client';

if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET === 'CHANGE_ME') {
  throw new Error('BETTER_AUTH_SECRET is required — generate one with: openssl rand -base64 32');
}

export const auth = betterAuth({
  // Session cookies default to HttpOnly + SameSite=Lax, Secure whenever the
  // baseURL is https (docs/04-security.md §Authentication).
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3001',
  basePath: '/api/v1/auth',
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(basePrisma, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    // Email-verification gate ships with the register flow (S1-2).
  },
  session: {
    // Rolling expiry: 7-day sessions, refreshed after a day of activity.
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  user: {
    additionalFields: {
      // input:false — a sign-up payload can never choose its role or clinic.
      // role falls back to the DB default (CLINIC_STAFF); clinicId is assigned
      // by the clinic-creation flow (S1-2).
      role: { type: 'string', required: false, input: false },
      clinicId: { type: 'string', required: false, input: false },
    },
  },
  advanced: {
    // Let Prisma's cuid() defaults generate ids, like every other model.
    database: { generateId: false },
  },
});

type SessionUser = (typeof auth.$Infer.Session)['user'];

declare module 'express' {
  interface Request {
    /** Set by tenantContextMiddleware when a valid session cookie is present. */
    sessionUser?: SessionUser;
  }
}
