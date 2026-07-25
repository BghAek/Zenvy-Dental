import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/rbac';
import { InboundQueue } from './inbound.queue';

// Meta webhook receiver — verification handshake (S0-9) + signed event ingest
// (S2-2, docs/api/conversations.md §Webhook internals). Signatures are verified
// before any payload use (docs/04 §Platform hardening); valid events are queued
// and answered 200 with no DB work on the request path. Payloads are never
// logged: they carry patient messages.

// The .env.example placeholder must never act as a real secret (same guard as
// auth.ts on BETTER_AUTH_SECRET) — treat it as unset and fail closed.
const secretFromEnv = (name: string): string | undefined => {
  const value = process.env[name];
  return value && value !== 'CHANGE_ME' ? value : undefined;
};

const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
};

/** Meta's envelope, narrowed to what routing needs. */
interface WebhookBody {
  entry?: {
    changes?: { field?: string; value?: { metadata?: { phone_number_id?: string } } }[];
  }[];
}

@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger('WhatsAppWebhook');

  constructor(private readonly queue: InboundQueue) {}

  @Public()
  @Get()
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    const expected = secretFromEnv('META_VERIFY_TOKEN');
    // `!expected` fails closed when the env var is unset; the typeof guard
    // fends off qs arrays (?hub.verify_token=a&hub.verify_token=b).
    if (
      mode !== 'subscribe' ||
      !expected ||
      typeof token !== 'string' ||
      !safeEqual(token, expected)
    ) {
      this.logger.warn('Webhook verification rejected: bad mode or verify token');
      throw new ForbiddenException('Vérification du webhook refusée.');
    }
    this.logger.log('Webhook verification handshake succeeded');
    return challenge ?? '';
  }

  @Public()
  @Post()
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>, @Body() body: WebhookBody): Promise<void> {
    const secret = secretFromEnv('META_APP_SECRET');
    const signature = req.header('x-hub-signature-256');
    if (!secret || !signature || !req.rawBody) {
      this.logger.warn('Webhook event rejected: missing secret, signature, or raw body');
      throw new ForbiddenException('Signature du webhook invalide.');
    }

    const computed = `sha256=${createHmac('sha256', secret).update(req.rawBody).digest('hex')}`;
    if (!safeEqual(computed, signature)) {
      this.logger.warn('Webhook event rejected: signature mismatch');
      throw new ForbiddenException('Signature du webhook invalide.');
    }

    // One job per change (Meta batches them); routing key travels with it, so
    // the worker never re-reads the envelope. An enqueue failure is a 500 on
    // purpose — Meta retries for 36h, and a dropped event is a lost patient.
    const receivedAt = new Date().toISOString();
    for (const entry of body?.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const phoneNumberId = change.value?.metadata?.phone_number_id;
        if (change.field !== 'messages' || !phoneNumberId) continue;
        await this.queue.add({ phoneNumberId, receivedAt, value: change.value });
      }
    }
  }
}
