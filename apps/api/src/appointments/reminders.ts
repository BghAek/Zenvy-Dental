import type { Appointment, ScheduledMessage } from '../generated/prisma/client';
import type { AppointmentStatus, ScheduledMessageKind } from '../generated/prisma/enums';
import { prisma } from '../prisma/client';

// S2-4 reminder lifecycle (docs/api/appointments.md §Reminder lifecycle).
// Appointment writes emit ScheduledMessage rows; the sending itself is S3-2, so
// until the templates are registered with Meta (S3-1) the rows exist and nothing
// leaves. Deleting an appointment cascades its rows away (schema.prisma).

const HOUR_MS = 60 * 60 * 1000;

/** What each status wants scheduled, as an offset from startsAt. */
const PLAN: Record<AppointmentStatus, { kind: ScheduledMessageKind; offsetMs: number }[]> = {
  SCHEDULED: [
    { kind: 'REMINDER_24H', offsetMs: -24 * HOUR_MS },
    { kind: 'REMINDER_2H', offsetMs: -2 * HOUR_MS },
  ],
  CONFIRMED: [
    { kind: 'REMINDER_24H', offsetMs: -24 * HOUR_MS },
    { kind: 'REMINDER_2H', offsetMs: -2 * HOUR_MS },
  ],
  DONE: [{ kind: 'FOLLOWUP', offsetMs: 24 * HOUR_MS }],
  CANCELLED: [],
  NO_SHOW: [],
};

/** Catalogue names registered with Meta in S3-1. */
const TEMPLATE: Partial<Record<ScheduledMessageKind, string>> = {
  REMINDER_24H: 'reminder_24h_fr',
  REMINDER_2H: 'reminder_2h_fr',
  FOLLOWUP: 'followup_fr',
};

/**
 * Re-runs the reminder rules for one appointment and returns its rows, oldest
 * send first. Called after every create and every accepted patch: pending rows
 * follow a reschedule, become CANCELLED when the status (or an opt-out) no
 * longer wants them, and rows already SENT are never touched or duplicated.
 */
export async function syncReminders(
  appointment: Appointment,
  optOut: boolean,
): Promise<ScheduledMessage[]> {
  // Opt-out blocks all outbound, retroactively (docs/05-ai-policy.md): wanting
  // nothing cancels what is pending and creates nothing.
  const wanted = new Map(
    (optOut ? [] : PLAN[appointment.status]).map((p) => [
      p.kind,
      new Date(appointment.startsAt.getTime() + p.offsetMs),
    ]),
  );
  const rows = await prisma.scheduledMessage.findMany({
    where: { appointmentId: appointment.id },
  });
  const now = Date.now();

  for (const row of rows) {
    if (row.status !== 'PENDING') continue;
    const sendAt = wanted.get(row.kind);
    // A send time that has slipped into the past is dropped, not fired late.
    if (!sendAt || sendAt.getTime() <= now) {
      await prisma.scheduledMessage.update({
        where: { id: row.id },
        data: { status: 'CANCELLED' },
      });
    } else if (sendAt.getTime() !== row.sendAt.getTime()) {
      await prisma.scheduledMessage.update({ where: { id: row.id }, data: { sendAt } });
    }
  }

  // A kind that is still live (pending or already sent) is left alone; one that
  // was cancelled by an earlier status can be re-armed.
  const live = new Set(rows.filter((r) => r.status !== 'CANCELLED').map((r) => r.kind));
  for (const [kind, sendAt] of wanted) {
    if (live.has(kind) || sendAt.getTime() <= now) continue;
    await prisma.scheduledMessage.create({
      data: {
        // Re-stamped by the tenant extension; the explicit value satisfies the type.
        clinicId: appointment.clinicId,
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        kind,
        templateName: TEMPLATE[kind]!,
        sendAt,
      },
    });
  }

  return prisma.scheduledMessage.findMany({
    where: { appointmentId: appointment.id },
    orderBy: [{ sendAt: 'asc' }, { id: 'asc' }],
  });
}
