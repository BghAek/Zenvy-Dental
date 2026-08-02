# Meta / WhatsApp Setup (S0-9)

Founder + Claude pairing guide: create the Meta dev app, get the WhatsApp test
number, and point its webhook at our API so a test message lands in the
database. Business verification and real numbers come post-LLC (decision D7,
docs/12). S2-2 added the ingest path itself — fast-200 + BullMQ, tenant
routing, persistence — documented in `docs/api/conversations.md`.

## Endpoint

`https://<host>/api/v1/webhooks/whatsapp` — public (no session), NestJS
`WhatsAppModule`.

- **GET** — Meta verification handshake: echoes `hub.challenge` when
  `hub.mode=subscribe` and `hub.verify_token` matches `META_VERIFY_TOKEN`;
  403 otherwise.
- **POST** — event notifications: `X-Hub-Signature-256` (HMAC-SHA256 of the
  raw body with `META_APP_SECRET`) is verified before any payload use
  (docs/04 §Platform hardening); valid events are enqueued on the
  `whatsapp-inbound` BullMQ queue and answered `200` with no DB work on the
  request path, invalid signatures get `403`. Payloads are never logged — they
  carry patient messages.

## Environment variables (repo-root `.env`)

| Variable | Where it comes from |
|---|---|
| `META_VERIFY_TOKEN` | Self-chosen (`openssl rand -hex 16`); entered verbatim in the Meta webhook config. |
| `META_APP_SECRET` | App Dashboard → App settings → Basic → App secret. |
| `META_ACCESS_TOKEN` | WhatsApp → API Setup → temporary access token (24h in dev mode). Outbound sends only. |
| `META_WABA_ID` | WhatsApp → API Setup → WhatsApp Business Account ID. Only the S3-1 template registration script reads it (`docs/api/whatsapp-templates.md`). |
| `REDIS_URL` | The compose `redis` service — the inbound worker runs inside the API process and needs it. |

Per-clinic tokens (`WhatsAppAccount.accessTokenEnc`, encrypted at rest) replace
`META_ACCESS_TOKEN` when the owner portal can provision numbers; until then the
one dev test number uses the env value.

## Founder steps (Meta console)

1. **Create the dev app**: [developers.facebook.com](https://developers.facebook.com)
   → My Apps → Create app → use case "Other" → type **Business** → name it
   (e.g. `ZenvyDental Dev`). No business verification needed for a dev app.
2. **Add WhatsApp**: in the app dashboard, add the **WhatsApp** product. Meta
   provisions a free **test number** automatically (WhatsApp → API Setup).
3. **Allow your phone**: API Setup → "To" → add your personal WhatsApp number
   as a recipient (test numbers may message up to 5 verified recipients).
4. **Collect secrets**: App settings → Basic → copy the **App secret** into
   `META_APP_SECRET`. Generate `META_VERIFY_TOKEN` yourself and put both in
   the repo-root `.env`.

## Wiring the webhook (pairing session)

1. Start the API: `pnpm --filter @zenvy/api start:dev` (port 3001).
2. Expose it publicly — Meta requires HTTPS. Quick tunnel, no account needed:

   ```bash
   cloudflared tunnel --url http://localhost:3001
   ```

   (Any tunnel works — ngrok, localtunnel. In production nginx already
   proxies `api.zenvydental.fr` → the API.)
3. In the app dashboard: WhatsApp → Configuration → Webhook → **Edit**:
   - Callback URL: `https://<tunnel-host>/api/v1/webhooks/whatsapp`
   - Verify token: the value of `META_VERIFY_TOKEN`
   - Save — Meta fires the GET handshake; the API log shows
     `Webhook verification handshake succeeded`.
4. Still in Configuration → Webhook fields: **Subscribe** to `messages`.
5. Route the number to a clinic (S2-2) — without a `WhatsAppAccount` row the
   worker has no tenant and drops the event with an `ErrorLog` warning. No
   endpoint provisions numbers yet (owner-portal onboarding, S4), so add the
   row by hand in `pnpm --filter @zenvy/api prisma studio` → `WhatsAppAccount`:

   | Field | Value |
   |---|---|
   | `clinicId` | your test clinic's id |
   | `phoneNumberId` | WhatsApp → API Setup → **Phone number ID** (not the number) |
   | `wabaId` | API Setup → WhatsApp Business Account ID |
   | `displayNumber` | the test number in E.164, e.g. `+15551797781` |

6. Start Redis (`docker compose up redis`) so the inbound worker has a queue.
7. From your phone, send any WhatsApp message to the test number. The API logs
   the routing only; the message itself lands in Postgres — one `Conversation`
   row, one `Message` row, and a `Patient` created from your number. That row
   is the S2-2 deliverable.

## Verifying locally without Meta

Simulate a signed event against a running API:

```bash
BODY='{"object":"whatsapp_business_account","entry":[]}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$META_APP_SECRET" -hex | sed 's/^.* /sha256=/')
curl -i -X POST http://localhost:3001/api/v1/webhooks/whatsapp \
  -H "Content-Type: application/json" -H "X-Hub-Signature-256: $SIG" -d "$BODY"
```

`200` and an empty queue (the envelope carries no `changes`); tamper with
`$BODY` after signing and you get `403`. For a full round trip, replace the
body with a real `entry[].changes[]` payload carrying your `phone_number_id`
— it flows through the queue into the database. Automated coverage:
`apps/api/test/whatsapp-webhook.spec.ts` (signature + enqueue) and
`whatsapp-inbound.spec.ts` (worker persistence).

## Known limits (fine for v1 dev)

- Test number: 5 recipients max, template-free replies only inside the 24h
  customer-service window.
- Meta retries failed deliveries for up to 36h — deduped on `waMessageId`.
- Dev access tokens expire after 24h; outbound sends fail until refreshed.
- App secret or verify token rotation = update `.env` and restart the API.
