import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { basePrisma } from '../src/prisma/client';
import { runAsClinic } from '../src/tenancy/tenant-context';

// S2-3 engine suite (docs/05-ai-policy.md §Engine flow): the orchestration and
// the handoff state machine. The model and the Graph API are stubbed — what is
// under test is what the engine DOES with a verdict, not the verdict itself
// (that is the eval set's job, test/ai-evals.spec.ts).

// Hoisted above the imports below by vitest, so the engine binds to the stubs.
vi.mock('../src/whatsapp/graph', () => ({
  sendText: vi.fn(async () => `wamid.ai-${Math.random().toString(36).slice(2)}`),
}));
vi.mock('../src/ai/llm', () => ({ isConfigured: () => true, complete: vi.fn() }));

import { AI_DAILY_TOKEN_BUDGET, CLARIFY, HANDOFF, replyToInbound } from '../src/ai/engine';
import { complete as llmComplete } from '../src/ai/llm';
import { sendText as graphSendText } from '../src/whatsapp/graph';

const complete = vi.mocked(llmComplete);
const sendText = vi.mocked(graphSendText);

const run = randomUUID().slice(0, 8);
let seeded = 0;

/** Every call is metered (S3-6), so the stubs carry a usage block too. */
const stubUsage = {
  model: 'gpt-4o-mini',
  promptTokens: 500,
  completionTokens: 100,
  costMicroEur: 135,
};

/** The classifier call comes first, then generation — queue them in that order. */
function stubModel(options: { urgent?: boolean; verdict?: object }): void {
  complete.mockResolvedValueOnce({ data: { urgent: options.urgent ?? false }, usage: stubUsage });
  if (options.verdict) complete.mockResolvedValueOnce({ data: options.verdict, usage: stubUsage });
}

describe('ai engine (S2-3)', () => {
  const startedAt = new Date();
  let clinicA: { id: string };
  let clinicB: { id: string };
  /** Its own clinic: the budget test spends a day's tokens and would starve the rest. */
  let clinicCapped: { id: string };

  const messagesOf = (conversationId: string) =>
    basePrisma.message.findMany({ where: { conversationId } });

  /** Index-free: the assistant's messages, oldest first. */
  const aiMessages = (conversationId: string) =>
    basePrisma.message.findMany({
      where: { conversationId, direction: 'OUT', author: 'AI' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

  /** A thread with one patient message waiting for an answer. */
  async function seedThread(
    clinicId: string,
    body: string,
    overrides: { status?: 'AI' | 'HUMAN'; optOut?: boolean; receivedAt?: Date } = {},
  ) {
    seeded += 1;
    const phone = `+3361299${String(seeded).padStart(4, '0')}`;
    const patient = await basePrisma.patient.create({
      data: { clinicId, firstName: 'Amélie', lastName: 'Durand', phone, optOut: overrides.optOut },
    });
    const conversation = await basePrisma.conversation.create({
      data: {
        clinicId,
        patientId: patient.id,
        waContactPhone: phone,
        status: overrides.status ?? 'AI',
        lastMessageAt: new Date(),
      },
    });
    await basePrisma.message.create({
      data: {
        clinicId,
        conversationId: conversation.id,
        direction: 'IN',
        author: 'PATIENT',
        body,
        waMessageId: `wamid.in-${randomUUID()}`,
        ...(overrides.receivedAt ? { createdAt: overrides.receivedAt } : {}),
      },
    });
    return conversation;
  }

  beforeAll(async () => {
    [clinicA, clinicB, clinicCapped] = await Promise.all(
      (['a', 'b', 'capped'] as const).map((label) =>
        basePrisma.clinic.create({
          data: {
            name: `Cabinet ${label} ${run}`,
            slug: `ai-${label}-${run}`,
            phone: '+33123456789',
            aiConfig: { horaires: '9h-19h', tarifs: 'consultation 30 €' },
            // The engine is gated on the subscription too (S3-7), so every
            // clinic here is a paying one unless a test says otherwise.
            subscription: {
              create: { trialEndsAt: new Date(Date.now() + 14 * 24 * 3600 * 1000) },
            },
          },
        }),
      ),
    );
    await basePrisma.whatsAppAccount.createMany({
      data: [clinicA, clinicB, clinicCapped].map((clinic, i) => ({
        clinicId: clinic.id,
        phoneNumberId: `ai-pnid-${i}-${run}`,
        wabaId: `waba-${i}`,
        displayNumber: `+3310000000${i}`,
      })),
    });
  });

  afterEach(() => {
    complete.mockReset();
    sendText.mockClear();
  });

  afterAll(async () => {
    await basePrisma.clinic.deleteMany({
      where: { id: { in: [clinicA.id, clinicB.id, clinicCapped.id] } },
    });
    await basePrisma.errorLog.deleteMany({
      where: { module: 'ai', createdAt: { gte: startedAt } },
    });
    await basePrisma.$disconnect();
  });

  it('sends the generated reply and discloses itself on first contact', async () => {
    const conversation = await seedThread(clinicA.id, 'Bonjour, vous ouvrez à quelle heure ?');
    stubModel({
      verdict: { reply: 'Le cabinet est ouvert de 9h à 19h.', handoff: false, understood: true },
    });

    await runAsClinic(clinicA.id, () => replyToInbound(conversation.id));

    const [reply] = await aiMessages(conversation.id);
    expect(reply).toMatchObject({ deliveryStatus: 'PENDING' });
    // EU AI Act disclosure, prepended to the first assistant message only.
    expect(reply.body).toBe(
      `Bonjour, je suis l’assistant virtuel du cabinet Cabinet a ${run}. Le cabinet est ouvert de 9h à 19h.`,
    );
    const after = await basePrisma.conversation.findUnique({ where: { id: conversation.id } });
    expect(after?.status).toBe('AI');
    expect(after?.lastMessageAt?.getTime()).toBeGreaterThanOrEqual(
      conversation.lastMessageAt!.getTime(),
    );
  });

  it('escalates an emergency without generating a reply', async () => {
    const conversation = await seedThread(clinicA.id, 'J’ai une douleur intense depuis hier');

    await runAsClinic(clinicA.id, () => replyToInbound(conversation.id));

    // Keyword hit: the classifier call is skipped entirely, and so is generation.
    expect(complete).not.toHaveBeenCalled();
    const after = await basePrisma.conversation.findUnique({ where: { id: conversation.id } });
    expect(after).toMatchObject({ status: 'HUMAN', urgentFlag: true });
    const [escalation] = await aiMessages(conversation.id);
    expect(escalation.body).toContain('+33123456789');
    expect(escalation.body).toContain('le 15');
  });

  it('escalates when only the classifier sees the emergency', async () => {
    const conversation = await seedThread(clinicA.id, 'Je suis tombé et un bout de dent est parti');
    stubModel({ urgent: true });

    await runAsClinic(clinicA.id, () => replyToInbound(conversation.id));

    expect(complete).toHaveBeenCalledTimes(1);
    const after = await basePrisma.conversation.findUnique({ where: { id: conversation.id } });
    expect(after).toMatchObject({ status: 'HUMAN', urgentFlag: true });
  });

  it('hands over when the model asks for a human', async () => {
    const conversation = await seedThread(clinicA.id, 'Je veux parler à une vraie personne');
    stubModel({ verdict: { reply: '', handoff: true, understood: true } });

    await runAsClinic(clinicA.id, () => replyToInbound(conversation.id));

    const [reply] = await aiMessages(conversation.id);
    expect(reply.body).toContain(HANDOFF);
    const after = await basePrisma.conversation.findUnique({ where: { id: conversation.id } });
    expect(after?.status).toBe('HUMAN');
    // Handing over is not an emergency — the urgent flag stays down.
    expect(after?.urgentFlag).toBe(false);
  });

  it('blocks a guardrail-failing reply and hands over instead', async () => {
    const conversation = await seedThread(clinicA.id, 'Combien coûte un implant ?');
    stubModel({
      verdict: { reply: 'Un implant coûte 1200 €.', handoff: false, understood: true },
    });

    await runAsClinic(clinicA.id, () => replyToInbound(conversation.id));

    const [reply] = await aiMessages(conversation.id);
    // The invented price never reaches the patient.
    expect(reply.body).not.toContain('1200');
    expect(reply.body).toContain(HANDOFF);
    expect(
      await basePrisma.errorLog.count({ where: { module: 'ai', severity: 'WARN' } }),
    ).toBeGreaterThan(0);
  });

  it('gives up after three consecutive non-understandings', async () => {
    const conversation = await seedThread(clinicA.id, 'euh');
    const unclear = { reply: '', handoff: false, understood: false };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      // Staff never touched it, so the thread is still the assistant's.
      await basePrisma.conversation.update({
        where: { id: conversation.id },
        data: { status: 'AI' },
      });
      await basePrisma.message.create({
        data: {
          clinicId: clinicA.id,
          conversationId: conversation.id,
          direction: 'IN',
          author: 'PATIENT',
          body: `hmm ${attempt}`,
          waMessageId: `wamid.unclear-${attempt}-${run}`,
        },
      });
      stubModel({ verdict: unclear });
      await runAsClinic(clinicA.id, () => replyToInbound(conversation.id));
    }

    const outbound = await aiMessages(conversation.id);
    expect(outbound).toHaveLength(3);
    expect(outbound[0].body).toContain(CLARIFY);
    expect(outbound[1].body).toBe(CLARIFY);
    expect(outbound[2].body).toBe(HANDOFF);
    const after = await basePrisma.conversation.findUnique({ where: { id: conversation.id } });
    expect(after?.status).toBe('HUMAN');
  });

  it('stays silent on a thread a human owns and on an opted-out patient', async () => {
    const humanThread = await seedThread(clinicA.id, 'Bonjour', { status: 'HUMAN' });
    const optedOut = await seedThread(clinicA.id, 'Bonjour', { optOut: true });

    await runAsClinic(clinicA.id, () => replyToInbound(humanThread.id));
    await runAsClinic(clinicA.id, () => replyToInbound(optedOut.id));

    expect(sendText).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(await messagesOf(humanThread.id)).toHaveLength(1);
    expect(await messagesOf(optedOut.id)).toHaveLength(1);
  });

  it('refuses to answer outside the 24h window', async () => {
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const conversation = await seedThread(clinicA.id, 'Bonjour', { receivedAt: stale });

    await runAsClinic(clinicA.id, () => replyToInbound(conversation.id));

    expect(sendText).not.toHaveBeenCalled();
    expect(await messagesOf(conversation.id)).toHaveLength(1);
  });

  it('hands the thread to a human when the model call fails', async () => {
    const conversation = await seedThread(clinicA.id, 'Bonjour');
    complete.mockRejectedValueOnce(new Error('provider down'));

    await runAsClinic(clinicA.id, () => replyToInbound(conversation.id));

    // A retry would be deduped away by the worker, so the failure must not be
    // silent: the thread lands in the inbox instead.
    expect(await messagesOf(conversation.id)).toHaveLength(1);
    const after = await basePrisma.conversation.findUnique({ where: { id: conversation.id } });
    expect(after?.status).toBe('HUMAN');
  });

  it('logs what every model call cost, under the calling clinic', async () => {
    const conversation = await seedThread(clinicA.id, 'Bonjour, vous ouvrez quand ?');
    const before = await basePrisma.aiUsage.count({ where: { clinicId: clinicA.id } });
    stubModel({
      verdict: { reply: 'Le cabinet est ouvert de 9h à 19h.', handoff: false, understood: true },
    });

    await runAsClinic(clinicA.id, () => replyToInbound(conversation.id));

    // Classifier + generation: two calls, two rows, priced at write time.
    const rows = await basePrisma.aiUsage.findMany({
      where: { clinicId: clinicA.id },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });
    expect(await basePrisma.aiUsage.count({ where: { clinicId: clinicA.id } })).toBe(before + 2);
    expect(rows[0]).toMatchObject({ model: 'gpt-4o-mini', promptTokens: 500, costMicroEur: 135 });
  });

  it('stops answering past the daily token budget, but still escalates an emergency', async () => {
    // A day's budget already spent by this clinic (S2-7/S3-6: anyone who can
    // message the number can otherwise run up the LLM bill).
    await basePrisma.aiUsage.create({
      data: {
        clinicId: clinicCapped.id,
        model: 'gpt-4o-mini',
        promptTokens: AI_DAILY_TOKEN_BUDGET,
        completionTokens: 0,
        costMicroEur: 1,
      },
    });

    const flood = await seedThread(clinicCapped.id, 'Vous ouvrez à quelle heure ?');
    await runAsClinic(clinicCapped.id, () => replyToInbound(flood.id));

    // Not a single paid call, and the clinic sees the thread in its inbox.
    expect(complete).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
    expect(await messagesOf(flood.id)).toHaveLength(1);
    expect((await basePrisma.conversation.findUnique({ where: { id: flood.id } }))?.status).toBe(
      'HUMAN',
    );

    // The keyword path spends nothing, so the cap must not silence it (R6).
    const urgent = await seedThread(clinicCapped.id, 'J’ai une douleur insupportable');
    await runAsClinic(clinicCapped.id, () => replyToInbound(urgent.id));

    expect(await basePrisma.conversation.findUnique({ where: { id: urgent.id } })).toMatchObject({
      status: 'HUMAN',
      urgentFlag: true,
    });
  });

  it('answers nothing at all once the subscription is over (S3-7)', async () => {
    // Unlike the token budget, this is not a flood ceiling but the end of the
    // contract: even the free emergency path stays silent (D32). The patient's
    // message is stored and the thread waits for a human either way.
    await basePrisma.subscription.update({
      where: { clinicId: clinicCapped.id },
      data: { status: 'CANCELED', trialEndsAt: null },
    });
    try {
      const urgent = await seedThread(clinicCapped.id, 'J’ai une douleur insupportable');
      await runAsClinic(clinicCapped.id, () => replyToInbound(urgent.id));

      expect(complete).not.toHaveBeenCalled();
      expect(sendText).not.toHaveBeenCalled();
      expect(await messagesOf(urgent.id)).toHaveLength(1);
      expect((await basePrisma.conversation.findUnique({ where: { id: urgent.id } }))?.status).toBe(
        'HUMAN',
      );
    } finally {
      await basePrisma.subscription.update({
        where: { clinicId: clinicCapped.id },
        data: { status: 'TRIALING', trialEndsAt: new Date(Date.now() + 14 * 24 * 3600 * 1000) },
      });
    }
  });

  it('writes only under its own clinic (cross-tenant)', async () => {
    const threadB = await seedThread(clinicB.id, 'Bonjour, une question');
    const beforeA = await basePrisma.message.count({ where: { clinicId: clinicA.id } });
    stubModel({
      verdict: { reply: 'Bonjour ! Comment puis-je aider ?', handoff: false, understood: true },
    });

    await runAsClinic(clinicB.id, () => replyToInbound(threadB.id));

    expect(await basePrisma.message.count({ where: { clinicId: clinicA.id } })).toBe(beforeA);
    const [reply] = await aiMessages(threadB.id);
    expect(reply.clinicId).toBe(clinicB.id);
  });

  it('cannot be pointed at another clinic’s conversation', async () => {
    const threadB = await seedThread(clinicB.id, 'Bonjour');

    // Clinic A's context + clinic B's id: the tenant extension finds nothing.
    await runAsClinic(clinicA.id, () => replyToInbound(threadB.id));

    expect(sendText).not.toHaveBeenCalled();
    expect(await messagesOf(threadB.id)).toHaveLength(1);
  });
});
