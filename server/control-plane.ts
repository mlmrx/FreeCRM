import type { AuditEvent, Integration, IntegrationJob, ModuleConfig, CRMWorkspace, WorkflowRule, WorkflowRun } from '@/lib/crm-platform';
import { parseJson } from '@/lib/crm-platform';
import type { RequestIdentity } from './request-context';
import { ApiError } from './request-context';
import { seedStatements } from './seed';

type WorkspaceRow = {
  id: string;
  owner_email: string;
  name: string;
  timezone: string;
  currency: string;
  locale: string;
  settings_json: string;
  created_at: string;
  updated_at: string;
  role: 'owner' | 'admin' | 'member';
  profile: 'personal' | 'business' | 'enterprise';
};

export type WorkspaceContext = {
  workspaceId: string;
  workspace: CRMWorkspace;
};

export async function ensureWorkspace(db: D1Database, identity: RequestIdentity): Promise<WorkspaceContext> {
  let row = await db.prepare(`
    SELECT w.id, w.owner_email, w.name, w.profile, w.timezone, w.currency, w.locale,
           w.settings_json, w.created_at, w.updated_at, m.role
    FROM memberships m
    JOIN workspaces w ON w.id = m.workspace_id
    WHERE m.user_id = ?
    ORDER BY w.created_at ASC
    LIMIT 1
  `).bind(identity.userId).first<WorkspaceRow>();

  if (!row) {
    const workspaceId = crypto.randomUUID();
    const now = new Date().toISOString();
    const workspaceName = identity.displayName === identity.email ? 'My FREE CRM' : `${identity.displayName}'s CRM`;
    const statements = [
      db.prepare(`
        INSERT INTO workspaces (
          id, owner_user_id, owner_email, name, timezone, currency, locale, settings_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'America/Los_Angeles', 'USD', 'en-US', ?, ?, ?)
      `).bind(workspaceId, identity.userId, identity.email, workspaceName, JSON.stringify({ demo: true, dataMode: 'cloud', numbering: { quote: 'Q-{YYYY}-{SEQ}', invoice: 'INV-{YYYY}-{SEQ}' } }), now, now),
      db.prepare(`
        INSERT INTO memberships (workspace_id, user_id, email, role, created_at)
        VALUES (?, ?, ?, 'owner', ?)
      `).bind(workspaceId, identity.userId, identity.email, now),
      ...seedStatements(db, workspaceId, identity),
    ];
    await db.batch(statements);

    row = await db.prepare(`
      SELECT w.id, w.owner_email, w.name, w.profile, w.timezone, w.currency, w.locale,
             w.settings_json, w.created_at, w.updated_at, m.role
      FROM memberships m
      JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.user_id = ? AND w.id = ?
      LIMIT 1
    `).bind(identity.userId, workspaceId).first<WorkspaceRow>();
  }

  if (!row) throw new ApiError(500, 'workspace_unavailable', 'The workspace could not be initialized.');

  return {
    workspaceId: row.id,
    workspace: {
      id: row.id,
      name: row.name,
      ownerEmail: row.owner_email,
      ownerName: identity.displayName,
      role: row.role,
      profile: row.profile,
      timezone: row.timezone,
      currency: row.currency,
      locale: row.locale,
      settings: parseJson(row.settings_json, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  };
}

type ModuleRow = { module_key: string; enabled: number; position: number; config_json: string };
type IntegrationRow = {
  id: string;
  provider: string;
  name: string;
  status: Integration['status'];
  auth_type: string;
  sync_direction: string;
  config_json: string;
  last_sync_at: string | null;
  next_sync_at: string | null;
  last_error: string | null;
  updated_at: string;
};
type IntegrationJobRow = {
  id: string;
  integration_id: string;
  direction: string;
  status: string;
  processed: number;
  failed: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};
type WorkflowRow = {
  id: string;
  name: string;
  enabled: number;
  trigger_type: string;
  conditions_json: string;
  actions_json: string;
  last_run_at: string | null;
  updated_at: string;
};
type WorkflowRunRow = {
  id: string;
  workflow_id: string;
  record_id: string | null;
  status: string;
  output_json: string;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};
type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata_json: string;
  request_id: string;
  created_at: string;
};

export async function loadControlPlane(db: D1Database, workspaceId: string) {
  const [modules, integrationsResult, jobs, workflowsResult, runs, auditResult] = await Promise.all([
    db.prepare('SELECT module_key, enabled, position, config_json FROM module_configs WHERE workspace_id = ? ORDER BY position').bind(workspaceId).all<ModuleRow>(),
    db.prepare('SELECT * FROM integrations WHERE workspace_id = ? ORDER BY name').bind(workspaceId).all<IntegrationRow>(),
    db.prepare('SELECT * FROM integration_jobs WHERE workspace_id = ? ORDER BY started_at DESC LIMIT 30').bind(workspaceId).all<IntegrationJobRow>(),
    db.prepare('SELECT * FROM workflow_rules WHERE workspace_id = ? ORDER BY created_at').bind(workspaceId).all<WorkflowRow>(),
    db.prepare('SELECT * FROM workflow_runs WHERE workspace_id = ? ORDER BY started_at DESC LIMIT 30').bind(workspaceId).all<WorkflowRunRow>(),
    db.prepare('SELECT id, action, entity_type, entity_id, metadata_json, request_id, created_at FROM audit_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100').bind(workspaceId).all<AuditRow>(),
  ]);

  return {
    modules: modules.results.map((row): ModuleConfig => ({ moduleKey: row.module_key, enabled: Boolean(row.enabled), position: row.position, config: parseJson(row.config_json, {}) })),
    integrations: integrationsResult.results.map((row): Integration => ({
      id: row.id,
      provider: row.provider,
      name: row.name,
      status: row.status,
      authType: row.auth_type,
      syncDirection: row.sync_direction,
      config: parseJson(row.config_json, {}),
      lastSyncAt: row.last_sync_at,
      nextSyncAt: row.next_sync_at,
      lastError: row.last_error,
      updatedAt: row.updated_at,
    })),
    integrationJobs: jobs.results.map((row): IntegrationJob => ({
      id: row.id,
      integrationId: row.integration_id,
      direction: row.direction,
      status: row.status,
      processed: row.processed,
      failed: row.failed,
      error: row.error,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    })),
    workflows: workflowsResult.results.map((row): WorkflowRule => ({
      id: row.id,
      name: row.name,
      enabled: Boolean(row.enabled),
      triggerType: row.trigger_type,
      conditions: parseJson(row.conditions_json, []),
      actions: parseJson(row.actions_json, []),
      lastRunAt: row.last_run_at,
      updatedAt: row.updated_at,
    })),
    workflowRuns: runs.results.map((row): WorkflowRun => ({
      id: row.id,
      workflowId: row.workflow_id,
      recordId: row.record_id,
      status: row.status,
      output: parseJson(row.output_json, {}),
      error: row.error,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    })),
    audit: auditResult.results.map((row): AuditEvent => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: parseJson(row.metadata_json, {}),
      requestId: row.request_id,
      createdAt: row.created_at,
    })),
  };
}
