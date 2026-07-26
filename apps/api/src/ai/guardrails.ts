import { MAX_REPLY_CHARS } from './prompt';

// Deterministic safety net around the model (docs/05-ai-policy.md): the prompt
// asks, this enforces. The prompt can be talked out of a rule; a regex cannot.
// Every check runs on the generated reply BEFORE it reaches the patient.

/** Lowercase + strip diacritics, so « Fièvre » and « fievre » hit one rule. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

// Keyword fast path for the emergency classifier: an obvious phrasing escalates
// without spending an LLM call. The list is deliberately generous — a false
// positive costs one human glance, a false negative costs a patient (R6).
export const EMERGENCY_KEYWORDS = [
  'douleur intense',
  'douleur insupportable',
  'insupportable',
  'tres mal',
  'super mal',
  'mal atroce',
  'je souffre',
  'ca me lance',
  'saigne',
  'saignement',
  'hemorragie',
  'gonfle',
  'gonflement',
  'enfle',
  'abces',
  'infection',
  'fievre',
  'dent cassee',
  'dent arrachee',
  'dent tombee',
  'traumatisme',
  'accident',
  'urgence',
  'urgent',
];

export function emergencyKeywordHit(text: string): boolean {
  const normalized = normalize(text);
  return EMERGENCY_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export type GuardrailFailure = 'TOO_LONG' | 'NOT_FRENCH' | 'MEDICAL_ADVICE' | 'INVENTED_FACT';

// High-confidence medical-advice signals only. Broad diagnosis phrasing is left
// to the prompt's handoff rule on purpose: « vous avez rendez-vous mardi » is a
// perfectly good reply, and a guardrail that blocks it is a product bug.
const MEDICAL_PATTERNS: RegExp[] = [
  /\d+\s?(mg|ml|g)\b/,
  /\b(paracetamol|doliprane|ibuprofene|advil|nurofen|amoxicilline|antibiotique|antalgique|anti-?inflammatoire|bain de bouche)\b/,
  /\bprenez\s+(du |de la |des |un |une |deux |trois |\d)/,
  /\b(rincez|appliquez|massez|desinfectez)\b/,
  // Same sentence, short gap: catches « vous avez (probablement) une carie »
  // without touching « vous avez rendez-vous mardi ».
  /\bvous (avez|souffrez d)\b[^.!?]{0,30}\b(carie|infection|abces|gingivite|parodontite|inflammation|kyste|necrose)/,
  /\bc est (probablement|surement|certainement) (une?|de l)\b/,
];

// Non-Latin script in a French reply means the model was steered off-policy.
const NON_LATIN =
  /[\p{Script=Han}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Greek}\p{Script=Thai}\p{Script=Devanagari}]/u;
const FRENCH_TOKENS =
  /\b(le|la|les|un|une|des|du|de|et|vous|votre|nous|pour|avec|est|sont|au|aux|je|ce|cette|dans|sur|pas|plus|bonjour|merci|cabinet)\b/;
/** Below this, a reply is too short for the stopword check to mean anything. */
const LANGUAGE_CHECK_MIN_CHARS = 40;

const MONEY = /(\d+(?:[.,]\d+)?)\s*(?:€|eur\b|euros?\b)/g;
const NUMBER = /\d+(?:[.,]\d+)?/g;
// Long digit runs only: « appelez le 15 » must not read as a phone number.
const PHONE = /\+\d[\d ().-]{7,}|\b0\d(?:[ .-]?\d{2}){4}\b/g;

const amount = (text: string): string => text.replace(/[.,]/g, '');
/** +33 1 23 45 67 89 and 01 23 45 67 89 are the same number — compare the
 *  national part so a reformatted clinic number is not read as invented. */
const nationalDigits = (text: string): string =>
  text.replace(/\D/g, '').replace(/^(?:0033|33|0)/, '');

export interface ReplyFacts {
  /** The clinic's configured facts, as rendered into the prompt. */
  configText: string;
  clinicPhone: string | null;
}

/**
 * Returns the first rule the reply breaks, or null when it may be sent.
 * A failure is never repaired — the engine hands the thread to a human.
 */
export function checkReply(reply: string, facts: ReplyFacts): GuardrailFailure | null {
  const trimmed = reply.trim();
  if (trimmed.length > MAX_REPLY_CHARS) return 'TOO_LONG';

  if (NON_LATIN.test(trimmed)) return 'NOT_FRENCH';
  const normalized = normalize(trimmed);
  if (trimmed.length >= LANGUAGE_CHECK_MIN_CHARS && !FRENCH_TOKENS.test(normalized)) {
    return 'NOT_FRENCH';
  }

  if (MEDICAL_PATTERNS.some((pattern) => pattern.test(normalized))) return 'MEDICAL_ADVICE';

  // Prices and phone numbers are the two facts the model is most tempted to
  // invent, and the two a patient acts on. Both must come from the clinic.
  // Any figure the clinic wrote counts as stated — it configures prices as free
  // text (« Détartrage : 50 » as often as « 50 € »). What this catches is the
  // amount that appears nowhere in the configuration at all.
  const stated = [...normalize(facts.configText).matchAll(NUMBER)].map((match) => amount(match[0]));
  for (const match of trimmed.matchAll(MONEY)) {
    if (!stated.includes(amount(match[1]))) return 'INVENTED_FACT';
  }

  const allowedPhones = [
    ...(facts.clinicPhone ? [nationalDigits(facts.clinicPhone)] : []),
    ...[...facts.configText.matchAll(PHONE)].map((match) => nationalDigits(match[0])),
  ];
  for (const match of trimmed.matchAll(PHONE)) {
    if (!allowedPhones.includes(nationalDigits(match[0]))) return 'INVENTED_FACT';
  }

  return null;
}
