import { Logger } from '@nestjs/common';
import type { ScheduledMessageKind } from '../generated/prisma/enums';
import { basePrisma, prisma } from '../prisma/client';
import { runAsClinic } from '../tenancy/tenant-context';
import { sendTemplate } from './graph';
import { TEMPLATES, type WhatsAppTemplate } from './templates';

// S3-2 outbound worker: turns a due ScheduledMessage row (S2-4 wrote it) into a
// pre-approved WhatsApp template send (S3-1 registered it).
//
// 24h-window enforcement (docs/05-ai-policy.md §24h rule): reminders fire when
// the customer-service window is usually shut, so this path sends templates and
// ONLY templates — a kind with no catalogue entry (CUSTOM) fails instead of
// falling back to free-form text, which Meta would reject anyway. The free-form
// paths keep their own window checks (AI engine, staff send).

const logger = new Logger('WhatsAppOutbound');

/** One job per due row; `clinicId` is the tenant the row was found under. */
export interface OutboundJob {
  scheduledMessageId: string;
  clinicId: string;
}

/** Rows whose time has come, oldest first. Cross-tenant by design — the sweep
 *  runs for the whole instance, then each send re-enters its own clinic. */
export function dueScheduledMessages(limit: number): Promise<OutboundJob[]> {
  return basePrisma.scheduledMessage
    .findMany({
      where: { status: 'PENDING', sendAt: { lte: new Date() } },
      select: { id: true, clinicId: true },
      orderBy: { sendAt: 'asc' },
      take: limit,
    })
    .then((rows) => rows.map((r) => ({ scheduledMessageId: r.id, clinicId: r.clinicId })));
}

/** Sends one scheduled message. Throws on a transient failure so BullMQ retries;
 *  a permanent one (no template, no WhatsApp number) marks the row FAILED. */
export function sendScheduled(job: OutboundJob): Promise<void> {
  return runAsClinic(job.clinicId, () => send(job.scheduledMessageId));
}

async function send(id: string): Promise<void> {
  // Scoped read: an id from another clinic simply does not resolve here.
  const row = await prisma.scheduledMessage.findFirst({
    where: { id },
    include: { patient: true, appointment: true, clinic: true },
  });
  // Re-checked, never assumed: the row may have been re-timed, cancelled or
  // already sent between the sweep and this job (a retry replays it too).
  if (!row || row.status !== 'PENDING' || row.sendAt.getTime() > Date.now()) return;

  // Opt-out blocks every outbound message (docs/05-ai-policy.md). The inbound
  // worker already cancels pending rows on « STOP »; this is the last gate
  // before Meta, and it also covers a patient deleted since scheduling.
  if (row.patient.optOut || row.patient.deletedAt) {
    await prisma.scheduledMessage.update({ where: { id }, data: { status: 'CANCELLED' } });
    return;
  }

  // A reminder for an appointment that has already begun is not a late
  // reminder, it is a wrong one — S2-4 drops rows that slip into the past when
  // it re-times them, and an outage that delays this worker gets the same rule.
  if (row.kind !== 'FOLLOWUP' && row.appointment && row.appointment.startsAt <= new Date()) {
    await prisma.scheduledMessage.update({ where: { id }, data: { status: 'CANCELLED' } });
    return;
  }

  const template = TEMPLATES[row.kind];
  const params = template && templateParams(row, template);
  if (!template || !params) {
    await fail(row.clinicId, id, `No usable template for a ${row.kind} scheduled message`);
    return;
  }

  const account = await prisma.whatsAppAccount.findFirst({ select: { phoneNumberId: true } });
  if (!account) {
    await fail(row.clinicId, id, 'Clinic has no WhatsAppAccount: scheduled message not sent');
    return;
  }

  const waMessageId = await sendTemplate(
    account.phoneNumberId,
    row.patient.phone,
    template,
    params,
  );

  // The patient sees the filled body, so the inbox stores exactly that — and on
  // the thread their reply will land on, which reopens the 24h window and hands
  // the conversation back to the AI engine (docs/api/conversations.md).
  const conversation = await threadFor(row.clinicId, row.patientId, row.patient.phone);
  await prisma.message.create({
    data: {
      clinicId: row.clinicId,
      conversationId: conversation.id,
      direction: 'OUT',
      // SYSTEM, not AI: the model never writes an outbound reminder (docs/05).
      author: 'SYSTEM',
      body: fillBody(template, params),
      waMessageId,
      templateName: template.name,
      deliveryStatus: 'PENDING',
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });
  // ponytail: Meta accepted the send before this write, so a crash in between
  // re-sends once on retry. A duplicate reminder beats a missed one; add a
  // claim-before-send step only if that crash ever actually happens.
  await prisma.scheduledMessage.update({ where: { id }, data: { status: 'SENT' } });
}

/** The positional variables, in the catalogue's order (whatsapp-templates.md).
 *  Built at send time, not at scheduling time: names, clinic and appointment
 *  time can all move between the two. */
function templateParams(
  row: {
    kind: ScheduledMessageKind;
    patient: { firstName: string };
    appointment: { startsAt: Date } | null;
    clinic: { name: string; timezone: string };
  },
  template: WhatsAppTemplate,
): string[] | null {
  // Meta rejects a parameter holding a newline, a tab or a run of spaces — and
  // a first name can be the WhatsApp profile name, which the patient writes.
  const firstName = flatten(row.patient.firstName);
  const clinic = flatten(row.clinic.name);
  const at = row.appointment?.startsAt;
  const tz = row.clinic.timezone;

  let params: string[] | null = null;
  // CUSTOM has no catalogue entry and falls through to null (D24).
  if (row.kind === 'FOLLOWUP') params = [firstName, clinic];
  else if (!at) params = null;
  else if (row.kind === 'REMINDER_24H')
    params = [firstName, frenchDate(at, tz), frenchTime(at, tz), clinic];
  else if (row.kind === 'REMINDER_2H') params = [firstName, frenchTime(at, tz), clinic];

  // A count mismatch is a 400 from Meta; catch it before the call.
  return params?.length === template.params.length ? params : null;
}

/** A template parameter is one line of text or Meta refuses the whole send. */
const flatten = (value: string): string => value.replace(/\s+/g, ' ').trim();

/** « mardi 4 août » — spelled out, so a job that runs late still reads right. */
const frenchDate = (at: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(at);

/** « 14h30 » — the French clock the templates were approved with. */
const frenchTime = (at: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('fr-FR', { timeZone, hour: '2-digit', minute: '2-digit' })
    .format(at)
    .replace(':', 'h');

const fillBody = (template: WhatsAppTemplate, params: string[]): string =>
  template.body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? '');

/** The patient's thread, created if the clinic has never written to them. */
async function threadFor(clinicId: string, patientId: string, phone: string) {
  const existing = await prisma.conversation.findFirst({ where: { waContactPhone: phone } });
  if (existing) return existing;
  return prisma.conversation.create({
    data: { clinicId, patientId, waContactPhone: phone, status: 'AI' },
  });
}

/** Permanent failure: retrying changes nothing, so the row stops pretending. */
async function fail(clinicId: string, id: string, message: string): Promise<void> {
  logger.warn(message);
  await prisma.scheduledMessage.update({ where: { id }, data: { status: 'FAILED' } });
  await basePrisma.errorLog.create({
    data: {
      clinicId,
      module: 'whatsapp',
      severity: 'WARN',
      message,
      context: { scheduledMessageId: id },
    },
  });
}
