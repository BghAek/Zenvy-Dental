import type { ScheduledMessageKind } from '../generated/prisma/enums';

// The WhatsApp template catalogue (S3-1, docs/api/whatsapp-templates.md).
// Outside Meta's 24h customer-service window only pre-approved bodies may leave
// the platform, so this file is the single source of truth: `register-templates`
// posts it to Meta, `appointments/reminders.ts` stamps the names onto
// ScheduledMessage rows, and the S3-2 sender fills the variables in order.
// Editing a body here does NOT change what Meta sends — a registered template is
// immutable in content; edit, re-register under a new name, then switch over.

export interface WhatsAppTemplate {
  /** Meta template name — lowercase letters, digits and underscores only. */
  name: string;
  /** UTILITY: each of these follows an appointment the patient booked. */
  category: 'UTILITY';
  language: 'fr';
  /** Body with positional placeholders; `{{n}}` is filled from `params[n - 1]`. */
  body: string;
  /** One entry per placeholder, in order: what it holds + Meta's review sample. */
  params: { label: string; example: string }[];
}

const CLINIC = { label: 'nom du cabinet', example: 'Cabinet Dentaire Lumière' };
const FIRST_NAME = { label: 'prénom du patient', example: 'Marie' };

/** CUSTOM has no template — it is the staff-authored escape hatch (S3-2). */
export const TEMPLATES: Partial<Record<ScheduledMessageKind, WhatsAppTemplate>> = {
  REMINDER_24H: {
    name: 'reminder_24h_fr',
    category: 'UTILITY',
    language: 'fr',
    body:
      'Bonjour {{1}}, nous vous rappelons votre rendez-vous le {{2}} à {{3}}. ' +
      'Pour confirmer, modifier ou annuler, répondez simplement à ce message. À bientôt, {{4}}.',
    params: [
      FIRST_NAME,
      { label: 'date du rendez-vous', example: 'mardi 4 août' },
      { label: 'heure du rendez-vous', example: '14h30' },
      CLINIC,
    ],
  },
  REMINDER_2H: {
    name: 'reminder_2h_fr',
    category: 'UTILITY',
    language: 'fr',
    body:
      "Bonjour {{1}}, votre rendez-vous a lieu aujourd'hui à {{2}}. " +
      "En cas d'imprévu, répondez simplement à ce message. À tout à l'heure, {{3}}.",
    params: [FIRST_NAME, { label: 'heure du rendez-vous', example: '14h30' }, CLINIC],
  },
  FOLLOWUP: {
    name: 'followup_fr',
    category: 'UTILITY',
    language: 'fr',
    body:
      'Bonjour {{1}}, nous espérons que tout va bien depuis votre visite. ' +
      'Si vous avez une question ou une gêne, répondez simplement à ce message : ' +
      'notre équipe vous répondra. Bonne journée, {{2}}.',
    params: [FIRST_NAME, CLINIC],
  },
};
