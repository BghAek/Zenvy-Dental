// Zero-dependency runnable check: `pnpm --filter @zenvy/shared test`.
// Fails (nonzero exit) if any schema or the client's parsing logic breaks.
import { z } from 'zod';
import {
  ApiError,
  ERROR_CODES,
  createApiClient,
  paginated,
  paginationQuerySchema,
  phoneE164Schema,
  roleSchema,
} from './index';

function check(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`selftest failed: ${label}`);
}

async function main() {
  check(phoneE164Schema.safeParse('+33612345678').success, 'valid FR mobile accepted');
  check(!phoneE164Schema.safeParse('0612345678').success, 'national format rejected');
  check(!phoneE164Schema.safeParse('+0123456').success, 'leading zero rejected');
  check(!phoneE164Schema.safeParse('+3361234567890123').success, 'over 15 digits rejected');

  const defaults = paginationQuerySchema.parse({});
  check(defaults.limit === 20 && defaults.cursor === undefined, 'pagination defaults');
  check(paginationQuerySchema.parse({ limit: '50', cursor: 'abc' }).limit === 50, 'limit coerced');
  check(!paginationQuerySchema.safeParse({ limit: 101 }).success, 'limit capped at 100');

  const page = paginated(z.object({ id: z.string() }));
  check(page.safeParse({ items: [{ id: 'a' }], nextCursor: null }).success, 'paginated envelope');

  check(roleSchema.safeParse('CLINIC_OWNER').success, 'known enum value accepted');
  check(!roleSchema.safeParse('ADMIN').success, 'unknown enum value rejected');
  check(ERROR_CODES.NOT_FOUND === 404, 'error code status map');

  const client = createApiClient('http://api.test');
  let lastUrl = '';

  globalThis.fetch = async (input) => {
    lastUrl = String(input);
    return new Response(
      JSON.stringify({
        error: { code: 'NOT_FOUND', message: 'Introuvable.', correlationId: 'req_1' },
      }),
      { status: 404 },
    );
  };
  const failure = await client.get('/patients/x', z.object({}), { limit: 20 }).then(
    () => undefined,
    (err: unknown) => err,
  );
  check(lastUrl === 'http://api.test/api/v1/patients/x?limit=20', 'url + query building');
  check(failure instanceof ApiError, 'error envelope rethrown as ApiError');
  check(
    failure.status === 404 && failure.code === 'NOT_FOUND' && failure.correlationId === 'req_1',
    'ApiError fields mapped from envelope',
  );

  globalThis.fetch = async () => new Response('<html>bad gateway</html>', { status: 502 });
  const proxyFailure = await client.get('/patients', z.object({})).then(
    () => undefined,
    (err: unknown) => err,
  );
  check(
    proxyFailure instanceof ApiError && proxyFailure.status === 502,
    'non-envelope failure still becomes ApiError',
  );

  globalThis.fetch = async () => new Response(JSON.stringify({ id: 'p1', extra: 1 }), { status: 200 });
  const patient = await client.get('/patients/p1', z.object({ id: z.string() }));
  check(patient.id === 'p1', 'success body parsed by schema');

  console.log('selftest: all checks passed');
}

void main();
