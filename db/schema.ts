import { sql } from 'drizzle-orm';
import { blob, check, foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
};

/**
 * Infrastructure-scoped replay claims for the Vercel -> D1 data-plane RPC.
 * They are intentionally not tenant data: one nonce must be unique across
 * every Worker isolate before a mutating batch can execute.
 */
export const d1RpcNonceClaims = sqliteTable('d1_rpc_nonce_claims', {
  nonce: text('nonce').primaryKey(),
  claimedAt: integer('claimed_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, (table) => [
  index('idx_d1_rpc_nonce_claims_expiry').on(table.expiresAt),
  check('d1_rpc_nonce_claims_nonce_check', sql`length(${table.nonce}) = 36`),
  check('d1_rpc_nonce_claims_expiry_check', sql`${table.claimedAt} >= 0 AND ${table.expiresAt} >= ${table.claimedAt}`),
]);

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id').notNull(),
  ownerEmail: text('owner_email').notNull(),
  ownerName: text('owner_name'),
  name: text('name').notNull(),
  profile: text('profile').notNull().default('personal'),
  timezone: text('timezone').notNull().default('America/Los_Angeles'),
  currency: text('currency').notNull().default('USD'),
  locale: text('locale').notNull().default('en-US'),
  settingsJson: text('settings_json').notNull().default('{}'),
  mutationEpoch: integer('mutation_epoch').notNull().default(0),
  ...timestamps,
}, (table) => [
  uniqueIndex('uq_workspaces_owner_user').on(table.ownerUserId),
]);

export const workspaceMaintenanceSessions = sqliteTable('workspace_maintenance_sessions', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  purpose: text('purpose').notNull(),
  token: text('token').notNull(),
  mode: text('mode'),
  operationId: text('operation_id'),
  status: text('status'),
  leaseToken: text('lease_token'),
  leaseExpiresAt: text('lease_expires_at'),
  responseJson: text('response_json'),
  lastErrorCode: text('last_error_code'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.purpose] }),
  check('workspace_maintenance_purpose_check', sql`${table.purpose} IN ('seed','reset')`),
  check('workspace_maintenance_token_check', sql`length(${table.token}) BETWEEN 32 AND 128`),
  check('workspace_maintenance_reset_state_check', sql`${table.purpose} = 'seed' OR (${table.mode} IN ('clean','demo') AND length(${table.operationId}) = 36 AND ${table.status} IN ('running','failed','completed') AND (${table.responseJson} IS NULL OR json_valid(${table.responseJson}) = 1))`),
]);

/** Durable reset receipts prevent a delayed retry from replaying an older destructive operation. */
export const workspaceResetOperations = sqliteTable('workspace_reset_operations', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  operationId: text('operation_id').notNull(),
  mode: text('mode').notNull(),
  token: text('token').notNull(),
  leaseToken: text('lease_token'),
  status: text('status').notNull().default('running'),
  responseJson: text('response_json'),
  lastErrorCode: text('last_error_code'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.operationId] }),
  uniqueIndex('uq_workspace_reset_token').on(table.workspaceId, table.token),
  check('workspace_reset_operation_id_check', sql`length(${table.operationId}) = 36`),
  check('workspace_reset_mode_check', sql`${table.mode} IN ('clean','demo')`),
  check('workspace_reset_token_check', sql`length(${table.token}) BETWEEN 32 AND 128`),
  check('workspace_reset_status_check', sql`${table.status} IN ('running','failed','completed')`),
  check('workspace_reset_lease_check', sql`(${table.status} = 'failed' AND ${table.leaseToken} IS NULL) OR (${table.status} IN ('running','completed') AND length(${table.leaseToken}) BETWEEN 32 AND 128)`),
  check('workspace_reset_response_check', sql`${table.responseJson} IS NULL OR json_valid(${table.responseJson}) = 1`),
]);

/**
 * Durable cross-store receipts for document uploads. Bytes may live in R2 while
 * searchable metadata lives in D1, so reset and compensation paths coordinate
 * through this tenant-scoped state machine.
 */
export const uploadIntents = sqliteTable('upload_intents', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  id: text('id').notNull(),
  objectKey: text('object_key').notNull(),
  mutationEpoch: integer('mutation_epoch').notNull(),
  status: text('status').notNull().default('pending'),
  leaseExpiresAt: text('lease_expires_at'),
  lastErrorCode: text('last_error_code'),
  cleanupAttempts: integer('cleanup_attempts').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.id] }),
  uniqueIndex('uq_upload_intents_workspace_object').on(table.workspaceId, table.objectKey),
  index('idx_upload_intents_workspace_epoch_status').on(table.workspaceId, table.mutationEpoch, table.status, table.leaseExpiresAt),
  check('upload_intents_epoch_check', sql`${table.mutationEpoch} >= 0`),
  check('upload_intents_status_check', sql`${table.status} IN ('pending','committed','cleanup_pending','cleaned')`),
  check('upload_intents_object_key_check', sql`length(${table.objectKey}) BETWEEN length(${table.workspaceId}) + 2 AND 1029 AND substr(${table.objectKey}, 1, length(${table.workspaceId}) + 1) = ${table.workspaceId} || '/'`),
  check('upload_intents_lease_check', sql`(${table.status} = 'pending' AND ${table.leaseExpiresAt} IS NOT NULL) OR (${table.status} <> 'pending' AND ${table.leaseExpiresAt} IS NULL)`),
  check('upload_intents_error_check', sql`(${table.status} = 'cleanup_pending' AND length(${table.lastErrorCode}) BETWEEN 1 AND 64) OR (${table.status} <> 'cleanup_pending' AND ${table.lastErrorCode} IS NULL)`),
  check('upload_intents_cleanup_attempts_check', sql`${table.cleanupAttempts} >= 0`),
]);

/** One bounded row per tenant lets every mutation batch assert its captured epoch. */
export const workspaceMutationFences = sqliteTable('workspace_mutation_fences', {
  workspaceId: text('workspace_id').primaryKey().references(() => workspaces.id, { onDelete: 'cascade' }),
  mutationEpoch: integer('mutation_epoch').notNull(),
  operationId: text('operation_id').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  check('workspace_mutation_fences_epoch_check', sql`${table.mutationEpoch} >= 0`),
  check('workspace_mutation_fences_operation_check', sql`length(${table.operationId}) BETWEEN 1 AND 160`),
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

export const recordMutationClaims = sqliteTable('record_mutation_claims', {
  workspaceId: text('workspace_id').notNull(),
  recordId: text('record_id').notNull(),
  expectedVersion: integer('expected_version').notNull(),
  operationId: text('operation_id').notNull(),
  claimedAt: text('claimed_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.recordId, table.expectedVersion] }),
  foreignKey({ name: 'fk_record_mutation_claim_record', columns: [table.workspaceId, table.recordId], foreignColumns: [records.workspaceId, records.id] }).onDelete('cascade'),
  index('idx_record_mutation_claim_operation').on(table.workspaceId, table.operationId),
]);

export const invoicePayments = sqliteTable('invoice_payments', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  invoiceId: text('invoice_id').notNull(),
  amountCents: integer('amount_cents').notNull(),
  recordedBy: text('recorded_by').notNull(),
  recordedAt: text('recorded_at').notNull(),
  requestId: text('request_id').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  foreignKey({ name: 'fk_invoice_payments_invoice_workspace', columns: [table.workspaceId, table.invoiceId], foreignColumns: [records.workspaceId, records.id] }).onDelete('cascade'),
  index('idx_invoice_payments_workspace_invoice').on(table.workspaceId, table.invoiceId, table.recordedAt),
  uniqueIndex('uq_invoice_payments_workspace_request').on(table.workspaceId, table.requestId),
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

// Knowledge is tenant-owned application data, separate from agent execution and provider configuration.
export const brainSources = sqliteTable('brain_sources', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  id: text('id').notNull(), title: text('title').notNull(), body: text('body').notNull(),
  kind: text('kind').notNull().default('note'), sourceUrl: text('source_url'),
  tagsJson: text('tags_json').notNull().default('[]'), pinned: integer('pinned').notNull().default(0),
  version: integer('version').notNull().default(1), ...timestamps,
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.id] }),
  index('idx_brain_sources_updated').on(table.workspaceId, table.updatedAt),
  check('brain_source_title', sql`length(${table.title}) BETWEEN 1 AND 200`),
  check('brain_source_body', sql`length(${table.body}) BETWEEN 1 AND 40000`),
  check('brain_source_kind', sql`${table.kind} IN ('note','clip','import')`),
  check('brain_source_tags', sql`json_valid(${table.tagsJson}) AND json_type(${table.tagsJson})='array' AND length(${table.tagsJson})<=2048`),
  check('brain_source_version', sql`${table.version}>=1 AND ${table.pinned} IN (0,1)`),
]);

export const brainChunks = sqliteTable('brain_chunks', {
  workspaceId: text('workspace_id').notNull(), id: text('id').notNull(), sourceId: text('source_id').notNull(),
  ordinal: integer('ordinal').notNull(), content: text('content').notNull(),
  embedding: blob('embedding'), embeddingModel: text('embedding_model'),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.id] }),
  uniqueIndex('uq_brain_chunk_ordinal').on(table.workspaceId, table.sourceId, table.ordinal),
  foreignKey({ columns: [table.workspaceId, table.sourceId], foreignColumns: [brainSources.workspaceId, brainSources.id] }).onDelete('cascade'),
  check('brain_chunk_bound', sql`${table.ordinal} BETWEEN 0 AND 39 AND length(${table.content}) BETWEEN 1 AND 2000`),
  check('brain_embedding_bound', sql`(${table.embedding} IS NULL AND ${table.embeddingModel} IS NULL) OR (${table.embedding} IS NOT NULL AND ${table.embeddingModel} IS NOT NULL AND length(${table.embedding}) BETWEEN 4 AND 4096 AND length(${table.embedding})%4=0)`),
]);

export const brainLinks = sqliteTable('brain_links', {
  workspaceId: text('workspace_id').notNull(), sourceId: text('source_id').notNull(), targetId: text('target_id').notNull(),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.sourceId, table.targetId] }),
  foreignKey({ columns: [table.workspaceId, table.sourceId], foreignColumns: [brainSources.workspaceId, brainSources.id] }).onDelete('cascade'),
  foreignKey({ columns: [table.workspaceId, table.targetId], foreignColumns: [brainSources.workspaceId, brainSources.id] }).onDelete('cascade'),
  check('brain_link_distinct', sql`${table.sourceId}<>${table.targetId}`),
]);

export const brainRecordLinks = sqliteTable('brain_record_links', {
  workspaceId: text('workspace_id').notNull(), sourceId: text('source_id').notNull(), recordId: text('record_id').notNull(),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.sourceId, table.recordId] }),
  foreignKey({ columns: [table.workspaceId, table.sourceId], foreignColumns: [brainSources.workspaceId, brainSources.id] }).onDelete('cascade'),
  foreignKey({ columns: [table.workspaceId, table.recordId], foreignColumns: [records.workspaceId, records.id] }).onDelete('cascade'),
]);

export const brainConversations = sqliteTable('brain_conversations', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  id: text('id').notNull(), title: text('title').notNull(), version: integer('version').notNull().default(0), ...timestamps,
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.id] }),
  index('idx_brain_conversations_updated').on(table.workspaceId, table.updatedAt),
  check('brain_conversation_title', sql`length(${table.title}) BETWEEN 1 AND 200`),
]);

export const brainMessages = sqliteTable('brain_messages', {
  workspaceId: text('workspace_id').notNull(), id: text('id').notNull(), conversationId: text('conversation_id').notNull(),
  role: text('role').notNull(), content: text('content').notNull(), citationsJson: text('citations_json').notNull().default('[]'),
  contextSourceIdsJson: text('context_source_ids_json').notNull().default('[]'),
  mode: text('mode').notNull(), createdAt: text('created_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.id] }),
  index('idx_brain_messages_conversation').on(table.workspaceId, table.conversationId, table.createdAt),
  foreignKey({ columns: [table.workspaceId, table.conversationId], foreignColumns: [brainConversations.workspaceId, brainConversations.id] }).onDelete('cascade'),
  check('brain_message_role', sql`${table.role} IN ('user','assistant')`),
  check('brain_message_mode', sql`${table.mode} IN ('question','search','ollama')`),
  check('brain_message_content', sql`length(${table.content}) BETWEEN 1 AND 24000`),
  check('brain_message_citations', sql`json_valid(${table.citationsJson}) AND json_type(${table.citationsJson})='array' AND length(${table.citationsJson})<=40000`),
  check('brain_message_context_sources', sql`json_valid(${table.contextSourceIdsJson}) AND json_type(${table.contextSourceIdsJson})='array' AND json_array_length(${table.contextSourceIdsJson})<=8 AND length(${table.contextSourceIdsJson})<=512`),
]);

export const brainSettings = sqliteTable('brain_settings', {
  workspaceId: text('workspace_id').primaryKey().references(() => workspaces.id, { onDelete: 'cascade' }),
  enabled: integer('enabled').notNull().default(0), revision: integer('revision').notNull().default(1),
  updatedAt: text('updated_at').notNull(),
}, (table) => [check('brain_settings_enabled', sql`${table.enabled} IN (0,1) AND ${table.revision}>=1`)]);

/** Payload hashes and result identifiers only; never retain deleted source/chat content in receipts. */
export const brainReceipts = sqliteTable('brain_receipts', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  operationId: text('operation_id').notNull(), fingerprint: text('fingerprint').notNull(),
  action: text('action').notNull(), resultJson: text('result_json').notNull(), affected: integer('affected').notNull(),
  mutationEpoch: integer('mutation_epoch').notNull(), createdAt: text('created_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.operationId] }),
  index('idx_brain_receipts_created').on(table.workspaceId, table.createdAt),
  check('brain_write_conflict', sql`${table.affected}=1`),
  check('brain_receipt_result', sql`json_valid(${table.resultJson}) AND length(${table.resultJson})<=1024`),
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
  index('idx_audit_events_workspace_created_id').on(table.workspaceId, table.createdAt, table.id),
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

// Multi-edition shared kernel. Composite primary/foreign keys keep every graph edge tenant-local.
export const capabilityOverrides = sqliteTable('capability_overrides', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }), capabilityKey: text('capability_key').notNull(), enabled: integer('enabled', { mode: 'boolean' }).notNull(), configJson: text('config_json').notNull().default('{}'), updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.capabilityKey] })]);

export const actors = sqliteTable('actors', {
  id: text('id').notNull(), workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }), kind: text('kind').notNull(), displayName: text('display_name').notNull(), status: text('status').notNull().default('active'), metadataJson: text('metadata_json').notNull().default('{}'), ...timestamps,
}, (t) => [primaryKey({ columns: [t.workspaceId, t.id] }), index('idx_actors_workspace_kind').on(t.workspaceId, t.kind, t.status), check('actors_kind_check', sql`${t.kind} IN ('human','organization','service','agent')`)]);

export const partyRelationships = sqliteTable('party_relationships', {
  id: text('id').notNull(), workspaceId: text('workspace_id').notNull(), sourceActorId: text('source_actor_id').notNull(), targetActorId: text('target_actor_id').notNull(), relationshipType: text('relationship_type').notNull(), validFrom: text('valid_from'), validTo: text('valid_to'), metadataJson: text('metadata_json').notNull().default('{}'), createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.id] }), foreignKey({ columns: [t.workspaceId, t.sourceActorId], foreignColumns: [actors.workspaceId, actors.id] }).onDelete('cascade'), foreignKey({ columns: [t.workspaceId, t.targetActorId], foreignColumns: [actors.workspaceId, actors.id] }).onDelete('cascade'), index('idx_party_relationships_workspace_source').on(t.workspaceId, t.sourceActorId)]);

export const timelineActivities = sqliteTable('timeline_activities', {
  id: text('id').notNull(), workspaceId: text('workspace_id').notNull(), actorId: text('actor_id'), subjectType: text('subject_type').notNull(), subjectId: text('subject_id').notNull(), activityType: text('activity_type').notNull(), occurredAt: text('occurred_at').notNull(), summary: text('summary').notNull(), metadataJson: text('metadata_json').notNull().default('{}'), createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.id] }), foreignKey({ columns: [t.workspaceId, t.actorId], foreignColumns: [actors.workspaceId, actors.id] }).onDelete('set null'), index('idx_timeline_workspace_subject').on(t.workspaceId, t.subjectType, t.subjectId, t.occurredAt)]);

export const workObjects = sqliteTable('work_objects', {
  id: text('id').notNull(), workspaceId: text('workspace_id').notNull(), kind: text('kind').notNull(), title: text('title').notNull(), status: text('status').notNull().default('open'), ownerActorId: text('owner_actor_id'), dataJson: text('data_json').notNull().default('{}'), ...timestamps,
}, (t) => [primaryKey({ columns: [t.workspaceId, t.id] }), foreignKey({ columns: [t.workspaceId, t.ownerActorId], foreignColumns: [actors.workspaceId, actors.id] }).onDelete('set null'), index('idx_work_objects_workspace_kind_status').on(t.workspaceId, t.kind, t.status), check('work_objects_kind_check', sql`${t.kind} IN ('work_item','opportunity','case','artifact','goal','policy')`)]);

export const agentIdentities = sqliteTable('agent_identities', {
  id: text('id').notNull(), workspaceId: text('workspace_id').notNull(), actorId: text('actor_id').notNull(), ownerActorId: text('owner_actor_id').notNull(), autonomyLevel: text('autonomy_level').notNull().default('observe'), status: text('status').notNull().default('paused'), monthlyBudgetCents: integer('monthly_budget_cents').notNull().default(0), spentCents: integer('spent_cents').notNull().default(0), emergencyStoppedAt: text('emergency_stopped_at'), ...timestamps,
}, (t) => [primaryKey({ columns: [t.workspaceId, t.id] }), foreignKey({ columns: [t.workspaceId, t.actorId], foreignColumns: [actors.workspaceId, actors.id] }).onDelete('cascade'), foreignKey({ columns: [t.workspaceId, t.ownerActorId], foreignColumns: [actors.workspaceId, actors.id] }).onDelete('restrict'), index('idx_agents_workspace_status').on(t.workspaceId, t.status)]);

/** Immutable, tenant-local policy history. Saving a revision activates it and invalidates old work. */
export const agentPolicyVersions = sqliteTable('agent_policy_versions', {
  workspaceId: text('workspace_id').notNull(),
  agentId: text('agent_id').notNull(),
  version: integer('version').notNull(),
  documentJson: text('document_json').notNull(),
  operationId: text('operation_id').notNull(),
  requestHash: text('request_hash').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [
  primaryKey({ columns: [t.workspaceId, t.agentId, t.version] }),
  foreignKey({ columns: [t.workspaceId, t.agentId], foreignColumns: [agentIdentities.workspaceId, agentIdentities.id] }).onDelete('restrict'),
  uniqueIndex('uq_agent_policy_operation').on(t.workspaceId, t.agentId, t.operationId),
  check('agent_policy_version_range', sql`${t.version} BETWEEN 1 AND 200`),
  check('agent_policy_document_json', sql`json_valid(${t.documentJson}) AND length(${t.documentJson})<=16000`),
]);

export const agentGoals = sqliteTable('agent_goals', {
  id: text('id').notNull(), workspaceId: text('workspace_id').notNull(), agentId: text('agent_id').notNull(), title: text('title').notNull(), status: text('status').notNull().default('active'), successJson: text('success_json').notNull().default('{}'), createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.id] }), foreignKey({ columns: [t.workspaceId, t.agentId], foreignColumns: [agentIdentities.workspaceId, agentIdentities.id] }).onDelete('cascade')]);

export const agentTools = sqliteTable('agent_tools', {
  id: text('id').notNull(), workspaceId: text('workspace_id').notNull(), name: text('name').notNull(), transport: text('transport').notNull(), external: integer('external', { mode: 'boolean' }).notNull().default(true), scopesJson: text('scopes_json').notNull().default('[]'), inputSchemaJson: text('input_schema_json').notNull().default('{}'), enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false), createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.id] })]);

export const agentRuns = sqliteTable('agent_runs', {
  id: text('id').notNull(), workspaceId: text('workspace_id').notNull(), agentId: text('agent_id').notNull(), goalId: text('goal_id'), toolId: text('tool_id'), actionJson: text('action_json').notNull().default('{}'), status: text('status').notNull().default('proposed'), budgetReservedCents: integer('budget_reserved_cents').notNull().default(0), idempotencyKey: text('idempotency_key').notNull(), requestHash: text('request_hash'), startedAt: text('started_at'), finishedAt: text('finished_at'), createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.id] }), foreignKey({ columns: [t.workspaceId, t.agentId], foreignColumns: [agentIdentities.workspaceId, agentIdentities.id] }).onDelete('cascade'), foreignKey({ columns: [t.workspaceId, t.goalId], foreignColumns: [agentGoals.workspaceId, agentGoals.id] }).onDelete('set null'), uniqueIndex('uq_agent_runs_workspace_idempotency').on(t.workspaceId, t.idempotencyKey), index('idx_agent_runs_workspace_status').on(t.workspaceId, t.status, t.createdAt)]);

export const agentToolGrants = sqliteTable('agent_tool_grants', {
  workspaceId: text('workspace_id').notNull(), agentId: text('agent_id').notNull(), toolId: text('tool_id').notNull(), scopesJson: text('scopes_json').notNull().default('[]'), expiresAt: text('expires_at'), createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.agentId, t.toolId] }), foreignKey({ columns: [t.workspaceId, t.agentId], foreignColumns: [agentIdentities.workspaceId, agentIdentities.id] }).onDelete('cascade'), foreignKey({ columns: [t.workspaceId, t.toolId], foreignColumns: [agentTools.workspaceId, agentTools.id] }).onDelete('cascade')]);

export const approvalRequests = sqliteTable('approval_requests', {
  id: text('id').notNull(), workspaceId: text('workspace_id').notNull(), runId: text('run_id').notNull(), requestedByActorId: text('requested_by_actor_id').notNull(), decidedByActorId: text('decided_by_actor_id'), status: text('status').notNull().default('pending'), actionSummary: text('action_summary').notNull(), expiresAt: text('expires_at').notNull(), decisionId: text('decision_id'), decidedAt: text('decided_at'), createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.id] }), foreignKey({ columns: [t.workspaceId, t.runId], foreignColumns: [agentRuns.workspaceId, agentRuns.id] }).onDelete('cascade'), index('idx_approvals_workspace_status').on(t.workspaceId, t.status, t.expiresAt), uniqueIndex('uq_approval_workspace_decision').on(t.workspaceId, t.decisionId).where(sql`${t.decisionId} IS NOT NULL`), uniqueIndex('uq_approval_workspace_run').on(t.workspaceId, t.runId)]);

export const executionReceipts = sqliteTable('execution_receipts', {
  id: text('id').notNull(), workspaceId: text('workspace_id').notNull(), runId: text('run_id').notNull(), toolId: text('tool_id').notNull(), outcome: text('outcome').notNull(), inputHash: text('input_hash').notNull(), outputHash: text('output_hash'), costCents: integer('cost_cents').notNull().default(0), metadataJson: text('metadata_json').notNull().default('{}'), createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.id] }), foreignKey({ columns: [t.workspaceId, t.runId], foreignColumns: [agentRuns.workspaceId, agentRuns.id] }).onDelete('restrict'), foreignKey({ columns: [t.workspaceId, t.toolId], foreignColumns: [agentTools.workspaceId, agentTools.id] }).onDelete('restrict'), index('idx_receipts_workspace_run').on(t.workspaceId, t.runId, t.createdAt), uniqueIndex('uq_execution_receipts_workspace_run').on(t.workspaceId, t.runId)]);

export const agentTraces = sqliteTable('agent_traces', {
  id: text('id').notNull(), workspaceId: text('workspace_id').notNull(), runId: text('run_id').notNull(), sequence: integer('sequence').notNull(), eventType: text('event_type').notNull(), detailJson: text('detail_json').notNull().default('{}'), createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.id] }), foreignKey({ columns: [t.workspaceId, t.runId], foreignColumns: [agentRuns.workspaceId, agentRuns.id] }).onDelete('cascade'), uniqueIndex('uq_agent_traces_workspace_sequence').on(t.workspaceId, t.runId, t.sequence)]);

export const connectorConnections = sqliteTable('connector_connections', {
  id: text('id').notNull(), workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }), connectorKey: text('connector_key').notNull(), authType: text('auth_type').notNull(), credentialRef: text('credential_ref'), credentialMetadataJson: text('credential_metadata_json').notNull().default('{}'), scopesJson: text('scopes_json').notNull().default('[]'), status: text('status').notNull().default('disconnected'), health: text('health').notNull().default('unknown'), syncCursor: text('sync_cursor'), retryCount: integer('retry_count').notNull().default(0), lastErrorCode: text('last_error_code'), ...timestamps, credentialGeneration: integer('credential_generation').notNull().default(0), webhookReceiptCount: integer('webhook_receipt_count').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.id] }), uniqueIndex('uq_connectors_workspace_key').on(t.workspaceId, t.connectorKey)]);

export const connectorSyncClaims = sqliteTable('connector_sync_claims', {
  workspaceId: text('workspace_id').notNull(),
  connectionId: text('connection_id').notNull(),
  expectedCursor: text('expected_cursor').notNull(),
  operationId: text('operation_id').notNull(),
  claimedAt: text('claimed_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  primaryKey({ columns: [t.workspaceId, t.connectionId, t.expectedCursor] }),
  foreignKey({ columns: [t.workspaceId, t.connectionId], foreignColumns: [connectorConnections.workspaceId, connectorConnections.id] }).onDelete('cascade'),
  index('idx_connector_sync_claim_operation').on(t.workspaceId, t.operationId),
]);

export const webhookDeliveries = sqliteTable('webhook_deliveries', {
  id: text('id').notNull(), workspaceId: text('workspace_id').notNull(), connectionId: text('connection_id').notNull(), providerDeliveryId: text('provider_delivery_id').notNull(), status: text('status').notNull().default('received'), attempts: integer('attempts').notNull().default(0), payloadHash: text('payload_hash').notNull(), receivedAt: text('received_at').notNull().default(sql`CURRENT_TIMESTAMP`), processedAt: text('processed_at'), credentialGeneration: integer('credential_generation').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.id] }), foreignKey({ columns: [t.workspaceId, t.connectionId], foreignColumns: [connectorConnections.workspaceId, connectorConnections.id] }).onDelete('cascade'), uniqueIndex('uq_webhooks_workspace_delivery').on(t.workspaceId, t.connectionId, t.providerDeliveryId), index('idx_webhook_deliveries_retention').on(t.workspaceId, t.connectionId, t.receivedAt)]);

// Adaptive state belongs to one private workspace. Deleting settings scrubs every
// dependent adaptation; operational receipts contain only hashes/result IDs.
export const adaptiveSettings = sqliteTable('adaptive_settings', {
  workspaceId: text('workspace_id').primaryKey().references(() => workspaces.id, { onDelete: 'cascade' }),
  learningEnabled: integer('learning_enabled').notNull().default(0), autoAdapt: integer('auto_adapt').notNull().default(0),
  paused: integer('paused').notNull().default(0), goals: text('goals').notNull().default(''), focus: text('focus').notNull().default('balanced'),
  followupDays: integer('followup_days').notNull().default(3), followupPinned: integer('followup_pinned').notNull().default(0),
  digestSize: integer('digest_size').notNull().default(5), watchEnabled: integer('watch_enabled').notNull().default(0),
  watchProjectsJson: text('watch_projects_json').notNull().default('[]'), lastScanAt: text('last_scan_at'), lastScanError: text('last_scan_error'),
  revision: integer('revision').notNull().default(0), updatedAt: text('updated_at').notNull(),
}, (t) => [
  check('adaptive_settings_flags', sql`${t.learningEnabled} IN (0,1) AND ${t.autoAdapt} IN (0,1) AND ${t.paused} IN (0,1) AND ${t.followupPinned} IN (0,1) AND ${t.watchEnabled} IN (0,1)`),
  check('adaptive_settings_bounds', sql`${t.revision}>=0 AND ${t.followupDays} BETWEEN 1 AND 30 AND ${t.digestSize} BETWEEN 3 AND 20 AND length(${t.goals})<=500 AND length(CAST(${t.goals} AS BLOB))<=2000 AND (${t.lastScanError} IS NULL OR length(${t.lastScanError})<=500)`),
  check('adaptive_settings_focus', sql`${t.focus} IN ('balanced','relationships','sales','service','knowledge')`),
  check('adaptive_settings_projects', sql`json_valid(${t.watchProjectsJson}) AND json_type(${t.watchProjectsJson})='array' AND json_array_length(${t.watchProjectsJson})<=4 AND length(CAST(${t.watchProjectsJson} AS BLOB))<=512`),
]);

export const adaptiveFeedback = sqliteTable('adaptive_feedback', {
  workspaceId: text('workspace_id').notNull().references(() => adaptiveSettings.workspaceId, { onDelete: 'cascade' }),
  signalId: text('signal_id').notNull(), fingerprint: text('fingerprint').notNull(), state: text('state').notNull(),
  snoozedUntil: text('snoozed_until'), topic: text('topic').notNull(), updatedAt: text('updated_at').notNull(),
}, (t) => [
  primaryKey({ columns: [t.workspaceId, t.signalId] }), index('idx_adaptive_feedback_updated').on(t.workspaceId, t.updatedAt),
  check('adaptive_feedback_bounds', sql`length(${t.signalId}) BETWEEN 1 AND 200 AND length(${t.fingerprint})=64 AND ${t.fingerprint} NOT GLOB '*[^0-9a-f]*'`),
  check('adaptive_feedback_state', sql`${t.state} IN ('new','useful','dismissed','snoozed','actioned') AND ((${t.state}='snoozed' AND ${t.snoozedUntil} IS NOT NULL) OR (${t.state}<>'snoozed' AND ${t.snoozedUntil} IS NULL))`),
  check('adaptive_feedback_topic', sql`${t.topic} IN ('relationships','sales','service','knowledge')`),
]);

export const adaptiveObservations = sqliteTable('adaptive_observations', {
  workspaceId: text('workspace_id').notNull().references(() => adaptiveSettings.workspaceId, { onDelete: 'cascade' }),
  id: text('id').notNull(), signalId: text('signal_id').notNull(), topic: text('topic').notNull(),
  outcome: text('outcome').notNull(), followupDays: integer('followup_days'), observedAt: text('observed_at').notNull(),
}, (t) => [
  primaryKey({ columns: [t.workspaceId, t.id] }), uniqueIndex('uq_adaptive_observation_outcome').on(t.workspaceId, t.signalId, t.outcome),
  index('idx_adaptive_observations_observed').on(t.workspaceId, t.observedAt),
  check('adaptive_observation_bounds', sql`length(${t.id})=36 AND length(${t.signalId}) BETWEEN 1 AND 200`),
  check('adaptive_observation_topic', sql`${t.topic} IN ('relationships','sales','service','knowledge')`),
  check('adaptive_observation_outcome', sql`(${t.outcome} IN ('useful','dismissed') AND ${t.followupDays} IS NULL) OR (${t.outcome}='follow-up' AND ${t.followupDays} BETWEEN 1 AND 30 AND ${t.followupDays} IS NOT NULL)`),
]);

export const adaptivePacks = sqliteTable('adaptive_packs', {
  workspaceId: text('workspace_id').notNull().references(() => adaptiveSettings.workspaceId, { onDelete: 'cascade' }),
  packId: text('pack_id').notNull(), version: text('version').notNull(), enabled: integer('enabled').notNull(),
  previousVersion: text('previous_version'), previousEnabled: integer('previous_enabled'), installedAt: text('installed_at').notNull(),
}, (t) => [
  primaryKey({ columns: [t.workspaceId, t.packId] }),
  check('adaptive_pack_bounds', sql`length(${t.packId}) BETWEEN 1 AND 100 AND length(${t.version}) BETWEEN 1 AND 100 AND (${t.previousVersion} IS NULL OR length(${t.previousVersion}) BETWEEN 1 AND 100)`),
  check('adaptive_pack_flags', sql`${t.enabled} IN (0,1) AND (${t.previousEnabled} IS NULL OR ${t.previousEnabled} IN (0,1)) AND ((${t.previousVersion} IS NULL AND ${t.previousEnabled} IS NULL) OR (${t.previousVersion} IS NOT NULL AND ${t.previousEnabled} IS NOT NULL))`),
]);

export const adaptiveReleases = sqliteTable('adaptive_releases', {
  workspaceId: text('workspace_id').notNull().references(() => adaptiveSettings.workspaceId, { onDelete: 'cascade' }),
  id: text('id').notNull(), projectId: text('project_id').notNull(), title: text('title').notNull(), version: text('version').notNull(),
  body: text('body').notNull(), url: text('url').notNull(), publishedAt: text('published_at').notNull(), fetchedAt: text('fetched_at').notNull(),
  topicsJson: text('topics_json').notNull().default('[]'), suggestedPackIdsJson: text('suggested_pack_ids_json').notNull().default('[]'),
}, (t) => [
  primaryKey({ columns: [t.workspaceId, t.id] }), index('idx_adaptive_releases_published').on(t.workspaceId, t.publishedAt),
  check('adaptive_release_bounds', sql`length(${t.id}) BETWEEN 1 AND 200 AND length(${t.projectId}) BETWEEN 1 AND 100 AND length(${t.title}) BETWEEN 1 AND 200 AND length(${t.version}) BETWEEN 1 AND 100 AND length(${t.body})<=12000 AND length(${t.url}) BETWEEN 1 AND 2048 AND length(CAST(${t.title}||${t.version}||${t.body}||${t.url} AS BLOB))<=65536`),
  check('adaptive_release_topics', sql`json_valid(${t.topicsJson}) AND json_type(${t.topicsJson})='array' AND json_array_length(${t.topicsJson})<=4 AND length(CAST(${t.topicsJson} AS BLOB))<=256`),
  check('adaptive_release_packs', sql`json_valid(${t.suggestedPackIdsJson}) AND json_type(${t.suggestedPackIdsJson})='array' AND json_array_length(${t.suggestedPackIdsJson})<=20 AND length(CAST(${t.suggestedPackIdsJson} AS BLOB))<=2048`),
]);

export const adaptiveProposals = sqliteTable('adaptive_proposals', {
  workspaceId: text('workspace_id').notNull().references(() => adaptiveSettings.workspaceId, { onDelete: 'cascade' }),
  id: text('id').notNull(), releaseId: text('release_id').notNull(), title: text('title').notNull(), problem: text('problem').notNull(),
  status: text('status').notNull().default('proposed'), createdAt: text('created_at').notNull(),
}, (t) => [
  primaryKey({ columns: [t.workspaceId, t.id] }), uniqueIndex('uq_adaptive_proposal_release').on(t.workspaceId, t.releaseId),
  foreignKey({ columns: [t.workspaceId, t.releaseId], foreignColumns: [adaptiveReleases.workspaceId, adaptiveReleases.id] }).onDelete('cascade'),
  check('adaptive_proposal_bounds', sql`length(${t.id}) BETWEEN 1 AND 200 AND length(${t.title}) BETWEEN 1 AND 200 AND length(${t.problem}) BETWEEN 1 AND 12000 AND length(CAST(${t.title}||${t.problem} AS BLOB))<=65536`),
  check('adaptive_proposal_status', sql`${t.status} IN ('proposed','dismissed')`),
]);

export const adaptiveReceipts = sqliteTable('adaptive_receipts', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  operationId: text('operation_id').notNull(), fingerprint: text('fingerprint').notNull(), action: text('action').notNull(),
  resultJson: text('result_json').notNull(), affected: integer('affected').notNull(), mutationEpoch: integer('mutation_epoch').notNull(), createdAt: text('created_at').notNull(),
}, (t) => [
  primaryKey({ columns: [t.workspaceId, t.operationId] }), index('idx_adaptive_receipts_created').on(t.workspaceId, t.createdAt),
  check('adaptive_write_conflict', sql`${t.affected}=1`),
  check('adaptive_receipt_bounds', sql`length(${t.operationId})=36 AND length(${t.fingerprint})=64 AND ${t.fingerprint} NOT GLOB '*[^0-9a-f]*' AND length(${t.action}) BETWEEN 1 AND 64 AND ${t.mutationEpoch}>=0`),
  check('adaptive_receipt_result', sql`json_valid(${t.resultJson}) AND json_type(${t.resultJson})='object' AND length(CAST(${t.resultJson} AS BLOB))<=1024`),
]);
