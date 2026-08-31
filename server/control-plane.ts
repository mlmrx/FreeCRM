import type { AgentRunSummary, AgentSummary, ApprovalSummary, AuditEvent, ConnectorSummary, ExecutionReceiptSummary, Integration, IntegrationJob, ModuleConfig, CRMWorkspace, WorkflowRule, WorkflowRun } from '@/lib/crm-platform';
import { parseJson } from '@/lib/crm-platform';
import { resolveCapabilities, type CapabilityKey, type CapabilityOverride } from '@/lib/multi-edition';
import { platformLimits } from '@/lib/platform-limits';
import type { RequestIdentity } from './request-context';
import { ApiError } from './request-context';
import { assertD1BatchSize } from './d1-limits';
import { seedStatements } from './seed';

type WorkspaceRow = {
  id: string;
  owner_email: string;
  owner_name: string | null;
  name: string;
  timezone: string;
  currency: string;
  locale: string;
  settings_json: string;
  created_at: string;
  updated_at: string;
  role: CRMWorkspace['role'];
  profile: CRMWorkspace['profile'];
};

export type WorkspaceContext = {
  workspaceId: string;
  workspace: CRMWorkspace;
};

const workspaceOwnerNamespace = 'FREE-CRM:first-workspace-owner:v1';

async function initialWorkspaceId(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${workspaceOwnerNamespace}\n${userId}`),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `workspace-${hex}`;
}

export async function ensureWorkspace(db: D1Database, identity: RequestIdentity): Promise<WorkspaceContext> {
  let row = await db.prepare(`
    SELECT w.id, w.owner_email, w.owner_name, w.name, w.profile, w.timezone, w.currency, w.locale,
           w.settings_json, w.created_at, w.updated_at, m.role
    FROM memberships m
    JOIN workspaces w ON w.id = m.workspace_id
    WHERE m.user_id = ?
    ORDER BY w.created_at ASC
    LIMIT 1
  `).bind(identity.userId).first<WorkspaceRow>();

  if (!row) {
    // First-load requests can race across isolates. A deterministic, opaque ID
    // makes the workspace primary key the concurrency winner, after which the
    // losing request recovers the committed membership below. Existing owners
    // return above, so their workspace IDs are never rewritten.
    const workspaceId = await initialWorkspaceId(identity.userId);
    const now = new Date().toISOString();
    const workspaceName = identity.displayName === identity.email ? 'My FREE CRM' : `${identity.displayName}'s CRM`;
    const statements = [
      db.prepare(`
        INSERT INTO workspaces (
          id, owner_user_id, owner_email, owner_name, name, timezone, currency, locale, settings_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'America/Los_Angeles', 'USD', 'en-US', ?, ?, ?)
      `).bind(workspaceId, identity.userId, identity.email, identity.displayName, workspaceName, JSON.stringify({ demo: true, numbering: { quote: 'Q-{YYYY}-{SEQ}', invoice: 'INV-{YYYY}-{SEQ}' } }), now, now),
      db.prepare(`
        INSERT INTO memberships (workspace_id, user_id, email, role, created_at)
        VALUES (?, ?, ?, 'owner', ?)
      `).bind(workspaceId, identity.userId, identity.email, now),
      ...seedStatements(db, workspaceId, identity, 'USD'),
    ];
    try {
      await db.batch(assertD1BatchSize(statements, 'Workspace first install'));
    } catch (error) {
      const winner = await db.prepare(`SELECT w.id,w.owner_email,w.owner_name,w.name,w.profile,w.timezone,w.currency,w.locale,w.settings_json,w.created_at,w.updated_at,m.role FROM memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=? ORDER BY w.created_at LIMIT 1`).bind(identity.userId).first<WorkspaceRow>();
      if (!winner) throw error;
      row = winner;
    }

    if (!row) row = await db.prepare(`
      SELECT w.id, w.owner_email, w.owner_name, w.name, w.profile, w.timezone, w.currency, w.locale,
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
      ownerName: row.owner_name?.trim() || row.owner_email.split('@')[0] || row.owner_email,
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

export async function loadControlPlane(db: D1Database, workspaceId: string, profile: CRMWorkspace['profile'] = 'personal', resetOperationId: string | null = null) {
  const [modules, integrationsResult, jobs, workflowsResult, runs, auditResult, overrideResult, agentsResult, toolsResult, agentRunsResult, approvalsResult, receiptsResult, connectorsResult, resetResult, resetReceiptResult] = await Promise.all([
    db.prepare('SELECT module_key, enabled, position, config_json FROM module_configs WHERE workspace_id = ? ORDER BY position').bind(workspaceId).all<ModuleRow>(),
    db.prepare("SELECT * FROM integrations WHERE workspace_id = ? AND provider <> 'csv' ORDER BY name").bind(workspaceId).all<IntegrationRow>(),
    db.prepare('SELECT * FROM integration_jobs WHERE workspace_id = ? ORDER BY started_at DESC LIMIT 30').bind(workspaceId).all<IntegrationJobRow>(),
    db.prepare('SELECT * FROM workflow_rules WHERE workspace_id = ? ORDER BY created_at').bind(workspaceId).all<WorkflowRow>(),
    db.prepare('SELECT * FROM workflow_runs WHERE workspace_id = ? ORDER BY started_at DESC LIMIT 30').bind(workspaceId).all<WorkflowRunRow>(),
    db.prepare('SELECT id, action, entity_type, entity_id, metadata_json, request_id, created_at FROM audit_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100').bind(workspaceId).all<AuditRow>(),
    db.prepare('SELECT capability_key, enabled FROM capability_overrides WHERE workspace_id = ?').bind(workspaceId).all<{ capability_key: CapabilityKey; enabled: number }>(),
    db.prepare(`SELECT ai.id, a.display_name, ai.autonomy_level, ai.status, ai.monthly_budget_cents, ai.spent_cents, ai.emergency_stopped_at FROM agent_identities ai JOIN actors a ON a.workspace_id = ai.workspace_id AND a.id = ai.actor_id WHERE ai.workspace_id = ? ORDER BY ai.created_at LIMIT ?`).bind(workspaceId, platformLimits.workspaceAgents + 1).all<{ id: string; display_name: string; autonomy_level: string; status: string; monthly_budget_cents: number; spent_cents: number; emergency_stopped_at: string | null }>(),
    db.prepare(`SELECT g.agent_id,t.id,t.name,t.external,t.enabled,g.scopes_json FROM agent_tool_grants g JOIN agent_tools t ON t.workspace_id=g.workspace_id AND t.id=g.tool_id WHERE g.workspace_id=? ORDER BY t.name`).bind(workspaceId).all<{ agent_id: string; id: string; name: string; external: number; enabled: number; scopes_json: string }>(),
    db.prepare('SELECT id, agent_id, status, created_at, finished_at FROM agent_runs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50').bind(workspaceId).all<{ id: string; agent_id: string; status: string; created_at: string; finished_at: string | null }>(),
    db.prepare('SELECT id, run_id, status, action_summary, expires_at, created_at FROM approval_requests WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50').bind(workspaceId).all<{ id: string; run_id: string; status: string; action_summary: string; expires_at: string; created_at: string }>(),
    db.prepare('SELECT id, run_id, outcome, cost_cents, metadata_json, created_at FROM execution_receipts WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50').bind(workspaceId).all<{ id: string; run_id: string; outcome: string; cost_cents: number; metadata_json: string; created_at: string }>(),
    db.prepare('SELECT id,connector_key,auth_type,status,health,scopes_json,sync_cursor,retry_count,last_error_code,updated_at FROM connector_connections WHERE workspace_id=? ORDER BY connector_key').bind(workspaceId).all<{ id: string; connector_key: string; auth_type: string; status: string; health: string; scopes_json: string; sync_cursor: string | null; retry_count: number; last_error_code: string | null; updated_at: string }>(),
    db.prepare("SELECT operation_id,mode,status,lease_expires_at,updated_at,last_error_code FROM workspace_maintenance_sessions WHERE workspace_id=? AND purpose='reset' AND status IN ('running','failed') LIMIT 1").bind(workspaceId).first<{ operation_id: string; mode: 'clean' | 'demo'; status: 'running' | 'failed'; lease_expires_at: string | null; updated_at: string; last_error_code: string | null }>(),
    resetOperationId
      ? db.prepare("SELECT operation_id,mode,updated_at FROM workspace_reset_operations WHERE workspace_id=? AND operation_id=? AND status='completed' LIMIT 1").bind(workspaceId, resetOperationId).first<{ operation_id: string; mode: 'clean' | 'demo'; updated_at: string }>()
      : Promise.resolve(null),
  ]);

  if (agentsResult.results.length > platformLimits.workspaceAgents) {
    throw new ApiError(409, 'workspace_agent_limit', `This release supports up to ${platformLimits.workspaceAgents} agent identities per workspace.`);
  }

  const overrides = Object.fromEntries(overrideResult.results.map((row) => [row.capability_key, Boolean(row.enabled)])) as CapabilityOverride;

  return {
    capabilities: resolveCapabilities(profile, overrides),
    agents: agentsResult.results.map((row): AgentSummary => ({ id: row.id, name: row.display_name, autonomy: row.autonomy_level, status: row.status, monthlyBudgetCents: row.monthly_budget_cents, spentCents: row.spent_cents, emergencyStoppedAt: row.emergency_stopped_at, tools: toolsResult.results.filter((tool) => tool.agent_id === row.id).map((tool) => ({ id: tool.id, name: tool.name, external: Boolean(tool.external), enabled: Boolean(tool.enabled), scopes: parseJson(tool.scopes_json, []) })) })),
    agentRuns: agentRunsResult.results.map((row): AgentRunSummary => ({ id: row.id, agentId: row.agent_id, status: row.status, createdAt: row.created_at, finishedAt: row.finished_at })),
    approvals: approvalsResult.results.map((row): ApprovalSummary => ({ id: row.id, runId: row.run_id, status: row.status, actionSummary: row.action_summary, expiresAt: row.expires_at, createdAt: row.created_at })),
    executionReceipts: receiptsResult.results.map((row): ExecutionReceiptSummary => {
      const raw = parseJson<{ output?: { summary?: unknown; recordCounts?: unknown; executedAt?: unknown } }>(row.metadata_json, {});
      const summary = typeof raw.output?.summary === 'string' ? raw.output.summary.slice(0, 500) : null;
      const executedAt = typeof raw.output?.executedAt === 'string' && !Number.isNaN(Date.parse(raw.output.executedAt)) ? raw.output.executedAt : null;
      const recordCounts = raw.output?.recordCounts && typeof raw.output.recordCounts === 'object' && !Array.isArray(raw.output.recordCounts)
        ? Object.fromEntries(Object.entries(raw.output.recordCounts).slice(0, 20).filter((entry): entry is [string, number] => entry[0].length <= 64 && Number.isSafeInteger(entry[1]) && (entry[1] as number) >= 0))
        : {};
      return { id: row.id, runId: row.run_id, outcome: row.outcome, costCents: row.cost_cents, createdAt: row.created_at, output: summary && executedAt ? { summary, recordCounts, executedAt } : null };
    }),
    connectorConnections: connectorsResult.results.map((row): ConnectorSummary => ({ id: row.id, connectorKey: row.connector_key, authType: row.auth_type, status: row.status, health: row.health, scopes: parseJson(row.scopes_json, []), syncCursor: row.sync_cursor, retryCount: row.retry_count, lastErrorCode: row.last_error_code, updatedAt: row.updated_at })),
    resetState: resetResult ? { operationId: resetResult.operation_id, mode: resetResult.mode, status: resetResult.status, leaseExpiresAt: resetResult.lease_expires_at, updatedAt: resetResult.updated_at, lastErrorCode: resetResult.last_error_code } : null,
    resetReceipt: resetReceiptResult ? { operationId: resetReceiptResult.operation_id, mode: resetReceiptResult.mode, completedAt: resetReceiptResult.updated_at } : null,
    modules: modules.results.map((row): ModuleConfig => ({ moduleKey: row.module_key, enabled: Boolean(row.enabled), position: row.position, config: parseJson(row.config_json, {}) })),
    integrations: integrationsResult.results.map((row): Integration => ({
      id: row.id,
      provider: row.provider,
      name: row.name,
      status: row.status,
      authType: row.auth_type,
      syncDirection: row.sync_direction,
      config: (() => {
        const raw = parseJson<Record<string, unknown>>(row.config_json, {});
        return {
          ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
          ...(typeof raw.configuredAt === 'string' ? { configuredAt: raw.configuredAt } : {}),
          endpointConfigured: typeof raw.webhookUrl === 'string' && raw.webhookUrl.length > 0,
        };
      })(),
      lastSyncAt: row.last_sync_at,
      nextSyncAt: row.next_sync_at,
      lastError: row.last_error ? 'The integration reported an error. Review provider logs with an administrator.' : null,
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
