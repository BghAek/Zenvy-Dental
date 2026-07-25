import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { basePrisma } from '../src/prisma/client';
import type { InboundJob } from '../src/whatsapp/inbound.queue';
import { processInbound } from '../src/whatsapp/inbound.processor';

// S2-2 inbound worker suite (docs/api/conversations.md §Webhook internals):
// tenant routing, dedup, patient resolution, conversation upsert, non-text
// placeholders, delivery receipts — plus the mandatory cross-tenant proof: an
// event routed to clinic B never writes a row under clinic A.

const run = randomUUID().slice(0, 8);
const phoneNumberIdA = `pnid-a-${run}`;
const phoneNumberIdB = `pnid-b-${run}`;

interface MetaMessage {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
}

const job = (
  phoneNumberId: string,
  value: Record<string, unknown>,
  receivedAt = new Date().toISOString(),
): InboundJob => ({ phoneNumberId, receivedAt, value });

const text = (id: string, from: string, body: string): MetaMessage => ({
  id,
  from,
  type: 'text',
  text: { body },
});

const inbound = (phoneNumberId: string, message: MetaMessage, profileName?: string) =>
  job(phoneNumberId, {
    contacts: [{ wa_id: message.from, profile: { name: profileName } }],
    messages: [message],
  });

describe('whatsapp inbound worker (S2-2)', () => {
  const startedAt = new Date();
  let clinicA: { id: string };
  let clinicB: { id: string };

  const conversations = (clinicId: string) =>
    basePrisma.conversation.findMany({
      where: { clinicId },
      include: { messages: { orderBy: { createdAt: 'asc' } }, patient: true },
    });

  beforeAll(async () => {
    [clinicA, clinicB] = await Promise.all(
      (['a', 'b'] as const).map((l) =>
        basePrisma.clinic.create({
          data: { name: `Cabinet ${l} ${run}`, slug: `wa-${l}-${run}` },
        }),
      ),
    );
    await basePrisma.whatsAppAccount.createMany({
      data: [
        {
          clinicId: clinicA.id,
          phoneNumberId: phoneNumberIdA,
          wabaId: 'waba-a',
          displayNumber: '+33100000001',
        },
        {
          clinicId: clinicB.id,
          phoneNumberId: phoneNumberIdB,
          wabaId: 'waba-b',
          displayNumber: '+33100000002',
        },
      ],
    });
  });

  afterAll(async () => {
    await basePrisma.clinic.deleteMany({ where: { id: { in: [clinicA.id, clinicB.id] } } });
    // ErrorLog survives its clinic (onDelete: SetNull), so clear this run's rows.
    await basePrisma.errorLog.deleteMany({
      where: { module: 'whatsapp', createdAt: { gte: startedAt } },
    });
    await basePrisma.$disconnect();
  });

  it('drops an event for an unknown phoneNumberId and logs it', async () => {
    const before = await basePrisma.conversation.count();
    await processInbound(inbound(`unknown-${run}`, text(`wamid.x-${run}`, '33612349999', 'Salut')));
    expect(await basePrisma.conversation.count()).toBe(before);
    const logged = await basePrisma.errorLog.findFirst({
      where: { module: 'whatsapp', severity: 'WARN' },
      orderBy: { createdAt: 'desc' },
    });
    expect(logged?.message).toContain('unknown phoneNumberId');
  });

  it('creates patient, conversation and message for an unknown number', async () => {
    await processInbound(
      inbound(phoneNumberIdA, text(`wamid.1-${run}`, '33612340001', 'Bonjour !'), 'Amélie'),
    );

    const [conversation] = await conversations(clinicA.id);
    expect(conversation.waContactPhone).toBe('+33612340001');
    expect(conversation.status).toBe('AI');
    expect(conversation.lastMessageAt).not.toBeNull();
    expect(conversation.patient?.firstName).toBe('Amélie');
    expect(conversation.patient?.source).toBe('WHATSAPP_INBOUND');
    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]).toMatchObject({
      direction: 'IN',
      author: 'PATIENT',
      body: 'Bonjour !',
      deliveryStatus: null,
    });
  });

  it('is idempotent on a re-delivered waMessageId', async () => {
    const message = text(`wamid.dup-${run}`, '33612340002', 'Deux fois');
    await processInbound(inbound(phoneNumberIdA, message));
    await processInbound(inbound(phoneNumberIdA, message));
    expect(await basePrisma.message.count({ where: { waMessageId: message.id } })).toBe(1);
  });

  it('falls back to a French contact name and caps a hostile profile name', async () => {
    await processInbound(
      inbound(phoneNumberIdA, text(`wamid.blank-${run}`, '33612340003', 'Coucou'), '   '),
    );
    await processInbound(
      inbound(phoneNumberIdA, text(`wamid.long-${run}`, '33612340004', 'Coucou'), 'é'.repeat(500)),
    );
    const blank = await basePrisma.patient.findFirst({ where: { phone: '+33612340003' } });
    const long = await basePrisma.patient.findFirst({ where: { phone: '+33612340004' } });
    expect(blank?.firstName).toBe('Contact WhatsApp');
    expect(long?.firstName).toHaveLength(100);
  });

  it('links an existing patient and restores a soft-deleted one', async () => {
    const known = await basePrisma.patient.create({
      data: {
        clinicId: clinicA.id,
        firstName: 'Marc',
        lastName: 'Dupont',
        phone: '+33612340005',
        deletedAt: new Date(),
      },
    });
    await processInbound(
      inbound(phoneNumberIdA, text(`wamid.known-${run}`, '33612340005', 'Je reviens'), 'Pirate'),
    );
    const restored = await basePrisma.patient.findUnique({ where: { id: known.id } });
    expect(restored?.deletedAt).toBeNull();
    // A clinic-owned name is not overwritten by the WhatsApp profile.
    expect(restored?.firstName).toBe('Marc');
    const conversation = await basePrisma.conversation.findFirst({
      where: { clinicId: clinicA.id, waContactPhone: '+33612340005' },
    });
    expect(conversation?.patientId).toBe(known.id);
  });

  it('stores a French placeholder for non-text messages and hands the thread to a human', async () => {
    await processInbound(
      inbound(phoneNumberIdA, { id: `wamid.audio-${run}`, from: '33612340006', type: 'audio' }),
    );
    const conversation = await basePrisma.conversation.findFirst({
      where: { clinicId: clinicA.id, waContactPhone: '+33612340006' },
      include: { messages: true },
    });
    expect(conversation?.status).toBe('HUMAN');
    expect(conversation?.messages[0].body).toBe('[Message vocal reçu]');
  });

  it('reopens a CLOSED thread as AI', async () => {
    const closed = await basePrisma.conversation.create({
      data: { clinicId: clinicA.id, waContactPhone: '+33612340007', status: 'CLOSED' },
    });
    await processInbound(
      inbound(phoneNumberIdA, text(`wamid.reopen-${run}`, '33612340007', 'Rebonjour')),
    );
    const reopened = await basePrisma.conversation.findUnique({ where: { id: closed.id } });
    expect(reopened?.status).toBe('AI');
  });

  it('applies delivery receipts and ignores ids it never stored', async () => {
    const conversation = await basePrisma.conversation.create({
      data: { clinicId: clinicA.id, waContactPhone: '+33612340008' },
    });
    const sent = await basePrisma.message.create({
      data: {
        clinicId: clinicA.id,
        conversationId: conversation.id,
        direction: 'OUT',
        author: 'STAFF',
        body: 'Bonjour',
        waMessageId: `wamid.out-${run}`,
        deliveryStatus: 'PENDING',
      },
    });
    await processInbound(
      job(phoneNumberIdA, {
        statuses: [
          { id: sent.waMessageId, status: 'delivered' },
          { id: `wamid.ghost-${run}`, status: 'read' },
        ],
      }),
    );
    const updated = await basePrisma.message.findUnique({ where: { id: sent.id } });
    expect(updated?.deliveryStatus).toBe('DELIVERED');
  });

  it('writes only under the routed clinic (cross-tenant)', async () => {
    const before = await conversations(clinicA.id);
    await processInbound(
      inbound(phoneNumberIdB, text(`wamid.b-${run}`, '33612340001', 'Chez B'), 'Chez B'),
    );
    const after = await conversations(clinicA.id);
    expect(after).toHaveLength(before.length);
    const [conversationB] = await conversations(clinicB.id);
    // Same contact number as clinic A's first thread — separate thread, separate
    // patient, no leak in either direction.
    expect(conversationB.clinicId).toBe(clinicB.id);
    expect(conversationB.patient?.clinicId).toBe(clinicB.id);
  });
});
