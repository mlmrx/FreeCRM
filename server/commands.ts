import { moduleByType, parseJson, type CRMRecord } from '@/lib/crm-platform';
import { capabilities, isWorkspaceProfile, type CapabilityKey } from '@/lib/multi-edition';
import { platformLimits } from '@/lib/platform-limits';
import { requirePermission } from './authorization';
import { getWorkspaceCapabilities, requireCapability } from './capabilities';
import type { RequestIdentity } from './request-context';
import { ApiError } from './request-context';
import type { WorkspaceContext } from './control-plane';
import { getRecord } from './data-plane';
import { seedStatements } from './seed';
import { normalizeMutationFenceError, workspaceMutationFence } from './mutation-fence';
import { assertD1BatchSize, D1_MAX_QUERIES_PER_INVOCATION } from './d1-limits';
import {
  cleanDate,
  cleanInteger,
  cleanIanaTimezone,
  cleanRecordInput,
  cleanText,
  requireId,
  requireVersion,
  type CRMCommand,
} from './validation';

type CommandResponse = { ok: true; result: Record<string, unknown>; replayed?: boolean };
type IdempotencyRow = { request_hash: string; response_json: string; status_code: number };

const recordCapability = (type: CRMRecord['objectType']): CapabilityKey => type === 'ticket' ? 'service' : ['lead', 'contact', 'company', 'activity', 'task', 'document'].includes(type) ? 'relationships' : 'sales';

function sqlJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

type ResetLease = { token: string; leaseToken: string; operationId: string };

async function markResetFailed(db: D1Database, workspaceId: string, lease: ResetLease, errorCode: string) {
  const failedAt = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE workspace_reset_operations SET status='failed',lease_token=NULL,response_json=NULL,last_error_code=?,updated_at=? WHERE workspace_id=? AND operation_id=? AND token=? AND lease_token=? AND status='running' AND EXISTS (SELECT 1 FROM workspace_maintenance_sessions WHERE workspace_id=? AND purpose='reset' AND token=? AND lease_token=? AND status='running')").bind(errorCode, failedAt, workspaceId, lease.operationId, lease.token, lease.leaseToken, workspaceId, lease.token, lease.leaseToken),
    db.prepare("UPDATE workspace_maintenance_sessions SET status='failed',lease_token=NULL,lease_expires_at=NULL,last_error_code=?,updated_at=? WHERE workspace_id=? AND purpose='reset' AND token=? AND lease_token=? AND status='running'").bind(errorCode, failedAt, workspaceId, lease.token, lease.leaseToken),
  ]);
}

function auditSnapshot(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => auditSnapshot(item, depth + 1));
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 240) : value;
  const sensitiveKey = /(?:email|phone|body|field|config|setting|note|password|passphrase|secret|token|credential|authorization|api.?key|webhook.?url|private.?key)/i;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .slice(0, 50)
    .filter(([key]) => !sensitiveKey.test(key))
    .map(([key, item]) => [key, auditSnapshot(item, depth + 1)]));
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

const managedStatuses: Partial<Record<CRMRecord['objectType'], readonly string[]>> = {
  lead: ['converted'],
  quote: ['accepted'],
  invoice: ['sent', 'partial', 'paid', 'overdue', 'void'],
  ticket: ['resolved'],
};

function assertActiveRecord(record: CRMRecord) {
  if (record.archivedAt) throw new ApiError(409, 'record_archived', 'Archived records cannot be changed.');
}

const protectedFields: Partial<Record<CRMRecord['objectType'], readonly string[]>> = {
  lead: ['convertedAt', 'contactId', 'companyId', 'opportunityId'],
  quote: ['acceptedAt', 'invoiceId'],
  invoice: ['invoiceNumber', 'issuedAt', 'paidCents', 'lastPaymentAt', 'payments', 'sourceQuoteId'],
  ticket: ['resolution', 'resolvedAt'],
  document: ['objectKey', 'originalName', 'contentType', 'size'],
};

function assertSafeRecordCreate(input: ReturnType<typeof cleanRecordInput>) {
  if (!input.objectType) return;
  if (input.status && managedStatuses[input.objectType]?.includes(input.status)) {
    throw new ApiError(409, 'managed_transition_required', `${input.objectType} status ${input.status} must be set through its domain command.`);
  }
  const reserved = protectedFields[input.objectType] ?? [];
  if (input.fields && reserved.some((key) => Object.hasOwn(input.fields!, key))) {
    throw new ApiError(400, 'protected_field', `System-managed ${input.objectType} fields cannot be set through generic record creation.`);
  }
  if (input.closedAt && managedStatuses[input.objectType]?.length) {
    throw new ApiError(400, 'protected_field', `closedAt is managed by ${input.objectType} domain transitions.`);
  }
}

function safeRecordUpdate(current: CRMRecord, input: ReturnType<typeof cleanRecordInput>): ReturnType<typeof cleanRecordInput> {
  const managed = managedStatuses[current.objectType] ?? [];
  if (input.status !== undefined && input.status !== current.status && (managed.includes(input.status) || managed.includes(current.status))) {
    throw new ApiError(409, 'managed_transition_required', `${current.objectType} status ${input.status} must be set through its domain command.`);
  }
  if (input.closedAt !== undefined && input.closedAt !== current.closedAt && managed.length) {
    throw new ApiError(400, 'protected_field', `closedAt is managed by ${current.objectType} domain transitions.`);
  }
  if (current.objectType === 'invoice' && ['sent', 'partial', 'paid', 'overdue', 'void'].includes(current.status)) {
    if (input.amountCents !== undefined && input.amountCents !== current.amountCents) throw new ApiError(409, 'protected_field', 'Invoice amount cannot change after issuance.');
    if (input.currency !== undefined && input.currency !== current.currency) throw new ApiError(409, 'protected_field', 'Invoice currency cannot change after issuance.');
  }
  if (!input.fields) return input;
  const nextFields = { ...input.fields };
  for (const key of protectedFields[current.objectType] ?? []) {
    if (Object.hasOwn(input.fields, key) && sqlJson(input.fields[key]) !== sqlJson(current.fields[key])) {
      throw new ApiError(400, 'protected_field', `${key} is managed by the ${current.objectType} service.`);
    }
    if (Object.hasOwn(current.fields, key)) nextFields[key] = current.fields[key];
    else delete nextFields[key];
  }
  return { ...input, fields: nextFields };
}

function claimRecordMutation(db: D1Database, workspaceId: string, recordId: string, expectedVersion: number, operationId: string, now: string) {
  return db.prepare('INSERT INTO record_mutation_claims (workspace_id,record_id,expected_version,operation_id,claimed_at) VALUES (?,?,?,?,?)').bind(workspaceId, recordId, expectedVersion, operationId, now);
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
    `).bind(runId, workspaceId, workflow.id, record.id, sqlJson({ createdRecordIds: created }), `${identity.requestId}:${workflow.id}:${record.id}:${record.version}`, now, now));
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
  services: { deleteWorkspaceObjects?: (workspaceId: string, beforeMutationEpoch: number) => Promise<{ deleted: number; complete: boolean }> } = {},
): Promise<CommandResponse> {
  const workspaceId = context.workspaceId;
  if (command.type === 'integration.update') {
    requirePermission(context.workspace.role, 'connectors:manage');
    await requireCapability(db, context, 'integrations');
  } else if (command.type === 'workflow.toggle') {
    requirePermission(context.workspace.role, 'workflows:manage');
  } else if (command.type === 'workspace.update' || command.type === 'capability.update' || command.type === 'demo.reset') {
    requirePermission(context.workspace.role, 'workspace:manage');
  } else {
    requirePermission(context.workspace.role, 'records:write');
  }
  const key = cleanText(idempotencyKey, 'Idempotency-Key', 128, true);
  const requestHash = await sha256(rawBody);
  await db.prepare("DELETE FROM idempotency_records WHERE rowid IN (SELECT rowid FROM idempotency_records WHERE expires_at <= ? LIMIT 100)").bind(new Date().toISOString()).run();
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
  const epochState = await db.prepare('SELECT mutation_epoch FROM workspaces WHERE id=?').bind(workspaceId).first<{ mutation_epoch: number }>();
  if (!epochState || !Number.isInteger(epochState.mutation_epoch)) throw new ApiError(500, 'workspace_epoch_missing', 'Workspace mutation state is unavailable.');
  let mutationEpoch = epochState.mutation_epoch;
  const statements: D1PreparedStatement[] = [];
  let result: Record<string, unknown> = {};
  let entityType = 'workspace';
  let entityId: string | null = workspaceId;
  let before: unknown = null;
  let after: unknown = null;
  let resetLease: ResetLease | null = null;

  if (command.type === 'record.create') {
    const input = cleanRecordInput(command.payload);
    assertSafeRecordCreate(input);
    const resolved = await getWorkspaceCapabilities(db, context);
    const capability = resolved[recordCapability(input.objectType!)];
    if (!capability.enabled) throw new ApiError(403, 'capability_disabled', `${capability.label} is disabled for this workspace.`);
    const workspaceUsage = await db.prepare('SELECT COUNT(*) AS count FROM records WHERE workspace_id = ?').bind(workspaceId).first<{ count: number }>();
    if ((workspaceUsage?.count ?? 0) >= platformLimits.workspaceRecords) throw new ApiError(409, 'workspace_record_limit', `This release supports up to ${platformLimits.workspaceRecords.toLocaleString()} records per workspace.`);
    if (capability.limit !== null) {
      const types = recordCapability(input.objectType!) === 'service' ? ['ticket'] : recordCapability(input.objectType!) === 'relationships' ? ['lead', 'contact', 'company', 'activity', 'task', 'document'] : ['opportunity', 'campaign', 'product', 'quote', 'invoice'];
      const placeholders = types.map(() => '?').join(',');
      const usage = await db.prepare(`SELECT COUNT(*) AS count FROM records WHERE workspace_id = ? AND object_type IN (${placeholders}) AND archived_at IS NULL`).bind(workspaceId, ...types).first<{ count: number }>();
      if ((usage?.count ?? 0) >= capability.limit) throw new ApiError(409, 'capability_limit', `${capability.label} has reached its workspace limit.`);
    }
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
    assertActiveRecord(current);
    if (current.version !== version) throw new ApiError(409, 'stale_record', 'This record changed elsewhere. Refresh and try again.', { currentVersion: current.version });
    const input = safeRecordUpdate(current, cleanRecordInput({ ...command.payload, objectType: current.objectType }, true));
    if (input.currency && input.currency !== context.workspace.currency) {
      throw new ApiError(400, 'currency_mismatch', `Records must use the workspace reporting currency (${context.workspace.currency}).`);
    }
    const updated = makeRecord(input, identity.userId, { ...current, version: current.version + 1 });
    statements.push(claimRecordMutation(db, workspaceId, id, version, key, now), db.prepare(`
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
    assertActiveRecord(current);
    if (current.version !== version) throw new ApiError(409, 'stale_record', 'This record changed elsewhere. Refresh and try again.', { currentVersion: current.version });
    statements.push(claimRecordMutation(db, workspaceId, id, version, key, now), db.prepare(`
      UPDATE records SET archived_at = ?, version = version + 1, updated_at = ?
      WHERE workspace_id = ? AND id = ? AND version = ?
    `).bind(now, now, workspaceId, id, version));
    result = { id, archivedAt: now, version: version + 1 };
    entityType = current.objectType;
    entityId = id;
    before = current;
    after = { ...current, archivedAt: now, version: version + 1, updatedAt: now };
  } else if (command.type === 'record.restore') {
    const id = requireId(command.payload);
    const version = requireVersion(command.payload);
    const current = await getRecord(db, workspaceId, id);
    if (!current.archivedAt) throw new ApiError(409, 'record_not_archived', 'Only archived records can be restored.');
    if (current.version !== version) throw new ApiError(409, 'stale_record', 'This record changed elsewhere. Refresh and try again.', { currentVersion: current.version });
    const resolved = await getWorkspaceCapabilities(db, context);
    const capability = resolved[recordCapability(current.objectType)];
    if (!capability.enabled) throw new ApiError(403, 'capability_disabled', `${capability.label} is disabled for this workspace.`);
    if (capability.limit !== null) {
      const types = recordCapability(current.objectType) === 'service' ? ['ticket'] : recordCapability(current.objectType) === 'relationships' ? ['lead', 'contact', 'company', 'activity', 'task', 'document'] : ['opportunity', 'campaign', 'product', 'quote', 'invoice'];
      const placeholders = types.map(() => '?').join(',');
      const usage = await db.prepare(`SELECT COUNT(*) AS count FROM records WHERE workspace_id = ? AND object_type IN (${placeholders}) AND archived_at IS NULL`).bind(workspaceId, ...types).first<{ count: number }>();
      if ((usage?.count ?? 0) >= capability.limit) throw new ApiError(409, 'capability_limit', `${capability.label} has reached its workspace limit.`);
    }
    statements.push(claimRecordMutation(db, workspaceId, id, version, key, now), db.prepare(`
      UPDATE records SET archived_at = NULL, version = version + 1, updated_at = ?
      WHERE workspace_id = ? AND id = ? AND version = ? AND archived_at IS NOT NULL
    `).bind(now, workspaceId, id, version));
    result = { id, archivedAt: null, version: version + 1 };
    entityType = current.objectType;
    entityId = id;
    before = current;
    after = { ...current, archivedAt: null, version: version + 1, updatedAt: now };
  } else if (command.type === 'note.create') {
    const recordId = requireId(command.payload, 'recordId');
    assertActiveRecord(await getRecord(db, workspaceId, recordId));
    const note = {
      id: crypto.randomUUID(),
      recordId,
      kind: cleanText(command.payload.kind, 'kind', 32) || 'note',
      body: cleanText(command.payload.body, 'body', platformLimits.noteBodyCharacters, true),
      source: 'manual',
      occurredAt: cleanDate(command.payload.occurredAt, 'occurredAt') ?? now,
      createdAt: now,
    };
    const noteUsage = await db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN record_id = ? THEN 1 ELSE 0 END) AS per_record FROM notes WHERE workspace_id = ?`).bind(recordId, workspaceId).first<{ total: number; per_record: number }>();
    if ((noteUsage?.total ?? 0) >= platformLimits.workspaceNotes || (noteUsage?.per_record ?? 0) >= platformLimits.notesPerRecord) {
      throw new ApiError(409, 'note_limit', `This release supports ${platformLimits.notesPerRecord} notes per record and ${platformLimits.workspaceNotes.toLocaleString()} per workspace.`);
    }
    statements.push(db.prepare(`
      INSERT INTO notes (id, workspace_id, record_id, kind, body, source, occurred_at, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(note.id, workspaceId, note.recordId, note.kind, note.body, note.source, note.occurredAt, identity.userId, now));
    statements.push(db.prepare('UPDATE records SET updated_at = ? WHERE workspace_id = ? AND id = ?').bind(now, workspaceId, recordId));
    result = { note };
    entityType = 'note';
    entityId = note.id;
    after = note;
  } else if (command.type === 'lead.convert') {
    const id = requireId(command.payload);
    const version = requireVersion(command.payload);
    const lead = await getRecord(db, workspaceId, id);
    assertActiveRecord(lead);
    if (lead.objectType !== 'lead') throw new ApiError(400, 'invalid_transition', 'Only leads can be converted.');
    if (lead.version !== version) throw new ApiError(409, 'stale_record', 'This lead changed elsewhere.', { currentVersion: lead.version });
    if (lead.status === 'converted') throw new ApiError(409, 'already_converted', 'This lead is already converted.');
    if (lead.status === 'disqualified') throw new ApiError(409, 'invalid_transition', 'A disqualified lead cannot be converted.');
    statements.push(claimRecordMutation(db, workspaceId, id, version, key, now));
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
    assertActiveRecord(quote);
    if (quote.objectType !== 'quote') throw new ApiError(400, 'invalid_transition', 'Only quotes can be accepted.');
    if (quote.version !== version) throw new ApiError(409, 'stale_record', 'This quote changed elsewhere.', { currentVersion: quote.version });
    if (quote.status !== 'sent') throw new ApiError(409, 'invalid_transition', 'Only a sent quote can be accepted.');
    statements.push(claimRecordMutation(db, workspaceId, id, version, key, now));
    const invoiceNumber = `INV-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
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
  } else if (command.type === 'invoice.issue') {
    const id = requireId(command.payload);
    const version = requireVersion(command.payload);
    const invoice = await getRecord(db, workspaceId, id);
    assertActiveRecord(invoice);
    if (invoice.objectType !== 'invoice') throw new ApiError(400, 'invalid_transition', 'Only invoices can be issued.');
    if (invoice.version !== version) throw new ApiError(409, 'stale_record', 'This invoice changed elsewhere.', { currentVersion: invoice.version });
    if (invoice.status !== 'draft') throw new ApiError(409, 'invalid_transition', 'Only a draft invoice can be issued.');
    if (invoice.amountCents <= 0) throw new ApiError(409, 'invoice_data_invalid', 'An invoice needs a positive amount before it can be issued.');
    const invoiceNumber = `INV-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const dueAt = invoice.dueAt ?? new Date(Date.now() + 15 * 86_400_000).toISOString();
    const fields = { ...invoice.fields, invoiceNumber, issuedAt: now, paidCents: 0 };
    statements.push(
      claimRecordMutation(db, workspaceId, id, version, key, now),
      db.prepare("UPDATE records SET status='sent',due_at=?,fields_json=?,version=version+1,updated_at=? WHERE workspace_id=? AND id=? AND version=?").bind(dueAt, sqlJson(fields), now, workspaceId, id, version),
    );
    result = { invoiceId: id, invoiceNumber, status: 'sent', dueAt, version: version + 1 };
    entityType = 'invoice';
    entityId = id;
    before = invoice;
    after = result;
  } else if (command.type === 'invoice.record_payment') {
    const id = requireId(command.payload);
    const version = requireVersion(command.payload);
    const invoice = await getRecord(db, workspaceId, id);
    assertActiveRecord(invoice);
    if (invoice.objectType !== 'invoice') throw new ApiError(400, 'invalid_transition', 'Only invoices can receive payments.');
    if (invoice.version !== version) throw new ApiError(409, 'stale_record', 'This invoice changed elsewhere.', { currentVersion: invoice.version });
    if (!['sent', 'partial', 'overdue'].includes(invoice.status)) throw new ApiError(409, 'invalid_transition', 'Only sent, partial, or overdue invoices can receive payments.');
    const previousPaid = Number(invoice.fields.paidCents ?? 0);
    if (!Number.isSafeInteger(previousPaid) || previousPaid < 0 || previousPaid > invoice.amountCents) throw new ApiError(409, 'invoice_data_invalid', 'The stored invoice balance is invalid and must be repaired before recording a payment.');
    const remaining = invoice.amountCents - previousPaid;
    const paymentCents = cleanInteger(command.payload.paymentCents, 'paymentCents', 1, remaining);
    const paidCents = previousPaid + paymentCents;
    const status = paidCents >= invoice.amountCents ? 'paid' : 'partial';
    const fields = { ...invoice.fields, paidCents, lastPaymentAt: now };
    const paymentId = crypto.randomUUID();
    statements.push(
      claimRecordMutation(db, workspaceId, id, version, key, now),
      db.prepare(`UPDATE records SET status = ?, fields_json = ?, closed_at = ?, version = version + 1, updated_at = ? WHERE workspace_id = ? AND id = ? AND version = ?`).bind(status, sqlJson(fields), status === 'paid' ? now : invoice.closedAt, now, workspaceId, id, version),
      db.prepare('INSERT INTO invoice_payments (id,workspace_id,invoice_id,amount_cents,recorded_by,recorded_at,request_id,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(paymentId, workspaceId, id, paymentCents, identity.userId, now, key, now),
    );
    result = { invoiceId: id, paymentId, paymentCents, status, paidCents, balanceCents: invoice.amountCents - paidCents, version: version + 1 };
    entityType = 'invoice';
    entityId = id;
    before = invoice;
    after = result;
  } else if (command.type === 'ticket.resolve') {
    const id = requireId(command.payload);
    const version = requireVersion(command.payload);
    const ticket = await getRecord(db, workspaceId, id);
    assertActiveRecord(ticket);
    if (ticket.objectType !== 'ticket') throw new ApiError(400, 'invalid_transition', 'Only tickets can be resolved.');
    if (ticket.version !== version) throw new ApiError(409, 'stale_record', 'This ticket changed elsewhere.', { currentVersion: ticket.version });
    if (!['new', 'open', 'waiting'].includes(ticket.status)) throw new ApiError(409, 'invalid_transition', 'Only an open ticket can be resolved.');
    const resolution = cleanText(command.payload.resolution, 'resolution', 4_000, true);
    const fields = { ...ticket.fields, resolution, resolvedAt: now };
    statements.push(claimRecordMutation(db, workspaceId, id, version, key, now), db.prepare(`UPDATE records SET status = 'resolved', fields_json = ?, closed_at = ?, version = version + 1, updated_at = ? WHERE workspace_id = ? AND id = ? AND version = ?`).bind(sqlJson(fields), now, now, workspaceId, id, version));
    result = { ticketId: id, status: 'resolved', resolution, version: version + 1 };
    entityType = 'ticket';
    entityId = id;
    before = ticket;
    after = result;
  } else if (command.type === 'workflow.toggle') {
    const id = requireId(command.payload);
    if (typeof command.payload.enabled !== 'boolean') throw new ApiError(400, 'validation_error', 'enabled must be a boolean.', { field: 'enabled' });
    const enabled = command.payload.enabled;
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
    throw new ApiError(409, 'integration_not_implemented', `${integration.provider} does not have a reviewed outbound adapter in this release. No destination or credential was stored.`);
  } else if (command.type === 'workspace.update') {
    const name = cleanText(command.payload.name ?? context.workspace.name, 'name', 120, true);
    const timezone = cleanIanaTimezone(command.payload.timezone, context.workspace.timezone);
    const currency = cleanText(command.payload.currency ?? context.workspace.currency, 'currency', 3, true).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new ApiError(400, 'validation_error', 'currency must be a three-letter ISO 4217 code.', { field: 'currency' });
    if (currency !== context.workspace.currency) {
      const records = await db.prepare('SELECT COUNT(*) AS count FROM records WHERE workspace_id=?').bind(workspaceId).first<{ count: number }>();
      if ((records?.count ?? 0) > 0) throw new ApiError(409, 'currency_change_requires_empty_workspace', 'Workspace currency can change only when the workspace has no CRM records. Export and reset first, then choose the new currency before importing or creating records.');
    }
    const profile = command.payload.profile ?? context.workspace.profile;
    if (!isWorkspaceProfile(profile)) throw new ApiError(400, 'validation_error', 'Unsupported workspace profile.', { field: 'profile' });
    const settings = command.payload.settings && typeof command.payload.settings === 'object' && !Array.isArray(command.payload.settings)
      ? { ...context.workspace.settings, ...(command.payload.settings as Record<string, unknown>) }
      : context.workspace.settings;
    statements.push(db.prepare('UPDATE workspaces SET name = ?, profile = ?, timezone = ?, currency = ?, settings_json = ?, updated_at = ? WHERE id = ?').bind(name, profile, timezone, currency, sqlJson(settings), now, workspaceId));
    result = { workspace: { ...context.workspace, name, profile, timezone, currency, settings, updatedAt: now } };
    before = context.workspace;
    after = result.workspace;
  } else if (command.type === 'capability.update') {
    const key = cleanText(command.payload.key, 'key', 64, true) as CapabilityKey;
    if (!Object.hasOwn(capabilities, key)) throw new ApiError(400, 'validation_error', 'Unsupported capability.', { field: 'key' });
    if (typeof command.payload.enabled !== 'boolean') throw new ApiError(400, 'validation_error', 'enabled must be a boolean.', { field: 'enabled' });
    if (key === 'advancedPolicies' && command.payload.enabled) throw new ApiError(409, 'capability_preview_only', 'Advanced policy authoring is a preview architecture and cannot be enabled in this release.');
    statements.push(db.prepare(`INSERT INTO capability_overrides (workspace_id, capability_key, enabled, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id, capability_key) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`).bind(workspaceId, key, command.payload.enabled ? 1 : 0, now));
    result = { key, enabled: command.payload.enabled };
    entityType = 'capability';
    entityId = key;
    after = result;
  } else if (command.type === 'legacy.import' || command.type === 'csv.import') {
    const rawRecords = command.payload.records;
    if (!Array.isArray(rawRecords) || rawRecords.length === 0) throw new ApiError(400, 'validation_error', 'At least one record is required.');
    // The command appends a mutation fence, audit event, outbox event, and
    // idempotency receipt after one INSERT per record. Keep that atomic batch
    // within the cross-runtime D1 ceiling instead of advertising an amount
    // that the Vercel-to-D1 bridge cannot commit.
    const maxImportRecords = D1_MAX_QUERIES_PER_INVOCATION - 4;
    if (rawRecords.length > maxImportRecords) throw new ApiError(413, 'import_too_large', `Import up to ${maxImportRecords} records per batch.`);
    const resolved = await getWorkspaceCapabilities(db, context);
    const inputs = rawRecords.map((rawRecord, index) => {
      if (!rawRecord || typeof rawRecord !== 'object' || Array.isArray(rawRecord)) {
        throw new ApiError(400, 'validation_error', `Import row ${index + 1} must be a record object.`, { field: `records.${index}` });
      }
      const input = cleanRecordInput(rawRecord as Record<string, unknown>);
      assertSafeRecordCreate(input);
      if (input.currency && input.currency !== context.workspace.currency) {
        throw new ApiError(400, 'currency_mismatch', `Imported records must use the workspace reporting currency (${context.workspace.currency}).`);
      }
      return input;
    });
    const incomingByCapability = inputs.reduce<Record<CapabilityKey, number>>((counts, input) => {
      const capability = recordCapability(input.objectType!);
      counts[capability] += 1;
      return counts;
    }, { relationships: 0, sales: 0, service: 0, integrations: 0, agentPlane: 0, advancedPolicies: 0 });
    for (const capabilityKey of ['relationships', 'sales', 'service'] as const) {
      if (incomingByCapability[capabilityKey] > 0 && !resolved[capabilityKey].enabled) {
        throw new ApiError(403, 'capability_disabled', `${resolved[capabilityKey].label} is disabled for this workspace.`);
      }
    }
    const importUsage = await db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN archived_at IS NULL AND object_type IN ('lead','contact','company','activity','task','document') THEN 1 ELSE 0 END) AS relationships_active,
        SUM(CASE WHEN archived_at IS NULL AND object_type IN ('opportunity','campaign','product','quote','invoice') THEN 1 ELSE 0 END) AS sales_active,
        SUM(CASE WHEN archived_at IS NULL AND object_type='ticket' THEN 1 ELSE 0 END) AS service_active
      FROM records
      WHERE workspace_id = ?
    `).bind(workspaceId).first<{ total: number; relationships_active: number; sales_active: number; service_active: number }>();
    if ((importUsage?.total ?? 0) + inputs.length > platformLimits.workspaceRecords) throw new ApiError(409, 'workspace_record_limit', `This import would exceed the ${platformLimits.workspaceRecords.toLocaleString()}-record workspace limit.`);
    const activeByCapability = {
      relationships: importUsage?.relationships_active ?? 0,
      sales: importUsage?.sales_active ?? 0,
      service: importUsage?.service_active ?? 0,
    };
    for (const capabilityKey of ['relationships', 'sales', 'service'] as const) {
      const limit = resolved[capabilityKey].limit;
      if (limit !== null && activeByCapability[capabilityKey] + incomingByCapability[capabilityKey] > limit) {
        throw new ApiError(409, 'capability_limit', `${resolved[capabilityKey].label} would exceed its ${limit.toLocaleString()}-record workspace limit.`);
      }
    }
    const imported: string[] = [];
    for (const input of inputs) {
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
    const unexpectedResetFields = Object.keys(command.payload).filter((field) => !['confirm', 'mode', 'operationId'].includes(field));
    if (unexpectedResetFields.length) throw new ApiError(400, 'validation_error', `Unexpected reset field: ${unexpectedResetFields[0]}.`, { field: unexpectedResetFields[0] });
    if (command.payload.mode !== 'clean' && command.payload.mode !== 'demo') throw new ApiError(400, 'validation_error', 'mode must be clean or demo.', { field: 'mode' });
    const mode = command.payload.mode;
    const resetOperationId = cleanText(command.payload.operationId, 'operationId', 36, true);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resetOperationId)) {
      throw new ApiError(400, 'validation_error', 'operationId must be a UUID.', { field: 'operationId' });
    }
    // A retry may carry a fresh HTTP idempotency key (for example after an R2
    // outage). Bind the resumable lock to the canonical destructive payload so
    // the owner can safely resume only the same reset mode.
    const resetMaintenanceToken = await sha256(`workspace-reset\n${workspaceId}\n${mode}\n${resetOperationId}`);
    type ResetOperationRow = { token: string; mode: string; status: 'running' | 'failed' | 'completed'; response_json: string | null };
    const priorOperation = await db.prepare('SELECT token,mode,status,response_json FROM workspace_reset_operations WHERE workspace_id=? AND operation_id=?').bind(workspaceId, resetOperationId).first<ResetOperationRow>();
    if (priorOperation && (priorOperation.token !== resetMaintenanceToken || priorOperation.mode !== mode)) {
      throw new ApiError(409, 'reset_operation_conflict', 'That reset operation ID is already bound to a different reset request.');
    }
    if (priorOperation?.status === 'completed') {
      if (!priorOperation.response_json) throw new ApiError(500, 'reset_receipt_invalid', 'The completed reset receipt is unavailable; no destructive action was taken.');
      return { ...(parseJson(priorOperation.response_json, { ok: true, result: { reset: true, mode, operationId: resetOperationId } }) as CommandResponse), replayed: true };
    }
    type ResetLockRow = { token: string; mode: string | null; operation_id: string | null; status: string | null; lease_token: string | null; response_json: string | null };
    const resetLeaseToken = crypto.randomUUID();
    const resetLeaseExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await db.prepare(`
      INSERT INTO workspace_maintenance_sessions (
        workspace_id,purpose,token,mode,operation_id,status,lease_token,lease_expires_at,
        response_json,last_error_code,created_at,updated_at
      ) VALUES (?,'reset',?,?,?,'running',?,?,NULL,NULL,?,?)
      ON CONFLICT(workspace_id,purpose) DO UPDATE SET
        token=excluded.token,mode=excluded.mode,operation_id=excluded.operation_id,status='running',
        lease_token=excluded.lease_token,lease_expires_at=excluded.lease_expires_at,
        response_json=NULL,last_error_code=NULL,created_at=excluded.created_at,updated_at=excluded.updated_at
      WHERE (workspace_maintenance_sessions.status='completed' AND NOT EXISTS (
               SELECT 1 FROM workspace_reset_operations
               WHERE workspace_id=excluded.workspace_id AND operation_id=excluded.operation_id AND status='completed'
            ))
         OR (workspace_maintenance_sessions.token=excluded.token AND (
              workspace_maintenance_sessions.status='failed'
              OR workspace_maintenance_sessions.lease_expires_at <= excluded.updated_at
         ))
    `).bind(workspaceId, resetMaintenanceToken, mode, resetOperationId, resetLeaseToken, resetLeaseExpiresAt, now, now).run();
    const resetLock = await db.prepare("SELECT token,mode,operation_id,status,lease_token,response_json FROM workspace_maintenance_sessions WHERE workspace_id=? AND purpose='reset'").bind(workspaceId).first<ResetLockRow>();
    if (resetLock?.token !== resetMaintenanceToken || resetLock.mode !== mode || resetLock.operation_id !== resetOperationId) {
      throw new ApiError(423, 'workspace_reset_in_progress', 'A different workspace reset operation is already in progress. Resume it before starting another reset.', resetLock ? { mode: resetLock.mode, operationId: resetLock.operation_id, status: resetLock.status } : undefined);
    }
    if (resetLock.status !== 'running' || resetLock.lease_token !== resetLeaseToken) {
      const completedOperation = await db.prepare('SELECT token,mode,status,response_json FROM workspace_reset_operations WHERE workspace_id=? AND operation_id=?').bind(workspaceId, resetOperationId).first<ResetOperationRow>();
      if (completedOperation?.token === resetMaintenanceToken && completedOperation.mode === mode && completedOperation.status === 'completed' && completedOperation.response_json) {
        return { ...(parseJson(completedOperation.response_json, { ok: true, result: { reset: true, mode, operationId: resetOperationId } }) as CommandResponse), replayed: true };
      }
      throw new ApiError(423, 'workspace_reset_in_progress', 'This reset is already running in another request. Wait for it to finish or resume after its lease expires.', { mode, operationId: resetOperationId, status: resetLock.status });
    }
    const acquiredResetLease: ResetLease = { token: resetMaintenanceToken, leaseToken: resetLeaseToken, operationId: resetOperationId };
    const resetClaim = await db.batch([
      db.prepare(`
        INSERT INTO workspace_reset_operations (workspace_id,operation_id,mode,token,lease_token,status,response_json,last_error_code,created_at,updated_at)
        VALUES (?,?,?,?,?,'running',NULL,NULL,?,?)
        ON CONFLICT(workspace_id,operation_id) DO UPDATE SET lease_token=excluded.lease_token,status='running',response_json=NULL,last_error_code=NULL,updated_at=excluded.updated_at
        WHERE workspace_reset_operations.token=excluded.token AND workspace_reset_operations.mode=excluded.mode AND workspace_reset_operations.status IN ('running','failed')
      `).bind(workspaceId, resetOperationId, mode, resetMaintenanceToken, resetLeaseToken, now, now),
      db.prepare(`
        UPDATE workspaces
        SET mutation_epoch=mutation_epoch+1,updated_at=?
        WHERE id=? AND EXISTS (
          SELECT 1
          FROM workspace_maintenance_sessions AS maintenance
          JOIN workspace_reset_operations AS operation
            ON operation.workspace_id=maintenance.workspace_id
            AND operation.operation_id=maintenance.operation_id
            AND operation.token=maintenance.token
            AND operation.lease_token=maintenance.lease_token
            AND operation.status='running'
          WHERE maintenance.workspace_id=? AND maintenance.purpose='reset'
            AND maintenance.token=? AND maintenance.lease_token=? AND maintenance.status='running'
            AND operation.operation_id=?
        )
      `).bind(now, workspaceId, workspaceId, resetMaintenanceToken, resetLeaseToken, resetOperationId),
    ]).catch(async (error) => {
      await markResetFailed(db, workspaceId, acquiredResetLease, 'reset_epoch_claim_failed').catch(() => undefined);
      throw error;
    });
    if (Number(resetClaim[0].meta?.changes ?? 0) !== 1 || Number(resetClaim[1].meta?.changes ?? 0) !== 1) {
      await markResetFailed(db, workspaceId, acquiredResetLease, 'reset_epoch_claim_failed').catch(() => undefined);
      throw new ApiError(409, 'reset_operation_conflict', 'The reset operation and mutation epoch could not be acquired; no destructive action was taken.');
    }
    const activeOperation = await db.prepare('SELECT token,mode,status,response_json FROM workspace_reset_operations WHERE workspace_id=? AND operation_id=?').bind(workspaceId, resetOperationId).first<ResetOperationRow>();
    if (!activeOperation || activeOperation.token !== resetMaintenanceToken || activeOperation.mode !== mode || activeOperation.status !== 'running') {
      await markResetFailed(db, workspaceId, acquiredResetLease, 'reset_operation_conflict').catch(() => undefined);
      throw new ApiError(409, 'reset_operation_conflict', 'The reset operation receipt could not be acquired; no destructive action was taken.');
    }
    const resetEpoch = await db.prepare('SELECT mutation_epoch FROM workspaces WHERE id=?').bind(workspaceId).first<{ mutation_epoch: number }>();
    if (!resetEpoch || !Number.isInteger(resetEpoch.mutation_epoch)) {
      await markResetFailed(db, workspaceId, acquiredResetLease, 'reset_epoch_missing').catch(() => undefined);
      throw new ApiError(500, 'workspace_epoch_missing', 'Workspace mutation state is unavailable.');
    }
    mutationEpoch = resetEpoch.mutation_epoch;
    resetLease = acquiredResetLease;

    await db.prepare(`
      UPDATE upload_intents
      SET status='cleanup_pending',lease_expires_at=NULL,last_error_code='upload_intent_expired',
          cleanup_attempts=cleanup_attempts+1,updated_at=?
      WHERE workspace_id=? AND mutation_epoch<? AND status='pending' AND lease_expires_at<=?
        AND EXISTS (
          SELECT 1 FROM workspace_maintenance_sessions
          WHERE workspace_id=? AND purpose='reset' AND token=? AND lease_token=? AND status='running'
        )
    `).bind(now, workspaceId, mutationEpoch, now, workspaceId, resetMaintenanceToken, resetLeaseToken).run();
    const activeUploads = await db.prepare("SELECT COUNT(*) AS count FROM upload_intents WHERE workspace_id=? AND mutation_epoch<? AND status='pending'").bind(workspaceId, mutationEpoch).first<{ count: number }>();
    if ((activeUploads?.count ?? 0) > 0) {
      await markResetFailed(db, workspaceId, resetLease, 'reset_uploads_pending');
      throw new ApiError(503, 'reset_uploads_pending', 'A document upload is still active. The reset is paused; retry after the upload finishes or its lease expires.');
    }

    const referencedDocuments = await db.prepare("SELECT COUNT(*) AS count FROM records WHERE workspace_id=? AND object_type='document'").bind(workspaceId).first<{ count: number }>();
    if (!services.deleteWorkspaceObjects) {
      await markResetFailed(db, workspaceId, resetLease, 'reset_storage_unavailable');
      throw new ApiError(503, 'reset_storage_unavailable', 'Document storage cleanup is unavailable. The reset is paused and can be resumed safely.');
    }
    await db.batch([
      db.prepare("UPDATE records SET status='deleting',archived_at=COALESCE(archived_at,?),updated_at=? WHERE workspace_id=? AND object_type='document'").bind(now, now, workspaceId),
      db.prepare("INSERT INTO outbox_events (id,workspace_id,topic,payload_json,status,attempts,available_at,created_at) VALUES (?,?,'crm.workspace.reset_storage',?,'pending',0,?,?) ON CONFLICT(id) DO UPDATE SET status='pending',available_at=excluded.available_at").bind(`reset-storage:${workspaceId}`, workspaceId, sqlJson({ referencedDocuments: referencedDocuments?.count ?? 0, beforeMutationEpoch: mutationEpoch }), now, now),
      db.prepare("INSERT INTO audit_events (id,workspace_id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,created_at) VALUES (?,?,?,'workspace.reset.storage_requested','workspace',?,?,?,?)").bind(crypto.randomUUID(), workspaceId, identity.userId, workspaceId, sqlJson({ source: 'api', mutationEpoch, referencedDocuments: referencedDocuments?.count ?? 0 }), identity.requestId, now),
    ]);
    let storageCleanup: { deleted: number; complete: boolean };
    try {
      storageCleanup = await services.deleteWorkspaceObjects(workspaceId, mutationEpoch);
    } catch {
      await markResetFailed(db, workspaceId, resetLease, 'reset_storage_pending');
      throw new ApiError(503, 'reset_storage_pending', 'Document cleanup did not finish. Records were safely hidden; retry reset to continue.');
    }
    const renewedAt = new Date().toISOString();
    const renewedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const renewal = await db.prepare("UPDATE workspace_maintenance_sessions SET lease_expires_at=?,updated_at=? WHERE workspace_id=? AND purpose='reset' AND token=? AND lease_token=? AND status='running'").bind(renewedUntil, renewedAt, workspaceId, resetMaintenanceToken, resetLeaseToken).run();
    if (Number(renewal.meta?.changes ?? 0) !== 1) throw new ApiError(423, 'reset_lease_lost', 'Another request owns the reset lease. Refresh the workspace before retrying.');
    if (!storageCleanup.complete) {
      await markResetFailed(db, workspaceId, resetLease, 'reset_storage_more');
      throw new ApiError(503, 'reset_storage_more', `Removed ${storageCleanup.deleted} stored objects. Resume the reset to finish the next bounded batch.`);
    }
    statements.push(
      db.prepare("UPDATE upload_intents SET status='cleaned',lease_expires_at=NULL,last_error_code=NULL,cleanup_attempts=cleanup_attempts+1,updated_at=? WHERE workspace_id=? AND mutation_epoch<? AND status IN ('committed','cleanup_pending')").bind(now, workspaceId, mutationEpoch),
      db.prepare('DELETE FROM notes WHERE workspace_id = ?').bind(workspaceId),
      db.prepare('DELETE FROM record_links WHERE workspace_id = ?').bind(workspaceId),
      db.prepare('DELETE FROM workflow_runs WHERE workspace_id = ?').bind(workspaceId),
      db.prepare('DELETE FROM timeline_activities WHERE workspace_id = ?').bind(workspaceId),
      db.prepare('DELETE FROM party_relationships WHERE workspace_id = ?').bind(workspaceId),
      db.prepare('DELETE FROM work_objects WHERE workspace_id = ?').bind(workspaceId),
      db.prepare('DELETE FROM records WHERE workspace_id = ?').bind(workspaceId),
      db.prepare('DELETE FROM integration_jobs WHERE workspace_id = ?').bind(workspaceId),
      db.prepare('DELETE FROM outbox_events WHERE workspace_id = ?').bind(workspaceId),
      db.prepare('DELETE FROM idempotency_records WHERE workspace_id = ? AND expires_at <= ?').bind(workspaceId, now),
      db.prepare('UPDATE idempotency_records SET response_json = ? WHERE workspace_id = ? AND expires_at > ?').bind(sqlJson({ ok: true, result: { discardedByReset: true } }), workspaceId, now),
      db.prepare("DELETE FROM actors WHERE workspace_id=? AND NOT ((kind='agent' AND id IN (SELECT actor_id FROM agent_identities WHERE workspace_id=?)) OR (kind='human' AND id IN (SELECT owner_actor_id FROM agent_identities WHERE workspace_id=?)))").bind(workspaceId, workspaceId, workspaceId),
    );
    if (mode === 'demo') statements.push(...seedStatements(db, workspaceId, identity, context.workspace.currency));
    const resetResult = { reset: true, mode, operationId: resetOperationId };
    const resetResponse = sqlJson({ ok: true, result: resetResult });
    statements.push(
      db.prepare("UPDATE workspace_reset_operations SET lease_token=?,status='completed',response_json=?,last_error_code=NULL,updated_at=? WHERE workspace_id=? AND operation_id=?").bind(resetLeaseToken, resetResponse, now, workspaceId, resetOperationId),
      db.prepare("UPDATE workspace_maintenance_sessions SET status='completed',lease_token=NULL,lease_expires_at=NULL,response_json=?,last_error_code=NULL,updated_at=? WHERE workspace_id=? AND purpose='reset' AND token=? AND lease_token=? AND status='running'").bind(resetResponse, now, workspaceId, resetMaintenanceToken, resetLeaseToken),
    );
    const settings = { ...context.workspace.settings, demo: mode === 'demo' };
    statements.push(db.prepare('UPDATE workspaces SET settings_json = ?, updated_at = ? WHERE id = ?').bind(sqlJson(settings), now, workspaceId));
    result = resetResult;
    entityType = 'workspace';
    entityId = workspaceId;
    after = result;
  } else {
    throw new ApiError(400, 'unsupported_command', 'Unsupported command.');
  }

  const response: CommandResponse = { ok: true, result };
  const auditId = crypto.randomUUID();
  const outboxId = crypto.randomUUID();
  if (command.type !== 'demo.reset') {
    statements.push(workspaceMutationFence(db, workspaceId, mutationEpoch, `${command.type}:${key}`, now));
  }
  statements.push(
    db.prepare(`
      INSERT INTO audit_events (
        id, workspace_id, actor_user_id, action, entity_type, entity_id,
        before_json, after_json, metadata_json, request_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(auditId, workspaceId, identity.userId, command.type, entityType, entityId, before ? sqlJson(auditSnapshot(before)) : null, after ? sqlJson(auditSnapshot(after)) : null, sqlJson({ source: 'api', mutationEpoch }), identity.requestId, now),
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
    await db.batch(assertD1BatchSize(statements, command.type === 'demo.reset' ? 'Workspace reset commit' : `Command ${command.type}`));
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
    if (String(error).includes('record_mutation_claims')) {
      const current = entityId ? await db.prepare('SELECT version FROM records WHERE workspace_id=? AND id=?').bind(workspaceId, entityId).first<{ version: number }>() : null;
      throw new ApiError(409, 'stale_record', 'This record changed elsewhere. Refresh and try again.', current ? { currentVersion: current.version } : undefined);
    }
    if (resetLease) {
      await markResetFailed(db, workspaceId, resetLease, 'reset_commit_failed').catch(() => undefined);
    }
    throw normalizeMutationFenceError(error);
  }
}
