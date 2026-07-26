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
}

/** False in local dev without a key: the engine then stays silent rather than
 *  handing every thread to a human. */
export function isConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return Boolean(key) && key !== 'CHANGE_ME';
}

export async function complete<T>(
  messages: LlmMessage[],
  schema: LlmSchema,
  maxTokens: number,
): Promise<T> {
  if (!isConfigured()) throw new Error('OPENAI_API_KEY is not configured');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
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
  return JSON.parse(content) as T;
}
