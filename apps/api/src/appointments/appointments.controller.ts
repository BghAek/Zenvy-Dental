import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  type Appointment as AppointmentDto,
  type CreateAppointmentRequest,
  type ListAppointmentsQuery,
  type Paginated,
  type UpdateAppointmentRequest,
  createAppointmentRequestSchema,
  listAppointmentsQuerySchema,
  updateAppointmentRequestSchema,
} from '@zenvy/shared';
import type { Request } from 'express';
import { Roles } from '../auth/rbac';
import { ApiException, ZodValidationPipe } from '../common/http';
import type { Appointment, Patient, ScheduledMessage } from '../generated/prisma/client';
import { Prisma } from '../generated/prisma/client';
import { Role } from '../generated/prisma/enums';
import { prisma } from '../prisma/client';
import { syncReminders } from './reminders';

// S2-4 appointments module (docs/api/appointments.md). Tenancy is implicit: the
// Prisma tenant extension constrains every query to the session's clinic, so a
// foreign id simply finds nothing → 404. No availability engine and no overlap
// check — ZenvyDental is a communication layer, not a PMS (decision D1).

type AppointmentRow = Appointment & { patient: Patient; scheduledMessages?: ScheduledMessage[] };

const REMINDER_ORDER = [{ sendAt: 'asc' as const }, { id: 'asc' as const }];

const toDto = (a: AppointmentRow, reminders = a.scheduledMessages ?? []): AppointmentDto => ({
  id: a.id,
  patient: {
    id: a.patient.id,
    firstName: a.patient.firstName,
    lastName: a.patient.lastName,
    phone: a.patient.phone,
    optOut: a.patient.optOut,
  },
  startsAt: a.startsAt.toISOString(),
  durationMin: a.durationMin,
  type: a.type,
  status: a.status,
  reminders: reminders.map((r) => ({
    id: r.id,
    kind: r.kind,
    sendAt: r.sendAt.toISOString(),
    status: r.status,
  })),
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});

const notFound = (): never => {
  throw new ApiException('APPOINTMENT_NOT_FOUND', 'Rendez-vous introuvable.');
};

@Roles(Role.CLINIC_OWNER, Role.CLINIC_STAFF)
@Controller('appointments')
export class AppointmentsController {
  @Get()
  async list(
    @Query(new ZodValidationPipe(listAppointmentsQuerySchema)) query: ListAppointmentsQuery,
  ): Promise<Paginated<AppointmentDto>> {
    const { cursor, limit, from, to, patientId, status } = query;
    const where: Prisma.AppointmentWhereInput = {
      ...(patientId ? { patientId } : {}),
      ...(status ? { status } : {}),
      // from inclusive, to exclusive — the calendar week passes both.
      ...(from || to
        ? {
            startsAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lt: new Date(to) } : {}),
            },
          }
        : {}),
    };

    // One extra row tells us whether a next page exists; id breaks startsAt ties
    // so the cursor position is stable.
    const rows = await prisma.appointment.findMany({
      where,
      include: { patient: true, scheduledMessages: { orderBy: REMINDER_ORDER } },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: items.map((a) => toDto(a)),
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  @Post()
  @HttpCode(201)
  async create(
    @Req() req: Request,
    @Body(new ZodValidationPipe(createAppointmentRequestSchema)) body: CreateAppointmentRequest,
  ): Promise<AppointmentDto> {
    // Unknown, soft-deleted or another clinic's patient are the same 404.
    const patient = await prisma.patient.findFirst({
      where: { id: body.patientId, deletedAt: null },
    });
    if (!patient) throw new ApiException('PATIENT_NOT_FOUND', 'Patient introuvable.');

    const appointment = await prisma.appointment.create({
      data: {
        // Re-stamped by the tenant extension; the explicit value satisfies the type.
        clinicId: req.sessionUser!.clinicId!,
        patientId: patient.id,
        startsAt: new Date(body.startsAt),
        durationMin: body.durationMin,
        type: body.type,
        status: body.status,
      },
    });
    const reminders = await syncReminders(appointment, patient.optOut);
    return toDto({ ...appointment, patient }, reminders);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<AppointmentDto> {
    return toDto(await this.load(id));
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAppointmentRequestSchema)) body: UpdateAppointmentRequest,
  ): Promise<AppointmentDto> {
    const existing = await this.load(id);
    const appointment = await prisma.appointment.update({
      where: { id },
      data: { ...body, ...(body.startsAt ? { startsAt: new Date(body.startsAt) } : {}) },
    });
    // Every accepted change re-runs the reminder rules.
    const reminders = await syncReminders(appointment, existing.patient.optOut);
    return toDto({ ...appointment, patient: existing.patient }, reminders);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    // Hard delete — pending reminder rows cascade away with it. A cancellation
    // the clinic wants to keep is status=CANCELLED, not a delete.
    const { count } = await prisma.appointment.deleteMany({ where: { id } });
    if (count === 0) notFound();
  }

  /** The scoped read every :id route starts from: another clinic's id finds nothing. */
  private async load(id: string): Promise<AppointmentRow> {
    const appointment = await prisma.appointment.findFirst({
      where: { id },
      include: { patient: true, scheduledMessages: { orderBy: REMINDER_ORDER } },
    });
    return appointment ?? notFound();
  }
}
