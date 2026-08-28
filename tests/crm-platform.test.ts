import { describe, expect, it } from 'vitest';
import {
  asCsv,
  buildAnalytics,
  formatMoney,
  isRecordType,
  nextStatus,
  normalizeTags,
  parseJson,
  recordHealth,
  relatedRecords,
  toCents,
  type CRMRecord,
} from '@/lib/crm-platform';

const now = new Date('2026-08-27T12:00:00.000Z');

function record(id: string, objectType: CRMRecord['objectType'], overrides: Partial<CRMRecord> = {}): CRMRecord {
  return {
    id,
    objectType,
    name: `${objectType} ${id}`,
    status: objectType === 'opportunity' ? 'qualified' : 'active',
    lifecycle: 'active',
    email: null,
    phone: null,
    companyName: null,
    amountCents: 0,
    currency: 'USD',
    probability: 0,
    source: null,
    priority: null,
    dueAt: null,
    closedAt: null,
    fields: {},
    tags: [],
    version: 1,
    archivedAt: null,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-20T12:00:00.000Z',
    ...overrides,
  };
}

describe('CRM platform primitives', () => {
  it('recognizes supported record types', () => {
    expect(isRecordType('contact')).toBe(true);
    expect(isRecordType('invoice')).toBe(true);
    expect(isRecordType('user')).toBe(false);
    expect(isRecordType(null)).toBe(false);
  });

  it('parses JSON safely and converts currency inputs to cents', () => {
    expect(parseJson('{"ok":true}', {})).toEqual({ ok: true });
    expect(parseJson('{broken', { fallback: true })).toEqual({ fallback: true });
    expect(parseJson(4, ['safe'])).toEqual(['safe']);
    expect(toCents('19.995')).toBe(2000);
    expect(toCents('nope')).toBe(0);
    expect(formatMoney(125000, 'USD', 'en-US')).toBe('$1,250');
  });

  it('normalizes unique tags and advances status without overflowing', () => {
    expect(normalizeTags(' Founder, SF, Founder,  ')).toEqual(['Founder', 'SF']);
    expect(normalizeTags(['A', '', 'A', 'B'])).toEqual(['A', 'B']);
    expect(normalizeTags(null)).toEqual([]);
    expect(normalizeTags(Array.from({ length: 30 }, (_, index) => `tag-${index}`))).toHaveLength(20);
    expect(nextStatus('lead', 'new')).toBe('contacted');
    expect(nextStatus('lead', 'converted')).toBe('disqualified');
    expect(nextStatus('invoice', 'void')).toBe('void');
    expect(nextStatus('task', 'unknown')).toBe('open');
  });
});

describe('customer health and relationships', () => {
  it('classifies healthy, attention, risk, and archived records', () => {
    expect(recordHealth(record('healthy', 'contact', { updatedAt: '2026-08-20T12:00:00.000Z' }), now)).toBe('healthy');
    expect(recordHealth(record('attention', 'contact', { updatedAt: '2026-07-30T12:00:00.000Z' }), now)).toBe('attention');
    expect(recordHealth(record('stale', 'contact', { updatedAt: '2026-06-01T12:00:00.000Z' }), now)).toBe('risk');
    expect(recordHealth(record('archived', 'contact', { archivedAt: '2026-08-01T00:00:00.000Z' }), now)).toBe('risk');
    expect(recordHealth(record('invoice', 'invoice', { status: 'overdue' }), now)).toBe('risk');
    expect(recordHealth(record('ticket', 'ticket', { status: 'open', priority: 'high' }), now)).toBe('risk');
    expect(recordHealth(record('waiting', 'ticket', { status: 'waiting' }), now)).toBe('attention');
  });

  it('finds records linked in either direction', () => {
    const records = [record('a', 'contact'), record('b', 'company'), record('c', 'opportunity'), record('d', 'task')];
    const links = [
      { sourceId: 'a', targetId: 'b', relationship: 'works_at', label: null, createdAt: now.toISOString() },
      { sourceId: 'c', targetId: 'a', relationship: 'primary_contact', label: null, createdAt: now.toISOString() },
      { sourceId: 'd', targetId: 'b', relationship: 'unrelated', label: null, createdAt: now.toISOString() },
    ];
    expect(relatedRecords('a', records, links).map((item) => item.id)).toEqual(['b', 'c']);
  });
});

describe('live analytics', () => {
  it('derives sales, service, task, source, activity, and invoice metrics', () => {
    const records = [
      record('contact', 'contact'),
      record('archived-contact', 'contact', { archivedAt: now.toISOString() }),
      record('company', 'company'),
      record('open-deal', 'opportunity', { status: 'proposal', amountCents: 100_000, probability: 60 }),
      record('won-deal', 'opportunity', { status: 'won', amountCents: 250_000, probability: 100, closedAt: '2026-08-10T12:00:00.000Z' }),
      record('lost-deal', 'opportunity', { status: 'lost', amountCents: 50_000 }),
      record('lead-a', 'lead', { status: 'converted', source: 'Referral' }),
      record('lead-b', 'lead', { status: 'new', source: 'Referral' }),
      record('lead-c', 'lead', { status: 'contacted', source: null }),
      record('task-done', 'task', { status: 'completed' }),
      record('task-overdue', 'task', { status: 'open', dueAt: '2026-08-01T12:00:00.000Z' }),
      record('ticket', 'ticket', { status: 'open' }),
      record('invoice-overdue', 'invoice', { status: 'overdue', amountCents: 80_000, dueAt: '2026-07-01T12:00:00.000Z', fields: { paidCents: 20_000 } }),
      record('invoice-partial', 'invoice', { status: 'partial', amountCents: 100_000, dueAt: '2026-08-10T12:00:00.000Z', fields: { paidCents: 25_000 } }),
      record('invoice-paid', 'invoice', { status: 'paid', amountCents: 90_000, fields: { paidCents: 90_000 } }),
      record('activity', 'activity', { fields: { occurredAt: '2026-08-24T12:00:00.000Z' } }),
    ];
    const analytics = buildAnalytics(records, now);
    expect(analytics.contacts).toBe(1);
    expect(analytics.companies).toBe(1);
    expect(analytics.openPipelineCents).toBe(100_000);
    expect(analytics.weightedForecastCents).toBe(60_000);
    expect(analytics.wonRevenueCents).toBe(250_000);
    expect(analytics.overdueInvoiceCents).toBe(60_000);
    expect(analytics.outstandingInvoiceCents).toBe(135_000);
    expect(analytics.overdueTasks).toBe(1);
    expect(analytics.openTickets).toBe(1);
    expect(analytics.leadConversionRate).toBe(33);
    expect(analytics.taskCompletionRate).toBe(50);
    expect(analytics.pipeline.find((item) => item.label === 'won')).toMatchObject({ count: 1, amountCents: 250_000 });
    expect(analytics.revenueByMonth.at(-1)).toEqual({ label: 'Aug', amountCents: 250_000 });
    expect(analytics.sources).toEqual([{ label: 'Referral', leads: 2, converted: 1 }, { label: 'Unknown', leads: 1, converted: 0 }]);
    expect(analytics.activityByWeek.at(-1)?.count).toBe(1);
    expect(analytics.invoiceAging.find((item) => item.label === '31–60')?.amountCents).toBe(60_000);
    expect(analytics.invoiceAging.find((item) => item.label === '1–30')?.amountCents).toBe(75_000);
  });

  it('returns zero percentages for an empty workspace', () => {
    const analytics = buildAnalytics([], now);
    expect(analytics.leadConversionRate).toBe(0);
    expect(analytics.taskCompletionRate).toBe(0);
    expect(analytics.openPipelineCents).toBe(0);
  });
});

describe('safe CSV export', () => {
  it('quotes every value, escapes quotes, and neutralizes spreadsheet formulas', () => {
    const output = asCsv([record('csv', 'contact', {
      name: '=HYPERLINK("https://evil.test")',
      email: '+cmd@example.test',
      phone: '-1',
      companyName: '@SUM(A1:A2)',
      tags: ['safe', 'with,comma'],
    })]);
    expect(output).toContain('"\'=HYPERLINK(""https://evil.test"")"');
    expect(output).toContain('"\'+cmd@example.test"');
    expect(output).toContain('"\'-1"');
    expect(output).toContain('"\'@SUM(A1:A2)"');
    expect(output).toContain('"safe; with,comma"');
  });
});
