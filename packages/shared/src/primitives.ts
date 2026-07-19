import { z } from 'zod';

// E.164: "+" then 2–15 digits, no leading zero. Covers FR mobiles (+336/+337) and any
// international patient number. Error messages are French — they can surface in the UI.
export const phoneE164Schema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'Numéro de téléphone invalide (format international, ex. +33612345678).');

// Cursor pagination (docs/03-api-conventions.md): ?cursor=<id>&limit=<n≤100>.
export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  // '' (a bare `?limit=`) counts as unset — coercion would turn it into 0.
  limit: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().min(1).max(100).default(20),
  ),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// Paginated list envelope: { items, nextCursor } — nextCursor null on the last page.
export const paginated = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });

export type Paginated<T> = { items: T[]; nextCursor: string | null };
