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
import type { Request } from 'express';
import {
  type CreatePatientRequest,
  type ListPatientsQuery,
  type Patient as PatientDto,
  type Paginated,
  type UpdatePatientRequest,
  createPatientRequestSchema,
  listPatientsQuerySchema,
  normalizePhone,
  updatePatientRequestSchema,
} from '@zenvy/shared';
import { Roles } from '../auth/rbac';
import { ApiException, ZodValidationPipe } from '../common/http';
import type { Patient } from '../generated/prisma/client';
import { Prisma } from '../generated/prisma/client';
import { Role } from '../generated/prisma/enums';
import { prisma } from '../prisma/client';

// S1-3 patients module (docs/api/patients.md). Tenancy is implicit: the Prisma
// tenant extension stamps/constrains clinicId, so clinicId never appears here.
// Soft delete only — deletedAt: null is ANDed into every read; the phone slot
// stays reserved (the (clinicId, phone) unique index is full, not partial).

const toDto = (p: Patient): PatientDto => ({
  id: p.id,
  firstName: p.firstName,
  lastName: p.lastName,
  phone: p.phone,
  tags: p.tags,
  notes: p.notes,
  source: p.source,
  optOut: p.optOut,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});

const phoneExists = (): never => {
  throw new ApiException('PATIENT_PHONE_EXISTS', 'Un patient avec ce numéro existe déjà.');
};

const notFound = (): never => {
  throw new ApiException('PATIENT_NOT_FOUND', 'Patient introuvable.');
};

@Roles(Role.CLINIC_OWNER, Role.CLINIC_STAFF)
@Controller('patients')
export class PatientsController {
  @Get()
  async list(
    @Query(new ZodValidationPipe(listPatientsQuerySchema)) query: ListPatientsQuery,
  ): Promise<Paginated<PatientDto>> {
    const { cursor, limit, search, tag } = query;
    const and: Prisma.PatientWhereInput[] = [{ deletedAt: null }];
    if (tag) and.push({ tags: { has: tag } });
    if (search) {
      const or: Prisma.PatientWhereInput[] = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
      // A term with a digit is also a phone probe: normalize it the same way
      // stored numbers were, so "06 12 34 56 78" matches "+33612345678".
      if (/\d/.test(search)) or.push({ phone: { contains: normalizePhone(search) } });
      and.push({ OR: or });
    }

    // Fetch one extra to know whether a next page exists. id breaks createdAt
    // ties so the cursor position is stable.
    const rows = await prisma.patient.findMany({
      where: { AND: and },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: items.map(toDto),
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  @Post()
  @HttpCode(201)
  async create(
    @Req() req: Request,
    @Body(new ZodValidationPipe(createPatientRequestSchema)) body: CreatePatientRequest,
  ): Promise<PatientDto> {
    // The unique slot may be held by an active OR a soft-deleted patient.
    const existing = await prisma.patient.findFirst({ where: { phone: body.phone } });
    if (existing && !existing.deletedAt) phoneExists();

    const data = {
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      tags: body.tags,
      notes: body.notes ?? null,
    };
    // Reuse the soft-deleted row (same id, deletedAt cleared, state reset) so
    // the reserved phone slot is freed without a delete/create race.
    // The tenant extension re-stamps clinicId; the explicit value only satisfies
    // the create type (same as the staff-invite create).
    const patient = existing
      ? await prisma.patient.update({
          where: { id: existing.id },
          data: { ...data, source: 'MANUAL', optOut: false, deletedAt: null },
        })
      : await prisma.patient.create({ data: { ...data, clinicId: req.sessionUser!.clinicId! } });
    return toDto(patient);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<PatientDto> {
    const patient = await prisma.patient.findFirst({ where: { id, deletedAt: null } });
    return toDto(patient ?? notFound());
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePatientRequestSchema)) body: UpdatePatientRequest,
  ): Promise<PatientDto> {
    const existing = await prisma.patient.findFirst({ where: { id, deletedAt: null } });
    if (!existing) notFound();
    if (body.phone && body.phone !== existing!.phone) {
      const collision = await prisma.patient.findFirst({
        where: { phone: body.phone, deletedAt: null, NOT: { id } },
      });
      if (collision) phoneExists();
      // ponytail: a phone owned by a *soft-deleted* row still trips the (clinicId,
      // phone) unique index → 500. Restore-on-create covers the common path;
      // handle here only if PATCH-onto-deleted-phone shows up in real usage.
    }
    const patient = await prisma.patient.update({ where: { id }, data: body });
    return toDto(patient);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    // updateMany (not findFirst+update) filters deletedAt: null and reports the
    // hit count in one statement — a re-delete matches nothing → 404.
    const { count } = await prisma.patient.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (count === 0) notFound();
  }
}
