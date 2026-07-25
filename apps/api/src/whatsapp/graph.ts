// Meta Graph API client — the only place the API talks to WhatsApp outbound.
// Frontends never call Meta directly (CLAUDE.md §Hard rules).

const GRAPH_VERSION = 'v21.0';

interface SendResponse {
  messages?: { id?: string }[];
}

/** Sends a free-form text (24h window checked by the caller) and returns Meta's
 *  message id, which delivery receipts later match on.
 *  ponytail: one token in env for the dev test number — swap for the per-clinic
 *  `WhatsAppAccount.accessTokenEnc` (AES-256-GCM, docs/04) when owner-portal
 *  provisioning lands and something actually writes that column. */
export async function sendText(phoneNumberId: string, to: string, body: string): Promise<string> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token || token === 'CHANGE_ME') throw new Error('META_ACCESS_TOKEN is not configured');

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body, preview_url: false },
    }),
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
