# Meta / WhatsApp Setup (S0-9)

Founder + Claude pairing guide: create the Meta dev app, get the WhatsApp test
number, and point its webhook at our API so a test message lands in the API
logs. Business verification and real numbers come post-LLC (decision D7,
docs/12). The webhook only logs events in S0-9 — persistence, fast-200 +
BullMQ ingest, and tenant routing are S2-2.

## Endpoint

`https://<host>/api/v1/webhooks/whatsapp` — public (no session), NestJS
`WhatsAppModule`.

- **GET** — Meta verification handshake: echoes `hub.challenge` when
  `hub.mode=subscribe` and `hub.verify_token` matches `META_VERIFY_TOKEN`;
  403 otherwise.
- **POST** — event notifications: `X-Hub-Signature-256` (HMAC-SHA256 of the
  raw body with `META_APP_SECRET`) is verified before any payload use
  (docs/04 §Platform hardening); valid events are logged and answered `200`,
  invalid signatures get `403`.

## Environment variables (repo-root `.env`)

| Variable | Where it comes from |
|---|---|
| `META_VERIFY_TOKEN` | Self-chosen (`openssl rand -hex 16`); entered verbatim in the Meta webhook config. |
| `META_APP_SECRET` | App Dashboard → App settings → Basic → App secret. |

S2 adds the Graph API access token and `phone_number_id` for outbound sends;
they are not needed to receive webhooks and are not in `.env` yet.

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
5. From your phone, send any WhatsApp message to the test number. The API log
   shows `Webhook event received: {...}` with the message payload — that log
   line is the S0-9 deliverable.

## Verifying locally without Meta

Simulate a signed event against a running API:

```bash
BODY='{"object":"whatsapp_business_account","entry":[]}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$META_APP_SECRET" -hex | sed 's/^.* /sha256=/')
curl -i -X POST http://localhost:3001/api/v1/webhooks/whatsapp \
  -H "Content-Type: application/json" -H "X-Hub-Signature-256: $SIG" -d "$BODY"
```

`200` with the payload logged; tamper with `$BODY` after signing and you get
`403`. Automated coverage: `apps/api/test/whatsapp-webhook.spec.ts`.

## Known limits (fine for v1 dev)

- Test number: 5 recipients max, template-free replies only inside the 24h
  customer-service window.
- Meta retries failed deliveries for up to 36h — dedup by message id lands
  with S2-2 persistence.
- App secret or verify token rotation = update `.env` and restart the API.
