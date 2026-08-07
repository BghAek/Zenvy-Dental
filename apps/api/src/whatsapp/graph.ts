import type { WhatsAppTemplate } from './templates';

// Meta Graph API client — the only place the API talks to WhatsApp outbound.
// Frontends never call Meta directly (CLAUDE.md §Hard rules).

const GRAPH_VERSION = 'v21.0';
/** Meta, unless a run points somewhere else — only the E2E suite does, at its
 *  local stub (packages/e2e/meta-stub.mjs), so the outbound leg is exercised
 *  without a WhatsApp number. Unset in every real environment. */
const graphBase = (): string => process.env.META_GRAPH_BASE_URL ?? 'https://graph.facebook.com';

interface SendResponse {
  messages?: { id?: string }[];
}

/** POSTs one message payload and returns Meta's message id, which delivery
 *  receipts later match on.
 *  ponytail: one token in env for the dev test number — swap for the per-clinic
 *  `WhatsAppAccount.accessTokenEnc` (AES-256-GCM, docs/04) when owner-portal
 *  provisioning lands and something actually writes that column. */
async function send(phoneNumberId: string, payload: object): Promise<string> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token || token === 'CHANGE_ME') throw new Error('META_ACCESS_TOKEN is not configured');

  const res = await fetch(`${graphBase()}/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });
  if (!res.ok) {
    // Meta's error body names the reason (expired token, closed window, …) and
    // holds no patient content, so it is safe to surface into the logs.
    throw new Error(`Graph API send failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as SendResponse;
  const id = json.messages?.[0]?.id;
  if (!id) throw new Error('Graph API send returned no message id');
  return id;
}

/** Free-form text — legal only inside the 24h window, checked by the caller. */
export function sendText(phoneNumberId: string, to: string, body: string): Promise<string> {
  return send(phoneNumberId, { to, type: 'text', text: { body, preview_url: false } });
}

/** A pre-approved template — the only thing that may leave outside the 24h
 *  window (S3-2, docs/api/whatsapp-templates.md §Sending one). `params` fills
 *  `{{1}}…{{n}}` positionally, so its order is the catalogue's order. */
export function sendTemplate(
  phoneNumberId: string,
  to: string,
  template: WhatsAppTemplate,
  params: string[],
): Promise<string> {
  return send(phoneNumberId, {
    to,
    type: 'template',
    template: {
      name: template.name,
      language: { code: template.language },
      components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
    },
  });
}
