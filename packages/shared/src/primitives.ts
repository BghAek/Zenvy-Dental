import { z } from 'zod';

// E.164: "+" then 2–15 digits, no leading zero. Covers FR mobiles (+336/+337) and any
// international patient number. Error messages are French — they can surface in the UI.
export const phoneE164Schema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'Numéro de téléphone invalide (format international, ex. +33612345678).');

// Blank form/query fields arrive as '' (or whitespace), not undefined — treat
// them as unset before optional/default logic runs.
export const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

// Required trimmed text with French messages — the common short-field shape.
// The `error` covers a missing/non-string value (Zod's invalid_type would
// otherwise be English); min(1) covers the empty/blank case after trim.
export const requiredText = (max: number, requiredMessage = 'Champ requis.') =>
  z.string({ error: requiredMessage }).trim().min(1, requiredMessage).max(max, `${max} caractères maximum.`);

// Human phone input → E.164: strip separators, "00…" → "+…", French national
// "0…" → "+33…". Other countries must already carry their "+<code>" prefix.
// ponytail: FR-only default (+33); clinic-locale-aware normalization if non-FR clinics land.
export function normalizePhone(input: string): string {
  const cleaned = input.trim().replace(/[\s.\-() ]/g, '');
  if (cleaned.startsWith('00')) return `+${cleaned.slice(2)}`;
  if (/^0\d/.test(cleaned)) return `+33${cleaned.slice(1)}`;
  return cleaned;
}

// Boundary schema for user-typed phone fields: normalize, then enforce E.164.
export const phoneInputSchema = z.string().transform(normalizePhone).pipe(phoneE164Schema);

// API responses serialize dates as ISO-8601 UTC strings (docs/02-database.md).
export const isoDateTimeSchema = z.iso.datetime();

// Cursor pagination (docs/03-api-conventions.md): ?cursor=<id>&limit=<n≤100>.
export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  // '' (a bare `?limit=`) counts as unset — coercion would turn it into 0.
  limit: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(100).default(20)),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// Paginated list envelope: { items, nextCursor } — nextCursor null on the last page.
export const paginated = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });

export type Paginated<T> = { items: T[]; nextCursor: string | null };
