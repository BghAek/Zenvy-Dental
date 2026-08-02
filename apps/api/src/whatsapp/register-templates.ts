import '../env';
import { TEMPLATES, type WhatsAppTemplate } from './templates';

// S3-1: submits the catalogue to one WhatsApp Business Account and prints where
// each template stands in Meta's review. Run once per WABA (dev test number
// today, each clinic's own account when owner-portal provisioning lands):
//
//   pnpm --filter @zenvy/api templates:register
//
// Idempotent by construction: submissions are best-effort and the exit code
// comes from the WABA's own listing afterwards, so re-running with everything
// already registered is a no-op that still reports the statuses.

const GRAPH_VERSION = 'v21.0';

interface GraphError {
  error?: { message?: string };
}
interface TemplateList {
  data?: { name?: string; status?: string; category?: string }[];
}

function payload(t: WhatsAppTemplate) {
  return {
    name: t.name,
    language: t.language,
    category: t.category,
    // Meta re-categorises borderline templates instead of rejecting them; the
    // listing below prints what each one actually landed as.
    allow_category_change: true,
    components: [
      {
        type: 'BODY',
        text: t.body,
        example: { body_text: [t.params.map((p) => p.example)] },
      },
    ],
  };
}

async function main(): Promise<void> {
  const token = process.env.META_ACCESS_TOKEN;
  const wabaId = process.env.META_WABA_ID;
  if (!token || token === 'CHANGE_ME' || !wabaId || wabaId === 'CHANGE_ME') {
    throw new Error('META_ACCESS_TOKEN and META_WABA_ID must be set — see docs/api/meta-setup.md');
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates`;
  const auth = { authorization: `Bearer ${token}` };
  const catalogue = Object.values(TEMPLATES);

  for (const t of catalogue) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify(payload(t)),
    });
    // A duplicate name errors here and that is fine — it means the template is
    // already on the account, which the listing confirms.
    const detail = res.ok ? 'submitted' : ((await res.json()) as GraphError).error?.message;
    console.log(`${t.name}: ${detail}`);
  }

  const res = await fetch(`${url}?fields=name,status,category&limit=200`, { headers: auth });
  if (!res.ok) throw new Error(`Could not list templates (${res.status}): ${await res.text()}`);
  const known = new Map(((await res.json()) as TemplateList).data?.map((t) => [t.name, t]) ?? []);

  console.log('\nStatus on the account:');
  for (const t of catalogue) {
    const found = known.get(t.name);
    console.log(`  ${t.name.padEnd(18)} ${found?.status ?? 'MISSING'}  ${found?.category ?? ''}`);
    // Approval is the deliverable: anything short of it fails the run so this
    // cannot be mistaken for a green registration.
    if (found?.status !== 'APPROVED') process.exitCode = 1;
  }
  if (process.exitCode) {
    console.log('\nPENDING is normal for minutes after submission — re-run to re-check.');
  }
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
