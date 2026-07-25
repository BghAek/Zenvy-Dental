import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import {
  type Conversation as ConversationDto,
  type ConversationSummary,
  type ListConversationsQuery,
  type ListMessagesQuery,
  type Message as MessageDto,
  type Paginated,
  type SendMessageRequest,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
  sendMessageRequestSchema,
} from '@zenvy/shared';
import type { Request } from 'express';
import { Roles } from '../auth/rbac';
import { ApiException, ZodValidationPipe } from '../common/http';
import type { Conversation, Message, Patient } from '../generated/prisma/client';
import { Role } from '../generated/prisma/enums';
import { prisma } from '../prisma/client';
import { sendText } from '../whatsapp/graph';

// S2-2 inbox endpoints (docs/api/conversations.md). Tenancy is implicit: the
// Prisma tenant extension constrains every query to the session's clinic, so a
// foreign id simply finds nothing → 404. Threads are created by the inbound
// worker only; staff act on them through the routes below.

const PREVIEW_LENGTH = 140;
const WINDOW_MS = 24 * 60 * 60 * 1000;

type ConversationRow = Conversation & { patient?: Patient | null; messages?: Message[] };

const toSummary = (c: ConversationRow): ConversationSummary => {
  const last = c.messages?.[0];
  return {
    id: c.id,
    patient: c.patient
      ? {
          id: c.patient.id,
          firstName: c.patient.firstName,
          lastName: c.patient.lastName,
          phone: c.patient.phone,
          optOut: c.patient.optOut,
        }
      : null,
    waContactPhone: c.waContactPhone,
    status: c.status,
    urgentFlag: c.urgentFlag,
    lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
    lastMessagePreview: last ? last.body.slice(0, PREVIEW_LENGTH) : null,
    lastMessageAuthor: last?.author ?? null,
    createdAt: c.createdAt.toISOString(),
  };
};

const toMessageDto = (m: Message): MessageDto => ({
  id: m.id,
  conversationId: m.conversationId,
  direction: m.direction,
  author: m.author,
  body: m.body,
  templateName: m.templateName,
  deliveryStatus: m.deliveryStatus,
  createdAt: m.createdAt.toISOString(),
});

const notFound = (): never => {
  throw new ApiException('CONVERSATION_NOT_FOUND', 'Conversation introuvable.');
};

/** Meta's customer-service window: 24h after the patient's last inbound message. */
async function windowExpiresAt(conversationId: string): Promise<Date | null> {
  const lastInbound = await prisma.message.findFirst({
    where: { conversationId, direction: 'IN' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { createdAt: true },
  });
  return lastInbound ? new Date(lastInbound.createdAt.getTime() + WINDOW_MS) : null;
}

@Roles(Role.CLINIC_OWNER, Role.CLINIC_STAFF)
@Controller('conversations')
export class ConversationsController {
  @Get()
  async list(
    @Query(new ZodValidationPipe(listConversationsQuerySchema)) query: ListConversationsQuery,
  ): Promise<Paginated<ConversationSummary>> {
    const { cursor, limit, status } = query;
    const rows = await prisma.conversation.findMany({
      // Unset status hides the archive; the inbox is about live threads.
      where: status ? { status } : { status: { not: 'CLOSED' } },
      include: { patient: true, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      // id breaks ties so the cursor position is stable; a thread with no
      // message yet sorts last rather than first (Postgres NULLS FIRST on desc).
      orderBy: [
        { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: items.map(toSummary),
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<ConversationDto> {
    const conversation = await this.load(id);
    return this.toDetail(conversation);
  }

  @Get(':id/messages')
  async messages(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(listMessagesQuerySchema)) query: ListMessagesQuery,
  ): Promise<Paginated<MessageDto>> {
    await this.load(id);
    const { cursor, limit } = query;
    const rows = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: items.map(toMessageDto),
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  @Post(':id/messages')
  @HttpCode(201)
  async send(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sendMessageRequestSchema)) body: SendMessageRequest,
  ): Promise<MessageDto> {
    const conversation = await this.load(id);
    // Sending never implicitly takes over: two authors on one thread is worse
    // than an extra click (docs/api/conversations.md).
    if (conversation.status !== 'HUMAN') {
      throw new ApiException(
        'CONVERSATION_NOT_TAKEN_OVER',
        'Reprenez la conversation avant de répondre.',
      );
    }
    if (conversation.patient?.optOut) {
      throw new ApiException('PATIENT_OPTED_OUT', 'Ce patient a demandé à ne plus être contacté.');
    }
    const expiresAt = await windowExpiresAt(id);
    if (!expiresAt || expiresAt.getTime() <= Date.now()) {
      throw new ApiException(
        'OUTSIDE_24H_WINDOW',
        'La fenêtre de 24 h est fermée : seuls les modèles approuvés sont autorisés.',
      );
    }

    const account = await prisma.whatsAppAccount.findFirst({ select: { phoneNumberId: true } });
    if (!account) {
      throw new ApiException(
        'DOMAIN_RULE_VIOLATION',
        'Le numéro WhatsApp du cabinet n’est pas encore connecté.',
      );
    }

    // Stored only once Meta accepted it — no row for a message that never left.
    const waMessageId = await sendText(
      account.phoneNumberId,
      conversation.waContactPhone,
      body.body,
    );
    const sentAt = new Date();
    const message = await prisma.message.create({
      data: {
        clinicId: conversation.clinicId,
        conversationId: id,
        direction: 'OUT',
        author: 'STAFF',
        body: body.body,
        waMessageId,
        deliveryStatus: 'PENDING',
      },
    });
    await prisma.conversation.update({ where: { id }, data: { lastMessageAt: sentAt } });
    return toMessageDto(message);
  }

  // The three lifecycle actions return the conversation, not a creation → 200.
  @Post(':id/takeover')
  @HttpCode(200)
  async takeover(@Req() req: Request, @Param('id') id: string): Promise<ConversationDto> {
    const conversation = await this.load(id);
    if (conversation.status === 'HUMAN') return this.toDetail(conversation);
    // Acting on the thread is the acknowledgement — the urgent flag clears here.
    return this.transition(req, id, 'HUMAN', 'conversation.takeover');
  }

  @Post(':id/release')
  @HttpCode(200)
  async release(@Req() req: Request, @Param('id') id: string): Promise<ConversationDto> {
    const conversation = await this.load(id);
    if (conversation.status === 'AI') return this.toDetail(conversation);
    // The AI answers the next inbound message; releasing generates no reply.
    return this.transition(req, id, 'AI', 'conversation.release');
  }

  @Post(':id/close')
  @HttpCode(200)
  async close(@Param('id') id: string): Promise<ConversationDto> {
    await this.load(id);
    // Archive only: messages stay, and a new inbound message reopens as AI.
    await prisma.conversation.update({
      where: { id },
      data: { status: 'CLOSED', urgentFlag: false },
    });
    return this.toDetail(await this.load(id));
  }

  /** The scoped read every route starts from: another clinic's id finds nothing. */
  private async load(id: string): Promise<ConversationRow> {
    const conversation = await prisma.conversation.findFirst({
      where: { id },
      include: { patient: true, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return conversation ?? notFound();
  }

  private async transition(
    req: Request,
    id: string,
    status: 'AI' | 'HUMAN',
    action: string,
  ): Promise<ConversationDto> {
    await prisma.conversation.update({
      where: { id },
      data: { status, ...(status === 'HUMAN' ? { urgentFlag: false } : {}) },
    });
    await prisma.auditLog.create({
      data: {
        actorUserId: req.sessionUser!.id,
        action,
        entity: 'Conversation',
        entityId: id,
      },
    });
    return this.toDetail(await this.load(id));
  }

  private async toDetail(c: ConversationRow): Promise<ConversationDto> {
    return {
      ...toSummary(c),
      windowExpiresAt: (await windowExpiresAt(c.id))?.toISOString() ?? null,
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
