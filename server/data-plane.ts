import { buildAnalytics, parseJson, type CRMInvoicePayment, type CRMNote, type CRMRecord, type RecordLink, type RecordType } from '@/lib/crm-platform';
import { ApiError } from './request-context';
import { platformLimits } from '@/lib/platform-limits';

export type RecordRow = {
  id: string;
  object_type: RecordType;
  name: string;
  status: string;
  lifecycle: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  amount_cents: number;
  currency: string;
  probability: number;
  source: string | null;
  priority: string | null;
  due_at: string | null;
  closed_at: string | null;
  fields_json: string;
  tags_json: string;
  version: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type LinkRow = { source_id: string; target_id: string; relationship: string; label: string | null; created_at: string };
type NoteRow = { id: string; record_id: string; kind: string; body: string; source: string; occurred_at: string; created_at: string };
type PaymentRow = { id: string; invoice_id: string; amount_cents: number; recorded_at: string; created_at: string };

export function mapRecord(row: RecordRow): CRMRecord {
  return {
    id: row.id,
    objectType: row.object_type,
    name: row.name,
    status: row.status,
    lifecycle: row.lifecycle,
    email: row.email,
    phone: row.phone,
    companyName: row.company_name,
    amountCents: row.amount_cents,
    currency: row.currency,
    probability: row.probability,
    source: row.source,
    priority: row.priority,
    dueAt: row.due_at,
    closedAt: row.closed_at,
    fields: parseJson(row.fields_json, {}),
    tags: parseJson(row.tags_json, []),
    version: row.version,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getRecord(db: D1Database, workspaceId: string, id: string): Promise<CRMRecord> {
  const row = await db.prepare('SELECT * FROM records WHERE workspace_id = ? AND id = ? LIMIT 1').bind(workspaceId, id).first<RecordRow>();
  if (!row) throw new ApiError(404, 'record_not_found', 'Record not found.');
  return mapRecord(row);
}

export async function loadDataPlane(db: D1Database, workspaceId: string) {
  const [recordsResult, linksResult, notesResult, paymentsResult] = await Promise.all([
    db.prepare('SELECT * FROM records WHERE workspace_id = ? ORDER BY updated_at DESC, id LIMIT ?').bind(workspaceId, platformLimits.workspaceRecords + 1).all<RecordRow>(),
    db.prepare('SELECT source_id, target_id, relationship, label, created_at FROM record_links WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?').bind(workspaceId, platformLimits.workspaceLinks + 1).all<LinkRow>(),
    db.prepare('SELECT id, record_id, kind, body, source, occurred_at, created_at FROM notes WHERE workspace_id = ? ORDER BY occurred_at DESC LIMIT ?').bind(workspaceId, platformLimits.workspaceNotes + 1).all<NoteRow>(),
    db.prepare('SELECT id, invoice_id, amount_cents, recorded_at, created_at FROM invoice_payments WHERE workspace_id = ? ORDER BY recorded_at DESC LIMIT ?').bind(workspaceId, platformLimits.workspacePayments + 1).all<PaymentRow>(),
  ]);
  const exceeded = [
    ['records', recordsResult.results.length, platformLimits.workspaceRecords],
    ['record links', linksResult.results.length, platformLimits.workspaceLinks],
    ['notes', notesResult.results.length, platformLimits.workspaceNotes],
    ['invoice payments', paymentsResult.results.length, platformLimits.workspacePayments],
  ].find(([, count, limit]) => Number(count) > Number(limit));
  if (exceeded) {
    throw new ApiError(409, 'workspace_capacity_exceeded', `This workspace exceeds the supported ${exceeded[0]} capacity. Use a provider backup or contact the fork maintainer before loading the application.`, { resource: exceeded[0], limit: exceeded[2] });
  }
  const records = recordsResult.results.map(mapRecord);
  const links = linksResult.results.map((row): RecordLink => ({ sourceId: row.source_id, targetId: row.target_id, relationship: row.relationship, label: row.label, createdAt: row.created_at }));
  const notes = notesResult.results.map((row): CRMNote => ({ id: row.id, recordId: row.record_id, kind: row.kind, body: row.body, source: row.source, occurredAt: row.occurred_at, createdAt: row.created_at }));
  const invoicePayments = paymentsResult.results.map((row): CRMInvoicePayment => ({ id: row.id, invoiceId: row.invoice_id, amountCents: row.amount_cents, recordedAt: row.recorded_at, createdAt: row.created_at }));
  return { records, links, notes, invoicePayments, analytics: buildAnalytics(records) };
}
