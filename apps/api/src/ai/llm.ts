// The one place the API talks to the LLM provider (docs/05-ai-policy.md): the
// engine never names OpenAI, so models and providers swap here alone. Raw fetch
// like the Graph client — an SDK buys nothing over a single POST and would be a
// new dependency (docs/07-coding-standards.md §Simplicity).

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
// docs/05-ai-policy.md: start cheap, move up where quality demands it.
const DEFAULT_MODEL = 'gpt-4o-mini';
const TIMEOUT_MS = 15_000;

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Strict `json_schema`: the provider guarantees the shape, so callers read the
 *  fields directly instead of defending against malformed JSON. */
export interface LlmSchema {
  name: string;
  properties: Record<string, { type: 'string' | 'boolean'; description: string }>;
}

interface CompletionResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** What one call spent, for the cost log and the daily budget guard (S3-6). */
export interface LlmUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  costMicroEur: number;
}

// Micro-euros per 1M tokens, list price ≈ parity, rounded up. Two models only:
// the one we run and the one we escalate to (docs/05-ai-policy.md).
// ponytail: hardcoded rates, move to config the day a third model is in play.
const PRICES: Record<string, { in: number; out: number }> = {
  'gpt-4o-mini': { in: 150_000, out: 600_000 },
  'gpt-4o': { in: 2_500_000, out: 10_000_000 },
};

/** Unknown model → the dearest known rate, so a model swap can only over-report
 *  spend. Under-reporting is what would quietly break the budget guard. */
export function priceMicroEur(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const price = PRICES[model] ?? PRICES['gpt-4o'];
  return Math.round((promptTokens * price.in + completionTokens * price.out) / 1_000_000);
}

/** False in local dev without a key: the engine then stays silent rather than
 *  handing every thread to a human. */
export function isConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return Boolean(key) && key !== 'CHANGE_ME';
}

/** Returns the parsed verdict AND what it cost — the caller logs the usage and
 *  the budget guard reads it back (docs/05-ai-policy.md §Cost guard). */
export async function complete<T>(
  messages: LlmMessage[],
  schema: LlmSchema,
  maxTokens: number,
): Promise<{ data: T; usage: LlmUsage }> {
  if (!isConfigured()) throw new Error('OPENAI_API_KEY is not configured');
  const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model,
      messages,
      // A clinic assistant restates configured facts; it does not improvise.
      temperature: 0.2,
      // Response length capped at the API, not only by the prompt (docs/05).
      max_tokens: maxTokens,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: schema.name,
          strict: true,
          schema: {
            type: 'object',
            properties: schema.properties,
            required: Object.keys(schema.properties),
            additionalProperties: false,
          },
        },
      },
    }),
  });
  if (!res.ok) {
    // Truncated: the provider's error body is diagnostics, and nothing patient-
    // written may end up in the logs (docs/04-security.md).
    throw new Error(`LLM call failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }

  const json = (await res.json()) as CompletionResponse;
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM returned no content');
  // A missing usage block falls back to the cap we asked for, never to zero:
  // an unmetered call must not be a free one as far as the budget is concerned.
  const promptTokens = json.usage?.prompt_tokens ?? estimateTokens(messages);
  const completionTokens = json.usage?.completion_tokens ?? maxTokens;
  return {
    data: JSON.parse(content) as T,
    usage: {
      model,
      promptTokens,
      completionTokens,
      costMicroEur: priceMicroEur(model, promptTokens, completionTokens),
    },
  };
}

/** Only used when the provider omits `usage`. Four characters per token is the
 *  usual French rule of thumb — close enough to keep a budget honest. */
const estimateTokens = (messages: LlmMessage[]): number =>
  Math.ceil(messages.reduce((total, message) => total + message.content.length, 0) / 4);
