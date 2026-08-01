import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { API_BASE_PATH } from '@zenvy/shared';
import { toNodeHandler } from 'better-auth/node';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { auth } from './auth/auth';

// Rate limits (docs/04-security.md §Platform hardening): tight on /auth
// (brute force), generous on /webhooks (Meta batches and retries), nothing on
// authenticated CRUD — a session is already a cost to obtain.
// Express middleware rather than a Nest guard because Better Auth is mounted as
// a raw handler below and never reaches Nest's guard pipeline (D20).
// ponytail: in-memory store, single API process in v1 (docs/01 §Deploy); move to
// the Redis store when the API runs more than one instance.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, limit: 600 });

// Shared by main.ts and the e2e tests so both run the exact same pipeline.
export async function createApp(): Promise<INestApplication> {
  // Better Auth reads the raw body itself; its handler is mounted before the
  // JSON body parser is re-enabled for the rest of the API.
  // rawBody keeps the exact bytes available for webhook HMAC checks (Meta, Stripe).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    rawBody: true,
  });

  // One hop: nginx on the VPS (docs/01 §Deploy). Without this every request
  // keys on the proxy's IP and the limiters throttle all clinics as one.
  app.set('trust proxy', 1);
  app.use(helmet());
  // Same-origin in production (nginx proxies /api), so the allowlist is empty
  // by default and cross-origin browsers fail closed. Set CORS_ORIGINS only for
  // the split-origin local setup (VITE_API_URL) or an api. subdomain.
  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length) app.enableCors({ origin: origins, credentials: true });

  app.use(`${API_BASE_PATH}/auth`, authLimiter);
  app.use(`${API_BASE_PATH}/auth`, toNodeHandler(auth));
  app.use(`${API_BASE_PATH}/webhooks`, webhookLimiter);
  app.useBodyParser('json');
  app.setGlobalPrefix(API_BASE_PATH.slice(1), { exclude: ['health'] });
  return app;
}
