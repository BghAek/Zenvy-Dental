import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import {
  type CreateSupportMessageRequest,
  type ListOpsClientsQuery,
  type ListOpsErrorsQuery,
  type ListOpsOnboardingRequestsQuery,
  type ListSupportThreadsQuery,
  type OpsClient,
  type OpsError,
  type OpsErrorSummary,
  type OpsOnboardingRequest,
  type Paginated,
  type SupportMessage as SupportMessageDto,
  type SupportThread as SupportThreadDto,
  type SupportThreadSummary,
  type UpdateOpsOnboardingRequest,
  type UpdateSupportThreadRequest,
  createSupportMessageRequestSchema,
  listOpsClientsQuerySchema,
  listOpsErrorsQuerySchema,
  listOpsOnboardingRequestsQuerySchema,
  listSupportThreadsQuerySchema,
  updateOpsOnboardingRequestSchema,
  updateSupportThreadRequestSchema,
} from '@zenvy/shared';
import type { Request } from 'express';
import { Roles } from '../auth/rbac';
import { ApiException, ZodValidationPipe, cursorArgs, page } from '../common/http';
import type { Clinic, ErrorLog, OnboardingRequest, Subscription } from '../generated/prisma/client';
import { Prisma } from '../generated/prisma/client';
import { Role } from '../generated/prisma/enums';
import { prisma } from '../prisma/client';
import {
  detailInclude,
  summaryInclude,
  threadNotFound,
  toMessageDto,
  toThreadDto,
  toThreadSummary,
} from './support.controller';

// S4-1 owner-portal endpoints (docs/api/ops.md), SUPER_ADMIN only. These are
// cross-tenant by design: the Prisma tenant extension lets a SUPER_ADMIN
// context through unscoped, and RolesGuard is what keeps everyone else out.
// Still `prisma` and not `basePrisma` — if the role check ever regressed, the
// extension would confine the query instead of leaking every clinic.

type ClinicRefRow = Pick<Clinic, 'id' | 'name' | 'slug'>;

type ClientRow = Clinic & {
  subscription: Subscription | null;
  whatsAppAccounts: { id: string }[];
  _count: { patients: number; conversations: number; users: number };
};

const toClient = (c: ClientRow): OpsClient => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  phone: c.phone,
  onboardingStatus: c.onboardingStatus,
  subscription: c.subscription && {
    status: c.subscription.status,
    plan: c.subscription.plan,
    trialEndsAt: c.subscription.trialEndsAt?.toISOString() ?? null,
  },
  whatsappConnected: c.whatsAppAccounts.length > 0,
  counts: {
    patients: c._count.patients,
    conversations: c._count.conversations,
    users: c._count.users,
  },
  createdAt: c.createdAt.toISOString(),
});

type ErrorRow = ErrorLog & { clinic: ClinicRefRow | null };

const toErrorSummary = (e: ErrorRow): OpsErrorSummary => ({
  id: e.id,
  correlationId: e.correlationId,
  clinic: e.clinic,
  userId: e.userId,
  module: e.module,
  severity: e.severity,
  message: e.message,
  createdAt: e.createdAt.toISOString(),
});

const toError = (e: ErrorRow): OpsError => ({
  ...toErrorSummary(e),
  stack: e.stack,
  context: e.context ?? null,
});

type OnboardingRow = OnboardingRequest & { clinic: ClinicRefRow };

const toOnboarding = (o: OnboardingRow): OpsOnboardingRequest => ({
  id: o.id,
  clinic: o.clinic,
  status: o.status,
  notes: o.notes,
  scheduledCallAt: o.scheduledCallAt?.toISOString() ?? null,
  createdAt: o.createdAt.toISOString(),
  updatedAt: o.updatedAt.toISOString(),
});

const clinicRef = { select: { id: true, name: true, slug: true } } as const;

@Roles(Role.SUPER_ADMIN)
@Controller('ops')
export class OpsController {
  // ---------- Clients ----------

  @Get('clients')
  async clients(
    @Query(new ZodValidationPipe(listOpsClientsQuerySchema)) query: ListOpsClientsQuery,
  ): Promise<Paginated<OpsClient>> {
    const { cursor, limit, search, subscriptionStatus, onboardingStatus } = query;
    const where: Prisma.ClinicWhereInput = {
      ...(onboardingStatus ? { onboardingStatus } : {}),
      ...(subscriptionStatus ? { subscription: { status: subscriptionStatus } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { slug: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const rows = await prisma.clinic.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...cursorArgs(cursor),
      include: {
        subscription: true,
        // Existence check only — one verified number is all the list shows.
        whatsAppAccounts: { where: { verified: true }, select: { id: true }, take: 1 },
        _count: {
          select: {
            patients: { where: { deletedAt: null } },
            conversations: true,
            users: true,
          },
        },
      },
    });
    const { items, nextCursor } = page(rows, limit);
    return { items: items.map(toClient), nextCursor };
  }

  // ---------- Error log ----------

  @Get('errors')
  async errors(
    @Query(new ZodValidationPipe(listOpsErrorsQuerySchema)) query: ListOpsErrorsQuery,
  ): Promise<Paginated<OpsErrorSummary>> {
    const { cursor, limit, clinicId, correlationId, module, severity, since, until } = query;
    const where: Prisma.ErrorLogWhereInput = {
      ...(clinicId ? { clinicId } : {}),
      ...(correlationId ? { correlationId } : {}),
      ...(module ? { module } : {}),
      ...(severity ? { severity } : {}),
      ...(since || until
        ? {
            createdAt: {
              ...(since ? { gte: new Date(since) } : {}),
              ...(until ? { lt: new Date(until) } : {}),
            },
          }
        : {}),
    };
    const rows = await prisma.errorLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...cursorArgs(cursor),
      include: { clinic: clinicRef },
    });
    const { items, nextCursor } = page(rows, limit);
    return { items: items.map(toErrorSummary), nextCursor };
  }

  @Get('errors/:id')
  async error(@Param('id') id: string): Promise<OpsError> {
    const row = await prisma.errorLog.findUnique({ where: { id }, include: { clinic: clinicRef } });
    if (!row) throw new ApiException('ERROR_LOG_NOT_FOUND', 'Erreur introuvable.');
    return toError(row);
  }

  // ---------- Onboarding queue ----------

  @Get('onboarding-requests')
  async onboardingRequests(
    @Query(new ZodValidationPipe(listOpsOnboardingRequestsQuerySchema))
    query: ListOpsOnboardingRequestsQuery,
  ): Promise<Paginated<OpsOnboardingRequest>> {
    const { cursor, limit, status, clinicId } = query;
    const rows = await prisma.onboardingRequest.findMany({
      where: { ...(status ? { status } : {}), ...(clinicId ? { clinicId } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...cursorArgs(cursor),
      include: { clinic: clinicRef },
    });
    const { items, nextCursor } = page(rows, limit);
    return { items: items.map(toOnboarding), nextCursor };
  }

  @Patch('onboarding-requests/:id')
  async updateOnboardingRequest(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateOpsOnboardingRequestSchema))
    body: UpdateOpsOnboardingRequest,
  ): Promise<OpsOnboardingRequest> {
    // Absent key = leave alone; explicit null = clear (docs/api/ops.md).
    const data: Prisma.OnboardingRequestUpdateInput = {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.scheduledCallAt !== undefined
        ? { scheduledCallAt: body.scheduledCallAt ? new Date(body.scheduledCallAt) : null }
        : {}),
    };
    const { count } = await prisma.onboardingRequest.updateMany({ where: { id }, data });
    if (count === 0) {
      throw new ApiException('ONBOARDING_REQUEST_NOT_FOUND', 'Demande d’onboarding introuvable.');
    }
    const row = await prisma.onboardingRequest.findUniqueOrThrow({
      where: { id },
      include: { clinic: clinicRef },
    });
    return toOnboarding(row);
  }

  // ---------- Support threads (founder side) ----------

  @Get('support-threads')
  async threads(
    @Query(new ZodValidationPipe(listSupportThreadsQuerySchema)) query: ListSupportThreadsQuery,
  ): Promise<Paginated<SupportThreadSummary>> {
    const { cursor, limit, status, clinicId } = query;
    const rows = await prisma.supportThread.findMany({
      where: { ...(status ? { status } : {}), ...(clinicId ? { clinicId } : {}) },
      // Last activity first: a clinic's new message bumps updatedAt.
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...cursorArgs(cursor),
      include: summaryInclude,
    });
    const { items, nextCursor } = page(rows, limit);
    return { items: items.map(toThreadSummary), nextCursor };
  }

  @Get('support-threads/:id')
  async thread(@Param('id') id: string): Promise<SupportThreadDto> {
    const thread = await prisma.supportThread.findUnique({ where: { id }, include: detailInclude });
    return toThreadDto(thread ?? threadNotFound());
  }

  @Post('support-threads/:id/messages')
  @HttpCode(201)
  async reply(
    @Req() req: Request,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createSupportMessageRequestSchema))
    body: CreateSupportMessageRequest,
  ): Promise<SupportMessageDto> {
    const thread = await prisma.supportThread.findUnique({ where: { id }, select: { id: true } });
    if (!thread) threadNotFound();
    const message = await prisma.supportMessage.create({
      data: { threadId: thread!.id, authorUserId: req.sessionUser!.id, body: body.body },
      include: { authorUser: { select: { name: true, role: true } } },
    });
    // Answering does not reopen or close anything — only bumps last activity,
    // so the thread sorts to the top of the clinic's list too.
    await prisma.supportThread.update({
      where: { id: thread!.id },
      data: { updatedAt: new Date() },
    });
    return toMessageDto(message);
  }

  @Patch('support-threads/:id')
  async updateThread(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSupportThreadRequestSchema)) body: UpdateSupportThreadRequest,
  ): Promise<SupportThreadDto> {
    const { count } = await prisma.supportThread.updateMany({
      where: { id },
      data: { status: body.status },
    });
    if (count === 0) threadNotFound();
    const thread = await prisma.supportThread.findUniqueOrThrow({
      where: { id },
      include: detailInclude,
    });
    return toThreadDto(thread);
  }
}
