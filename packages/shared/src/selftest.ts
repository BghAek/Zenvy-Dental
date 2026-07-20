// Zero-dependency runnable check: `pnpm --filter @zenvy/shared test`.
// Fails (nonzero exit) if any schema or the client's parsing logic breaks.
import { z } from 'zod';
import {
  ApiError,
  ERROR_CODES,
  createApiClient,
  createClinicRequestSchema,
  createPatientRequestSchema,
  listPatientsQuerySchema,
  meResponseSchema,
  normalizePhone,
  paginated,
  paginationQuerySchema,
  phoneE164Schema,
  phoneInputSchema,
  roleSchema,
  updatePatientRequestSchema,
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
  check(paginationQuerySchema.parse({ limit: '' }).limit === 20, 'empty limit param → default');
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

  globalThis.fetch = async () => new Response('', { status: 200 });
  const emptyBody = await client.get('/patients', z.object({})).then(
    () => undefined,
    (err: unknown) => err,
  );
  check(
    emptyBody instanceof ApiError && emptyBody.status === 200,
    '2xx non-JSON body still becomes ApiError',
  );

  globalThis.fetch = async () => new Response(null, { status: 204 });
  check(
    (await client.delete('/patients/p1', z.void())) === undefined,
    '204 passes a void schema',
  );
  const surprise204 = await client.delete('/patients/p1', z.object({ id: z.string() })).then(
    () => undefined,
    (err: unknown) => err,
  );
  check(surprise204 instanceof z.ZodError, '204 against a data schema fails loudly');

  globalThis.fetch = async () => new Response(JSON.stringify({ id: 'p1', extra: 1 }), { status: 200 });
  const patient = await client.get('/patients/p1', z.object({ id: z.string() }));
  check(patient.id === 'p1', 'success body parsed by schema');

  // S1-1 contracts: phone normalization, auth/clinic, patients.
  check(normalizePhone('06 12 34 56 78') === '+33612345678', 'FR national normalized');
  check(normalizePhone('0033.6-12(34)56 78') === '+33612345678', '00-prefix + separators normalized');
  check(phoneInputSchema.parse('+33 6 12 34 56 78') === '+33612345678', 'E.164 input kept');
  check(!phoneInputSchema.safeParse('abc').success, 'non-numeric phone rejected');

  const clinicReq = createClinicRequestSchema.parse({ name: '  Cabinet Lumière ' });
  check(clinicReq.name === 'Cabinet Lumière' && clinicReq.timezone === 'Europe/Paris', 'clinic defaults + trim');
  check(!createClinicRequestSchema.safeParse({ name: 'X', timezone: 'Mars/Olympus' }).success, 'bad timezone rejected');
  const blankClinic = createClinicRequestSchema.parse({ name: 'X', phone: '', address: '', timezone: '' });
  check(
    blankClinic.phone === undefined && blankClinic.address === undefined && blankClinic.timezone === 'Europe/Paris',
    'blank optional clinic fields count as unset',
  );
  check(createClinicRequestSchema.parse({ name: 'X', timezone: 'europe/paris' }).timezone === 'Europe/Paris', 'timezone canonicalized');

  check(
    meResponseSchema.safeParse({
      user: {
        id: 'u1',
        email: 'a@b.fr',
        name: 'A',
        emailVerified: true,
        role: 'CLINIC_OWNER',
        clinicId: null,
      },
      clinic: null,
      subscription: null,
    }).success,
    'me response with no clinic yet',
  );

  const newPatient = createPatientRequestSchema.parse({
    firstName: 'Marie',
    lastName: 'Curie',
    phone: '06 12 34 56 78',
  });
  check(newPatient.phone === '+33612345678' && newPatient.tags.length === 0, 'patient create: phone normalized, tags default');
  check(!createPatientRequestSchema.safeParse({ firstName: '', lastName: 'X', phone: '0612345678' }).success, 'empty first name rejected');
  check(updatePatientRequestSchema.safeParse({}).success, 'empty patch allowed');
  check(updatePatientRequestSchema.parse({ notes: null }).notes === null, 'notes clearable with null');
  check(listPatientsQuerySchema.parse({ search: ' Marie ' }).search === 'Marie', 'search trimmed');
  check(listPatientsQuerySchema.parse({ search: '', tag: '' }).search === undefined, 'cleared search box = unset');
  check(ERROR_CODES.PATIENT_NOT_FOUND === 404 && ERROR_CODES.INVITE_INVALID === 400, 'S1-1 error codes mapped');

  console.log('selftest: all checks passed');
}

// node runs this with default unhandled-rejection semantics, but don't rely on
// them for the exit code — a failed check must always exit nonzero.
declare const process: { exitCode?: number };
main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
