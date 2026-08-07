import { createHmac } from 'node:crypto';
import { API_BASE_PATH } from '@zenvy/shared';
import { API_URL, DEMO_PHONE_NUMBER_ID, META_APP_SECRET } from './env';

// Meta's side of the conversation. The suite posts the same envelope Meta
// posts, signed with the same HMAC the webhook verifies (S2-2,
// docs/api/conversations.md §Webhook internals) — no test-only entry point.

interface InboundMessage {
  /** wa_id: international digits, no leading "+". */
  from: string;
  /** WhatsApp profile name — what the thread shows until a patient is linked. */
  name: string;
  text: string;
}

export async function receiveWhatsAppMessage(message: InboundMessage): Promise<void> {
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '266000000000001',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '33145887766',
                phone_number_id: DEMO_PHONE_NUMBER_ID,
              },
              contacts: [{ profile: { name: message.name }, wa_id: message.from }],
              messages: [
                {
                  from: message.from,
                  id: `wamid.e2e-${Date.now()}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: message.text },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  const response = await fetch(`${API_URL}${API_BASE_PATH}/webhooks/whatsapp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': `sha256=${createHmac('sha256', META_APP_SECRET).update(body).digest('hex')}`,
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`The webhook rejected the message (${response.status})`);
  }
}
