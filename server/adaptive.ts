import type { AdaptiveAnswer, AdaptiveFeedback, AdaptiveInputRecord, AdaptiveInputSource, AdaptiveObservation, AdaptivePack, AdaptiveProposal, AdaptiveRelease, AdaptiveSettings, AdaptiveSignal, AdaptiveSnapshot, AdaptiveTopic } from '@/lib/adaptive-types';
import { adaptiveTopics } from '@/lib/adaptive-types';
import { adaptiveDefaultPackIds, adaptivePackCatalog, adaptiveProjects } from '@/lib/adaptive-catalog';
import { adaptiveTimestamp, buildAdaptiveSignals, deriveLearning } from '@/lib/adaptive-engine';
import { hasPermission, requirePermission } from './authorization';
import { brainConfig, brainId } from './brain';
import { BrainAiError, generateGroundedAnswer } from './brain-ai';
import { fetchCapabilityReleases } from './capability-scout';
import { requireCapability } from './capabilities';
import type { WorkspaceContext } from './control-plane';
import { assertD1BatchSize } from './d1-limits';
import { captureWorkspaceMutationEpoch, normalizeMutationFenceError, workspaceMutationFence } from './mutation-fence';
import { ApiError, type RequestIdentity } from './request-context';

const DAY = 86_400_000;
const SCAN_INTERVAL = 6 * 60 * 60_000;
type SettingsRow = { revision: number; learning_enabled: number; auto_adapt: number; paused: number; goals: string; focus: AdaptiveSettings['focus']; followup_days: number; followup_pinned: number; digest_size: number; watch_enabled: number; watch_projects_json: string; last_scan_at: string | null; last_scan_error: string | null; updated_at: string };
type PackRow = { pack_id: string; version: string; enabled: number; previous_version: string | null; previous_enabled: number | null; installed_at: string };
type ReleaseRow = { id: string; project_id: string; title: string; version: string; body: string; url: string; published_at: string; fetched_at: string; topics_json: string; suggested_pack_ids_json: string };
type FeedbackRow = { signal_id: string; fingerprint: string; state: AdaptiveSignal['state']; snoozed_until: string | null; topic: AdaptiveTopic; updated_at: string };
type ReceiptPointer = { done?: boolean; recordId?: string; created?: boolean; signalId?: string; signalFingerprint?: string; proposalId?: string; refreshed?: boolean; errors?: number; forgotten?: boolean };

export function defaultAdaptiveSettings(): AdaptiveSettings {
  return { revision: 0, learningEnabled: false, autoAdapt: false, paused: false, goals: '', focus: 'balanced', followUpDays: 3, followUpPinned: false, digestSize: 5, watchEnabled: false, watchProjects: [], lastScanAt: null, lastScanError: null, updatedAt: '' };
}

function string(value: unknown, field: string, max: number, required = true): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) throw new ApiError(400, 'validation_error', `${field} must be ${required ? 'nonempty ' : ''}text of at most ${max} characters.`);
  return value.trim();
}
function integer(value: unknown, field: string, min: number, max: number) {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) throw new ApiError(400, 'validation_error', `${field} must be an integer from ${min} to ${max}.`);
  return Number(value);
}
function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new ApiError(400, 'validation_error', `${field} must be true or false.`);
  return value;
}
async function digest(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function nextScan(settings: AdaptiveSettings): string | null {
  if (!settings.watchEnabled || settings.paused) return null;
  return settings.lastScanAt ? new Date(Date.parse(settings.lastScanAt) + (settings.lastScanError ? 15 * 60_000 : SCAN_INTERVAL)).toISOString() : null;
}
async function readSettings(db: D1Database, workspaceId: string): Promise<AdaptiveSettings> {
  const row = await db.prepare('SELECT * FROM adaptive_settings WHERE workspace_id=?').bind(workspaceId).first<SettingsRow>();
  if (!row) return defaultAdaptiveSettings();
  return { revision: row.revision, learningEnabled: !!row.learning_enabled, autoAdapt: !!row.auto_adapt, paused: !!row.paused, goals: row.goals, focus: row.focus, followUpDays: row.followup_days, followUpPinned: !!row.followup_pinned, digestSize: row.digest_size, watchEnabled: !!row.watch_enabled, watchProjects: JSON.parse(row.watch_projects_json), lastScanAt: row.last_scan_at, lastScanError: row.last_scan_error, updatedAt: row.updated_at };
}
function release(row: ReleaseRow): AdaptiveRelease {
  return { id: row.id, projectId: row.project_id, title: row.title, version: row.version, body: row.body, url: row.url, publishedAt: row.published_at, fetchedAt: row.fetched_at, topics: JSON.parse(row.topics_json), suggestedPackIds: JSON.parse(row.suggested_pack_ids_json) };
}
async function observations(db: D1Database, workspaceId: string, now: string): Promise<AdaptiveObservation[]> {
  const rows = await db.prepare('SELECT id,signal_id signalId,topic,outcome,followup_days followUpDays,observed_at observedAt FROM adaptive_observations WHERE workspace_id=? AND observed_at>=? AND observed_at<=? ORDER BY observed_at DESC,id LIMIT 500').bind(workspaceId, new Date(Date.parse(now) - 30 * DAY).toISOString(), now).all<AdaptiveObservation>();
  return rows.results;
}
function resolvedPacks(rows: PackRow[]): AdaptivePack[] {
  return adaptivePackCatalog.map((pack) => {
    const stored = rows.find((row) => row.pack_id === pack.id);
    return { ...pack, enabled: stored ? !!stored.enabled && stored.version === pack.version : adaptiveDefaultPackIds.includes(pack.id), previousVersion: stored?.previous_version ?? null, installedAt: stored?.installed_at ?? null };
  });
}

export async function readAdaptiveSnapshot(db: D1Database, context: WorkspaceContext, identity: RequestIdentity): Promise<AdaptiveSnapshot> {
  requirePermission(context.workspace.role, 'records:read');
  const workspaceId = context.workspaceId;
  const now = new Date().toISOString();
  const [settings, recordRows, sourceRows, linkRows, memory, packRows, releaseRows, proposalRows, feedbackRows, brain, taskReceipts] = await Promise.all([
    readSettings(db, workspaceId),
    db.prepare('SELECT id,object_type objectType,name,status,due_at dueAt,updated_at updatedAt,version,fields_json fieldsJson,amount_cents amountCents FROM records WHERE workspace_id=? AND archived_at IS NULL ORDER BY updated_at DESC,id LIMIT 1000').bind(workspaceId).all<Omit<AdaptiveInputRecord, 'fields'> & { fieldsJson: string }>(),
    db.prepare('SELECT id,title,body,updated_at updatedAt,version FROM brain_sources WHERE workspace_id=? ORDER BY updated_at DESC,id LIMIT 200').bind(workspaceId).all<Omit<AdaptiveInputSource, 'recordIds'>>(),
    db.prepare('SELECT source_id,record_id FROM brain_record_links WHERE workspace_id=? LIMIT 2400').bind(workspaceId).all<{ source_id: string; record_id: string }>(),
    observations(db, workspaceId, now),
    db.prepare('SELECT * FROM adaptive_packs WHERE workspace_id=? LIMIT 20').bind(workspaceId).all<PackRow>(),
    db.prepare('SELECT * FROM adaptive_releases WHERE workspace_id=? ORDER BY published_at DESC,id LIMIT 20').bind(workspaceId).all<ReleaseRow>(),
    db.prepare('SELECT id,release_id releaseId,title,problem,status,created_at createdAt FROM adaptive_proposals WHERE workspace_id=? ORDER BY created_at DESC,id LIMIT 20').bind(workspaceId).all<AdaptiveProposal>(),
    db.prepare('SELECT * FROM adaptive_feedback WHERE workspace_id=? ORDER BY updated_at DESC LIMIT 1000').bind(workspaceId).all<FeedbackRow>(),
    db.prepare('SELECT enabled FROM brain_settings WHERE workspace_id=?').bind(workspaceId).first<{ enabled: number }>(),
    db.prepare("SELECT result_json FROM adaptive_receipts WHERE workspace_id=? AND action='followup.create' AND mutation_epoch=(SELECT mutation_epoch FROM workspaces WHERE id=?) LIMIT 1000").bind(workspaceId, workspaceId).all<{ result_json: string }>(),
  ]);
  const packs = resolvedPacks(packRows.results);
  const releases = releaseRows.results.map(release);
  const learning = deriveLearning(memory, settings, now);
  const records = recordRows.results.map(({ fieldsJson, ...row }) => ({ ...row, fields: JSON.parse(fieldsJson) as Record<string, unknown> }));
  const sources = sourceRows.results.map((row) => ({ ...row, recordIds: linkRows.results.filter((link) => link.source_id === row.id).map((link) => link.record_id) }));
  const feedback: AdaptiveFeedback[] = feedbackRows.results.map((row) => ({ signalId: row.signal_id, fingerprint: row.fingerprint, state: row.state, snoozedUntil: row.snoozed_until }));
  const completedTasks = taskReceipts.results.map((row) => JSON.parse(row.result_json) as ReceiptPointer);
  const candidates = buildAdaptiveSignals({ records, sources, releases: settings.watchEnabled ? releases.filter((item) => settings.watchProjects.includes(item.projectId)) : [], settings, observations: memory, enabledPackIds: packs.filter((pack) => pack.enabled).map((pack) => pack.id), feedback: [], now, candidateLimit: 3000 });
  await Promise.all(candidates.map(async (signal) => {
    // Fingerprints bind actions to actual current evidence, not an LLM's claims or client text.
    signal.fingerprint = await digest({ id: signal.id, kind: signal.kind, evidence: signal.evidence, title: signal.title });
    const prior = feedback.find((item) => item.signalId === signal.id && item.fingerprint === signal.fingerprint);
    if (prior) {
      signal.state = prior.state === 'snoozed' && (!prior.snoozedUntil || prior.snoozedUntil <= now) ? 'new' : prior.state;
      signal.snoozedUntil = prior.snoozedUntil;
    }
    // The durable task receipt outlives bounded feed history. Pruning feedback
    // or archiving/editing a task cannot re-authorize the same unchanged signal.
    if (completedTasks.some((item) => item.signalId === signal.id && item.signalFingerprint === signal.fingerprint)) { signal.state = 'actioned'; signal.snoozedUntil = null; }
  }));
  // Apply evidence-bound feedback before the digest limit so filed items cannot
  // starve the next useful recommendation. Keep a bounded undo/history view.
  const signals = [...candidates.filter((item) => ['new', 'useful'].includes(item.state)).slice(0, settings.digestSize), ...candidates.filter((item) => !['new', 'useful'].includes(item.state)).slice(0, 30)];
  const due = nextScan(settings);
  return { workspaceName: context.workspace.name, timezone: context.workspace.timezone, canWrite: hasPermission(context.workspace.role, 'records:write'), canManage: hasPermission(context.workspace.role, 'workspace:manage'), canExport: hasPermission(context.workspace.role, 'data:export'), device: identity.runtimeMode === 'device', localAiEnabled: !!brain?.enabled && identity.runtimeMode === 'device', settings, signals, ...learning, observationCount: memory.length, packs, projects: [...adaptiveProjects], releases, proposals: proposalRows.results, refresh: { generatedAt: now, nextScanAt: due, scanStatus: settings.paused ? 'paused' : !settings.watchEnabled ? 'off' : due && due > now ? 'waiting' : 'ready' }, metrics: { useful: feedback.filter((item) => item.state === 'useful').length, dismissed: feedback.filter((item) => item.state === 'dismissed').length, followUps: feedback.filter((item) => item.state === 'actioned').length, activeSignals: signals.filter((item) => ['new', 'useful'].includes(item.state)).length } };
}

function validateSettings(body: Record<string, unknown>, current: AdaptiveSettings): AdaptiveSettings {
  if (!['balanced', ...adaptiveTopics].includes(String(body.focus))) throw new ApiError(400, 'validation_error', 'Choose a supported focus.');
  if (!Array.isArray(body.watchProjects) || body.watchProjects.length > 4 || body.watchProjects.some((id) => !adaptiveProjects.some((project) => project.id === id))) throw new ApiError(400, 'validation_error', 'Choose projects from the reviewed public release catalog.');
  const watchEnabled = boolean(body.watchEnabled, 'watchEnabled');
  if (watchEnabled && !body.watchProjects.length) throw new ApiError(400, 'validation_error', 'Choose at least one public project to watch.');
  return { ...current, learningEnabled: boolean(body.learningEnabled, 'learningEnabled'), autoAdapt: boolean(body.autoAdapt, 'autoAdapt'), paused: boolean(body.paused, 'paused'), goals: string(body.goals, 'goals', 500, false), focus: body.focus as AdaptiveSettings['focus'], followUpDays: integer(body.followUpDays, 'followUpDays', 1, 30), followUpPinned: boolean(body.followUpPinned, 'followUpPinned'), digestSize: integer(body.digestSize, 'digestSize', 3, 20), watchEnabled, watchProjects: [...new Set(body.watchProjects as string[])] };
}

function settingsWrite(db: D1Database, workspaceId: string, settings: AdaptiveSettings, expected: number, now: string, guard = '', guardValues: unknown[] = []) {
  // One row serializes consent, feed actions and background scan commits. The
  // receipt's changes() constraint immediately rolls back a lost version race.
  return db.prepare(`INSERT INTO adaptive_settings (workspace_id,learning_enabled,auto_adapt,paused,goals,focus,followup_days,followup_pinned,digest_size,watch_enabled,watch_projects_json,last_scan_at,last_scan_error,revision,updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (?=0 OR EXISTS(SELECT 1 FROM adaptive_settings WHERE workspace_id=? AND revision=?))${guard}
    ON CONFLICT(workspace_id) DO UPDATE SET learning_enabled=excluded.learning_enabled,auto_adapt=excluded.auto_adapt,paused=excluded.paused,goals=excluded.goals,focus=excluded.focus,followup_days=excluded.followup_days,followup_pinned=excluded.followup_pinned,digest_size=excluded.digest_size,watch_enabled=excluded.watch_enabled,watch_projects_json=excluded.watch_projects_json,last_scan_at=excluded.last_scan_at,last_scan_error=excluded.last_scan_error,revision=excluded.revision,updated_at=excluded.updated_at WHERE adaptive_settings.revision=?`).bind(workspaceId, Number(settings.learningEnabled), Number(settings.autoAdapt), Number(settings.paused), settings.goals, settings.focus, settings.followUpDays, Number(settings.followUpPinned), settings.digestSize, Number(settings.watchEnabled), JSON.stringify(settings.watchProjects), settings.lastScanAt, settings.lastScanError, expected + 1, now, expected, workspaceId, expected, ...guardValues, expected);
}

function evidenceGuard(signal: AdaptiveSignal, workspaceId: string) {
  const evidence = [...new Map(signal.evidence.map((item) => [`${item.kind}:${item.id}`, item])).values()];
  let sql = '';
  const values: unknown[] = [];
  for (const item of evidence) {
    if (item.kind === 'source') { sql += ' AND EXISTS(SELECT 1 FROM brain_sources WHERE workspace_id=? AND id=? AND version=?)'; values.push(workspaceId, item.id, item.version); }
    else if (item.kind === 'record') { sql += ' AND EXISTS(SELECT 1 FROM records WHERE workspace_id=? AND id=? AND version=? AND archived_at IS NULL)'; values.push(workspaceId, item.id, item.version); }
    else { sql += ' AND EXISTS(SELECT 1 FROM adaptive_releases WHERE workspace_id=? AND id=? AND published_at=?)'; values.push(workspaceId, item.id, item.observedAt); }
  }
  return { sql, values };
}

function feedbackWrite(db: D1Database, workspaceId: string, signal: AdaptiveSignal, state: AdaptiveSignal['state'], snoozedUntil: string | null, now: string) {
  return db.prepare('INSERT INTO adaptive_feedback (workspace_id,signal_id,fingerprint,state,snoozed_until,topic,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(workspace_id,signal_id) DO UPDATE SET fingerprint=excluded.fingerprint,state=excluded.state,snoozed_until=excluded.snoozed_until,topic=excluded.topic,updated_at=excluded.updated_at').bind(workspaceId, signal.id, signal.fingerprint, state, snoozedUntil, signal.topic, now);
}

async function materialize(db: D1Database, workspaceId: string, pointer: ReceiptPointer) {
  if (pointer.recordId && !(await db.prepare('SELECT id FROM records WHERE workspace_id=? AND id=? AND archived_at IS NULL').bind(workspaceId, pointer.recordId).first())) throw new ApiError(410, 'adaptive_result_removed', 'This task was removed; the action was not repeated.');
  if (pointer.proposalId && !(await db.prepare('SELECT id FROM adaptive_proposals WHERE workspace_id=? AND id=?').bind(workspaceId, pointer.proposalId).first())) throw new ApiError(410, 'adaptive_result_removed', 'This proposal was removed; the action was not repeated.');
  return pointer;
}

/** No learning/model/scan side effects are hidden in GETs or UI impressions. */
export async function mutateAdaptive(db: D1Database, context: WorkspaceContext, identity: RequestIdentity, body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const action = string(body.action, 'action', 40);
  const manage = ['settings.update', 'learning.forget', 'pack.set', 'pack.rollback'];
  if (![...manage, 'refresh', 'feedback', 'followup.create', 'proposal.create', 'proposal.dismiss', 'ask'].includes(action)) throw new ApiError(400, 'unknown_operation', 'Unknown adaptive CRM operation.');
  requirePermission(context.workspace.role, manage.includes(action) ? 'workspace:manage' : action === 'ask' ? 'records:read' : 'records:write');
  if (action === 'ask') return askAdaptive(db, context, identity, string(body.question, 'question', 2000), signal);
  const workspaceId = context.workspaceId;
  const operationId = brainId(body.operationId, 'operationId');
  const hash = await digest(body);
  const epoch = await captureWorkspaceMutationEpoch(db, workspaceId);
  async function replay() {
    const row = await db.prepare('SELECT fingerprint,result_json,mutation_epoch FROM adaptive_receipts WHERE workspace_id=? AND operation_id=?').bind(workspaceId, operationId).first<{ fingerprint: string; result_json: string; mutation_epoch: number }>();
    if (!row) return null;
    if (row.fingerprint !== hash) throw new ApiError(409, 'idempotency_conflict', 'This operation ID was used for a different request.');
    if (row.mutation_epoch !== epoch) throw new ApiError(409, 'adaptive_result_reset', 'A reset discarded this result. The action was not repeated.');
    return { result: await materialize(db, workspaceId, JSON.parse(row.result_json)) };
  }
  const prior = await replay();
  if (prior) return prior.result;
  const current = await readSettings(db, workspaceId);
  let next = { ...current };
  const now = new Date().toISOString();
  const after: D1PreparedStatement[] = [];
  let guard = ''; const guardValues: unknown[] = [];
  let result: ReceiptPointer = { done: true };
  let entityId: string | null = null;
  if (manage.includes(action) && integer(body.expectedRevision, 'expectedRevision', 0, Number.MAX_SAFE_INTEGER) !== current.revision) throw new ApiError(409, 'adaptive_write_conflict', 'Settings changed. Refresh before applying this decision.');
  if (current.paused && ['followup.create', 'proposal.create', 'pack.set'].includes(action)) throw new ApiError(409, 'adaptive_paused', 'Adaptive assistance is paused. Resume it before creating or enabling anything.');

  if (action === 'settings.update') {
    next = validateSettings(body, current);
  } else if (action === 'learning.forget') {
    if (body.confirm !== 'FORGET') throw new ApiError(400, 'confirmation_required', 'Confirm FORGET to erase learning observations. CRM records are preserved.');
    after.push(db.prepare('DELETE FROM adaptive_observations WHERE workspace_id=?').bind(workspaceId));
    next.learningEnabled = false; next.autoAdapt = false;
    result = { forgotten: true };
  } else if (action === 'feedback' || action === 'followup.create') {
    const snapshot = await readAdaptiveSnapshot(db, context, identity);
    const found = snapshot.signals.find((item) => item.id === body.signalId);
    if (!found || found.fingerprint !== body.fingerprint) throw new ApiError(409, 'adaptive_evidence_changed', 'This signal or its evidence changed. Refresh and review it again.');
    const evidence = evidenceGuard(found, workspaceId); guard += evidence.sql; guardValues.push(...evidence.values);
    if (action === 'feedback') {
      if (!['useful', 'dismissed', 'snoozed', 'new'].includes(String(body.value))) throw new ApiError(400, 'validation_error', 'Choose useful, dismissed, snoozed or new.');
      const value = body.value as AdaptiveSignal['state'];
      if (found.state === 'actioned') throw new ApiError(409, 'adaptive_already_actioned', 'This signal already created a task. Manage the task in your CRM.');
      after.push(feedbackWrite(db, workspaceId, found, value, value === 'snoozed' ? new Date(Date.parse(now) + integer(body.snoozeDays, 'snoozeDays', 1, 30) * DAY).toISOString() : null, now));
      if (['useful', 'dismissed', 'new'].includes(value)) {
        // Corrections and undo remove old learning even when observation is now off.
        after.push(db.prepare("DELETE FROM adaptive_observations WHERE workspace_id=? AND signal_id=? AND outcome IN ('useful','dismissed')").bind(workspaceId, found.id));
      }
      if (current.learningEnabled && !current.paused && ['useful', 'dismissed'].includes(value)) {
        after.push(db.prepare('INSERT INTO adaptive_observations (workspace_id,id,signal_id,topic,outcome,followup_days,observed_at) VALUES (?,?,?,?,?,NULL,?)').bind(workspaceId, crypto.randomUUID(), found.id, found.topic, value, now));
      }
    } else {
      if (!found.suggestedTask) throw new ApiError(400, 'adaptive_no_action', 'This signal does not support creating a follow-up task.');
      if (found.state === 'actioned') throw new ApiError(409, 'adaptive_already_actioned', 'This signal already created a task.');
      await requireCapability(db, context, 'relationships');
      const title = string(body.title, 'title', 200);
      const due = string(body.dueAt, 'dueAt', 40);
      const dueTime = adaptiveTimestamp(due);
      if (dueTime === null || dueTime < Date.parse(now) - DAY || dueTime > Date.parse(now) + 366 * DAY) throw new ApiError(400, 'validation_error', 'Choose a valid follow-up date within the next year.');
      integer(body.followUpDays, 'followUpDays', 1, 30);
      // Learn the actual reviewed due date, not a client-supplied behavioral claim.
      const days = Math.max(1, Math.min(30, Math.round((Date.parse(due) - Date.parse(now)) / DAY)));
      const recordId = crypto.randomUUID(); entityId = recordId;
      guard += " AND NOT EXISTS(SELECT 1 FROM adaptive_feedback WHERE workspace_id=? AND signal_id=? AND fingerprint=? AND state='actioned')";
      guardValues.push(workspaceId, found.id, found.fingerprint);
      guard += " AND NOT EXISTS(SELECT 1 FROM adaptive_receipts WHERE workspace_id=? AND action='followup.create' AND mutation_epoch=? AND json_extract(result_json,'$.signalId')=? AND json_extract(result_json,'$.signalFingerprint')=?)";
      guardValues.push(workspaceId, epoch, found.id, found.fingerprint);
      after.push(db.prepare("INSERT INTO records (id,workspace_id,object_type,name,status,lifecycle,owner_user_id,currency,source,priority,due_at,fields_json,tags_json,version,created_at,updated_at) VALUES (?,?,'task',?,'open','active',?,?,'Reviewed adaptive suggestion','medium',?,?,'[\"Reviewed\"]',1,?,?)").bind(recordId, workspaceId, title, identity.userId, context.workspace.currency, new Date(due).toISOString(), JSON.stringify({ adaptiveSignalId: found.id, sourceReferences: found.evidence.map(({ kind, id, version }) => ({ kind, id, version })) }), now, now));
      for (const reference of found.evidence.filter((item) => item.kind === 'record').slice(0, 2)) after.push(db.prepare("INSERT INTO record_links (workspace_id,source_id,target_id,relationship,label,created_at) VALUES (?,?,?,'follow_up','Reviewed follow-up',?)").bind(workspaceId, reference.id, recordId, now));
      after.push(feedbackWrite(db, workspaceId, found, 'actioned', null, now));
      if (current.learningEnabled && !current.paused) after.push(db.prepare("INSERT INTO adaptive_observations (workspace_id,id,signal_id,topic,outcome,followup_days,observed_at) VALUES (?,?,?,?,'follow-up',?,?) ON CONFLICT(workspace_id,signal_id,outcome) DO NOTHING").bind(workspaceId, crypto.randomUUID(), found.id, found.topic, days, now));
      after.push(db.prepare("INSERT INTO audit_events (id,workspace_id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,created_at) VALUES (?,?,?,'record.create','task',?,'{\"origin\":\"reviewed-adaptive-followup\"}',?,?)").bind(crypto.randomUUID(), workspaceId, identity.userId, recordId, identity.requestId, now));
      result = { recordId, created: true, signalId: found.id, signalFingerprint: found.fingerprint };
    }
  } else if (action === 'pack.set' || action === 'pack.rollback') {
    const pack = adaptivePackCatalog.find((item) => item.id === body.id);
    if (!pack) throw new ApiError(400, 'unsupported_pack', 'Only reviewed packs bundled with this installation can be activated.');
    entityId = pack.id;
    const existing = await db.prepare('SELECT * FROM adaptive_packs WHERE workspace_id=? AND pack_id=?').bind(workspaceId, pack.id).first<PackRow>();
    let enabled: boolean;
    if (action === 'pack.rollback') {
      if (!existing?.previous_version || existing.previous_enabled === null) throw new ApiError(409, 'rollback_unavailable', 'This pack has no prior activation state to restore.');
      if (existing.previous_version !== pack.version) throw new ApiError(409, 'rollback_version_unavailable', 'The prior code version is not bundled. Restore a tested application backup instead.');
      enabled = !!existing.previous_enabled;
    } else {
      if (body.version !== pack.version) throw new ApiError(409, 'pack_version_changed', 'Review the currently bundled pack version before activating.');
      enabled = boolean(body.enabled, 'enabled');
    }
    after.push(db.prepare('INSERT INTO adaptive_packs (workspace_id,pack_id,version,enabled,previous_version,previous_enabled,installed_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(workspace_id,pack_id) DO UPDATE SET version=excluded.version,enabled=excluded.enabled,previous_version=excluded.previous_version,previous_enabled=excluded.previous_enabled,installed_at=excluded.installed_at').bind(workspaceId, pack.id, pack.version, Number(enabled), existing?.version ?? pack.version, existing?.enabled ?? Number(adaptiveDefaultPackIds.includes(pack.id)), now));
  } else if (action === 'proposal.create' || action === 'proposal.dismiss') {
    if (action === 'proposal.dismiss') {
      const id = brainId(body.id);
      if (!(await db.prepare('SELECT id FROM adaptive_proposals WHERE workspace_id=? AND id=?').bind(workspaceId, id).first())) throw new ApiError(404, 'proposal_not_found', 'This proposal is unavailable.');
      after.push(db.prepare("UPDATE adaptive_proposals SET status='dismissed' WHERE workspace_id=? AND id=?").bind(workspaceId, id));
    } else {
      const row = await db.prepare('SELECT * FROM adaptive_releases WHERE workspace_id=? AND id=?').bind(workspaceId, string(body.releaseId, 'releaseId', 200)).first<ReleaseRow>();
      if (!row) throw new ApiError(404, 'release_not_found', 'This release is not in your inspected inventory.');
      const existing = await db.prepare('SELECT id FROM adaptive_proposals WHERE workspace_id=? AND release_id=?').bind(workspaceId, row.id).first<{ id: string }>();
      const id = existing?.id ?? crypto.randomUUID(); entityId = id;
      const title = `Evaluate: ${row.title}`.slice(0, 200);
      const problem = `Public announcement: ${row.url}\nPublished: ${row.published_at}\n\nVendor description (not independently verified):\n${row.body.slice(0, 5000)}\n\nEvaluation and acceptance criteria:\n1. Identify the user problem and verify the advertised behavior.\n2. Check whether an existing reviewed FREE CRM pack already solves it.\n3. Design an original, portable implementation if a real gap remains.\n4. Specify required permissions, storage, credentials, licenses and operating costs.\n5. Add tenant isolation, regression, safety and migration tests.\n6. Review a separate code change and compatibility/recovery plan before release.\n\nThis is a local proposal, not an installed capability or a submitted GitHub issue.`;
      after.push(db.prepare("INSERT INTO adaptive_proposals (workspace_id,id,release_id,title,problem,status,created_at) VALUES (?,?,?,?,?,'proposed',?) ON CONFLICT(workspace_id,release_id) DO UPDATE SET status='proposed'").bind(workspaceId, id, row.id, title, problem, now));
      result = { proposalId: id };
    }
  } else if (action === 'refresh') {
    if (!current.watchEnabled || current.paused || !current.watchProjects.length) return { refreshed: false, reason: current.paused ? 'paused' : 'off' };
    const due = nextScan(current);
    if (due && due > now) return { refreshed: false, nextScanAt: due };
    const discovered = await fetchCapabilityReleases(current.watchProjects, signal);
    next.lastScanAt = now; next.lastScanError = discovered.errors.length ? `${discovered.errors.length} public source(s) unavailable; previous inventory retained for failed sources.` : null;
    const rows = await db.prepare('SELECT * FROM adaptive_releases WHERE workspace_id=? ORDER BY published_at DESC LIMIT 20').bind(workspaceId).all<ReleaseRow>();
    const protectedRows = await db.prepare("SELECT release_id FROM adaptive_proposals WHERE workspace_id=? AND status='proposed' LIMIT 20").bind(workspaceId).all<{ release_id: string }>();
    const protectedIds = new Set(protectedRows.results.map((item) => item.release_id));
    const failed = new Set(discovered.errors.map((item) => item.projectId));
    const retained = rows.results.map(release).filter((item) => protectedIds.has(item.id) || failed.has(item.projectId));
    const inventory = [...new Map([...retained, ...discovered.releases].map((item) => [item.id, item])).values()].sort((a, b) => Number(protectedIds.has(b.id)) - Number(protectedIds.has(a.id)) || b.publishedAt.localeCompare(a.publishedAt)).slice(0, 20);
    after.push(db.prepare("DELETE FROM adaptive_proposals WHERE workspace_id=? AND status='dismissed'").bind(workspaceId));
    after.push(db.prepare(`DELETE FROM adaptive_releases WHERE workspace_id=?${inventory.length ? ` AND id NOT IN (${inventory.map(() => '?').join(',')})` : ''}`).bind(workspaceId, ...inventory.map((item) => item.id)));
    for (const item of inventory) after.push(db.prepare('INSERT INTO adaptive_releases (workspace_id,id,project_id,title,version,body,url,published_at,fetched_at,topics_json,suggested_pack_ids_json) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,id) DO UPDATE SET title=excluded.title,version=excluded.version,body=excluded.body,url=excluded.url,published_at=excluded.published_at,fetched_at=excluded.fetched_at,topics_json=excluded.topics_json,suggested_pack_ids_json=excluded.suggested_pack_ids_json').bind(workspaceId, item.id, item.projectId, item.title, item.version, item.body, item.url, item.publishedAt, item.fetchedAt, JSON.stringify(item.topics), JSON.stringify(item.suggestedPackIds)));
    result = { refreshed: true, errors: discovered.errors.length };
  }
  signal?.throwIfAborted();
  // Bounded retention is part of each write, not an unbounded telemetry archive.
  const cleanup = [
    db.prepare('DELETE FROM adaptive_observations WHERE workspace_id=? AND (observed_at<? OR id NOT IN (SELECT id FROM adaptive_observations WHERE workspace_id=? ORDER BY observed_at DESC,id LIMIT 498))').bind(workspaceId, new Date(Date.parse(now) - 30 * DAY).toISOString(), workspaceId),
    db.prepare('DELETE FROM adaptive_feedback WHERE workspace_id=? AND signal_id NOT IN (SELECT signal_id FROM adaptive_feedback WHERE workspace_id=? ORDER BY updated_at DESC,signal_id LIMIT 998)').bind(workspaceId, workspaceId),
  ];
  try {
    await db.batch(assertD1BatchSize([
      settingsWrite(db, workspaceId, next, current.revision, now, guard, guardValues),
      db.prepare('INSERT INTO adaptive_receipts (workspace_id,operation_id,fingerprint,action,result_json,affected,mutation_epoch,created_at) VALUES (?,?,?,?,?,changes(),?,?)').bind(workspaceId, operationId, hash, action, JSON.stringify(result), epoch, now),
      ...cleanup, ...after,
      db.prepare("INSERT INTO audit_events (id,workspace_id,actor_user_id,action,entity_type,entity_id,metadata_json,request_id,created_at) VALUES (?,?,?,?,'adaptive',?,'{}',?,?)").bind(crypto.randomUUID(), workspaceId, identity.userId, `adaptive.${action}`, entityId, identity.requestId, now),
      workspaceMutationFence(db, workspaceId, epoch, `adaptive:${operationId}`, now),
    ], `Adaptive CRM ${action}`));
  } catch (error) {
    const recovered = await replay();
    if (recovered) return recovered.result;
    throw normalizeAdaptiveError(error);
  }
  return materialize(db, workspaceId, result);
}

async function askAdaptive(db: D1Database, context: WorkspaceContext, identity: RequestIdentity, question: string, signal?: AbortSignal): Promise<AdaptiveAnswer> {
  const epoch = await captureWorkspaceMutationEpoch(db, context.workspaceId);
  const policy = await db.prepare('SELECT enabled,revision FROM brain_settings WHERE workspace_id=?').bind(context.workspaceId).first<{ enabled: number; revision: number }>();
  const snapshot = await readAdaptiveSnapshot(db, context, identity);
  const active = snapshot.signals.filter((item) => ['new', 'useful'].includes(item.state)).slice(0, 6);
  if (!snapshot.localAiEnabled || snapshot.settings.paused) {
    const learningQuestion = /learn|remember|know about me|adapt|preference/i.test(question);
    const text = learningQuestion ? [snapshot.settings.learningEnabled ? `Learning is on. ${snapshot.observationCount} recent observations are available.` : 'Learning is off. I do not infer preferences from your browsing.', ...snapshot.learning.map((item) => item.explanation), snapshot.followUpExplanation, 'Use Learning controls to correct your focus, pin follow-up timing, pause or forget observations.'] : active.length ? ['Here is your current evidence-based briefing, not an AI-generated answer.', ...active.slice(0, snapshot.settings.digestSize).map((item) => `${item.title}\n${item.why}`), 'Open a source to verify it. Any task needs your explicit review and confirmation.'] : ['No current signals match your workspace yet. Capture a note with a possible commitment, add a dated CRM task or activity, or opt into a public release source.'];
    return { answer: text.join('\n\n'), citations: active.flatMap((item) => item.evidence).slice(0, 8), mode: 'guide' };
  }
  const contextPassages = active.map((item, index) => ({ id: `briefing-${index}`, sourceId: item.id, title: item.title, text: `${item.detail}\nWhy relevant: ${item.why}\nEvidence: ${item.evidence.map((evidence) => `${evidence.title}: ${evidence.excerpt}`).join('\n')}`.slice(0, 2000), ordinal: index }));
  contextPassages.push({ id: 'learning-state', sourceId: 'learning-state', title: 'Inspectable workspace preferences', text: JSON.stringify({ goals: snapshot.settings.goals, focus: snapshot.settings.focus, learning: snapshot.learning, followUpDays: snapshot.effectiveFollowUpDays, explanation: snapshot.followUpExplanation }).slice(0, 2000), ordinal: 6 });
  const generated = await generateGroundedAnswer(brainConfig(), question, contextPassages, [], true, signal);
  const current = await readAdaptiveSnapshot(db, context, identity);
  const currentPolicy = await db.prepare('SELECT enabled,revision FROM brain_settings WHERE workspace_id=?').bind(context.workspaceId).first<{ enabled: number; revision: number }>();
  const currentEpoch = await captureWorkspaceMutationEpoch(db, context.workspaceId);
  if (currentEpoch !== epoch || !policy?.enabled || currentPolicy?.revision !== policy.revision || current.settings.revision !== snapshot.settings.revision || !current.localAiEnabled || current.settings.paused || active.some((item) => !current.signals.some((fresh) => fresh.id === item.id && fresh.fingerprint === item.fingerprint))) throw new ApiError(409, 'adaptive_evidence_changed', 'Your evidence or consent changed during this answer. Ask again with the current briefing.');
  return { answer: generated.answer, citations: active.flatMap((item, index) => generated.citationIds.includes(`briefing-${index}`) ? item.evidence : []).slice(0, 12), mode: 'local-ai' };
}

export async function exportAdaptive(db: D1Database, context: WorkspaceContext, identity: RequestIdentity) {
  requirePermission(context.workspace.role, 'data:export');
  const workspaceId = context.workspaceId;
  const tables = ['adaptive_settings', 'adaptive_observations', 'adaptive_feedback', 'adaptive_packs', 'adaptive_releases', 'adaptive_proposals'] as const;
  const now = new Date().toISOString();
  const rows = await db.batch([...tables.map((table) => table === 'adaptive_observations' ? db.prepare(`SELECT * FROM ${table} WHERE workspace_id=? AND observed_at>=? AND observed_at<=?`).bind(workspaceId, new Date(Date.parse(now) - 30 * DAY).toISOString(), now) : db.prepare(`SELECT * FROM ${table} WHERE workspace_id=?`).bind(workspaceId)), db.prepare("INSERT INTO audit_events (id,workspace_id,actor_user_id,action,entity_type,metadata_json,request_id,created_at) VALUES (?,?,?,'adaptive.export','adaptive','{}',?,?)").bind(crypto.randomUUID(), workspaceId, identity.userId, identity.requestId, now)]);
  return { format: 'free-crm-adaptive', version: 1, exportedAt: new Date().toISOString(), ...Object.fromEntries(tables.map((table, index) => [table.replace('adaptive_', ''), rows[index].results])) };
}

export function normalizeAdaptiveError(error: unknown): unknown {
  if (error instanceof ApiError) return error;
  if (error instanceof BrainAiError) return new ApiError(503, error.code, error.message);
  if (error instanceof Error && error.name === 'AbortError') return new ApiError(499, 'request_cancelled', 'The request was cancelled.');
  const description = String(error);
  if (description.includes('adaptive_write_conflict')) return new ApiError(409, 'adaptive_write_conflict', 'Settings or evidence changed while this action was running. Refresh before retrying.');
  if (description.includes('adaptive_capacity') || /record capability limit|workspace record limit|record link capacity/.test(description)) return new ApiError(409, 'adaptive_capacity', 'This workspace reached a supported capacity. Export and remove items you no longer need.');
  if (description.includes('FOREIGN KEY constraint failed')) return new ApiError(409, 'adaptive_evidence_changed', 'A referenced source is no longer available.');
  if (description.includes('UNIQUE constraint failed')) return new ApiError(409, 'adaptive_conflict', 'This item already exists. Refresh before retrying.');
  return normalizeMutationFenceError(error);
}
