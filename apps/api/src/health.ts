import { Queue } from 'bullmq';
import { basePrisma } from './prisma/client';
import { INBOUND_QUEUE } from './whatsapp/inbound.queue';
import { OUTBOUND_QUEUE } from './whatsapp/outbound.queue';

// What the uptime monitor reads (docs/06-observability.md §Health & uptime).
// "The process is listening" is not the question: without Postgres the API
// answers nothing useful, and without Redis it silently stops sending. The
// answer stays 200 even when degraded — UptimeRobot keyword-matches
// `"status":"ok"`, and a 5xx here would write one ErrorLog row per probe (D41).

export interface HealthReport {
  status: 'ok' | 'degraded';
  checks: {
    db: 'ok' | 'down';
    redis: 'ok' | 'down';
    /** Jobs waiting across both WhatsApp queues; null when Redis is down. */
    queueDepth: number | null;
  };
}

const PROBE_TIMEOUT_MS = 5_000;

// ioredis reconnects forever by default, so a probe against a dead Redis would
// hang rather than answer "down" — a monitor that never alerts, and a test run
// that times out on any machine without Redis.
const probeConnection = () => ({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  retryStrategy: () => null,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  connectTimeout: 2_000,
});

/** A probe that neither answers nor fails is the same as a failing one. */
function withTimeout<T>(work: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), PROBE_TIMEOUT_MS).unref()),
  ]);
}

async function probeDb(): Promise<boolean> {
  try {
    await basePrisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Waiting jobs across both queues, or null when Redis cannot be reached. */
async function probeQueues(): Promise<number | null> {
  // ponytail: connects per probe — one monitor every few minutes does not justify
  // a shared client that shutdown and every test touching /health would close.
  const queues = [INBOUND_QUEUE, OUTBOUND_QUEUE].map((name) => {
    const queue = new Queue(name, { connection: probeConnection() });
    // A refused connection also surfaces as an 'error' event, which crashes the
    // process if nothing listens. The rejected command below is the report.
    queue.on('error', () => undefined);
    return queue;
  });
  // Each queue swallows its own failure: BullMQ connects in the background, and
  // a Promise.all over two rejections leaves the second one unhandled — which
  // is a crashed API process, from a health check.
  const depths = await Promise.all(
    queues.map((queue) =>
      queue
        .waitUntilReady()
        .then(() => queue.getWaitingCount())
        .catch(() => null),
    ),
  );
  await Promise.all(queues.map((queue) => queue.close().catch(() => undefined)));
  if (depths.includes(null)) return null;
  return depths.reduce<number>((total, depth) => total + (depth ?? 0), 0);
}

export async function healthReport(): Promise<HealthReport> {
  const [db, queueDepth] = await Promise.all([
    withTimeout(probeDb(), false),
    withTimeout(probeQueues(), null),
  ]);
  return {
    status: db && queueDepth !== null ? 'ok' : 'degraded',
    checks: {
      db: db ? 'ok' : 'down',
      redis: queueDepth === null ? 'down' : 'ok',
      queueDepth,
    },
  };
}
