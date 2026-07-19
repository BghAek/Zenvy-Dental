import './env';

async function bootstrap() {
  // Imported after env so module-level config (Prisma, Better Auth) sees .env.
  const { createApp } = await import('./app');
  const app = await createApp();
  await app.listen(process.env.PORT ?? 3001);
}

void bootstrap();
