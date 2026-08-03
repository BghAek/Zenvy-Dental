import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduledMessageKind, ScheduledMessageStatus } from '../src/generated/prisma/enums';
import { basePrisma } from '../src/prisma/client';

// S3-2 scheduled-send suite (docs/api/whatsapp-templates.md §Sending one): which
// rows come due, what leaves for each kind, and everything that stops a send —
// opt-out, a row already handled, a clinic with no number — plus the mandatory
// cross-tenant proof (docs/04-security.md). The Graph API is stubbed: what is
// under test is the decision to send and the parameters, not Meta's HTTP.

vi.mock('../src/whatsapp/graph', () => ({
  sendText: vi.fn(),
  sendTemplate: vi.fn(async () => `wamid.tpl-${randomUUID()}`),
}));

import { sendTemplate as graphSendTemplate } from '../src/whatsapp/graph';
import { dueScheduledMessages, sendScheduled } from '../src/whatsapp/outbound.processor';

const sendTemplate = vi.mocked(graphSendTemplate);

const run = randomUUID().slice(0, 8);
const MINUTE_MS = 60 * 1000;
const ago = (min: number) => new Date(Date.now() - min * MINUTE_MS);
const ahead = (min: number) => new Date(Date.now() + min * MINUTE_MS);

// A Tuesday 14h30 in Paris, in the CEST half of the year so the offset is not
// the machine's. Far ahead on purpose: a reminder for an appointment that has
// already started is cancelled, so a date in the past would rot this suite.
const APPOINTMENT_AT = new Date('2030-08-06T12:30:00.000Z');
const APPOINTMENT_DATE_FR = 'mardi 6 août';

describe('scheduled sends (S3-2)', () => {
  const startedAt = new Date();
  let clinicA: { id: string };
  let clinicB: { id: string };
  let seeded = 0;

  /** A patient with an appointment and one scheduled row, ready to fire. */
  async function seed(
    clinicId: string,
    kind: ScheduledMessageKind,
    overrides: {
      sendAt?: Date;
      status?: ScheduledMessageStatus;
      optOut?: boolean;
      withAppointment?: boolean;
      firstName?: string;
    } = {},
  ): Promise<{ id: string; clinicId: string; patientId: string; phone: string }> {
    seeded += 1;
    const phone = `+3361388${String(seeded).padStart(4, '0')}`;
    const patient = await basePrisma.patient.create({
      data: {
        clinicId,
        firstName: overrides.firstName ?? 'Marie',
        lastName: 'Dupont',
        phone,
        optOut: overrides.optOut ?? false,
      },
    });
    const appointment =
      overrides.withAppointment === false
        ? null
        : await basePrisma.appointment.create({
            data: {
              clinicId,
              patientId: patient.id,
              startsAt: APPOINTMENT_AT,
              durationMin: 30,
              type: 'Détartrage',
            },
          });
    const row = await basePrisma.scheduledMessage.create({
      data: {
        clinicId,
        patientId: patient.id,
        appointmentId: appointment?.id ?? null,
        kind,
        templateName: 'seeded-by-test',
        sendAt: overrides.sendAt ?? ago(1),
        status: overrides.status ?? 'PENDING',
      },
    });
    return { id: row.id, clinicId, patientId: patient.id, phone };
  }

  const reload = (id: string) => basePrisma.scheduledMessage.findUnique({ where: { id } });

  beforeAll(async () => {
    [clinicA, clinicB] = await Promise.all(
      (['a', 'b'] as const).map((l) =>
        basePrisma.clinic.create({
          data: { name: `Cabinet Lumière ${l}${run}`, slug: `sm-${l}-${run}` },
        }),
      ),
    );
    await basePrisma.whatsAppAccount.createMany({
      data: [
        {
          clinicId: clinicA.id,
          phoneNumberId: `pnid-sm-a-${run}`,
          wabaId: 'waba-a',
          displayNumber: '+33100000001',
        },
        {
          clinicId: clinicB.id,
          phoneNumberId: `pnid-sm-b-${run}`,
          wabaId: 'waba-b',
          displayNumber: '+33100000002',
        },
      ],
    });
  });

  beforeEach(() => {
    sendTemplate.mockClear();
  });

  afterAll(async () => {
    await basePrisma.clinic.deleteMany({ where: { id: { in: [clinicA.id, clinicB.id] } } });
    await basePrisma.errorLog.deleteMany({
      where: { module: 'whatsapp', createdAt: { gte: startedAt } },
    });
    await basePrisma.$disconnect();
  });

  it('picks up rows that are due and leaves the rest alone', async () => {
    const due = await seed(clinicA.id, 'REMINDER_24H');
    const later = await seed(clinicA.id, 'REMINDER_24H', { sendAt: ahead(60) });
    const cancelled = await seed(clinicA.id, 'REMINDER_2H', { status: 'CANCELLED' });
    const sent = await seed(clinicA.id, 'REMINDER_2H', { status: 'SENT' });

    const ids = (await dueScheduledMessages(500)).map((j) => j.scheduledMessageId);
    expect(ids).toContain(due.id);
    expect(ids).not.toContain(later.id);
    expect(ids).not.toContain(cancelled.id);
    expect(ids).not.toContain(sent.id);
  });

  it('sends reminder_24h_fr with the catalogue parameters in order', async () => {
    const row = await seed(clinicA.id, 'REMINDER_24H');

    await sendScheduled({ scheduledMessageId: row.id, clinicId: row.clinicId });

    expect(sendTemplate).toHaveBeenCalledTimes(1);
    const [phoneNumberId, to, template, params] = sendTemplate.mock.calls[0];
    expect(phoneNumberId).toBe(`pnid-sm-a-${run}`);
    expect(to).toBe(row.phone);
    expect(template.name).toBe('reminder_24h_fr');
    expect(params).toEqual(['Marie', APPOINTMENT_DATE_FR, '14h30', `Cabinet Lumière a${run}`]);
    expect((await reload(row.id))?.status).toBe('SENT');
  });

  it('stores the filled body on the patient thread', async () => {
    const row = await seed(clinicA.id, 'REMINDER_2H');

    await sendScheduled({ scheduledMessageId: row.id, clinicId: row.clinicId });

    const [, , template, params] = sendTemplate.mock.calls[0];
    expect(template.name).toBe('reminder_2h_fr');
    expect(params).toEqual(['Marie', '14h30', `Cabinet Lumière a${run}`]);

    const conversation = await basePrisma.conversation.findFirst({
      where: { clinicId: clinicA.id, waContactPhone: row.phone },
      include: { messages: true },
    });
    expect(conversation?.patientId).toBe(row.patientId);
    expect(conversation?.lastMessageAt).not.toBeNull();
    expect(conversation?.messages).toHaveLength(1);
    expect(conversation?.messages[0]).toMatchObject({
      direction: 'OUT',
      // The model never writes a reminder (docs/05-ai-policy.md).
      author: 'SYSTEM',
      templateName: 'reminder_2h_fr',
      deliveryStatus: 'PENDING',
    });
    // Variables filled, no placeholder left behind.
    expect(conversation?.messages[0].body).toContain("aujourd'hui à 14h30");
    expect(conversation?.messages[0].body).not.toContain('{{');
  });

  it('sends the follow-up without an appointment time', async () => {
    const row = await seed(clinicA.id, 'FOLLOWUP');

    await sendScheduled({ scheduledMessageId: row.id, clinicId: row.clinicId });

    const [, , template, params] = sendTemplate.mock.calls[0];
    expect(template.name).toBe('followup_fr');
    expect(params).toEqual(['Marie', `Cabinet Lumière a${run}`]);
  });

  it('cancels a reminder whose appointment has already started', async () => {
    // The worker was down for hours: « votre rendez-vous a lieu aujourd'hui à
    // 14h30 » must not go out at 18h. The J+1 follow-up is the opposite case —
    // it exists precisely to fire after the appointment.
    const stale = await seed(clinicA.id, 'REMINDER_2H');
    const followup = await seed(clinicA.id, 'FOLLOWUP');
    await basePrisma.appointment.updateMany({
      where: { patientId: { in: [stale.patientId, followup.patientId] } },
      data: { startsAt: ago(180) },
    });

    await sendScheduled({ scheduledMessageId: stale.id, clinicId: clinicA.id });
    expect(sendTemplate).not.toHaveBeenCalled();
    expect((await reload(stale.id))?.status).toBe('CANCELLED');

    await sendScheduled({ scheduledMessageId: followup.id, clinicId: clinicA.id });
    expect(sendTemplate).toHaveBeenCalledTimes(1);
    expect((await reload(followup.id))?.status).toBe('SENT');
  });

  it('flattens a WhatsApp profile name Meta would reject', async () => {
    // The name comes from the patient's own WhatsApp profile: a newline or a
    // run of spaces in a parameter fails the whole send at Meta.
    const row = await seed(clinicA.id, 'FOLLOWUP', { firstName: 'Jean\n\tPierre   Luc' });

    await sendScheduled({ scheduledMessageId: row.id, clinicId: clinicA.id });

    const [, , , params] = sendTemplate.mock.calls[0];
    expect(params[0]).toBe('Jean Pierre Luc');
  });

  it('cancels instead of sending when the patient has opted out', async () => {
    const row = await seed(clinicA.id, 'REMINDER_24H', { optOut: true });

    await sendScheduled({ scheduledMessageId: row.id, clinicId: row.clinicId });

    expect(sendTemplate).not.toHaveBeenCalled();
    expect((await reload(row.id))?.status).toBe('CANCELLED');
  });

  it('does not re-send a row that is no longer pending or not yet due', async () => {
    const alreadySent = await seed(clinicA.id, 'REMINDER_24H', { status: 'SENT' });
    const notDue = await seed(clinicA.id, 'REMINDER_24H', { sendAt: ahead(60) });

    await sendScheduled({ scheduledMessageId: alreadySent.id, clinicId: clinicA.id });
    await sendScheduled({ scheduledMessageId: notDue.id, clinicId: clinicA.id });

    expect(sendTemplate).not.toHaveBeenCalled();
    expect((await reload(notDue.id))?.status).toBe('PENDING');
  });

  it('fails the row permanently when the clinic has no WhatsApp number', async () => {
    const orphan = await basePrisma.clinic.create({
      data: { name: `Cabinet sans numéro ${run}`, slug: `sm-none-${run}` },
    });
    const row = await seed(orphan.id, 'REMINDER_24H');

    await sendScheduled({ scheduledMessageId: row.id, clinicId: orphan.id });

    expect(sendTemplate).not.toHaveBeenCalled();
    expect((await reload(row.id))?.status).toBe('FAILED');
    const logged = await basePrisma.errorLog.findFirst({
      where: { clinicId: orphan.id, module: 'whatsapp' },
    });
    expect(logged?.message).toContain('no WhatsAppAccount');
    await basePrisma.clinic.delete({ where: { id: orphan.id } });
  });

  it('throws on a Graph failure so BullMQ retries, leaving the row pending', async () => {
    const row = await seed(clinicA.id, 'REMINDER_24H');
    sendTemplate.mockRejectedValueOnce(new Error('Graph API send failed (503): busy'));

    await expect(
      sendScheduled({ scheduledMessageId: row.id, clinicId: clinicA.id }),
    ).rejects.toThrow('503');
    expect((await reload(row.id))?.status).toBe('PENDING');
  });

  it('never sends another clinic’s row (cross-tenant)', async () => {
    const row = await seed(clinicB.id, 'REMINDER_24H');

    // Clinic A's context, clinic B's row id: the scoped read must not resolve.
    await sendScheduled({ scheduledMessageId: row.id, clinicId: clinicA.id });

    expect(sendTemplate).not.toHaveBeenCalled();
    expect((await reload(row.id))?.status).toBe('PENDING');
  });
});
