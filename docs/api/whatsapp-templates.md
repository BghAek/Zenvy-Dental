# WhatsApp Template Catalogue (S3-1)

Meta only lets us send free-form WhatsApp text inside the **24h
customer-service window** — the day after a patient's last inbound message
(`docs/05-ai-policy.md` §24h rule). Reminders and follow-ups fire when that
window is shut, so each one has to be a **pre-approved template**: a fixed
French body registered with Meta ahead of time, filled with variables at send
time.

This page is the catalogue. The code that owns it is
[templates.ts](../../apps/api/src/whatsapp/templates.ts) — the file is the
single source of truth, this page explains it. Three consumers:

| Consumer | Uses |
|---|---|
| `register-templates.ts` (S3-1) | posts the bodies + examples to Meta for review |
| `appointments/reminders.ts` (S2-4) | stamps `ScheduledMessage.templateName` |
| the BullMQ sender (S3-2) | fills the variables and calls the Graph API |

## The catalogue

All three are `UTILITY`, language `fr`. They follow an appointment the patient
booked, which is what keeps them out of the `MARKETING` category — marketing
templates need separate opt-in and carry a higher per-message price.

| Template | Kind | Fired when | Variables |
|---|---|---|---|
| `reminder_24h_fr` | `REMINDER_24H` | `startsAt − 24h`, status `SCHEDULED`/`CONFIRMED` | prénom, date, heure, cabinet |
| `reminder_2h_fr` | `REMINDER_2H` | `startsAt − 2h`, same statuses | prénom, heure, cabinet |
| `followup_fr` | `FOLLOWUP` | `startsAt + 24h`, status `DONE` (J+1) | prénom, cabinet |

Scheduling rules — including opt-out and past-`sendAt` handling — are in
[appointments.md](appointments.md) §Reminder lifecycle. `ScheduledMessageKind`
also has `CUSTOM`, which has no template: it is the staff-authored escape hatch
and stays out of the catalogue.

### `reminder_24h_fr`

```
Bonjour {{1}}, nous vous rappelons votre rendez-vous le {{2}} à {{3}}. Pour confirmer, modifier ou annuler, répondez simplement à ce message. À bientôt, {{4}}.
```

| # | Holds | Example |
|---|---|---|
| 1 | prénom du patient | `Marie` |
| 2 | date du rendez-vous | `mardi 4 août` |
| 3 | heure du rendez-vous | `14h30` |
| 4 | nom du cabinet | `Cabinet Dentaire Lumière` |

The date is spelled out rather than relative (« demain ») so a job that runs
late still reads correctly.

### `reminder_2h_fr`

```
Bonjour {{1}}, votre rendez-vous a lieu aujourd'hui à {{2}}. En cas d'imprévu, répondez simplement à ce message. À tout à l'heure, {{3}}.
```

| # | Holds | Example |
|---|---|---|
| 1 | prénom du patient | `Marie` |
| 2 | heure du rendez-vous | `14h30` |
| 3 | nom du cabinet | `Cabinet Dentaire Lumière` |

### `followup_fr`

```
Bonjour {{1}}, nous espérons que tout va bien depuis votre visite. Si vous avez une question ou une gêne, répondez simplement à ce message : notre équipe vous répondra. Bonne journée, {{2}}.
```

| # | Holds | Example |
|---|---|---|
| 1 | prénom du patient | `Marie` |
| 2 | nom du cabinet | `Cabinet Dentaire Lumière` |

No medical claim, no advice, no diagnosis question — the follow-up invites a
reply and nothing more (`docs/05-ai-policy.md`).

## No quick-reply buttons (D22)

Every template ends by asking the patient to **reply in writing**, rather than
offering « Confirmer » / « Annuler » buttons. The reply opens the 24h window and
lands in the normal AI engine flow, which already understands « oui je confirme »
and « je dois annuler » — so the feature costs nothing to support. Buttons would
need `type: button` payload handling in the inbound worker, a branch in the
engine, and automatic status flips; they are a later template version, not a v1
requirement.

## Registering them with Meta

Templates live on a **WhatsApp Business Account**, not on a phone number, and
have to be registered once per WABA — the dev test number today, each clinic's
own account when owner-portal provisioning lands.

```bash
# repo-root .env — both from the Meta app dashboard (docs/api/meta-setup.md)
META_ACCESS_TOKEN=...   # WhatsApp → API Setup → temporary access token
META_WABA_ID=...        # WhatsApp → API Setup → WhatsApp Business Account ID

pnpm --filter @zenvy/api templates:register
```

The script `POST`s each entry to
`https://graph.facebook.com/v21.0/{WABA_ID}/message_templates` and then prints
the account's own view of all three:

```
reminder_24h_fr: submitted
reminder_2h_fr: submitted
followup_fr: submitted

Status on the account:
  reminder_24h_fr    APPROVED  UTILITY
  reminder_2h_fr     PENDING   UTILITY
  followup_fr        PENDING   UTILITY

PENDING is normal for minutes after submission — re-run to re-check.
```

It exits non-zero until **all three read `APPROVED`**, so a half-registered
account cannot be mistaken for a finished one. Re-running is safe: a name Meta
already knows fails its `POST` with « template name already exists », which the
listing then confirms as registered. Review is usually minutes and can take up
to 24h.

The submission sends `allow_category_change: true` — Meta prefers
re-categorising a borderline template over rejecting it, and the printed
category is what it actually landed as. A template that comes back `MARKETING`
is a problem worth fixing (opt-in rules, price), not a cosmetic difference.

**A registered template's body is immutable.** Changing the French copy means
registering a new name and switching `templates.ts` over to it; editing the
string alone changes nothing about what Meta sends. `REJECTED` templates are
deleted in the Meta Template Manager and resubmitted with fixed copy.

## Sending one (S3-2)

`apps/api/src/whatsapp/outbound.processor.ts` builds this payload and
`graph.ts` `sendTemplate()` posts it. When each row fires, and everything that
stops it, is `docs/api/appointments.md` §Sending:

```json
{
  "messaging_product": "whatsapp",
  "to": "+33600000000",
  "type": "template",
  "template": {
    "name": "reminder_24h_fr",
    "language": { "code": "fr" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "Marie" },
          { "type": "text", "text": "mardi 4 août" },
          { "type": "text", "text": "14h30" },
          { "type": "text", "text": "Cabinet Dentaire Lumière" }
        ]
      }
    ]
  }
}
```

Parameters are positional: `{{n}}` is filled by the nth entry, in the order
this page and `templates.ts` list them. A count mismatch is a send-time error
from Meta, so
[whatsapp-templates.spec.ts](../../apps/api/test/whatsapp-templates.spec.ts)
holds body and parameter list to the same length, and the sender refuses to
call Meta when the two disagree.

Values are rendered at send time in the clinic's timezone with `Intl` in
`fr-FR` — « mardi 4 août », « 14h30 » — not stored on the row when it is
scheduled: a name, a clinic or an appointment time can move in the days
between (`ScheduledMessage.params` therefore stays null in v1).

Both rules the sender owed are in place: `Patient.optOut` is re-checked
immediately before every send and cancels the row instead of firing, and the
filled body is stored on the patient's conversation, so their reply opens the
24h window and continues under the AI engine.

## Limits worth knowing

- **Test number**: 5 verified recipients maximum; templates register and send
  normally within that list (`docs/api/meta-setup.md` §Known limits).
- **Dev access tokens expire after 24h** — registration fails with an auth error
  until refreshed.
- **Per-message billing** at the template's category rate; another reason
  `UTILITY` matters.
- **Quality rating**: templates that get blocked or reported by patients are
  throttled or paused by Meta. Opt-out (« STOP ») is honoured absolutely
  (`docs/05-ai-policy.md`) — it is the main defence of that rating.
