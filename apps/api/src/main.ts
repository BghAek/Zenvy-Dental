import './env';

async function bootstrap() {
  // Imported after env so module-level config (Prisma, Better Auth) sees .env.
  const { createApp } = await import('./app');
  const app = await createApp();
  await app.listen(process.env.PORT ?? 3001);

  // The API process is also the BullMQ consumer in v1 — started here, never in
  // a module, so the test suite boots the app without touching Redis.
  const { startInboundWorker } = await import('./whatsapp/inbound.queue');
  startInboundWorker();
}

void bootstrap();
