import { Logger } from '@nestjs/common';
import { normalizePhone, phoneE164Schema } from '@zenvy/shared';
import type { MessageDeliveryStatus } from '../generated/prisma/enums';
import { basePrisma, prisma } from '../prisma/client';
import { runAsClinic } from '../tenancy/tenant-context';
import type { InboundJob } from './inbound.queue';

// S2-2 inbound worker — the steps in docs/api/conversations.md §Webhook
// internals, in order: tenant routing → dedup → patient resolution →
// conversation upsert → message insert → (S2-3) AI handoff.

const logger = new Logger('WhatsAppInbound');

// Only the fields we act on; the rest of Meta's payload is ignored by design.
interface MetaContact {
  wa_id?: string;
  profile?: { name?: string };
}
interface MetaMessage {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
}
interface MetaStatus {
  id?: string;
  status?: string;
  errors?: unknown;
}
interface MetaValue {
  contacts?: MetaContact[];
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
}

// The v1 assistant is text-only: anything else is stored as a French placeholder
// and the thread goes to a human (docs/api/conversations.md step 6).
const PLACEHOLDERS: Record<string, string> = {
  image: '[Image reçue]',
  audio: '[Message vocal reçu]',
  video: '[Vidéo reçue]',
  document: '[Document reçu]',
  sticker: '[Sticker reçu]',
  location: '[Position reçue]',
  contacts: '[Contact reçu]',
};

const DELIVERY: Record<string, MessageDeliveryStatus> = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
};

const FALLBACK_NAME = 'Contact WhatsApp';
// Anyone who can message the clinic's number can create rows here, so cap it.
// ponytail: fixed hourly cap, revisit if a real clinic hits it (S2-7 reviews).
const PATIENT_CREATION_CAP_PER_HOUR = 20;

/** ErrorLog is the durable trail; bodies never reach the logs (docs/04). */
async function warn(clinicId: string | null, message: string, context?: object): Promise<void> {
  logger.warn(message);
  await basePrisma.errorLog.create({
    data: { clinicId, module: 'whatsapp', severity: 'WARN', message, context: context ?? {} },
  });
}

/** wa_id is international digits without "+"; anything unparseable is dropped. */
function toE164(waId: string): string | null {
  const phone = normalizePhone(waId.startsWith('+') ? waId : `+${waId}`);
  return phoneE164Schema.safeParse(phone).success ? phone : null;
}

/** The WhatsApp profile name is attacker-controlled: trimmed, capped at the
 *  patientSchema bound, never trusted beyond being stored as text. */
function safeName(profileName?: string): string {
  return profileName?.trim().slice(0, 100) || FALLBACK_NAME;
}

export async function processInbound(job: InboundJob): Promise<void> {
  // 1. Tenant routing — the one lookup with no clinic yet, hence basePrisma.
  const account = await basePrisma.whatsAppAccount.findUnique({
    where: { phoneNumberId: job.phoneNumberId },
    select: { clinicId: true },
  });
  if (!account) {
    // Nothing to isolate an unrouted event to: log and drop.
    await warn(null, 'Webhook event for an unknown phoneNumberId', {
      phoneNumberId: job.phoneNumberId,
    });
    return;
  }

  const value = (job.value ?? {}) as MetaValue;
  await runAsClinic(account.clinicId, async () => {
    for (const message of value.messages ?? []) {
      await storeInbound(account.clinicId, value, message, job.receivedAt);
    }
    for (const status of value.statuses ?? []) {
      await applyStatus(account.clinicId, status);
    }
  });
}

async function storeInbound(
  clinicId: string,
  value: MetaValue,
  message: MetaMessage,
  receivedAt: string,
): Promise<void> {
  if (!message.id || !message.from) return;

  // 2. Dedup — Meta retries for up to 36h. Global check (waMessageId is unique
  // across clinics), so basePrisma rather than the scoped client.
  const seen = await basePrisma.message.findFirst({
    where: { waMessageId: message.id },
    select: { id: true },
  });
  if (seen) return;

  const phone = toE164(message.from);
  if (!phone) {
    await warn(clinicId, 'Inbound message from an unparseable number', { from: message.from });
    return;
  }

  // 3. Patient resolution.
  const contact = value.contacts?.find((c) => c.wa_id === message.from);
  const patientId = await resolvePatient(clinicId, phone, contact?.profile?.name);

  const isText = message.type === 'text' && typeof message.text?.body === 'string';
  const body = isText
    ? message.text!.body!.slice(0, 4096)
    : (PLACEHOLDERS[message.type ?? ''] ?? '[Message non pris en charge]');
  const at = new Date(receivedAt);

  // 4. Conversation upsert on (clinicId, waContactPhone): a CLOSED thread
  // reopens as AI, a non-text message forces a human to read it.
  const existing = await prisma.conversation.findFirst({ where: { waContactPhone: phone } });
  const conversation = existing
    ? await prisma.conversation.update({
        where: { id: existing.id },
        data: {
          lastMessageAt: at,
          ...(existing.status === 'CLOSED' ? { status: 'AI' as const } : {}),
          ...(isText ? {} : { status: 'HUMAN' as const }),
          ...(existing.patientId === null && patientId ? { patientId } : {}),
        },
      })
    : await prisma.conversation.create({
        data: {
          clinicId,
          waContactPhone: phone,
          patientId,
          lastMessageAt: at,
          status: isText ? 'AI' : 'HUMAN',
        },
      });

  // 5. Message insert — inbound has no delivery status.
  await prisma.message.create({
    data: {
      clinicId,
      conversationId: conversation.id,
      direction: 'IN',
      author: 'PATIENT',
      body,
      waMessageId: message.id,
    },
  });

  // 6. Hand off to the AI engine when status is AI — lands with S2-3.
}

async function resolvePatient(
  clinicId: string,
  phone: string,
  profileName?: string,
): Promise<string | null> {
  // The (clinicId, phone) unique slot may be held by a soft-deleted patient;
  // restore it rather than colliding (same rule as POST /patients).
  const existing = await prisma.patient.findFirst({ where: { phone } });
  if (existing) {
    if (existing.deletedAt) {
      // Name and optOut are kept: a clinic edit — or a STOP — outranks the
      // WhatsApp profile.
      await prisma.patient.update({ where: { id: existing.id }, data: { deletedAt: null } });
    }
    return existing.id;
  }

  const createdLastHour = await prisma.patient.count({
    where: {
      source: 'WHATSAPP_INBOUND',
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });
  if (createdLastHour >= PATIENT_CREATION_CAP_PER_HOUR) {
    // Message and conversation are still stored — only the patient link is lost.
    await warn(clinicId, 'Patient auto-creation cap reached: conversation left unlinked', {
      phone,
    });
    return null;
  }

  const patient = await prisma.patient.create({
    data: {
      clinicId,
      firstName: safeName(profileName),
      lastName: '—',
      phone,
      source: 'WHATSAPP_INBOUND',
    },
  });
  return patient.id;
}

/** Delivery receipts for our outbound messages; ids we never stored are noise. */
async function applyStatus(clinicId: string, status: MetaStatus): Promise<void> {
  const deliveryStatus = DELIVERY[status.status ?? ''];
  if (!status.id || !deliveryStatus) return;

  const { count } = await prisma.message.updateMany({
    where: { waMessageId: status.id },
    data: { deliveryStatus },
  });
  if (count > 0 && deliveryStatus === 'FAILED') {
    await warn(clinicId, 'Outbound message failed at Meta', {
      waMessageId: status.id,
      errors: status.errors ?? null,
    });
  }
}
