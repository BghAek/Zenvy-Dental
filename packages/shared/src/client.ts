import { z } from 'zod';
import { ApiError, errorResponseSchema } from './errors';

export const API_BASE_PATH = '/api/v1';

type Query = Record<string, string | number | boolean | undefined>;

// Thin typed fetch wrapper (docs/03-api-conventions.md §Frontend data layer).
// Session cookie auth, JSON only, responses validated by the caller's Zod schema,
// API errors rethrown as ApiError from the standard envelope.
export function createApiClient(baseUrl = '') {
  async function request<S extends z.ZodType>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    schema: S,
    opts: { body?: unknown; query?: Query } = {},
  ): Promise<z.infer<S>> {
    let url = `${baseUrl}${API_BASE_PATH}${path}`;
    if (opts.query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(opts.query)) {
        if (value !== undefined) params.set(key, String(value));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const res = await fetch(url, {
      method,
      credentials: 'include',
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    if (!res.ok) {
      const parsed = errorResponseSchema.safeParse(await res.json().catch(() => undefined));
      if (parsed.success) {
        const { code, message, correlationId } = parsed.data.error;
        throw new ApiError(res.status, code, message, correlationId);
      }
      // Non-envelope failure (proxy error page, network hiccup mid-body…).
      throw new ApiError(res.status, 'INTERNAL_ERROR', 'Une erreur est survenue. Veuillez réessayer.');
    }

    if (res.status === 204) return undefined as z.infer<S>;
    return schema.parse(await res.json()) as z.infer<S>;
  }

  return {
    get: <S extends z.ZodType>(path: string, schema: S, query?: Query) =>
      request('GET', path, schema, { query }),
    post: <S extends z.ZodType>(path: string, schema: S, body?: unknown) =>
      request('POST', path, schema, { body }),
    patch: <S extends z.ZodType>(path: string, schema: S, body?: unknown) =>
      request('PATCH', path, schema, { body }),
    delete: <S extends z.ZodType>(path: string, schema: S) => request('DELETE', path, schema),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
