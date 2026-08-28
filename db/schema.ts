import { sql } from 'drizzle-orm';
import { foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id').notNull(),
  ownerEmail: text('owner_email').notNull(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('America/Los_Angeles'),
  currency: text('currency').notNull().default('USD'),
  locale: text('locale').notNull().default('en-US'),
  settingsJson: text('settings_json').notNull().default('{}'),
  ...timestamps,
}, (table) => [
  uniqueIndex('uq_workspaces_owner_user').on(table.ownerUserId),
]);

export const memberships = sqliteTable('memberships', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  email: text('email').notNull(),
  role: text('role').notNull().default('owner'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.userId] }),
  index('idx_memberships_user_workspace').on(table.userId, table.workspaceId),
]);

export const moduleConfigs = sqliteTable('module_configs', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  moduleKey: text('module_key').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  position: integer('position').notNull().default(0),
  configJson: text('config_json').notNull().default('{}'),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.moduleKey] }),
  index('idx_module_configs_workspace_position').on(table.workspaceId, table.position),
]);

export const records = sqliteTable('records', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  objectType: text('object_type').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull().default('active'),
  lifecycle: text('lifecycle').notNull().default('active'),
  ownerUserId: text('owner_user_id').notNull(),
  email: text('email'),
  phone: text('phone'),
  companyName: text('company_name'),
  amountCents: integer('amount_cents').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  probability: integer('probability').notNull().default(0),
  source: text('source'),
  priority: text('priority'),
  dueAt: text('due_at'),
  closedAt: text('closed_at'),
  fieldsJson: text('fields_json').notNull().default('{}'),
  tagsJson: text('tags_json').notNull().default('[]'),
  version: integer('version').notNull().default(1),
  archivedAt: text('archived_at'),
  ...timestamps,
}, (table) => [
  uniqueIndex('uq_records_workspace_id').on(table.workspaceId, table.id),
  index('idx_records_workspace_type_updated').on(table.workspaceId, table.objectType, table.updatedAt),
  index('idx_records_workspace_type_status').on(table.workspaceId, table.objectType, table.status),
  index('idx_records_workspace_due').on(table.workspaceId, table.dueAt),
  index('idx_records_workspace_email').on(table.workspaceId, table.email),
  index('idx_records_workspace_company').on(table.workspaceId, table.companyName),
]);

export const recordLinks = sqliteTable('record_links', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  sourceId: text('source_id').notNull(),
  targetId: text('target_id').notNull(),
  relationship: text('relationship').notNull(),
  label: text('label'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.sourceId, table.targetId, table.relationship] }),
  foreignKey({ name: 'fk_record_links_source_workspace', columns: [table.workspaceId, table.sourceId], foreignColumns: [records.workspaceId, records.id] }).onDelete('cascade'),
  foreignKey({ name: 'fk_record_links_target_workspace', columns: [table.workspaceId, table.targetId], foreignColumns: [records.workspaceId, records.id] }).onDelete('cascade'),
  index('idx_record_links_workspace_source').on(table.workspaceId, table.sourceId),
  index('idx_record_links_workspace_target').on(table.workspaceId, table.targetId),
]);

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  recordId: text('record_id').notNull(),
  kind: text('kind').notNull().default('note'),
  body: text('body').notNull(),
  source: text('source').notNull().default('manual'),
  occurredAt: text('occurred_at').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  foreignKey({ name: 'fk_notes_record_workspace', columns: [table.workspaceId, table.recordId], foreignColumns: [records.workspaceId, records.id] }).onDelete('cascade'),
  index('idx_notes_workspace_record_occurred').on(table.workspaceId, table.recordId, table.occurredAt),
]);

export const workflowRules = sqliteTable('workflow_rules', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  triggerType: text('trigger_type').notNull(),
  conditionsJson: text('conditions_json').notNull().default('[]'),
  actionsJson: text('actions_json').notNull().default('[]'),
  lastRunAt: text('last_run_at'),
  ...timestamps,
}, (table) => [
  uniqueIndex('uq_workflow_rules_workspace_id').on(table.workspaceId, table.id),
  index('idx_workflow_rules_workspace_enabled').on(table.workspaceId, table.enabled),
]);

export const workflowRuns = sqliteTable('workflow_runs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  workflowId: text('workflow_id').notNull(),
  recordId: text('record_id'),
  status: text('status').notNull(),
  outputJson: text('output_json').notNull().default('{}'),
  error: text('error'),
  idempotencyKey: text('idempotency_key').notNull(),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
}, (table) => [
  foreignKey({ name: 'fk_workflow_runs_rule_workspace', columns: [table.workspaceId, table.workflowId], foreignColumns: [workflowRules.workspaceId, workflowRules.id] }).onDelete('cascade'),
  uniqueIndex('uq_workflow_runs_workspace_key').on(table.workspaceId, table.idempotencyKey),
  index('idx_workflow_runs_workspace_started').on(table.workspaceId, table.startedAt),
]);

export const integrations = sqliteTable('integrations', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull().default('disconnected'),
  authType: text('auth_type').notNull().default('oauth'),
  syncDirection: text('sync_direction').notNull().default('two_way'),
  configJson: text('config_json').notNull().default('{}'),
  lastSyncAt: text('last_sync_at'),
  nextSyncAt: text('next_sync_at'),
  lastError: text('last_error'),
  ...timestamps,
}, (table) => [
  uniqueIndex('uq_integrations_workspace_id').on(table.workspaceId, table.id),
  uniqueIndex('uq_integrations_workspace_provider').on(table.workspaceId, table.provider),
  index('idx_integrations_workspace_status').on(table.workspaceId, table.status),
]);

export const integrationJobs = sqliteTable('integration_jobs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  integrationId: text('integration_id').notNull(),
  direction: text('direction').notNull(),
  status: text('status').notNull(),
  cursor: text('cursor'),
  processed: integer('processed').notNull().default(0),
  failed: integer('failed').notNull().default(0),
  error: text('error'),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
}, (table) => [
  foreignKey({ name: 'fk_integration_jobs_integration_workspace', columns: [table.workspaceId, table.integrationId], foreignColumns: [integrations.workspaceId, integrations.id] }).onDelete('cascade'),
  index('idx_integration_jobs_workspace_started').on(table.workspaceId, table.startedAt),
  index('idx_integration_jobs_status').on(table.status, table.startedAt),
]);

export const auditEvents = sqliteTable('audit_events', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  actorUserId: text('actor_user_id').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  beforeJson: text('before_json'),
  afterJson: text('after_json'),
  metadataJson: text('metadata_json').notNull().default('{}'),
  requestId: text('request_id').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_audit_events_workspace_created').on(table.workspaceId, table.createdAt),
  index('idx_audit_events_workspace_entity').on(table.workspaceId, table.entityType, table.entityId),
]);

export const idempotencyRecords = sqliteTable('idempotency_records', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  operation: text('operation').notNull(),
  key: text('key').notNull(),
  requestHash: text('request_hash').notNull(),
  statusCode: integer('status_code').notNull(),
  responseJson: text('response_json').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  expiresAt: text('expires_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.operation, table.key] }),
  index('idx_idempotency_records_expiry').on(table.expiresAt),
]);

export const outboxEvents = sqliteTable('outbox_events', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  topic: text('topic').notNull(),
  payloadJson: text('payload_json').notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  availableAt: text('available_at').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_outbox_events_status_available').on(table.status, table.availableAt),
  index('idx_outbox_events_workspace_created').on(table.workspaceId, table.createdAt),
]);
