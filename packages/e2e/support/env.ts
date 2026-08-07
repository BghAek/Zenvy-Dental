// Ports, secrets and seeded logins shared by the Playwright config (which
// starts the servers) and the specs (which drive them). Secrets here are
// deliberately fixed and worthless: the suite runs against a disposable,
// freshly seeded database and a stubbed Meta.

export const API_PORT = 3001;
export const WEB_PORT = 4173;
export const META_STUB_PORT = 4010;

export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

export const BETTER_AUTH_SECRET = 'e2e-better-auth-secret';
export const META_APP_SECRET = 'e2e-meta-app-secret';

/** The WhatsApp number the demo seed connects to « Cabinet Dentaire Lumière ». */
export const DEMO_PHONE_NUMBER_ID = '155000000000001';
/** Seeded dashboard login (S4-4, apps/api/prisma/seed.ts). */
export const DEMO_OWNER = { email: 'docteur@lumiere-dentaire.fr', password: 'Demo1234!' };
/** A seeded patient who never sent STOP — so their appointments get reminders. */
export const DEMO_PATIENT = 'Marie Dubois';
