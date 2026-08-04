import { Logger } from '@nestjs/common';
import { basePrisma, prisma } from '../prisma/client';
import { getTenantContext } from '../tenancy/tenant-context';
import { sendText } from '../whatsapp/graph';
import { emergencyKeywordHit, checkReply } from './guardrails';
import * as llm from './llm';
import {
  EMERGENCY_SCHEMA,
  type EngineContext,
  HISTORY_LIMIT,
  MAX_REPLY_TOKENS,
  REPLY_SCHEMA,
  buildMessages,
  emergencyMessages,
  renderConfig,
} from './prompt';

// S2-3 conversation engine — the flow in docs/05-ai-policy.md §Engine flow,
// entered from the inbound worker once a patient message is stored. Runs inside
// runAsClinic, so `prisma` is already scoped to the routed clinic.

const logger = new Logger('AiEngine');
const WINDOW_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Anyone who can message the clinic's number can make us call the LLM, so cap
// what one clinic's assistant spends in a rolling 24h (S3-6, D31 — replaces the
// S2-7 reply cap). Past it the thread goes to a human: the message is still
// stored and visible, we just stop paying to answer it. The emergency keyword
// path is deliberately exempt (R6 — a false negative costs a patient, and it
// spends no LLM call).
// ponytail: one flat budget for every clinic, per-plan budgets when a second
// pricing tier exists.
export const AI_DAILY_TOKEN_BUDGET = Number(process.env.AI_DAILY_TOKEN_BUDGET ?? 300_000);

interface ReplyVerdict {
  reply: string;
  handoff: boolean;
  understood: boolean;
}

// Patient-visible French, fixed in code: these three are policy, not copy the
// clinic may tune (docs/05-ai-policy.md §Hard boundaries).
const disclosure = (clinicName: string): string =>
  `Bonjour, je suis l’assistant virtuel du cabinet ${clinicName}.`;

export const HANDOFF =
  'Je transmets votre message à l’équipe du cabinet : une personne vous répondra ici même.';

/** Fixed wording so the engine can count consecutive misses by reading them
 *  back — three in a row ends the assistant's turn (docs/05-ai-policy.md). */
export const CLARIFY =
  'Je n’ai pas bien compris votre demande. Pouvez-vous la reformuler en quelques mots ?';

const emergencyReply = (clinicPhone: string | null): string =>
  [
    'Votre message semble urgent.',
    clinicPhone ? `Appelez le cabinet immédiatement au ${clinicPhone}.` : null,
    'En cas d’urgence vitale (douleur insupportable, saignement qui ne s’arrête pas, gonflement du visage avec fièvre), appelez le 15 ou rendez-vous aux urgences les plus proches.',
    'L’équipe du cabinet est prévenue et prend le relais ici.',
  ]
    .filter(Boolean)
    .join(' ');

/** ErrorLog is the durable trail; patient bodies never reach it (docs/04). */
async function warn(conversationId: string, message: string): Promise<void> {
  logger.warn(message);
  await basePrisma.errorLog.create({
    data: {
      clinicId: getTenantContext()?.clinicId ?? null,
      module: 'ai',
      severity: 'WARN',
      message,
      context: { conversationId },
    },
  });
}

/**
 * Answers the message the inbound worker just stored.
 *
 * Never throws: the worker dedups on `waMessageId`, so a job retry would find
 * the message already stored and skip this call — the reply would be lost
 * silently. Any failure therefore ends with the thread in a human's hands.
 */
export async function replyToInbound(conversationId: string): Promise<void> {
  try {
    await run(conversationId);
  } catch (error) {
    await warn(conversationId, `AI engine failed: ${(error as Error).message}`);
    // updateMany, not update: a thread that vanished (or belongs to another
    // clinic) must no-op here, not throw a second error out of the handler.
    await prisma.conversation.updateMany({
      where: { id: conversationId },
      data: { status: 'HUMAN' },
    });
  }
}

async function run(conversationId: string): Promise<void> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId },
    include: { patient: true, clinic: true },
  });
  // Staff may have taken over between the webhook and this call.
  if (!conversation || conversation.status !== 'AI') return;
  // Opt-out blocks every outbound message, the assistant's included.
  if (conversation.patient?.optOut) return;
  if (!llm.isConfigured()) {
    await warn(conversationId, 'OPENAI_API_KEY is not configured: no AI reply sent');
    return;
  }

  const recent = await prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: HISTORY_LIMIT,
    select: { author: true, body: true, direction: true, createdAt: true },
  });
  const latest = recent[0];
  // Free-form replies live only inside Meta's 24h window. A job delayed past it
  // (outage, retry storm) hands over rather than failing at the Graph API.
  if (!latest || latest.direction !== 'IN') return;
  if (Date.now() - latest.createdAt.getTime() > WINDOW_MS) {
    await warn(conversationId, 'Inbound message older than the 24h window: no AI reply');
    return;
  }

  // Emergency classifier runs BEFORE generation and bypasses it entirely; the
  // keyword hit spares an LLM call on the clearest cases.
  const keywordUrgent = emergencyKeywordHit(latest.body);

  // Checked between the free keyword pass and the first paid call: a flood
  // cannot run up the bill, and cannot silence the emergency path either.
  if (!keywordUrgent && (await overTokenBudget())) {
    await warn(
      conversationId,
      `AI daily token budget reached (${AI_DAILY_TOKEN_BUDGET}): thread handed to a human`,
    );
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: 'HUMAN' },
    });
    return;
  }

  const urgent =
    keywordUrgent ||
    (
      await paidCall<{ urgent: boolean }>(
        conversation.clinicId,
        emergencyMessages(latest.body),
        EMERGENCY_SCHEMA,
        16,
      )
    ).urgent;
  if (urgent) {
    // The urgent flag on the inbox thread is how the clinic is notified in v1.
    // ponytail: inbox flag only, add push/email when staff ask for it.
    await deliver(conversation, emergencyReply(conversation.clinic.phone), {
      handoff: true,
      urgent: true,
    });
    return;
  }

  const nextAppointment = conversation.patientId
    ? await prisma.appointment.findFirst({
        where: {
          patientId: conversation.patientId,
          startsAt: { gte: new Date() },
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
        },
        orderBy: { startsAt: 'asc' },
        select: { startsAt: true, type: true },
      })
    : null;

  const context: EngineContext = {
    clinic: conversation.clinic,
    // Notes and history stay out of the prompt: the assistant needs a first
    // name to be polite, not a medical file (docs/04 §data minimization).
    patientFirstName: conversation.patient?.firstName ?? null,
    nextAppointment,
    history: [...recent].reverse(),
  };

  const verdict = await paidCall<ReplyVerdict>(
    conversation.clinicId,
    buildMessages(context),
    REPLY_SCHEMA,
    MAX_REPLY_TOKENS,
  );

  if (verdict.handoff) {
    await deliver(conversation, HANDOFF, { handoff: true });
    return;
  }

  if (!verdict.understood) {
    const giveUp = await thirdStrike(conversationId);
    await deliver(conversation, giveUp ? HANDOFF : CLARIFY, { handoff: giveUp });
    return;
  }

  const failure = checkReply(verdict.reply, {
    configText: renderConfig(conversation.clinic.aiConfig),
    clinicPhone: conversation.clinic.phone,
  });
  if (failure) {
    await warn(conversationId, `Guardrail blocked an AI reply: ${failure}`);
    await deliver(conversation, HANDOFF, { handoff: true });
    return;
  }

  await deliver(conversation, verdict.reply, { handoff: false });
}

/** Every LLM call the engine makes goes through here, so nothing is spent
 *  without landing in the cost log the budget guard reads back. */
async function paidCall<T>(
  clinicId: string,
  messages: Parameters<typeof llm.complete>[0],
  schema: Parameters<typeof llm.complete>[1],
  maxTokens: number,
): Promise<T> {
  const { data, usage } = await llm.complete<T>(messages, schema, maxTokens);
  try {
    // `prisma` re-stamps clinicId from the tenant context either way — passing
    // it keeps the write typed like every other tenant-scoped create.
    await prisma.aiUsage.create({ data: { ...usage, clinicId } });
  } catch (error) {
    // Accounting must never cost a patient their answer — the call is already
    // paid for either way, so log the miss and reply.
    logger.warn(`AI usage not recorded: ${(error as Error).message}`);
  }
  return data;
}

/** `prisma` is tenant-scoped, so this sums the routed clinic's own spend. */
async function overTokenBudget(): Promise<boolean> {
  const spent = await prisma.aiUsage.aggregate({
    _sum: { promptTokens: true, completionTokens: true },
    where: { createdAt: { gte: new Date(Date.now() - DAY_MS) } },
  });
  const tokens = (spent._sum.promptTokens ?? 0) + (spent._sum.completionTokens ?? 0);
  return tokens >= AI_DAILY_TOKEN_BUDGET;
}

/** True when the two previous assistant messages were both clarification
 *  requests — this one would be the third consecutive non-understanding. */
async function thirdStrike(conversationId: string): Promise<boolean> {
  const previous = await prisma.message.findMany({
    where: { conversationId, direction: 'OUT', author: 'AI' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 2,
    select: { body: true },
  });
  return previous.length === 2 && previous.every((message) => message.body.endsWith(CLARIFY));
}

interface DeliverTarget {
  id: string;
  clinicId: string;
  waContactPhone: string;
  clinic: { name: string };
}

async function deliver(
  conversation: DeliverTarget,
  body: string,
  { handoff, urgent = false }: { handoff: boolean; urgent?: boolean },
): Promise<void> {
  // EU AI Act chatbot disclosure — first message the assistant ever sends in
  // this thread, whatever that message is. Non-configurable (docs/05).
  const sentBefore = await prisma.message.count({
    where: { conversationId: conversation.id, direction: 'OUT', author: 'AI' },
  });
  const text = sentBefore === 0 ? `${disclosure(conversation.clinic.name)} ${body}` : body;

  const account = await prisma.whatsAppAccount.findFirst({ select: { phoneNumberId: true } });
  if (!account) {
    await warn(conversation.id, 'Clinic has no WhatsAppAccount: AI reply not sent');
    return;
  }

  // Stored only once Meta accepted it — same rule as the staff send path.
  const waMessageId = await sendText(account.phoneNumberId, conversation.waContactPhone, text);
  await prisma.message.create({
    data: {
      clinicId: conversation.clinicId,
      conversationId: conversation.id,
      direction: 'OUT',
      author: 'AI',
      body: text,
      waMessageId,
      deliveryStatus: 'PENDING',
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      ...(handoff ? { status: 'HUMAN' as const } : {}),
      ...(urgent ? { urgentFlag: true } : {}),
    },
  });
}
