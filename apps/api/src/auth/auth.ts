import { prismaAdapter } from '@better-auth/prisma-adapter';
import { API_BASE_PATH } from '@zenvy/shared';
import { betterAuth } from 'better-auth';
import { createEmailVerificationToken } from 'better-auth/api';
import { sendMail } from '../mail/mailer';
import { basePrisma } from '../prisma/client';

if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET === 'CHANGE_ME') {
  throw new Error('BETTER_AUTH_SECRET is required — generate one with: openssl rand -base64 32');
}

const secret = process.env.BETTER_AUTH_SECRET;
const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001';

// Behind nginx every app is its own origin (docs/01 §Infrastructure): the
// dashboard is the baseURL, so the owner portal has to be trusted explicitly or
// Better Auth answers 403 INVALID_ORIGIN on the founder's sign-in. Same shape
// as CORS_ORIGINS — an exact-origin allowlist, empty by default (S4-6).
const trustedOrigins = [
  baseURL,
  ...(process.env.AUTH_TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
];

const sendVerificationMail = async (user: { email: string; name: string }): Promise<void> => {
  const url = `${baseURL}${API_BASE_PATH}/auth/verify-email?token=${await createEmailVerificationToken(secret, user.email)}&callbackURL=${encodeURIComponent('/')}`;
  await sendMail({
    to: user.email,
    subject: 'Vérifiez votre adresse e-mail — ZenvyDental',
    text: `Bonjour ${user.name},\n\nPour vérifier votre adresse e-mail, cliquez sur ce lien : ${url}`,
  });
};

export const auth = betterAuth({
  // Session cookies default to HttpOnly + SameSite=Lax, Secure whenever the
  // baseURL is https (docs/04-security.md §Authentication).
  baseURL,
  basePath: `${API_BASE_PATH}/auth`,
  secret,
  trustedOrigins,
  database: prismaAdapter(basePrisma, { provider: 'postgresql' }),
  databaseHooks: {
    user: {
      create: {
        // The initial verification mail. Deliberately NOT sendOnSignUp: that
        // path hands `ctx.request.clone()` to the callback, which crashes the
        // whole sign-up under vitest's module graph (undici "unusable") —
        // this hook needs nothing from the request, so no clone anywhere.
        after: async (user) => {
          await sendVerificationMail(user);
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    // Sign-in stays open before verification — the gate is on clinic creation
    // and invite acceptance (403 EMAIL_NOT_VERIFIED, docs/api/auth.md).
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: 'Réinitialisation de votre mot de passe ZenvyDental',
        text: `Bonjour ${user.name},\n\nPour réinitialiser votre mot de passe, cliquez sur ce lien : ${url}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`,
      });
    },
  },
  emailVerification: {
    // Covers the explicit re-send endpoint (POST /auth/send-verification-email).
    sendVerificationEmail: async ({ user }) => {
      await sendVerificationMail(user);
    },
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
    // Better Auth turns the Origin check off by itself whenever NODE_ENV=test.
    // Pinned on so the suites exercise what production enforces, and so an API
    // booted with a stray NODE_ENV never silently drops CSRF checks (S4-6).
    disableOriginCheck: false,
  },
});

type SessionUser = (typeof auth.$Infer.Session)['user'];

declare module 'express' {
  interface Request {
    /** Set by tenantContextMiddleware when a valid session cookie is present. */
    sessionUser?: SessionUser;
  }
}
