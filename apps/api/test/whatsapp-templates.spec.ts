import { describe, expect, it } from 'vitest';
import { SCHEDULED_MESSAGE_KINDS } from '@zenvy/shared';
import { TEMPLATES, type WhatsAppTemplate } from '../src/whatsapp/templates';

// The catalogue's mistakes surface at Meta's review desk hours later, or worse,
// as a send that fails in production because the parameter count is off. These
// are the checks that would have caught it before the submission.

describe('WhatsApp template catalogue (S3-1)', () => {
  const entries = Object.entries(TEMPLATES) as [string, WhatsAppTemplate][];

  it('covers every scheduled-message kind that sends a template', () => {
    // CUSTOM is the staff-authored escape hatch and has no catalogue entry;
    // a new kind added to the enum lands here until it gets one.
    const expected = SCHEDULED_MESSAGE_KINDS.filter((k) => k !== 'CUSTOM');
    expect(Object.keys(TEMPLATES).sort()).toEqual([...expected].sort());
  });

  it.each(entries)('%s uses a name Meta accepts', (_kind, t) => {
    expect(t.name).toMatch(/^[a-z0-9_]+$/);
    expect(t.name.length).toBeLessThanOrEqual(512);
  });

  it.each(entries)('%s numbers its placeholders 1..n with no gaps', (_kind, t) => {
    const found = [...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    // Meta rejects a body whose placeholders skip a number or restart, and
    // fills {{n}} from the nth parameter — so the two must line up exactly.
    expect(found).toEqual(t.params.map((_p, i) => i + 1));
  });

  it.each(entries)('%s ships a review example for every placeholder', (_kind, t) => {
    expect(t.params.length).toBeGreaterThan(0);
    for (const p of t.params) {
      expect(p.example.trim()).not.toBe('');
      expect(p.label.trim()).not.toBe('');
    }
  });

  it.each(entries)('%s body stays inside Meta formatting limits', (_kind, t) => {
    expect(t.body.length).toBeLessThanOrEqual(1024);
    // Meta rejects leading/trailing whitespace, newlines around a variable and
    // double spaces — all easy to introduce when editing the strings above.
    expect(t.body).toBe(t.body.trim());
    expect(t.body).not.toMatch(/ {2}|\n/);
  });
});
