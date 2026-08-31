import type { CapabilityKey, WorkspaceProfile, WorkspaceRole } from './multi-edition';

export const recordTypes = [
  'lead',
  'contact',
  'company',
  'opportunity',
  'activity',
  'task',
  'campaign',
  'product',
  'quote',
  'invoice',
  'ticket',
  'document',
] as const;

export type RecordType = (typeof recordTypes)[number];
export type CRMGroup = 'Relationships' | 'Sales' | 'Work' | 'Growth' | 'Service';

export type CRMRecord = {
  id: string;
  objectType: RecordType;
  name: string;
  status: string;
  lifecycle: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  amountCents: number;
  currency: string;
  probability: number;
  source: string | null;
  priority: string | null;
  dueAt: string | null;
  closedAt: string | null;
  fields: Record<string, unknown>;
  tags: string[];
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecordLink = {
  sourceId: string;
  targetId: string;
  relationship: string;
  label: string | null;
  createdAt: string;
};

export type CRMNote = {
  id: string;
  recordId: string;
  kind: string;
  body: string;
  source: string;
  occurredAt: string;
  createdAt: string;
};

export type CRMWorkspace = {
  id: string;
  name: string;
  ownerEmail: string;
  ownerName: string;
  role: WorkspaceRole;
  profile: WorkspaceProfile;
  timezone: string;
  currency: string;
  locale: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ResolvedCapability = { key: CapabilityKey; label: string; enabled: boolean; navigation: boolean; limit: number | null };

export type AgentSummary = {
  id: string; name: string; autonomy: string; status: string; monthlyBudgetCents: number;
  spentCents: number; emergencyStoppedAt: string | null;
  tools: Array<{ id: string; name: string; scopes: string[]; external: boolean; enabled: boolean }>;
};

export type CRMInvoicePayment = {
  id: string;
  invoiceId: string;
  amountCents: number;
  recordedAt: string;
  createdAt: string;
};

export type AgentRunSummary = { id: string; agentId: string; status: string; createdAt: string; finishedAt: string | null };
export type ApprovalSummary = { id: string; runId: string; status: string; actionSummary: string; expiresAt: string; createdAt: string };
export type ExecutionReceiptSummary = {
  id: string;
  runId: string;
  outcome: string;
  costCents: number;
  createdAt: string;
  output: { summary: string; recordCounts: Record<string, number>; executedAt: string } | null;
};
export type ConnectorSummary = {
  id: string;
  connectorKey: string;
  authType: string;
  status: string;
  health: string;
  scopes: string[];
  syncCursor: string | null;
  retryCount: number;
  lastErrorCode: string | null;
  updatedAt: string;
};

export type ModuleConfig = {
  moduleKey: string;
  enabled: boolean;
  position: number;
  config: Record<string, unknown>;
};

export type Integration = {
  id: string;
  provider: string;
  name: string;
  status: 'connected' | 'available' | 'configured' | 'disconnected' | 'error';
  authType: string;
  syncDirection: string;
  config: Record<string, unknown>;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  lastError: string | null;
  updatedAt: string;
};

export type IntegrationJob = {
  id: string;
  integrationId: string;
  direction: string;
  status: string;
  processed: number;
  failed: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type WorkflowRule = {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: string;
  conditions: Array<Record<string, unknown>>;
  actions: Array<Record<string, unknown>>;
  lastRunAt: string | null;
  updatedAt: string;
};

export type WorkflowRun = {
  id: string;
  workflowId: string;
  recordId: string | null;
  status: string;
  output: Record<string, unknown>;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type AuditEvent = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  requestId: string;
  createdAt: string;
};

export type CRMAnalytics = {
  contacts: number;
  companies: number;
  openPipelineCents: number;
  weightedForecastCents: number;
  wonRevenueCents: number;
  overdueInvoiceCents: number;
  outstandingInvoiceCents: number;
  overdueTasks: number;
  openTickets: number;
  leadConversionRate: number;
  taskCompletionRate: number;
  pipeline: Array<{ label: string; count: number; amountCents: number }>;
  revenueByMonth: Array<{ label: string; amountCents: number }>;
  sources: Array<{ label: string; leads: number; converted: number }>;
  activityByWeek: Array<{ label: string; count: number }>;
  invoiceAging: Array<{ label: string; amountCents: number }>;
};

export type CRMSnapshot = {
  workspace: CRMWorkspace;
  runtime: {
    mode: 'device' | 'sites' | 'cloudflare-access';
    label: string;
    detail: string;
  };
  records: CRMRecord[];
  links: RecordLink[];
  notes: CRMNote[];
  invoicePayments: CRMInvoicePayment[];
  modules: ModuleConfig[];
  integrations: Integration[];
  integrationJobs: IntegrationJob[];
  workflows: WorkflowRule[];
  workflowRuns: WorkflowRun[];
  audit: AuditEvent[];
  capabilities: Record<CapabilityKey, ResolvedCapability>;
  agents: AgentSummary[];
  agentRuns: AgentRunSummary[];
  approvals: ApprovalSummary[];
  executionReceipts: ExecutionReceiptSummary[];
  connectorConnections: ConnectorSummary[];
  resetState: { operationId: string; mode: 'clean' | 'demo'; status: 'running' | 'failed'; leaseExpiresAt: string | null; updatedAt: string; lastErrorCode: string | null } | null;
  resetReceipt: { operationId: string; mode: 'clean' | 'demo'; completedAt: string } | null;
  analytics: CRMAnalytics;
  generatedAt: string;
  demo: boolean;
};

export const moduleCatalog: Array<{
  key: RecordType;
  label: string;
  singular: string;
  group: CRMGroup;
  glyph: string;
  statuses: string[];
}> = [
  { key: 'lead', label: 'Leads', singular: 'Lead', group: 'Relationships', glyph: '◎', statuses: ['new', 'contacted', 'qualified', 'converted', 'disqualified'] },
  { key: 'contact', label: 'Contacts', singular: 'Contact', group: 'Relationships', glyph: '◉', statuses: ['active', 'nurture', 'customer', 'partner', 'archived'] },
  { key: 'company', label: 'Companies', singular: 'Company', group: 'Relationships', glyph: '▦', statuses: ['prospect', 'customer', 'partner', 'inactive'] },
  { key: 'opportunity', label: 'Pipeline', singular: 'Opportunity', group: 'Sales', glyph: '◇', statuses: ['exploring', 'qualified', 'proposal', 'negotiation', 'won', 'lost'] },
  { key: 'product', label: 'Products', singular: 'Product', group: 'Sales', glyph: '▣', statuses: ['active', 'draft', 'retired'] },
  { key: 'quote', label: 'Quotes', singular: 'Quote', group: 'Sales', glyph: '≡', statuses: ['draft', 'sent', 'accepted', 'rejected', 'expired'] },
  { key: 'invoice', label: 'Invoices', singular: 'Invoice', group: 'Sales', glyph: '$', statuses: ['draft', 'sent', 'partial', 'paid', 'overdue', 'void'] },
  { key: 'activity', label: 'Activities', singular: 'Activity', group: 'Work', glyph: '◌', statuses: ['planned', 'completed', 'cancelled'] },
  { key: 'task', label: 'Tasks & calendar', singular: 'Task', group: 'Work', glyph: '✓', statuses: ['open', 'in_progress', 'completed', 'cancelled'] },
  { key: 'document', label: 'Documents', singular: 'Document', group: 'Work', glyph: '▤', statuses: ['active', 'draft', 'archived'] },
  { key: 'campaign', label: 'Campaigns', singular: 'Campaign', group: 'Growth', glyph: '↗', statuses: ['draft', 'scheduled', 'active', 'paused', 'completed'] },
  { key: 'ticket', label: 'Tickets', singular: 'Ticket', group: 'Service', glyph: '◇', statuses: ['new', 'open', 'waiting', 'resolved', 'closed'] },
];

export const moduleByType = Object.fromEntries(moduleCatalog.map((module) => [module.key, module])) as Record<RecordType, (typeof moduleCatalog)[number]>;

export function isRecordType(value: unknown): value is RecordType {
  return typeof value === 'string' && (recordTypes as readonly string[]).includes(value);
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toCents(value: unknown): number {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

export function formatMoney(cents: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
}

export function normalizeTags(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(raw.map((item) => String(item).trim()).filter(Boolean))].slice(0, 20);
}

export function nextStatus(type: RecordType, current: string): string {
  const statuses = moduleByType[type].statuses;
  const index = statuses.indexOf(current);
  return statuses[Math.min(Math.max(index + 1, 0), statuses.length - 1)];
}

export function recordHealth(record: CRMRecord, now = new Date()): 'healthy' | 'attention' | 'risk' {
  if (record.archivedAt) return 'risk';
  const ageDays = Math.max(0, (now.getTime() - new Date(record.updatedAt).getTime()) / 86_400_000);
  if (record.objectType === 'invoice' && ['overdue', 'partial'].includes(record.status)) return 'risk';
  if (record.objectType === 'ticket' && ['new', 'open'].includes(record.status) && record.priority === 'high') return 'risk';
  if (ageDays > 45) return 'risk';
  if (ageDays > 21 || record.status === 'waiting') return 'attention';
  return 'healthy';
}

export function relatedRecords(recordId: string, records: CRMRecord[], links: RecordLink[]): CRMRecord[] {
  const ids = new Set<string>();
  for (const link of links) {
    if (link.sourceId === recordId) ids.add(link.targetId);
    if (link.targetId === recordId) ids.add(link.sourceId);
  }
  return records.filter((record) => ids.has(record.id));
}

export function buildAnalytics(records: CRMRecord[], now = new Date()): CRMAnalytics {
  const active = records.filter((record) => !record.archivedAt);
  const opportunities = active.filter((record) => record.objectType === 'opportunity');
  const invoices = active.filter((record) => record.objectType === 'invoice');
  const leads = active.filter((record) => record.objectType === 'lead');
  const tasks = active.filter((record) => record.objectType === 'task');
  const activities = active.filter((record) => record.objectType === 'activity');
  const openOpportunities = opportunities.filter((record) => !['won', 'lost'].includes(record.status));
  const completedTasks = tasks.filter((record) => record.status === 'completed').length;
  const convertedLeads = leads.filter((record) => record.status === 'converted').length;
  const nowTime = now.getTime();

  const pipeline = moduleByType.opportunity.statuses.map((status) => {
    const matching = opportunities.filter((record) => record.status === status);
    return { label: status, count: matching.length, amountCents: matching.reduce((sum, record) => sum + record.amountCents, 0) };
  });

  const revenueByMonth = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1));
    const label = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    const amountCents = opportunities
      .filter((record) => record.status === 'won')
      .filter((record) => {
        const closed = new Date(record.closedAt ?? record.updatedAt);
        return closed.getUTCFullYear() === date.getUTCFullYear() && closed.getUTCMonth() === date.getUTCMonth();
      })
      .reduce((sum, record) => sum + record.amountCents, 0);
    return { label, amountCents };
  });

  const sourcesMap = new Map<string, { leads: number; converted: number }>();
  for (const lead of leads) {
    const key = lead.source || 'Unknown';
    const current = sourcesMap.get(key) ?? { leads: 0, converted: 0 };
    current.leads += 1;
    if (lead.status === 'converted') current.converted += 1;
    sourcesMap.set(key, current);
  }

  const activityByWeek = Array.from({ length: 8 }, (_, index) => {
    const end = new Date(nowTime - (7 - index) * 7 * 86_400_000);
    const start = new Date(end.getTime() - 7 * 86_400_000);
    const count = activities.filter((record) => {
      const occurred = new Date(String(record.fields.occurredAt ?? record.createdAt)).getTime();
      return occurred >= start.getTime() && occurred < end.getTime();
    }).length;
    return { label: `W${index + 1}`, count };
  });

  const agingBuckets = [
    { label: 'Current', min: -Infinity, max: 0 },
    { label: '1–30', min: 1, max: 30 },
    { label: '31–60', min: 31, max: 60 },
    { label: '60+', min: 61, max: Infinity },
  ];
  const invoiceAging = agingBuckets.map((bucket) => ({
    label: bucket.label,
    amountCents: invoices
      .filter((record) => !['paid', 'void'].includes(record.status))
      .filter((record) => {
        const due = record.dueAt ? new Date(record.dueAt).getTime() : nowTime;
        const days = Math.floor((nowTime - due) / 86_400_000);
        return days >= bucket.min && days <= bucket.max;
      })
      .reduce((sum, record) => sum + Math.max(0, record.amountCents - Number(record.fields.paidCents ?? 0)), 0),
  }));

  return {
    contacts: active.filter((record) => record.objectType === 'contact').length,
    companies: active.filter((record) => record.objectType === 'company').length,
    openPipelineCents: openOpportunities.reduce((sum, record) => sum + record.amountCents, 0),
    weightedForecastCents: openOpportunities.reduce((sum, record) => sum + Math.round(record.amountCents * record.probability / 100), 0),
    wonRevenueCents: opportunities.filter((record) => record.status === 'won').reduce((sum, record) => sum + record.amountCents, 0),
    overdueInvoiceCents: invoices.filter((record) => record.status === 'overdue').reduce((sum, record) => sum + Math.max(0, record.amountCents - Number(record.fields.paidCents ?? 0)), 0),
    outstandingInvoiceCents: invoices.filter((record) => !['paid', 'void'].includes(record.status)).reduce((sum, record) => sum + Math.max(0, record.amountCents - Number(record.fields.paidCents ?? 0)), 0),
    overdueTasks: tasks.filter((record) => record.status !== 'completed' && record.dueAt && new Date(record.dueAt).getTime() < nowTime).length,
    openTickets: active.filter((record) => record.objectType === 'ticket' && !['resolved', 'closed'].includes(record.status)).length,
    leadConversionRate: leads.length ? Math.round(convertedLeads / leads.length * 100) : 0,
    taskCompletionRate: tasks.length ? Math.round(completedTasks / tasks.length * 100) : 0,
    pipeline,
    revenueByMonth,
    sources: [...sourcesMap.entries()].map(([label, values]) => ({ label, ...values })).sort((a, b) => b.leads - a.leads),
    activityByWeek,
    invoiceAging,
  };
}

export function asCsv(records: CRMRecord[]): string {
  const columns = ['type', 'name', 'status', 'email', 'phone', 'company', 'amount', 'currency', 'source', 'priority', 'due_at', 'tags'];
  const escape = (value: unknown) => {
    const raw = String(value ?? '');
    const safe = /^[\t\r\n ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const rows = records.map((record) => [
    record.objectType,
    record.name,
    record.status,
    record.email,
    record.phone,
    record.companyName,
    record.amountCents / 100,
    record.currency,
    record.source,
    record.priority,
    record.dueAt,
    record.tags.join('; '),
  ].map(escape).join(','));
  return [columns.join(','), ...rows].join('\n');
}
