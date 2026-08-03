import { Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { basePrisma } from '../prisma/client';
import { dueScheduledMessages, type OutboundJob, sendScheduled } from './outbound.processor';

// S3-2 outbound queue (docs/api/whatsapp-templates.md §Sending one). The
// schedule lives in Postgres — S2-4 writes, re-times and cancels ScheduledMessage
// rows on every appointment write — so this side only sweeps for rows that are
// due and hands each to a job. Redis carries the send and its retries, never
// the calendar: a flushed Redis loses nothing but the in-flight attempt.

export const OUTBOUND_QUEUE = 'whatsapp-outbound';

const SWEEP_MS = 60_000;
/** Per sweep. A backlog drains over the following minutes rather than at once. */
const SWEEP_BATCH = 200;

const connection = () => ({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });

let queue: Queue<OutboundJob> | undefined;

/** Connects on first use only: tests and CI never open a Redis socket. */
function outboundQueue(): Queue<OutboundJob> {
  return (queue ??= new Queue<OutboundJob>(OUTBOUND_QUEUE, {
    connection: connection(),
    defaultJobOptions: {
      // A reminder is not latency-critical, so back off in minutes: the usual
      // failure is Meta or the network, and three fast retries would all miss.
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: true,
      removeOnFail: 500,
    },
  }));
}

/** Enqueues everything due. The job id is the row id, so a row already in
 *  flight is not enqueued twice by the next sweep. */
export async function sweepScheduled(): Promise<number> {
  const due = await dueScheduledMessages(SWEEP_BATCH);
  for (const job of due) {
    await outboundQueue().add('send', job, { jobId: job.scheduledMessageId });
    await basePrisma.scheduledMessage.update({
      where: { id: job.scheduledMessageId },
      data: { jobId: job.scheduledMessageId },
    });
  }
  return due.length;
}

/** The row after the last retry: no longer coming, and why. */
async function markFailed(job: OutboundJob, attempts: number, error: Error): Promise<void> {
  await basePrisma.scheduledMessage.updateMany({
    where: { id: job.scheduledMessageId, status: 'PENDING' },
    data: { status: 'FAILED' },
  });
  await basePrisma.errorLog.create({
    data: {
      clinicId: job.clinicId,
      module: 'whatsapp',
      severity: 'ERROR',
      message: `Scheduled message failed after ${attempts} attempt(s): ${error.message}`,
      context: { scheduledMessageId: job.scheduledMessageId },
    },
  });
}

/** Started by main.ts only, beside the inbound worker.
 *  ponytail: one interval in the single API process (docs/01) — a second
 *  instance would sweep twice, which the job id already deduplicates. */
export function startOutboundSender(): { worker: Worker<OutboundJob>; sweep: NodeJS.Timeout } {
  const logger = new Logger('WhatsAppOutboundWorker');
  const worker = new Worker<OutboundJob>(OUTBOUND_QUEUE, (job) => sendScheduled(job.data), {
    connection: connection(),
  });

  worker.on('failed', (job, error) => {
    logger.error(`Scheduled send ${job?.data.scheduledMessageId ?? '?'} failed: ${error.message}`);
    // `finishedOn` is set only once BullMQ has stopped retrying — a job on its
    // way to another attempt has none, and the row must stay PENDING for it.
    if (!job?.finishedOn) return;
    // Out of retries: the row stops claiming it is still coming, and the clinic
    // sees why in the error log (docs/06-observability.md). Caught here because
    // a rejected listener would take the process down with it.
    void markFailed(job.data, job.attemptsMade, error).catch((dbError: Error) =>
      logger.error(`Could not record the failure: ${dbError.message}`),
    );
  });

  const sweep = setInterval(() => {
    sweepScheduled().catch((error: Error) => logger.error(`Sweep failed: ${error.message}`));
  }, SWEEP_MS);
  logger.log(`Listening on ${OUTBOUND_QUEUE}, sweeping every ${SWEEP_MS / 1000}s`);
  return { worker, sweep };
}
