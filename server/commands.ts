import { moduleByType, parseJson, type CRMRecord } from '@/lib/crm-platform';
import { isWorkspaceProfile } from '@/lib/multi-edition';
import type { RequestIdentity } from './request-context';
import { ApiError } from './request-context';
import type { WorkspaceContext } from './control-plane';
import { getRecord } from './data-plane';
import { seedStatements } from './seed';
import {
  cleanDate,
  cleanInteger,
  cleanRecordInput,
  cleanText,
  cleanUrl,
  requireId,
  requireVersion,
  type CRMCommand,
} from './validation';

type CommandResponse = { ok: true; result: Record<string, unknown>; replayed?: boolean };
type IdempotencyRow = { request_hash: string; response_json: string; status_code: number };

function sqlJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

function auditSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 20).map(auditSnapshot);
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 240) : value;
  const redactedKeys = new Set(['email', 'phone', 'body', 'fields', 'config', 'webhookUrl', 'token', 'secret', 'notes']);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !redactedKeys.has(key))
    .map(([key, item]) => [key, auditSnapshot(item)]));
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function recordInsert(
  db: D1Database,
  workspaceId: string,
  ownerUserId: string,
  record: CRMRecord,
): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO records (
      id, workspace_id, object_type, name, status, lifecycle, owner_user_id,
      email, phone, company_name, amount_cents, currency, probability, source,
      priority, due_at, closed_at, fields_json, tags_json, version, archived_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    record.id, workspaceId, record.objectType, record.name, record.status, record.lifecycle,
    ownerUserId, record.email, record.phone, record.companyName, record.amountCents,
    record.currency, record.probability, record.source, record.priority, record.dueAt,
    record.closedAt, sqlJson(record.fields), sqlJson(record.tags), record.version,
    record.archivedAt, record.createdAt, record.updatedAt,
  );
}

function makeRecord(input: ReturnType<typeof cleanRecordInput>, ownerUserId: string, defaults?: Partial<CRMRecord>): CRMRecord {
  if (!input.objectType && !defaults?.objectType) throw new ApiError(400, 'validation_error', 'objectType is required.');
  const objectType = input.objectType ?? defaults!.objectType!;
  const now = new Date().toISOString();
  return {
    id: defaults?.id ?? crypto.randomUUID(),
    objectType,
    name: input.name ?? defaults?.name ?? moduleByType[objectType].singular,
    status: input.status ?? defaults?.status ?? moduleByType[objectType].statuses[0],
    lifecycle: input.lifecycle ?? defaults?.lifecycle ?? (objectType === 'lead' ? 'lead' : 'active'),
    email: input.email === undefined ? defaults?.email ?? null : input.email,
    phone: input.phone === undefined ? defaults?.phone ?? null : input.phone,
    companyName: input.companyName === undefined ? defaults?.companyName ?? null : input.companyName,
    amountCents: input.amountCents ?? defaults?.amountCents ?? 0,
    currency: input.currency ?? defaults?.currency ?? 'USD',
    probability: input.probability ?? defaults?.probability ?? 0,
    source: input.source === undefined ? defaults?.source ?? null : input.source,
    priority: input.priority === undefined ? defaults?.priority ?? null : input.priority,
    dueAt: input.dueAt === undefined ? defaults?.dueAt ?? null : input.dueAt,
    closedAt: input.closedAt === undefined ? defaults?.closedAt ?? null : input.closedAt,
    fields: input.fields ?? defaults?.fields ?? {},
    tags: input.tags ?? defaults?.tags ?? [],
    version: defaults?.version ?? 1,
    archivedAt: defaults?.archivedAt ?? null,
    createdAt: defaults?.createdAt ?? now,
    updatedAt: now,
  };
}

async function workflowStatements(
  db: D1Database,
  workspaceId: string,
  identity: RequestIdentity,
  record: CRMRecord,
): Promise<D1PreparedStatement[]> {
  type WorkflowRow = { id: string; name: string; conditions_json: string; actions_json: string };
  const rows = await db.prepare(`
    SELECT id, name, conditions_json, actions_json
    FROM workflow_rules
    WHERE workspace_id = ? AND enabled = 1 AND trigger_type = 'record.status_changed'
  `).bind(workspaceId).all<WorkflowRow>();
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  for (const workflow of rows.results) {
    const conditions = parseJson<Array<{ field?: string; equals?: unknown }>>(workflow.conditions_json, []);
    const values: Record<string, unknown> = { objectType: record.objectType, status: record.status, lifecycle: record.lifecycle };
    if (!conditions.every((condition) => condition.field && values[condition.field] === condition.equals)) continue;
    const actions = parseJson<Array<{ type?: string; title?: string }>>(workflow.actions_json, []);
    const runId = crypto.randomUUID();
    const created: string[] = [];
    for (const action of actions) {
      if (action.type !== 'create_task' || !action.title) continue;
      const title = action.title.replaceAll('{record.name}', record.name).slice(0, 240);
      const task = makeRecord({
        objectType: 'task',
        name: title,
        status: 'open',
        lifecycle: 'active',
        email: undefined,
        phone: undefined,
        companyName: record.companyName,
        amountCents: 0,
        currency: record.currency,
        probability: 0,
        source: 'Workflow',
        priority: 'medium',
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
        closedAt: undefined,
        fields: { workflowId: workflow.id, relatedRecordId: record.id },
        tags: ['Automated'],
      }, identity.userId);
      statements.push(recordInsert(db, workspaceId, identity.userId, task));
      statements.push(db.prepare(`
        INSERT INTO record_links (workspace_id, source_id, target_id, relationship, label, created_at)
        VALUES (?, ?, ?, 'workflow_task', 'Created by workflow', ?)
      `).bind(workspaceId, record.id, task.id, now));
      created.push(task.id);
    }
    statements.push(db.prepare(`
      INSERT INTO workflow_runs (
        id, workspace_id, workflow_id, record_id, status, output_json, idempotency_key, started_at, finished_at
      ) VALUES (?, ?, ?, ?, 'succeeded', ?, ?, ?, ?)
    `).bind(runId, workspaceId, workflow.id, record.id, sqlJson({ createdRecordIds: created }), `${identity.requestId}:${workflow.id}`, now, now));
    statements.push(db.prepare('UPDATE workflow_rules SET last_run_at = ?, updated_at = ? WHERE workspace_id = ? AND id = ?').bind(now, now, workspaceId, workflow.id));
  }

  return statements;
}

export async function executeCommand(
  db: D1Database,
  identity: RequestIdentity,
  context: WorkspaceContext,
  command: CRMCommand,
  idempotencyKey: string,
  rawBody: string,
): Promise<CommandResponse> {
  const workspaceId = context.workspaceId;
  const key = cleanText(idempotencyKey, 'Idempotency-Key', 128, true);
  const requestHash = await sha256(rawBody);
  const existing = await db.prepare(`
    SELECT request_hash, response_json, status_code
    FROM idempotency_records
    WHERE workspace_id = ? AND operation = ? AND key = ?
    LIMIT 1
  `).bind(workspaceId, command.type, key).first<IdempotencyRow>();
  if (existing) {
    if (existing.request_hash !== requestHash) throw new ApiError(409, 'idempotency_conflict', 'That idempotency key was already used with a different request.');
    return { ...(parseJson(existing.response_json, { ok: true, result: {} }) as CommandResponse), replayed: true };
  }

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  let result: Record<string, unknown> = {};
  let entityType = 'workspace';
  let entityId: string | null = workspaceId;
  let before: unknown = null;
  let after: unknown = null;

  if (command.type === 'record.create') {
    const input = cleanRecordInput(command.payload);
    if (input.currency && input.currency !== context.workspace.currency) {
      throw new ApiError(400, 'currency_mismatch', `Records must use the workspace reporting currency (${context.workspace.currency}).`);
    }
    const record = makeRecord(input, identity.userId, { currency: context.workspace.currency });
    statements.push(recordInsert(db, workspaceId, identity.userId, record));
    result = { record };
    entityType = record.objectType;
    entityId = record.id;
    after = record;
  } else if (command.type === 'record.update') {
    const id = requireId(command.payload);
    const version = requireVersion(command.payload);
    const current = await getRecord(db, workspaceId, id);
    if (current.version !== version) throw new ApiError(409, 'stale_record', 'This record changed elsewhere. Refresh and try again.', { currentVersion: current.version });
    const input = cleanRecordInput({ ...command.payload, objectType: current.objectType }, true);
    if (input.currency && input.currency !== context.workspace.currency) {
      throw new ApiError(400, 'currency_mismatch', `Records must use the workspace reporting currency (${context.workspace.currency}).`);
    }
    const updated = makeRecord(input, identity.userId, { ...current, version: current.version + 1 });
    statements.push(db.prepare(`
      UPDATE records SET
        name = ?, status = ?, lifecycle = ?, email = ?, phone = ?, company_name = ?,
        amount_cents = ?, currency = ?, probability = ?, source = ?, priority = ?,
        due_at = ?, closed_at = ?, fields_json = ?, tags_json = ?, version = ?, updated_at = ?
      WHERE workspace_id = ? AND id = ? AND version = ?
    `).bind(
      updated.name, updated.status, updated.lifecycle, updated.email, updated.phone,
      updated.companyName, updated.amountCents, updated.currency, updated.probability,
      updated.source, updated.priority, updated.dueAt, updated.closedAt, sqlJson(updated.fields),
      sqlJson(updated.tags), updated.version, updated.updatedAt, workspaceId, id, version,
    ));
    if (current.status !== updated.status) statements.push(...await workflowStatements(db, workspaceId, identity, updated));
    result = { record: updated };
    entityType = current.objectType;
    entityId = id;
    before = current;
    after = updated;
  } else if (command.type === 'record.archive') {
    const id = requireId(command.payload);
    const version = requireVersion(command.payload);
    const current = await getRecord(db, workspaceId, id);
    if (current.version !== version) throw new ApiError(409, 'stale_record', 'This record changed elsewhere. Refresh and try again.', { currentVersion: current.version });
    statements.push(db.prepare(`
      UPDATE records SET archived_at = ?, version = version + 1, updated_at = ?
      WHERE workspace_id = ? AND id = ? AND version = ?
    `).bind(now, now, workspaceId, id, version));
    result = { id, archivedAt: now, version: version + 1 };
    entityType = current.objectType;
    entityId = id;
    before = current;
    after = { ...current, archivedAt: now, version: version + 1, updatedAt: now };
  } else if (command.type === 'note.create') {
    const recordId = requireId(command.payload, 'recordId');
    await getRecord(db, workspaceId, recordId);
    const note = {
      id: crypto.randomUUID(),
      recordId,
      kind: cleanText(command.payload.kind, 'kind', 32) || 'note',
      body: cleanText(command.payload.body, 'body', 10_000, true),
      source: 'manual',
      occurredAt: cleanDate(command.payload.occurredAt, 'occurredAt') ?? now,
      createdAt: now,
    };
    statements.push(db.prepare(`
      INSERT INTO notes (id, workspace_id, record_id, kind, body, source, occurred_at, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(note.id, workspaceId, note.recordId, note.kind, note.body, note.source, note.occurredAt, identity.userId, now));
    statements.push(db.prepare('UPDATE records SET updated_at = ?, version = version + 1 WHERE workspace_id = ? AND id = ?').bind(now, workspaceId, recordId));
    result = { note };
    entityType = 'note';
    entityId = note.id;
    after = note;
  } else if (command.type === 'lead.convert') {
    const id = requireId(command.payload);
    const version = requireVersion(command.payload);
    const lead = await getRecord(db, workspaceId, id);
    if (lead.objectType !== 'lead') throw new ApiError(400, 'invalid_transition', 'Only leads can be converted.');
    if (lead.version !== version) throw new ApiError(409, 'stale_record', 'This lead changed elsewhere.', { currentVersion: lead.version });
    if (lead.status === 'converted') throw new ApiError(409, 'already_converted', 'This lead is already converted.');
    const contact = makeRecord(cleanRecordInput({
      objectType: 'contact', name: lead.name, status: 'active', lifecycle: 'prospect', email: lead.email,
      phone: lead.phone, companyName: lead.companyName, source: lead.source, tags: lead.tags, fields: lead.fields,
    }), identity.userId, { currency: context.workspace.currency });
    statements.push(recordInsert(db, workspaceId, identity.userId, contact));
    let companyId: string | null = null;
    if (lead.companyName) {
      const company = await db.prepare(`SELECT id FROM records WHERE workspace_id = ? AND object_type = 'company' AND lower(name) = lower(?) AND archived_at IS NULL LIMIT 1`).bind(workspaceId, lead.companyName).first<{ id: string }>();
      if (company) companyId = company.id;
      else {
        const companyRecord = makeRecord(cleanRecordInput({ objectType: 'company', name: lead.companyName, status: 'prospect', lifecycle: 'prospect', source: lead.source }), identity.userId, { currency: context.workspace.currency });
        companyId = companyRecord.id;
        statements.push(recordInsert(db, workspaceId, identity.userId, companyRecord));
      }
      statements.push(db.prepare(`INSERT INTO record_links (workspace_id, source_id, target_id, relationship, label, created_at) VALUES (?, ?, ?, 'works_at', 'Converted from lead', ?)`).bind(workspaceId, contact.id, companyId, now));
    }
    let opportunityId: string | null = null;
    if (command.payload.createOpportunity !== false) {
      const value = cleanInteger(command.payload.amountCents, 'amountCents', 0, 2_147_483_647, 0);
      const opportunity = makeRecord(cleanRecordInput({ objectType: 'opportunity', name: `${lead.companyName || lead.name} opportunity`, status: 'qualified', companyName: lead.companyName, amountCents: value, probability: 40, source: lead.source, tags: lead.tags }), identity.userId, { currency: context.workspace.currency });
      opportunityId = opportunity.id;
      statements.push(recordInsert(db, workspaceId, identity.userId, opportunity));
      statements.push(db.prepare(`INSERT INTO record_links (workspace_id, source_id, target_id, relationship, label, created_at) VALUES (?, ?, ?, 'primary_contact', 'Primary contact', ?)`).bind(workspaceId, contact.id, opportunity.id, now));
    }
    statements.push(db.prepare(`UPDATE records SET status = 'converted', lifecycle = 'customer', closed_at = ?, version = version + 1, updated_at = ? WHERE workspace_id = ? AND id = ? AND version = ?`).bind(now, now, workspaceId, id, version));
    statements.push(db.prepare(`INSERT INTO record_links (workspace_id, source_id, target_id, relationship, label, created_at) VALUES (?, ?, ?, 'converted_to', 'Converted contact', ?)`).bind(workspaceId, id, contact.id, now));
    result = { leadId: id, contactId: contact.id, companyId, opportunityId };
    entityType = 'lead';
    entityId = id;
    before = lead;
    after = { status: 'converted', contactId: contact.id, companyId, opportunityId };
  } else if (command.type === 'quote.accept') {
    const id = requireId(command.payload);
    const version = requireVersion(command.payload);
    const quote = await getRecord(db, workspaceId, id);
    if (quote.objectType !== 'quote') throw new ApiError(400, 'invalid_transition', 'Only quotes can be accepted.');
    if (quote.version !== version) throw new ApiError(409, 'stale_record', 'This quote changed elsewhere.', { currentVersion: quote.version });
    const invoiceNumber = `INV-${new Date().getUTCFullYear()}-${String(Date.now()).slice(-5)}`;
    const invoice = makeRecord(cleanRecordInput({
      objectType: 'invoice', name: `${invoiceNumber} · ${quote.companyName || quote.name}`, status: 'sent',
      companyName: quote.companyName, amountCents: quote.amountCents, currency: quote.currency,
      dueAt: new Date(Date.now() + 15 * 86_400_000).toISOString(), tags: ['From quote'],
      fields: { invoiceNumber, issuedAt: now, paidCents: 0, sourceQuoteId: quote.id, lineItems: quote.fields.lineItems ?? [] },
    }), identity.userId);
    statements.push(db.prepare(`UPDATE records SET status = 'accepted', closed_at = ?, version = version + 1, updated_at = ? WHERE workspace_id = ? AND id = ? AND version = ?`).bind(now, now, workspaceId, id, version));
    statements.push(recordInsert(db, workspaceId, identity.userId, invoice));
    statements.push(db.prepare(`INSERT INTO record_links (workspace_id, source_id, target_id, relationship, label, created_at) VALUES (?, ?, ?, 'converted_to', 'Converted to invoice', ?)`).bind(workspaceId, id, invoice.id, now));
    result = { quoteId: id, invoice };
    entityType = 'quote';
    entityId = id;
    before = quote;
    after = { quoteStatus: 'accepted', invoiceId: invoice.id };
  } else if (command.type === 'invoice.record_payment') {
    const id = requireId(command.payload);
    const version = requireVersion(command.payload);
    const invoice = await getRecord(db, workspaceId, id);
    if (invoice.objectType !== 'invoice') throw new ApiError(400, 'invalid_transition', 'Only invoices can receive payments.');
    if (invoice.version !== version) throw new ApiError(409, 'stale_record', 'This invoice changed elsewhere.', { currentVersion: invoice.version });
    const paymentCents = cleanInteger(command.payload.paymentCents, 'paymentCents', 1, invoice.amountCents);
    const paidCents = Math.min(invoice.amountCents, Number(invoice.fields.paidCents ?? 0) + paymentCents);
    const status = paidCents >= invoice.amountCents ? 'paid' : 'partial';
    const fields = { ...invoice.fields, paidCents, lastPaymentAt: now };
    statements.push(db.prepare(`UPDATE records SET status = ?, fields_json = ?, closed_at = ?, version = version + 1, updated_at = ? WHERE workspace_id = ? AND id = ? AND version = ?`).bind(status, sqlJson(fields), status === 'paid' ? now : invoice.closedAt, now, workspaceId, id, version));
    result = { invoiceId: id, status, paidCents, balanceCents: invoice.amountCents - paidCents, version: version + 1 };
    entityType = 'invoice';
    entityId = id;
    before = invoice;
    after = result;
  } else if (command.type === 'ticket.resolve') {
    const id = requireId(command.payload);
    const version = requireVersion(command.payload);
    const ticket = await getRecord(db, workspaceId, id);
    if (ticket.objectType !== 'ticket') throw new ApiError(400, 'invalid_transition', 'Only tickets can be resolved.');
    if (ticket.version !== version) throw new ApiError(409, 'stale_record', 'This ticket changed elsewhere.', { currentVersion: ticket.version });
    const resolution = cleanText(command.payload.resolution, 'resolution', 4_000, true);
    const fields = { ...ticket.fields, resolution, resolvedAt: now };
    statements.push(db.prepare(`UPDATE records SET status = 'resolved', fields_json = ?, closed_at = ?, version = version + 1, updated_at = ? WHERE workspace_id = ? AND id = ? AND version = ?`).bind(sqlJson(fields), now, now, workspaceId, id, version));
    result = { ticketId: id, status: 'resolved', resolution, version: version + 1 };
    entityType = 'ticket';
    entityId = id;
    before = ticket;
    after = result;
  } else if (command.type === 'workflow.toggle') {
    const id = requireId(command.payload);
    const enabled = Boolean(command.payload.enabled);
    const workflow = await db.prepare('SELECT id, enabled FROM workflow_rules WHERE workspace_id = ? AND id = ? LIMIT 1').bind(workspaceId, id).first<{ id: string; enabled: number }>();
    if (!workflow) throw new ApiError(404, 'workflow_not_found', 'Workflow not found.');
    statements.push(db.prepare('UPDATE workflow_rules SET enabled = ?, updated_at = ? WHERE workspace_id = ? AND id = ?').bind(enabled ? 1 : 0, now, workspaceId, id));
    result = { id, enabled };
    entityType = 'workflow';
    entityId = id;
    before = { enabled: Boolean(workflow.enabled) };
    after = result;
  } else if (command.type === 'integration.update') {
    const id = requireId(command.payload);
    const integration = await db.prepare('SELECT id, provider, config_json, status FROM integrations WHERE workspace_id = ? AND id = ? LIMIT 1').bind(workspaceId, id).first<{ id: string; provider: string; config_json: string; status: string }>();
    if (!integration) throw new ApiError(404, 'integration_not_found', 'Integration not found.');
    const config = parseJson<Record<string, unknown>>(integration.config_json, {});
    if (integration.provider === 'webhook' || integration.provider === 'zapier') {
      const webhookUrl = cleanUrl(command.payload.webhookUrl, 'webhookUrl');
      if (!webhookUrl) throw new ApiError(400, 'validation_error', 'Webhook URL is required.');
      config.webhookUrl = webhookUrl;
      config.configuredAt = now;
      statements.push(db.prepare(`UPDATE integrations SET status = 'configured', config_json = ?, last_error = NULL, updated_at = ? WHERE workspace_id = ? AND id = ?`).bind(sqlJson(config), now, workspaceId, id));
      result = { id, status: 'configured', config };
    } else {
      throw new ApiError(409, 'oauth_required', `${integration.provider} requires its OAuth application credentials before it can connect.`);
    }
    entityType = 'integration';
    entityId = id;
    before = { status: integration.status, config: parseJson(integration.config_json, {}) };
    after = result;
  } else if (command.type === 'workspace.update') {
    if (context.workspace.role !== 'owner' && context.workspace.role !== 'admin') throw new ApiError(403, 'forbidden', 'Admin access is required.');
    const name = cleanText(command.payload.name ?? context.workspace.name, 'name', 120, true);
    const timezone = cleanText(command.payload.timezone ?? context.workspace.timezone, 'timezone', 80, true);
    const currency = cleanText(command.payload.currency ?? context.workspace.currency, 'currency', 3, true).toUpperCase();
    const profile = command.payload.profile ?? context.workspace.profile;
    if (!isWorkspaceProfile(profile)) throw new ApiError(400, 'validation_error', 'Unsupported workspace profile.', { field: 'profile' });
    const settings = command.payload.settings && typeof command.payload.settings === 'object' && !Array.isArray(command.payload.settings)
      ? { ...context.workspace.settings, ...(command.payload.settings as Record<string, unknown>) }
      : context.workspace.settings;
    statements.push(db.prepare('UPDATE workspaces SET name = ?, profile = ?, timezone = ?, currency = ?, settings_json = ?, updated_at = ? WHERE id = ?').bind(name, profile, timezone, currency, sqlJson(settings), now, workspaceId));
    result = { workspace: { ...context.workspace, name, profile, timezone, currency, settings, updatedAt: now } };
    before = context.workspace;
    after = result.workspace;
  } else if (command.type === 'legacy.import') {
    const rawRecords = command.payload.records;
    if (!Array.isArray(rawRecords) || rawRecords.length === 0) throw new ApiError(400, 'validation_error', 'At least one record is required.');
    if (rawRecords.length > 75) throw new ApiError(413, 'import_too_large', 'Import up to 75 records per batch.');
    const imported: string[] = [];
    for (const rawRecord of rawRecords) {
      if (!rawRecord || typeof rawRecord !== 'object' || Array.isArray(rawRecord)) continue;
      const input = cleanRecordInput(rawRecord as Record<string, unknown>);
      const record = makeRecord(input, identity.userId, { currency: context.workspace.currency });
      statements.push(recordInsert(db, workspaceId, identity.userId, record));
      imported.push(record.id);
    }
    result = { imported: imported.length, recordIds: imported };
    entityType = 'import';
    entityId = null;
    after = { count: imported.length };
  } else if (command.type === 'demo.reset') {
    if (context.workspace.role !== 'owner') throw new ApiError(403, 'forbidden', 'Only the workspace owner can reset data.');
    if (command.payload.confirm !== 'RESET') throw new ApiError(400, 'confirmation_required', 'Type RESET to confirm.');
    const mode = command.payload.mode === 'clean' ? 'clean' : 'demo';
    statements.push(
      db.prepare('DELETE FROM notes WHERE workspace_id = ?').bind(workspaceId),
      db.prepare('DELETE FROM record_links WHERE workspace_id = ?').bind(workspaceId),
      db.prepare('DELETE FROM workflow_runs WHERE workspace_id = ?').bind(workspaceId),
      db.prepare('DELETE FROM records WHERE workspace_id = ?').bind(workspaceId),
      db.prepare('DELETE FROM integration_jobs WHERE workspace_id = ?').bind(workspaceId),
      db.prepare('DELETE FROM audit_events WHERE workspace_id = ?').bind(workspaceId),
      db.prepare('DELETE FROM outbox_events WHERE workspace_id = ?').bind(workspaceId),
      db.prepare('DELETE FROM idempotency_records WHERE workspace_id = ?').bind(workspaceId),
    );
    if (mode === 'demo') statements.push(...seedStatements(db, workspaceId, identity));
    const settings = { ...context.workspace.settings, demo: mode === 'demo' };
    statements.push(db.prepare('UPDATE workspaces SET settings_json = ?, updated_at = ? WHERE id = ?').bind(sqlJson(settings), now, workspaceId));
    result = { reset: true, mode };
    entityType = 'workspace';
    entityId = workspaceId;
    after = result;
  } else {
    throw new ApiError(400, 'unsupported_command', 'Unsupported command.');
  }

  const response: CommandResponse = { ok: true, result };
  const auditId = crypto.randomUUID();
  const outboxId = crypto.randomUUID();
  statements.push(
    db.prepare(`
      INSERT INTO audit_events (
        id, workspace_id, actor_user_id, action, entity_type, entity_id,
        before_json, after_json, metadata_json, request_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(auditId, workspaceId, identity.userId, command.type, entityType, entityId, before ? sqlJson(auditSnapshot(before)) : null, after ? sqlJson(auditSnapshot(after)) : null, sqlJson({ source: 'api' }), identity.requestId, now),
    db.prepare(`
      INSERT INTO outbox_events (id, workspace_id, topic, payload_json, status, attempts, available_at, created_at)
      VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)
    `).bind(outboxId, workspaceId, `crm.${command.type}`, sqlJson({ entityType, entityId, requestId: identity.requestId }), now, now),
    db.prepare(`
      INSERT INTO idempotency_records (
        workspace_id, operation, key, request_hash, status_code, response_json, created_at, expires_at
      ) VALUES (?, ?, ?, ?, 200, ?, ?, ?)
    `).bind(workspaceId, command.type, key, requestHash, sqlJson(response), now, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()),
  );

  try {
    await db.batch(statements);
    return response;
  } catch (error) {
    // A concurrent retry can pass the preflight before the first request commits.
    // The unique idempotency key is the final fence; replay the committed result.
    const committed = await db.prepare(`
      SELECT request_hash, response_json, status_code
      FROM idempotency_records
      WHERE workspace_id = ? AND operation = ? AND key = ?
      LIMIT 1
    `).bind(workspaceId, command.type, key).first<IdempotencyRow>();
    if (committed?.request_hash === requestHash) {
      return { ...(parseJson(committed.response_json, response) as CommandResponse), replayed: true };
    }
    throw error;
  }
}
