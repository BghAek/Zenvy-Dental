import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import { AppModule } from './app.module';
import { auth } from './auth/auth';

// Shared by main.ts and the e2e tests so both run the exact same pipeline.
export async function createApp(): Promise<INestApplication> {
  // Better Auth reads the raw body itself; its handler is mounted before the
  // JSON body parser is re-enabled for the rest of the API.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.use('/api/v1/auth', toNodeHandler(auth));
  app.useBodyParser('json');
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  return app;
}
