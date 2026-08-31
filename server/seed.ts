import { moduleCatalog, type RecordType } from '@/lib/crm-platform';
import type { RequestIdentity } from './request-context';

type SeedRecord = {
  key: string;
  type: RecordType;
  name: string;
  status: string;
  lifecycle?: string;
  email?: string;
  phone?: string;
  company?: string;
  amountCents?: number;
  probability?: number;
  source?: string;
  priority?: string;
  dueDays?: number;
  closedDays?: number;
  tags?: string[];
  fields?: Record<string, unknown>;
};

const date = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const recordId = (workspaceId: string, key: string) => `seed-${key}-${workspaceId}`;

// Synthetic demo records use reserved .example domains and do not identify real people.
const seeds: SeedRecord[] = [
  { key: 'company-northstar', type: 'company', name: 'Northstar Studio', status: 'customer', lifecycle: 'customer', company: 'Northstar Studio', tags: ['Design', 'Customer'], fields: { domain: 'northstar.example', industry: 'Design services', healthScore: 91, employees: 14 } },
  { key: 'company-cascade', type: 'company', name: 'Cascade Climate', status: 'prospect', lifecycle: 'prospect', company: 'Cascade Climate', tags: ['Climate', 'Prospect'], fields: { domain: 'cascade.example', industry: 'Climate technology', healthScore: 72, employees: 28 } },
  { key: 'company-orbit', type: 'company', name: 'Orbit Labs', status: 'partner', lifecycle: 'partner', company: 'Orbit Labs', tags: ['AI', 'Partner'], fields: { domain: 'orbit.example', industry: 'Applied AI', healthScore: 84, employees: 9 } },

  { key: 'contact-aisha', type: 'contact', name: 'Aisha Rahman', status: 'customer', lifecycle: 'customer', email: 'aisha@northstar.example', phone: '+1 415 555 0142', company: 'Northstar Studio', source: 'Referral', tags: ['Decision maker', 'Design'], fields: { role: 'Founder', location: 'San Francisco', relationshipStrength: 94, lastContactAt: date(-2) } },
  { key: 'contact-miguel', type: 'contact', name: 'Miguel Santos', status: 'nurture', lifecycle: 'prospect', email: 'miguel@cascade.example', phone: '+1 510 555 0198', company: 'Cascade Climate', source: 'Conference', tags: ['Climate', 'Operator'], fields: { role: 'COO', location: 'Oakland', relationshipStrength: 76, lastContactAt: date(-12) } },
  { key: 'contact-priya', type: 'contact', name: 'Priya Nair', status: 'partner', lifecycle: 'partner', email: 'priya@orbit.example', company: 'Orbit Labs', source: 'Community', tags: ['AI', 'Advisor'], fields: { role: 'CEO', location: 'Palo Alto', relationshipStrength: 88, lastContactAt: date(-5) } },
  { key: 'contact-jordan', type: 'contact', name: 'Jordan Lee', status: 'active', lifecycle: 'prospect', email: 'jordan@example.com', source: 'Website', tags: ['Founder'], fields: { role: 'Independent founder', location: 'San Jose', relationshipStrength: 61, lastContactAt: date(-31) } },

  { key: 'lead-elena', type: 'lead', name: 'Elena Park', status: 'new', lifecycle: 'lead', email: 'elena@harbor.example', company: 'Harbor Health', source: 'Website', tags: ['Health'], fields: { score: 83, role: 'Founder', nextAction: 'Send discovery questions' } },
  { key: 'lead-david', type: 'lead', name: 'David Okafor', status: 'contacted', lifecycle: 'lead', email: 'david@meadow.example', company: 'Meadow Systems', source: 'LinkedIn', tags: ['SaaS'], fields: { score: 71, role: 'VP Product', nextAction: 'Follow up on pilot scope' } },
  { key: 'lead-zoe', type: 'lead', name: 'Zoe Chen', status: 'qualified', lifecycle: 'prospect', email: 'zoe@lumen.example', company: 'Lumen Works', source: 'Referral', tags: ['Warm'], fields: { score: 91, role: 'CEO', nextAction: 'Create proposal' } },
  { key: 'lead-sam', type: 'lead', name: 'Sam Rivera', status: 'converted', lifecycle: 'customer', email: 'sam@field.example', company: 'Field & Co', source: 'Newsletter', tags: ['Converted'], fields: { score: 95, convertedAt: date(-42) } },

  { key: 'opp-northstar', type: 'opportunity', name: 'Northstar growth advisory', status: 'won', lifecycle: 'customer', company: 'Northstar Studio', amountCents: 1800000, probability: 100, source: 'Referral', closedDays: -28, tags: ['Advisory'], fields: { nextAction: 'Quarterly value review', stageEnteredAt: date(-35), productIds: ['seed-product-advisory'] } },
  { key: 'opp-cascade', type: 'opportunity', name: 'Cascade GTM sprint', status: 'proposal', lifecycle: 'prospect', company: 'Cascade Climate', amountCents: 2400000, probability: 65, source: 'Conference', dueDays: 14, tags: ['Sprint', 'Climate'], fields: { nextAction: 'Review proposal with Miguel', stageEnteredAt: date(-3) } },
  { key: 'opp-lumen', type: 'opportunity', name: 'Lumen customer research', status: 'qualified', lifecycle: 'prospect', company: 'Lumen Works', amountCents: 950000, probability: 40, source: 'Referral', dueDays: 28, tags: ['Research'], fields: { nextAction: 'Confirm research cohort', stageEnteredAt: date(-5) } },
  { key: 'opp-orbit', type: 'opportunity', name: 'Orbit partner workshop', status: 'negotiation', lifecycle: 'partner', company: 'Orbit Labs', amountCents: 600000, probability: 80, source: 'Community', dueDays: 7, tags: ['Workshop'], fields: { nextAction: 'Finalize workshop date', stageEnteredAt: date(-2) } },
  { key: 'opp-lost', type: 'opportunity', name: 'Meadow positioning project', status: 'lost', lifecycle: 'prospect', company: 'Meadow Systems', amountCents: 1200000, probability: 0, source: 'LinkedIn', closedDays: -50, tags: ['Lost'], fields: { lossReason: 'Timing', stageEnteredAt: date(-50) } },

  { key: 'product-advisory', type: 'product', name: 'Growth advisory retainer', status: 'active', amountCents: 600000, tags: ['Recurring'], fields: { sku: 'ADV-001', billing: 'monthly', taxRate: 0, costCents: 120000 } },
  { key: 'product-sprint', type: 'product', name: 'Go-to-market sprint', status: 'active', amountCents: 2400000, tags: ['Fixed fee'], fields: { sku: 'GTM-010', billing: 'one_time', taxRate: 0, costCents: 600000 } },
  { key: 'product-research', type: 'product', name: 'Customer research package', status: 'active', amountCents: 950000, tags: ['Research'], fields: { sku: 'RES-020', billing: 'one_time', taxRate: 0, costCents: 240000 } },
  { key: 'product-workshop', type: 'product', name: 'Founder workshop', status: 'active', amountCents: 600000, tags: ['Workshop'], fields: { sku: 'WS-030', billing: 'one_time', taxRate: 0, costCents: 100000 } },

  { key: 'quote-northstar', type: 'quote', name: 'Q-2026-001 · Northstar advisory', status: 'accepted', company: 'Northstar Studio', amountCents: 1800000, closedDays: -33, tags: ['Accepted'], fields: { quoteNumber: 'Q-2026-001', validUntil: date(-20), terms: 'Net 15', lineItems: [{ description: 'Growth advisory retainer', quantity: 3, unitCents: 600000 }] } },
  { key: 'quote-cascade', type: 'quote', name: 'Q-2026-002 · Cascade GTM sprint', status: 'sent', company: 'Cascade Climate', amountCents: 2400000, dueDays: 10, tags: ['Pending'], fields: { quoteNumber: 'Q-2026-002', validUntil: date(10), terms: '50% upfront', lineItems: [{ description: 'Go-to-market sprint', quantity: 1, unitCents: 2400000 }] } },
  { key: 'quote-lumen', type: 'quote', name: 'Q-2026-003 · Lumen research', status: 'draft', company: 'Lumen Works', amountCents: 950000, dueDays: 21, tags: ['Draft'], fields: { quoteNumber: 'Q-2026-003', validUntil: date(21), terms: 'Net 15', lineItems: [{ description: 'Customer research package', quantity: 1, unitCents: 950000 }] } },

  { key: 'invoice-northstar', type: 'invoice', name: 'INV-2026-001 · Northstar', status: 'paid', company: 'Northstar Studio', amountCents: 1800000, closedDays: -15, tags: ['Paid'], fields: { invoiceNumber: 'INV-2026-001', issuedAt: date(-32), paidCents: 1800000, paidAt: date(-15) } },
  { key: 'invoice-cascade', type: 'invoice', name: 'INV-2026-002 · Cascade deposit', status: 'sent', company: 'Cascade Climate', amountCents: 1200000, dueDays: 12, tags: ['Receivable'], fields: { invoiceNumber: 'INV-2026-002', issuedAt: date(-2), paidCents: 0 } },
  { key: 'invoice-overdue', type: 'invoice', name: 'INV-2026-003 · Field & Co', status: 'overdue', company: 'Field & Co', amountCents: 450000, dueDays: -9, priority: 'high', tags: ['Overdue'], fields: { invoiceNumber: 'INV-2026-003', issuedAt: date(-38), paidCents: 100000 } },

  { key: 'task-cascade', type: 'task', name: 'Review Cascade proposal with Miguel', status: 'open', company: 'Cascade Climate', priority: 'high', dueDays: 1, tags: ['Sales'], fields: { recurrence: null, reminderMinutes: 60 } },
  { key: 'task-reconnect', type: 'task', name: 'Reconnect with Jordan', status: 'open', priority: 'medium', dueDays: -2, tags: ['Relationship'], fields: { recurrence: null, reminderMinutes: 1440 } },
  { key: 'task-invoice', type: 'task', name: 'Follow up on Field & Co invoice', status: 'in_progress', company: 'Field & Co', priority: 'high', dueDays: -1, tags: ['Finance'], fields: { recurrence: null, reminderMinutes: 120 } },
  { key: 'task-content', type: 'task', name: 'Publish monthly customer note', status: 'completed', priority: 'low', closedDays: -4, tags: ['Growth'], fields: { recurrence: 'monthly', completedAt: date(-4) } },
  { key: 'task-review', type: 'task', name: 'Friday pipeline review', status: 'open', priority: 'medium', dueDays: 3, tags: ['Operations'], fields: { recurrence: 'weekly', reminderMinutes: 30 } },

  { key: 'activity-aisha', type: 'activity', name: 'Quarterly value review with Aisha', status: 'completed', company: 'Northstar Studio', closedDays: -2, tags: ['Meeting'], fields: { channel: 'meeting', occurredAt: date(-2), durationMinutes: 45, outcome: 'Renewal intent confirmed' } },
  { key: 'activity-miguel', type: 'activity', name: 'Proposal email to Miguel', status: 'completed', company: 'Cascade Climate', closedDays: -3, tags: ['Email'], fields: { channel: 'email', occurredAt: date(-3), outcome: 'Review scheduled' } },
  { key: 'activity-priya', type: 'activity', name: 'Partner planning call with Priya', status: 'completed', company: 'Orbit Labs', closedDays: -5, tags: ['Call'], fields: { channel: 'call', occurredAt: date(-5), durationMinutes: 30, outcome: 'Workshop proposed' } },
  { key: 'activity-zoe', type: 'activity', name: 'Discovery with Zoe', status: 'completed', company: 'Lumen Works', closedDays: -7, tags: ['Meeting'], fields: { channel: 'meeting', occurredAt: date(-7), durationMinutes: 50, outcome: 'Qualified for research package' } },

  { key: 'campaign-founder', type: 'campaign', name: 'Founder reactivation · August', status: 'active', amountCents: 0, dueDays: 8, tags: ['Email'], fields: { channel: 'email', audienceCount: 42, sent: 36, replied: 9, converted: 3, mode: 'manual_queue' } },
  { key: 'campaign-referral', type: 'campaign', name: 'Customer referral ask', status: 'scheduled', dueDays: 14, tags: ['Referral'], fields: { channel: 'email', audienceCount: 12, sent: 0, replied: 0, converted: 0, mode: 'manual_queue' } },

  { key: 'ticket-onboarding', type: 'ticket', name: 'Northstar onboarding checklist', status: 'resolved', company: 'Northstar Studio', priority: 'medium', closedDays: -18, tags: ['Onboarding'], fields: { category: 'Onboarding', resolution: 'Workspace and weekly cadence configured', openedAt: date(-30) } },
  { key: 'ticket-access', type: 'ticket', name: 'Cascade workshop access', status: 'open', company: 'Cascade Climate', priority: 'high', dueDays: 2, tags: ['Access'], fields: { category: 'Access', openedAt: date(-1), nextAction: 'Confirm attendee list' } },
  { key: 'ticket-question', type: 'ticket', name: 'Orbit deliverable format question', status: 'waiting', company: 'Orbit Labs', priority: 'low', dueDays: 4, tags: ['Question'], fields: { category: 'Question', openedAt: date(-3), waitingOn: 'Customer' } },

  { key: 'document-contract', type: 'document', name: 'Northstar advisory agreement.pdf', status: 'active', company: 'Northstar Studio', tags: ['Contract'], fields: { contentType: 'application/pdf', size: 284200, storage: 'demo-metadata', linkedTo: 'Northstar growth advisory' } },
  { key: 'document-proposal', type: 'document', name: 'Cascade GTM proposal.pdf', status: 'draft', company: 'Cascade Climate', tags: ['Proposal'], fields: { contentType: 'application/pdf', size: 198400, storage: 'demo-metadata', linkedTo: 'Cascade GTM sprint' } },
];

const links: Array<[string, string, string, string]> = [
  ['contact-aisha', 'company-northstar', 'works_at', 'Founder'],
  ['contact-aisha', 'opp-northstar', 'decision_maker', 'Decision maker'],
  ['contact-aisha', 'activity-aisha', 'participant', 'Participant'],
  ['company-northstar', 'quote-northstar', 'customer', 'Customer'],
  ['quote-northstar', 'invoice-northstar', 'converted_to', 'Converted to invoice'],
  ['company-northstar', 'ticket-onboarding', 'customer', 'Customer'],
  ['company-northstar', 'document-contract', 'document', 'Contract'],
  ['contact-miguel', 'company-cascade', 'works_at', 'COO'],
  ['contact-miguel', 'opp-cascade', 'champion', 'Champion'],
  ['company-cascade', 'quote-cascade', 'customer', 'Customer'],
  ['company-cascade', 'invoice-cascade', 'customer', 'Customer'],
  ['company-cascade', 'ticket-access', 'customer', 'Customer'],
  ['company-cascade', 'document-proposal', 'document', 'Proposal'],
  ['contact-priya', 'company-orbit', 'works_at', 'CEO'],
  ['contact-priya', 'opp-orbit', 'decision_maker', 'Decision maker'],
  ['company-orbit', 'ticket-question', 'customer', 'Customer'],
  ['lead-zoe', 'opp-lumen', 'qualified_into', 'Qualified opportunity'],
  ['opp-cascade', 'product-sprint', 'line_item', '1 × GTM sprint'],
  ['opp-lumen', 'product-research', 'line_item', '1 × research package'],
  ['opp-northstar', 'product-advisory', 'line_item', '3 × advisory retainer'],
];

export function seedStatements(db: D1Database, workspaceId: string, identity: RequestIdentity, currency: string): D1PreparedStatement[] {
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  const maintenanceToken = crypto.randomUUID();

  statements.push(db.prepare(`
    INSERT INTO workspace_maintenance_sessions (workspace_id, purpose, token, created_at)
    VALUES (?, 'seed', ?, ?)
  `).bind(workspaceId, maintenanceToken, now));

  for (const [position, module] of moduleCatalog.entries()) {
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO module_configs (workspace_id, module_key, enabled, position, config_json, updated_at)
      VALUES (?, ?, 1, ?, '{}', ?)
    `).bind(workspaceId, module.key, position, now));
  }

  for (const seed of seeds) {
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO records (
        id, workspace_id, object_type, name, status, lifecycle, owner_user_id,
        email, phone, company_name, amount_cents, currency, probability, source,
        priority, due_at, closed_at, fields_json, tags_json, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(
      recordId(workspaceId, seed.key), workspaceId, seed.type, seed.name, seed.status,
      seed.lifecycle ?? 'active', identity.userId, seed.email ?? null, seed.phone ?? null,
      seed.company ?? null, seed.amountCents ?? 0, currency, seed.probability ?? 0, seed.source ?? null,
      seed.priority ?? null, seed.dueDays === undefined ? null : date(seed.dueDays),
      seed.closedDays === undefined ? null : date(seed.closedDays), JSON.stringify(seed.fields ?? {}),
      JSON.stringify(seed.tags ?? []), date(-60), now,
    ));
  }

  const payments = [
    ['payment-northstar', 'invoice-northstar', 1_800_000, date(-15)],
    ['payment-overdue', 'invoice-overdue', 100_000, date(-25)],
  ] as const;
  for (const [paymentKey, invoiceKey, amountCents, recordedAt] of payments) {
    statements.push(db.prepare(`
      INSERT INTO invoice_payments (id, workspace_id, invoice_id, amount_cents, recorded_by, recorded_at, request_id, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM invoice_payments WHERE workspace_id = ? AND id = ?)
    `).bind(
      recordId(workspaceId, paymentKey), workspaceId, recordId(workspaceId, invoiceKey), amountCents,
      identity.userId, recordedAt, `seed:${paymentKey}:${workspaceId}`, now,
      workspaceId, recordId(workspaceId, paymentKey),
    ));
  }

  for (const [source, target, relationship, label] of links) {
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO record_links (workspace_id, source_id, target_id, relationship, label, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(workspaceId, recordId(workspaceId, source), recordId(workspaceId, target), relationship, label, now));
  }

  const notes = [
    ['note-aisha', 'contact-aisha', 'meeting', 'Aisha values concise weekly updates and wants the next quarter tied to referral revenue.', -2],
    ['note-miguel', 'contact-miguel', 'email', 'Miguel asked for a phased option and a clear success metric for the GTM sprint.', -3],
    ['note-priya', 'contact-priya', 'call', 'Priya can introduce two founders after the partner workshop lands.', -5],
    ['note-zoe', 'lead-zoe', 'meeting', 'Zoe needs customer language before the board planning session next month.', -7],
    ['note-ticket', 'ticket-access', 'update', 'Waiting for final attendee emails before granting workshop access.', -1],
  ] as const;
  for (const [id, record, kind, body, occurredDays] of notes) {
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO notes (id, workspace_id, record_id, kind, body, source, occurred_at, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, 'demo', ?, ?, ?)
    `).bind(recordId(workspaceId, id), workspaceId, recordId(workspaceId, record), kind, body, date(occurredDays), identity.userId, now));
  }

  const integrations = [
    ['csv', 'CSV export', 'connected', 'builtin', 'outbound', { capabilities: ['export'] }],
    ['calendar', 'Calendar / ICS', 'available', 'deeplink', 'export', { capabilities: ['ics_export'] }],
    ['email', 'Email compose', 'available', 'deeplink', 'outbound', { capabilities: ['mailto'] }],
    ['webhook', 'Generic webhook', 'disconnected', 'workspace-key', 'inbound', { requires: ['Generate a workspace key in Integrations'] }],
    ['google', 'Google Workspace', 'disconnected', 'oauth', 'two_way', { requires: ['OAuth app credentials'] }],
    ['microsoft', 'Microsoft 365', 'disconnected', 'oauth', 'two_way', { requires: ['OAuth app credentials'] }],
    ['slack', 'Slack', 'disconnected', 'oauth', 'outbound', { requires: ['OAuth app credentials'] }],
    ['zapier', 'Zapier / Make / n8n', 'disconnected', 'webhook', 'two_way', { requires: ['Webhook URL or API key'] }],
  ] as const;
  for (const [provider, name, status, authType, direction, config] of integrations) {
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO integrations (
        id, workspace_id, provider, name, status, auth_type, sync_direction, config_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(recordId(workspaceId, `integration-${provider}`), workspaceId, provider, name, status, authType, direction, JSON.stringify(config), now, now));
  }

  const workflows = [
    ['workflow-won', 'Won deal → onboarding task', 1, 'record.status_changed', [{ field: 'objectType', equals: 'opportunity' }, { field: 'status', equals: 'won' }], [{ type: 'create_task', title: 'Kick off {record.name}' }]],
    ['workflow-overdue', 'Overdue invoice → collection task', 1, 'record.status_changed', [{ field: 'objectType', equals: 'invoice' }, { field: 'status', equals: 'overdue' }], [{ type: 'create_task', title: 'Follow up on {record.name}' }]],
    ['workflow-lead', 'Qualified lead → proposal reminder', 0, 'record.status_changed', [{ field: 'objectType', equals: 'lead' }, { field: 'status', equals: 'qualified' }], [{ type: 'create_task', title: 'Create proposal for {record.name}' }]],
  ] as const;
  for (const [key, name, enabled, triggerType, conditions, actions] of workflows) {
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO workflow_rules (
        id, workspace_id, name, enabled, trigger_type, conditions_json, actions_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(recordId(workspaceId, key), workspaceId, name, enabled, triggerType, JSON.stringify(conditions), JSON.stringify(actions), now, now));
  }

  statements.push(db.prepare(`
    INSERT OR IGNORE INTO audit_events (
      id, workspace_id, actor_user_id, action, entity_type, entity_id, metadata_json, request_id, created_at
    ) VALUES (?, ?, ?, 'workspace.seeded', 'workspace', ?, ?, ?, ?)
  `).bind(recordId(workspaceId, 'audit-seeded'), workspaceId, identity.userId, workspaceId, JSON.stringify({ demo: true }), identity.requestId, now));

  statements.push(db.prepare(`
    DELETE FROM workspace_maintenance_sessions
    WHERE workspace_id = ? AND purpose = 'seed' AND token = ?
  `).bind(workspaceId, maintenanceToken));

  return statements;
}
