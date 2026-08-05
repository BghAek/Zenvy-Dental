import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import {
  type CreateSupportMessageRequest,
  type CreateSupportThreadRequest,
  type ListSupportThreadsQuery,
  type Paginated,
  type SupportMessage as SupportMessageDto,
  type SupportThread as SupportThreadDto,
  type SupportThreadSummary,
  createSupportMessageRequestSchema,
  createSupportThreadRequestSchema,
  listSupportThreadsQuerySchema,
} from '@zenvy/shared';
import type { Request } from 'express';
import { Roles } from '../auth/rbac';
import { NoSubscription } from '../billing/subscription.guard';
import { ApiException, ZodValidationPipe, cursorArgs, page } from '../common/http';
import type { Clinic, SupportMessage, SupportThread, User } from '../generated/prisma/client';
import { Role, SupportThreadStatus } from '../generated/prisma/enums';
import { prisma } from '../prisma/client';

// S4-1 clinic-side support chat (docs/api/ops.md). The founder's half lives in
// ops.controller.ts and reuses the mappers below — one contract, both apps.
//
// Tenancy: SupportMessage has no clinicId, so the tenant extension does NOT
// scope it. Every read and write here goes through prisma.supportThread first
// (which IS scoped) — that lookup is the ownership proof.

const PREVIEW_LENGTH = 140;

const clinicRef = { select: { id: true, name: true, slug: true } } as const;

/** List rows carry only the newest message (for the preview). */
export const summaryInclude = {
  clinic: clinicRef,
  _count: { select: { messages: true } },
  messages: { orderBy: { createdAt: 'desc' }, take: 1 },
} as const;

/** Detail carries the whole thread, oldest first.
 *  ponytail: no message pagination — support threads are short; paginate if
 *  one ever isn't. */
export const detailInclude = {
  clinic: clinicRef,
  _count: { select: { messages: true } },
  messages: {
    orderBy: { createdAt: 'asc' },
    include: { authorUser: { select: { name: true, role: true } } },
  },
} as const;

type MessageRow = SupportMessage & { authorUser?: Pick<User, 'name' | 'role'> | null };
type ThreadRow = SupportThread & {
  clinic: Pick<Clinic, 'id' | 'name' | 'slug'>;
  _count: { messages: number };
  messages: MessageRow[];
};

export const toMessageDto = (m: MessageRow): SupportMessageDto => ({
  id: m.id,
  threadId: m.threadId,
  authorRole: m.authorUser?.role ?? null,
  // Support replies are institutional: the clinic sees the role and renders
  // « Support ZenvyDental », never the founder's personal name.
  authorName: m.authorUser && m.authorUser.role !== Role.SUPER_ADMIN ? m.authorUser.name : null,
  body: m.body,
  createdAt: m.createdAt.toISOString(),
});

export const toThreadSummary = (t: ThreadRow): SupportThreadSummary => {
  // Works for both includes: newest-first-take-1 and oldest-first-all both put
  // the newest message at the end of a one- or n-element array.
  const last = t.messages[t.messages.length - 1];
  return {
    id: t.id,
    clinic: t.clinic,
    subject: t.subject,
    status: t.status,
    lastMessageAt: last?.createdAt.toISOString() ?? null,
    lastMessagePreview: last ? last.body.slice(0, PREVIEW_LENGTH) : null,
    messageCount: t._count.messages,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
};

export const toThreadDto = (t: ThreadRow): SupportThreadDto => ({
  ...toThreadSummary(t),
  messages: t.messages.map(toMessageDto),
});

export const threadNotFound = (): never => {
  throw new ApiException('SUPPORT_THREAD_NOT_FOUND', 'Conversation de support introuvable.');
};

// Exempt from gating: a clinic whose payment failed must still be able to ask
// for help — that is exactly when it needs to (docs/api/ops.md).
@NoSubscription()
@Roles(Role.CLINIC_OWNER, Role.CLINIC_STAFF)
@Controller('support-threads')
export class SupportController {
  @Get()
  async list(
    @Query(new ZodValidationPipe(listSupportThreadsQuerySchema)) query: ListSupportThreadsQuery,
  ): Promise<Paginated<SupportThreadSummary>> {
    const { cursor, limit, status } = query;
    // `clinicId` is deliberately not read here: the tenant comes from the
    // session, never from a query string (docs/03-api-conventions.md).
    const rows = await prisma.supportThread.findMany({
      where: status ? { status } : {},
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...cursorArgs(cursor),
      include: summaryInclude,
    });
    const { items, nextCursor } = page(rows, limit);
    return { items: items.map(toThreadSummary), nextCursor };
  }

  @Post()
  @HttpCode(201)
  async create(
    @Req() req: Request,
    @Body(new ZodValidationPipe(createSupportThreadRequestSchema)) body: CreateSupportThreadRequest,
  ): Promise<SupportThreadDto> {
    const user = req.sessionUser!;
    // Nested create is safe here: the parent create is tenant-stamped and
    // SupportMessage inherits its scope from the thread it hangs off.
    const thread = await prisma.supportThread.create({
      data: {
        clinicId: user.clinicId!,
        subject: body.subject ?? null,
        messages: { create: { authorUserId: user.id, body: body.body } },
      },
      include: detailInclude,
    });
    return toThreadDto(thread);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<SupportThreadDto> {
    const thread = await prisma.supportThread.findFirst({ where: { id }, include: detailInclude });
    return toThreadDto(thread ?? threadNotFound());
  }

  @Post(':id/messages')
  @HttpCode(201)
  async reply(
    @Req() req: Request,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createSupportMessageRequestSchema))
    body: CreateSupportMessageRequest,
  ): Promise<SupportMessageDto> {
    const user = req.sessionUser!;
    // Scoped lookup first — another clinic's thread is a 404 before any
    // (unscoped) SupportMessage query runs.
    const thread = await prisma.supportThread.findFirst({ where: { id }, select: { id: true } });
    if (!thread) threadNotFound();
    const message = await prisma.supportMessage.create({
      data: { threadId: thread!.id, authorUserId: user.id, body: body.body },
      include: { authorUser: { select: { name: true, role: true } } },
    });
    // A reply reopens a closed thread — never a dead end for the clinic — and
    // bumps updatedAt, which is what "last activity" sorting reads.
    await prisma.supportThread.update({
      where: { id: thread!.id },
      data: { status: SupportThreadStatus.OPEN },
    });
    return toMessageDto(message);
  }
}
