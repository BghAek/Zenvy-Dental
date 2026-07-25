import { Injectable, Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { processInbound } from './inbound.processor';

// S2-2 ingest queue (docs/api/conversations.md §Webhook internals): the webhook
// only signs-checks and enqueues; every DB write happens here, off the request
// path, so Meta always gets its fast 200.

export const INBOUND_QUEUE = 'whatsapp-inbound';

/** One job per `entry[].changes[]` — Meta batches several into one delivery. */
export interface InboundJob {
  phoneNumberId: string;
  receivedAt: string;
  value: unknown;
}

const connection = () => ({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });

@Injectable()
export class InboundQueue {
  private queue?: Queue<InboundJob>;

  /** Connects on first use only: tests and CI never open a Redis socket. */
  async add(job: InboundJob): Promise<void> {
    this.queue ??= new Queue<InboundJob>(INBOUND_QUEUE, {
      connection: connection(),
      defaultJobOptions: {
        // Retries cover a transient DB/Redis blip; the worker is idempotent
        // (dedup on waMessageId), so replaying a job is harmless.
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: 500,
      },
    });
    await this.queue.add('inbound', job);
  }
}

/** Started by main.ts only — the API process is also the worker in v1.
 *  ponytail: one process, split into its own container when volume demands. */
export function startInboundWorker(): Worker<InboundJob> {
  const logger = new Logger('WhatsAppInboundWorker');
  const worker = new Worker<InboundJob>(INBOUND_QUEUE, (job) => processInbound(job.data), {
    connection: connection(),
  });
  worker.on('failed', (job, error) => {
    logger.error(`Inbound job ${job?.id ?? '?'} failed: ${error.message}`);
  });
  logger.log(`Listening on ${INBOUND_QUEUE}`);
  return worker;
}
