ALTER TABLE `workspaces` ADD `owner_name` text;
--> statement-breakpoint
ALTER TABLE `agent_runs` ADD `request_hash` text;
--> statement-breakpoint
ALTER TABLE `approval_requests` ADD `decision_id` text;
--> statement-breakpoint
ALTER TABLE `connector_connections` ADD `credential_generation` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `webhook_deliveries` ADD `credential_generation` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `agent_runs` SET `request_hash` = lower(hex(randomblob(32))) WHERE `request_hash` IS NULL;
--> statement-breakpoint
INSERT INTO `agent_traces` (`id`,`workspace_id`,`run_id`,`sequence`,`event_type`,`detail_json`,`created_at`)
SELECT lower(hex(randomblob(16))),r.`workspace_id`,r.`id`,COALESCE((SELECT MAX(t.`sequence`) + 1 FROM `agent_traces` t WHERE t.`workspace_id` = r.`workspace_id` AND t.`run_id` = r.`id`),1),'migration_cancelled','{"reason":"legacy_authorization_incomplete","requestHash":"migration-generated"}',CURRENT_TIMESTAMP
FROM `agent_runs` r
WHERE r.`status` IN ('proposed','constrained','awaiting_approval','authorized','running')
  AND (r.`tool_id` IS NULL OR json_valid(r.`action_json`) <> 1 OR COALESCE(json_type(r.`action_json`,'$.summary'),'') <> 'text' OR COALESCE(json_type(r.`action_json`,'$.scope'),'') <> 'text');
--> statement-breakpoint
UPDATE `approval_requests`
SET `status` = 'cancelled', `decided_at` = CURRENT_TIMESTAMP, `decision_id` = 'migration:0003:' || `id`
WHERE `status` = 'pending' AND EXISTS (
  SELECT 1 FROM `agent_runs` r
  WHERE r.`workspace_id` = `approval_requests`.`workspace_id` AND r.`id` = `approval_requests`.`run_id`
    AND r.`status` IN ('proposed','constrained','awaiting_approval','authorized','running')
    AND (r.`tool_id` IS NULL OR json_valid(r.`action_json`) <> 1 OR COALESCE(json_type(r.`action_json`,'$.summary'),'') <> 'text' OR COALESCE(json_type(r.`action_json`,'$.scope'),'') <> 'text')
);
--> statement-breakpoint
UPDATE `agent_runs`
SET `status` = 'cancelled', `finished_at` = CURRENT_TIMESTAMP
WHERE `status` IN ('proposed','constrained','awaiting_approval','authorized','running')
  AND (`tool_id` IS NULL OR json_valid(`action_json`) <> 1 OR COALESCE(json_type(`action_json`,'$.summary'),'') <> 'text' OR COALESCE(json_type(`action_json`,'$.scope'),'') <> 'text');
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_approval_workspace_decision` ON `approval_requests` (`workspace_id`,`decision_id`) WHERE `decision_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_approval_workspace_run` ON `approval_requests` (`workspace_id`,`run_id`);
--> statement-breakpoint
CREATE TABLE `workspace_maintenance_sessions` (`workspace_id` text NOT NULL,`purpose` text NOT NULL CHECK (`purpose` IN ('seed','reset')),`token` text NOT NULL CHECK (length(`token`) BETWEEN 32 AND 128),`mode` text,`operation_id` text,`status` text,`lease_token` text,`lease_expires_at` text,`response_json` text,`last_error_code` text,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,CHECK (`purpose` = 'seed' OR (`mode` IN ('clean','demo') AND length(`operation_id`) = 36 AND `status` IN ('running','failed','completed') AND (`response_json` IS NULL OR json_valid(`response_json`) = 1))),PRIMARY KEY(`workspace_id`,`purpose`),FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade);
--> statement-breakpoint
CREATE TABLE `record_mutation_claims` (`workspace_id` text NOT NULL,`record_id` text NOT NULL,`expected_version` integer NOT NULL,`operation_id` text NOT NULL,`claimed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,PRIMARY KEY(`workspace_id`,`record_id`,`expected_version`),FOREIGN KEY (`workspace_id`,`record_id`) REFERENCES `records`(`workspace_id`,`id`) ON DELETE cascade);
--> statement-breakpoint
CREATE INDEX `idx_record_mutation_claim_operation` ON `record_mutation_claims` (`workspace_id`,`operation_id`);
--> statement-breakpoint
CREATE TRIGGER `audit_events_reset_fence` BEFORE INSERT ON `audit_events`
WHEN EXISTS (SELECT 1 FROM `workspace_maintenance_sessions` WHERE `workspace_id` = NEW.`workspace_id` AND `purpose` = 'reset' AND `status` IN ('running','failed'))
  AND NEW.`action` NOT IN ('workspace.reset.storage_requested','workspace.seeded')
BEGIN SELECT RAISE(ABORT, 'workspace reset in progress'); END;
--> statement-breakpoint
CREATE TRIGGER `agent_traces_append_only_update` BEFORE UPDATE ON `agent_traces` BEGIN SELECT RAISE(ABORT, 'agent_traces are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `agent_traces_append_only_delete` BEFORE DELETE ON `agent_traces` BEGIN SELECT RAISE(ABORT, 'agent_traces are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `agent_identity_validate_insert` BEFORE INSERT ON `agent_identities`
WHEN NEW.`autonomy_level` NOT IN ('observe','suggest','prepare','approval-required','policy-autonomous')
  OR NEW.`status` NOT IN ('active','paused')
  OR NEW.`monthly_budget_cents` < 0
  OR NEW.`spent_cents` < 0
  OR NEW.`spent_cents` > NEW.`monthly_budget_cents`
  OR (NEW.`emergency_stopped_at` IS NOT NULL AND NEW.`status` <> 'paused')
  OR NOT EXISTS (SELECT 1 FROM `actors` WHERE `workspace_id` = NEW.`workspace_id` AND `id` = NEW.`actor_id` AND `kind` = 'agent')
  OR NOT EXISTS (SELECT 1 FROM `actors` WHERE `workspace_id` = NEW.`workspace_id` AND `id` = NEW.`owner_actor_id` AND `kind` = 'human')
BEGIN SELECT RAISE(ABORT, 'invalid agent identity state'); END;
--> statement-breakpoint
CREATE TRIGGER `agent_identity_validate_update` BEFORE UPDATE ON `agent_identities`
WHEN NEW.`autonomy_level` NOT IN ('observe','suggest','prepare','approval-required','policy-autonomous')
  OR NEW.`status` NOT IN ('active','paused')
  OR NEW.`monthly_budget_cents` < 0
  OR NEW.`spent_cents` < 0
  OR NEW.`spent_cents` > NEW.`monthly_budget_cents`
  OR (NEW.`emergency_stopped_at` IS NOT NULL AND NEW.`status` <> 'paused')
  OR NOT EXISTS (SELECT 1 FROM `actors` WHERE `workspace_id` = NEW.`workspace_id` AND `id` = NEW.`actor_id` AND `kind` = 'agent')
  OR NOT EXISTS (SELECT 1 FROM `actors` WHERE `workspace_id` = NEW.`workspace_id` AND `id` = NEW.`owner_actor_id` AND `kind` = 'human')
BEGIN SELECT RAISE(ABORT, 'invalid agent identity state'); END;
--> statement-breakpoint
CREATE TRIGGER `agent_identity_profile_limit` BEFORE INSERT ON `agent_identities`
WHEN EXISTS (SELECT 1 FROM `capability_overrides` WHERE `workspace_id` = NEW.`workspace_id` AND `capability_key` = 'agentPlane' AND `enabled` = 0)
  OR ((SELECT `profile` FROM `workspaces` WHERE `id` = NEW.`workspace_id`) = 'personal' AND (SELECT COUNT(*) FROM `agent_identities` WHERE `workspace_id` = NEW.`workspace_id`) >= 1)
  OR ((SELECT `profile` FROM `workspaces` WHERE `id` = NEW.`workspace_id`) = 'business' AND (SELECT COUNT(*) FROM `agent_identities` WHERE `workspace_id` = NEW.`workspace_id`) >= 10)
  OR ((SELECT `profile` FROM `workspaces` WHERE `id` = NEW.`workspace_id`) = 'enterprise' AND (SELECT COUNT(*) FROM `agent_identities` WHERE `workspace_id` = NEW.`workspace_id`) >= 100)
BEGIN SELECT RAISE(ABORT, 'agent capability limit exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER `agent_tools_workspace_insert` BEFORE INSERT ON `agent_tools`
WHEN NOT EXISTS (SELECT 1 FROM `workspaces` WHERE `id` = NEW.`workspace_id`)
BEGIN SELECT RAISE(ABORT, 'agent tool workspace is invalid'); END;
--> statement-breakpoint
CREATE TRIGGER `agent_tools_workspace_update` BEFORE UPDATE OF `workspace_id` ON `agent_tools`
WHEN NOT EXISTS (SELECT 1 FROM `workspaces` WHERE `id` = NEW.`workspace_id`)
BEGIN SELECT RAISE(ABORT, 'agent tool workspace is invalid'); END;
--> statement-breakpoint
CREATE TRIGGER `agent_tools_identity_restrict` BEFORE UPDATE OF `workspace_id`,`id` ON `agent_tools`
WHEN EXISTS (SELECT 1 FROM `agent_runs` WHERE `workspace_id` = OLD.`workspace_id` AND `tool_id` = OLD.`id`)
BEGIN SELECT RAISE(ABORT, 'agent tool identity is referenced by run history'); END;
--> statement-breakpoint
CREATE TRIGGER `agent_tools_history_restrict` BEFORE DELETE ON `agent_tools`
WHEN EXISTS (SELECT 1 FROM `agent_runs` WHERE `workspace_id` = OLD.`workspace_id` AND `tool_id` = OLD.`id`)
BEGIN SELECT RAISE(ABORT, 'agent tool is referenced by run history'); END;
--> statement-breakpoint
CREATE TRIGGER `agent_runs_validate_insert` BEFORE INSERT ON `agent_runs`
WHEN NEW.`tool_id` IS NULL
  OR NEW.`request_hash` IS NULL
  OR length(NEW.`request_hash`) <> 64
  OR NEW.`request_hash` GLOB '*[^0-9a-f]*'
  OR length(trim(NEW.`idempotency_key`)) NOT BETWEEN 1 AND 128
  OR NEW.`status` NOT IN ('proposed','constrained','awaiting_approval','authorized','running','succeeded','failed','rejected','expired','cancelled')
  OR NEW.`budget_reserved_cents` < 0
  OR CASE WHEN json_valid(NEW.`action_json`) = 1 THEN
       COALESCE(json_type(NEW.`action_json`, '$.summary'), '') <> 'text'
       OR length(trim(json_extract(NEW.`action_json`, '$.summary'))) NOT BETWEEN 1 AND 500
       OR COALESCE(json_type(NEW.`action_json`, '$.scope'), '') <> 'text'
       OR length(trim(json_extract(NEW.`action_json`, '$.scope'))) NOT BETWEEN 1 AND 120
       OR length(NEW.`action_json`) > 8192
     ELSE 1 END
  OR (NEW.`goal_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `agent_goals` WHERE `workspace_id` = NEW.`workspace_id` AND `id` = NEW.`goal_id` AND `agent_id` = NEW.`agent_id`))
  OR NOT EXISTS (
       SELECT 1 FROM `agent_tools` t
       JOIN `agent_tool_grants` g ON g.`workspace_id` = t.`workspace_id` AND g.`tool_id` = t.`id`
       WHERE t.`workspace_id` = NEW.`workspace_id` AND t.`id` = NEW.`tool_id` AND g.`agent_id` = NEW.`agent_id` AND t.`enabled` = 1
     )
  OR EXISTS (SELECT 1 FROM `capability_overrides` WHERE `workspace_id` = NEW.`workspace_id` AND `capability_key` = 'agentPlane' AND `enabled` = 0)
BEGIN SELECT RAISE(ABORT, 'invalid agent run'); END;
--> statement-breakpoint
CREATE TRIGGER `agent_runs_immutable_authorization` BEFORE UPDATE OF `workspace_id`,`id`,`agent_id`,`goal_id`,`tool_id`,`action_json`,`budget_reserved_cents`,`idempotency_key`,`request_hash`,`created_at` ON `agent_runs`
BEGIN SELECT RAISE(ABORT, 'agent run authorization is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `agent_runs_status_machine` BEFORE UPDATE OF `status` ON `agent_runs`
WHEN NEW.`status` <> OLD.`status` AND NOT (
     (OLD.`status` = 'proposed' AND NEW.`status` IN ('constrained','awaiting_approval','authorized','cancelled'))
  OR (OLD.`status` = 'awaiting_approval' AND NEW.`status` IN ('authorized','rejected','expired','cancelled'))
  OR (OLD.`status` = 'authorized' AND NEW.`status` IN ('running','succeeded','failed','cancelled'))
  OR (OLD.`status` = 'running' AND NEW.`status` IN ('succeeded','failed','cancelled'))
)
BEGIN SELECT RAISE(ABORT, 'invalid agent run transition'); END;
--> statement-breakpoint
CREATE TRIGGER `approvals_validate_insert` BEFORE INSERT ON `approval_requests`
WHEN NEW.`status` <> 'pending'
  OR NEW.`decision_id` IS NOT NULL
  OR NEW.`decided_by_actor_id` IS NOT NULL
  OR NEW.`decided_at` IS NOT NULL
  OR length(trim(NEW.`action_summary`)) NOT BETWEEN 1 AND 500
  OR julianday(NEW.`expires_at`) IS NULL
  OR NEW.`expires_at` <= NEW.`created_at`
  OR NOT EXISTS (SELECT 1 FROM `actors` WHERE `workspace_id` = NEW.`workspace_id` AND `id` = NEW.`requested_by_actor_id` AND `kind` = 'human')
  OR NOT EXISTS (SELECT 1 FROM `agent_runs` WHERE `workspace_id` = NEW.`workspace_id` AND `id` = NEW.`run_id` AND `status` = 'awaiting_approval')
BEGIN SELECT RAISE(ABORT, 'invalid approval request'); END;
--> statement-breakpoint
CREATE TRIGGER `approvals_finalize_once` BEFORE UPDATE ON `approval_requests`
WHEN OLD.`status` <> 'pending'
  OR NEW.`status` NOT IN ('approved','rejected','expired','cancelled')
  OR NEW.`workspace_id` <> OLD.`workspace_id`
  OR NEW.`id` <> OLD.`id`
  OR NEW.`run_id` <> OLD.`run_id`
  OR NEW.`requested_by_actor_id` <> OLD.`requested_by_actor_id`
  OR NEW.`action_summary` <> OLD.`action_summary`
  OR NEW.`expires_at` <> OLD.`expires_at`
  OR NEW.`created_at` <> OLD.`created_at`
  OR NEW.`decision_id` IS NULL
  OR NEW.`decided_at` IS NULL
  OR (NEW.`decided_by_actor_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `actors` WHERE `workspace_id` = NEW.`workspace_id` AND `id` = NEW.`decided_by_actor_id` AND `kind` = 'human'))
  OR (NEW.`status` IN ('approved','rejected') AND NEW.`decided_by_actor_id` IS NULL)
BEGIN SELECT RAISE(ABORT, 'invalid approval transition'); END;
--> statement-breakpoint
CREATE TRIGGER `approvals_append_only_delete` BEFORE DELETE ON `approval_requests`
BEGIN SELECT RAISE(ABORT, 'approval requests are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `execution_receipts_validate_insert` BEFORE INSERT ON `execution_receipts`
WHEN NEW.`outcome` NOT IN ('succeeded','failed')
  OR NEW.`cost_cents` < 0
  OR length(NEW.`input_hash`) <> 64
  OR NEW.`input_hash` GLOB '*[^0-9a-f]*'
  OR (NEW.`output_hash` IS NOT NULL AND (length(NEW.`output_hash`) <> 64 OR NEW.`output_hash` GLOB '*[^0-9a-f]*'))
  OR (NEW.`outcome` = 'succeeded' AND NEW.`output_hash` IS NULL)
  OR json_valid(NEW.`metadata_json`) <> 1
  OR length(NEW.`metadata_json`) > 16384
  OR NOT EXISTS (
       SELECT 1 FROM `agent_runs` r
       JOIN `agent_identities` ai ON ai.`workspace_id` = r.`workspace_id` AND ai.`id` = r.`agent_id`
       JOIN `agent_tools` t ON t.`workspace_id` = r.`workspace_id` AND t.`id` = r.`tool_id`
       JOIN `agent_tool_grants` g ON g.`workspace_id` = r.`workspace_id` AND g.`agent_id` = r.`agent_id` AND g.`tool_id` = r.`tool_id`
       WHERE r.`workspace_id` = NEW.`workspace_id`
         AND r.`id` = NEW.`run_id`
         AND r.`tool_id` = NEW.`tool_id`
         AND r.`status` = 'authorized'
         AND r.`budget_reserved_cents` = NEW.`cost_cents`
         AND ai.`status` = 'active'
         AND ai.`emergency_stopped_at` IS NULL
         AND ai.`spent_cents` + NEW.`cost_cents` <= ai.`monthly_budget_cents`
         AND t.`enabled` = 1
         AND t.`external` = 0
         AND t.`transport` = 'local-simulator'
         AND EXISTS (SELECT 1 FROM json_each(g.`scopes_json`) WHERE value = json_extract(r.`action_json`, '$.scope'))
         AND EXISTS (SELECT 1 FROM json_each(t.`scopes_json`) WHERE value = json_extract(r.`action_json`, '$.scope'))
         AND ((ai.`autonomy_level` = 'policy-autonomous' AND COALESCE(json_extract(r.`action_json`, '$.destructive'), 0) = 0) OR EXISTS (SELECT 1 FROM `approval_requests` ap WHERE ap.`workspace_id` = r.`workspace_id` AND ap.`run_id` = r.`id` AND ap.`status` = 'approved'))
         AND NOT EXISTS (SELECT 1 FROM `capability_overrides` c WHERE c.`workspace_id` = r.`workspace_id` AND c.`capability_key` = 'agentPlane' AND c.`enabled` = 0)
     )
BEGIN SELECT RAISE(ABORT, 'run is not executable'); END;
--> statement-breakpoint
CREATE TABLE `connector_sync_claims` (`workspace_id` text NOT NULL,`connection_id` text NOT NULL,`expected_cursor` text NOT NULL,`operation_id` text NOT NULL,`claimed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,PRIMARY KEY(`workspace_id`,`connection_id`,`expected_cursor`),FOREIGN KEY (`workspace_id`,`connection_id`) REFERENCES `connector_connections`(`workspace_id`,`id`) ON DELETE cascade);
--> statement-breakpoint
CREATE INDEX `idx_connector_sync_claim_operation` ON `connector_sync_claims` (`workspace_id`,`operation_id`);
--> statement-breakpoint
CREATE TRIGGER `connector_sync_claim_validate` BEFORE INSERT ON `connector_sync_claims`
WHEN NOT EXISTS (
  SELECT 1 FROM `connector_connections`
  WHERE `workspace_id` = NEW.`workspace_id`
    AND `id` = NEW.`connection_id`
    AND `status` = 'connected'
    AND COALESCE(`sync_cursor`, '') = NEW.`expected_cursor`
)
BEGIN SELECT RAISE(ABORT, 'connector sync state changed'); END;
--> statement-breakpoint
CREATE TABLE `invoice_payments` (`id` text PRIMARY KEY NOT NULL,`workspace_id` text NOT NULL,`invoice_id` text NOT NULL,`amount_cents` integer NOT NULL,`recorded_by` text NOT NULL,`recorded_at` text NOT NULL,`request_id` text NOT NULL,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,FOREIGN KEY (`workspace_id`,`invoice_id`) REFERENCES `records`(`workspace_id`,`id`) ON DELETE cascade);
--> statement-breakpoint
CREATE INDEX `idx_invoice_payments_workspace_invoice` ON `invoice_payments` (`workspace_id`,`invoice_id`,`recorded_at`);
--> statement-breakpoint
INSERT INTO `invoice_payments` (`id`,`workspace_id`,`invoice_id`,`amount_cents`,`recorded_by`,`recorded_at`,`request_id`,`created_at`)
SELECT lower(hex(randomblob(16))),`workspace_id`,`id`,MIN(CAST(json_extract(`fields_json`,'$.paidCents') AS integer),`amount_cents`),SUBSTR(COALESCE(NULLIF(TRIM(`owner_user_id`),''),'migration'),1,200),CASE WHEN julianday(COALESCE(json_extract(`fields_json`,'$.lastPaymentAt'),json_extract(`fields_json`,'$.paidAt'))) IS NOT NULL THEN COALESCE(json_extract(`fields_json`,'$.lastPaymentAt'),json_extract(`fields_json`,'$.paidAt')) WHEN julianday(`updated_at`) IS NOT NULL THEN `updated_at` ELSE CURRENT_TIMESTAMP END,'migration:0003:' || `id`,`updated_at`
FROM `records`
WHERE `object_type` = 'invoice' AND `amount_cents` > 0 AND json_valid(`fields_json`) = 1 AND CAST(COALESCE(json_extract(`fields_json`,'$.paidCents'),0) AS integer) > 0;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_invoice_payments_workspace_request` ON `invoice_payments` (`workspace_id`,`request_id`);
--> statement-breakpoint
CREATE TRIGGER `invoice_payments_validate_insert` BEFORE INSERT ON `invoice_payments`
WHEN NEW.`amount_cents` <= 0
  OR length(trim(NEW.`recorded_by`)) NOT BETWEEN 1 AND 200
  OR length(trim(NEW.`request_id`)) NOT BETWEEN 1 AND 200
  OR julianday(NEW.`recorded_at`) IS NULL
  OR (SELECT COUNT(*) FROM `invoice_payments` WHERE `workspace_id` = NEW.`workspace_id`) >= 5000
  OR (SELECT COUNT(*) FROM `invoice_payments` WHERE `workspace_id` = NEW.`workspace_id` AND `invoice_id` = NEW.`invoice_id`) >= 100
  OR NOT EXISTS (SELECT 1 FROM `records` WHERE `workspace_id` = NEW.`workspace_id` AND `id` = NEW.`invoice_id` AND `object_type` = 'invoice' AND `archived_at` IS NULL AND `amount_cents` > 0)
  OR (COALESCE((SELECT SUM(`amount_cents`) FROM `invoice_payments` WHERE `workspace_id` = NEW.`workspace_id` AND `invoice_id` = NEW.`invoice_id`),0) + NEW.`amount_cents`) > COALESCE((SELECT `amount_cents` FROM `records` WHERE `workspace_id` = NEW.`workspace_id` AND `id` = NEW.`invoice_id`),0)
BEGIN SELECT RAISE(ABORT, 'invalid invoice payment'); END;
--> statement-breakpoint
CREATE TRIGGER `invoice_payments_append_only_update` BEFORE UPDATE ON `invoice_payments`
BEGIN SELECT RAISE(ABORT, 'invoice payments are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `invoice_payments_append_only_delete` BEFORE DELETE ON `invoice_payments`
WHEN NOT EXISTS (SELECT 1 FROM `workspace_maintenance_sessions` WHERE `workspace_id` = OLD.`workspace_id` AND `purpose` = 'reset' AND `status` = 'running')
BEGIN SELECT RAISE(ABORT, 'invoice payments are append-only outside a confirmed workspace reset'); END;
--> statement-breakpoint
CREATE TRIGGER `records_capability_limit_insert` BEFORE INSERT ON `records`
WHEN NOT EXISTS (SELECT 1 FROM `workspace_maintenance_sessions` WHERE `workspace_id` = NEW.`workspace_id` AND `purpose` = 'seed') AND (
     NOT EXISTS (SELECT 1 FROM `workspaces` WHERE `id` = NEW.`workspace_id`)
  OR (NEW.`object_type` IN ('lead','contact','company','activity','task','document') AND EXISTS (SELECT 1 FROM `capability_overrides` WHERE `workspace_id` = NEW.`workspace_id` AND `capability_key` = 'relationships' AND `enabled` = 0))
  OR (NEW.`object_type` IN ('opportunity','campaign','product','quote','invoice') AND EXISTS (SELECT 1 FROM `capability_overrides` WHERE `workspace_id` = NEW.`workspace_id` AND `capability_key` = 'sales' AND `enabled` = 0))
  OR (NEW.`object_type` = 'ticket' AND (EXISTS (SELECT 1 FROM `capability_overrides` WHERE `workspace_id` = NEW.`workspace_id` AND `capability_key` = 'service' AND `enabled` = 0) OR (SELECT `profile` FROM `workspaces` WHERE `id` = NEW.`workspace_id`) = 'personal'))
  OR (NEW.`object_type` IN ('lead','contact','company','activity','task','document') AND (SELECT `profile` FROM `workspaces` WHERE `id` = NEW.`workspace_id`) = 'personal' AND (SELECT COUNT(*) FROM `records` WHERE `workspace_id` = NEW.`workspace_id` AND `object_type` IN ('lead','contact','company','activity','task','document') AND `archived_at` IS NULL) >= 500)
  OR (NEW.`object_type` IN ('lead','contact','company','activity','task','document') AND (SELECT `profile` FROM `workspaces` WHERE `id` = NEW.`workspace_id`) IN ('business','enterprise') AND (SELECT COUNT(*) FROM `records` WHERE `workspace_id` = NEW.`workspace_id` AND `object_type` IN ('lead','contact','company','activity','task','document') AND `archived_at` IS NULL) >= 1000)
  OR (NEW.`object_type` IN ('opportunity','campaign','product','quote','invoice') AND (SELECT `profile` FROM `workspaces` WHERE `id` = NEW.`workspace_id`) = 'personal' AND (SELECT COUNT(*) FROM `records` WHERE `workspace_id` = NEW.`workspace_id` AND `object_type` IN ('opportunity','campaign','product','quote','invoice') AND `archived_at` IS NULL) >= 250)
  OR (NEW.`object_type` IN ('opportunity','campaign','product','quote','invoice') AND (SELECT `profile` FROM `workspaces` WHERE `id` = NEW.`workspace_id`) IN ('business','enterprise') AND (SELECT COUNT(*) FROM `records` WHERE `workspace_id` = NEW.`workspace_id` AND `object_type` IN ('opportunity','campaign','product','quote','invoice') AND `archived_at` IS NULL) >= 1000)
  OR (NEW.`object_type` = 'ticket' AND (SELECT `profile` FROM `workspaces` WHERE `id` = NEW.`workspace_id`) = 'business' AND (SELECT COUNT(*) FROM `records` WHERE `workspace_id` = NEW.`workspace_id` AND `object_type` = 'ticket' AND `archived_at` IS NULL) >= 500)
  OR (NEW.`object_type` = 'ticket' AND (SELECT `profile` FROM `workspaces` WHERE `id` = NEW.`workspace_id`) = 'enterprise' AND (SELECT COUNT(*) FROM `records` WHERE `workspace_id` = NEW.`workspace_id` AND `object_type` = 'ticket' AND `archived_at` IS NULL) >= 1000)
)
BEGIN SELECT RAISE(ABORT, 'record capability limit exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER `records_workspace_capacity_insert` BEFORE INSERT ON `records`
WHEN (SELECT COUNT(*) FROM `records` WHERE `workspace_id` = NEW.`workspace_id`) >= 1000
BEGIN SELECT RAISE(ABORT, 'workspace record limit exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER `records_payload_validate_insert` BEFORE INSERT ON `records`
WHEN json_valid(NEW.`fields_json`) <> 1 OR json_type(NEW.`fields_json`) <> 'object' OR length(CAST(NEW.`fields_json` AS blob)) > 4096
  OR json_valid(NEW.`tags_json`) <> 1 OR json_type(NEW.`tags_json`) <> 'array' OR length(CAST(NEW.`tags_json` AS blob)) > 1024
BEGIN SELECT RAISE(ABORT, 'record payload exceeds limits'); END;
--> statement-breakpoint
CREATE TRIGGER `records_payload_validate_update` BEFORE UPDATE OF `fields_json`,`tags_json` ON `records`
WHEN json_valid(NEW.`fields_json`) <> 1 OR json_type(NEW.`fields_json`) <> 'object' OR length(CAST(NEW.`fields_json` AS blob)) > 4096
  OR json_valid(NEW.`tags_json`) <> 1 OR json_type(NEW.`tags_json`) <> 'array' OR length(CAST(NEW.`tags_json` AS blob)) > 1024
BEGIN SELECT RAISE(ABORT, 'record payload exceeds limits'); END;
--> statement-breakpoint
CREATE TRIGGER `records_restore_capacity_update` BEFORE UPDATE OF `archived_at` ON `records`
WHEN OLD.`archived_at` IS NOT NULL AND NEW.`archived_at` IS NULL AND (
     (NEW.`object_type` IN ('lead','contact','company','activity','task','document') AND EXISTS (SELECT 1 FROM `capability_overrides` WHERE `workspace_id`=NEW.`workspace_id` AND `capability_key`='relationships' AND `enabled`=0))
  OR (NEW.`object_type` IN ('opportunity','campaign','product','quote','invoice') AND EXISTS (SELECT 1 FROM `capability_overrides` WHERE `workspace_id`=NEW.`workspace_id` AND `capability_key`='sales' AND `enabled`=0))
  OR (NEW.`object_type`='ticket' AND (EXISTS (SELECT 1 FROM `capability_overrides` WHERE `workspace_id`=NEW.`workspace_id` AND `capability_key`='service' AND `enabled`=0) OR (SELECT `profile` FROM `workspaces` WHERE `id`=NEW.`workspace_id`)='personal'))
  OR (NEW.`object_type` IN ('lead','contact','company','activity','task','document') AND (SELECT COUNT(*) FROM `records` WHERE `workspace_id`=NEW.`workspace_id` AND `object_type` IN ('lead','contact','company','activity','task','document') AND `archived_at` IS NULL) >= CASE WHEN (SELECT `profile` FROM `workspaces` WHERE `id`=NEW.`workspace_id`)='personal' THEN 500 ELSE 1000 END)
  OR (NEW.`object_type` IN ('opportunity','campaign','product','quote','invoice') AND (SELECT COUNT(*) FROM `records` WHERE `workspace_id`=NEW.`workspace_id` AND `object_type` IN ('opportunity','campaign','product','quote','invoice') AND `archived_at` IS NULL) >= CASE WHEN (SELECT `profile` FROM `workspaces` WHERE `id`=NEW.`workspace_id`)='personal' THEN 250 ELSE 1000 END)
  OR (NEW.`object_type`='ticket' AND (SELECT COUNT(*) FROM `records` WHERE `workspace_id`=NEW.`workspace_id` AND `object_type`='ticket' AND `archived_at` IS NULL) >= CASE WHEN (SELECT `profile` FROM `workspaces` WHERE `id`=NEW.`workspace_id`)='business' THEN 500 ELSE 1000 END)
)
BEGIN SELECT RAISE(ABORT, 'record capability limit exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER `notes_capacity_validate_insert` BEFORE INSERT ON `notes`
WHEN length(NEW.`body`) NOT BETWEEN 1 AND 2000
  OR (SELECT COUNT(*) FROM `notes` WHERE `workspace_id`=NEW.`workspace_id`) >= 2500
  OR (SELECT COUNT(*) FROM `notes` WHERE `workspace_id`=NEW.`workspace_id` AND `record_id`=NEW.`record_id`) >= 50
BEGIN SELECT RAISE(ABORT, 'note capacity exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER `record_links_capacity_validate_insert` BEFORE INSERT ON `record_links`
WHEN (SELECT COUNT(*) FROM `record_links` WHERE `workspace_id`=NEW.`workspace_id`) >= 5000
BEGIN SELECT RAISE(ABORT, 'record link capacity exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER `records_type_validate_insert` BEFORE INSERT ON `records`
WHEN NEW.`object_type` NOT IN ('contact','company','lead','opportunity','task','activity','campaign','product','quote','invoice','ticket','document')
BEGIN SELECT RAISE(ABORT, 'invalid record object type'); END;
--> statement-breakpoint
UPDATE `records`
SET `currency` = (SELECT `currency` FROM `workspaces` WHERE `id` = `records`.`workspace_id`)
WHERE `amount_cents` = 0 AND `currency` <> (SELECT `currency` FROM `workspaces` WHERE `id` = `records`.`workspace_id`);
--> statement-breakpoint
CREATE TABLE `_free_crm_currency_guard` (`valid` integer NOT NULL CHECK (`valid` = 1));
--> statement-breakpoint
INSERT INTO `_free_crm_currency_guard` (`valid`)
SELECT 0 FROM `records` r JOIN `workspaces` w ON w.`id` = r.`workspace_id`
WHERE r.`amount_cents` <> 0 AND r.`currency` <> w.`currency` LIMIT 1;
--> statement-breakpoint
DROP TABLE `_free_crm_currency_guard`;
--> statement-breakpoint
CREATE TRIGGER `records_currency_validate_insert` BEFORE INSERT ON `records`
WHEN NOT EXISTS (SELECT 1 FROM `workspaces` WHERE `id` = NEW.`workspace_id` AND `currency` = NEW.`currency`)
BEGIN SELECT RAISE(ABORT, 'record currency does not match workspace'); END;
--> statement-breakpoint
CREATE TRIGGER `records_currency_validate_update` BEFORE UPDATE OF `workspace_id`,`currency`,`amount_cents` ON `records`
WHEN NOT EXISTS (SELECT 1 FROM `workspaces` WHERE `id` = NEW.`workspace_id` AND `currency` = NEW.`currency`)
BEGIN SELECT RAISE(ABORT, 'record currency does not match workspace'); END;
--> statement-breakpoint
CREATE TRIGGER `workspaces_currency_validate_update` BEFORE UPDATE OF `currency` ON `workspaces`
WHEN NEW.`currency` <> OLD.`currency` AND (
     length(NEW.`currency`) <> 3
  OR NEW.`currency` NOT GLOB '[A-Z][A-Z][A-Z]'
  OR EXISTS (SELECT 1 FROM `records` WHERE `workspace_id` = OLD.`id`)
)
BEGIN SELECT RAISE(ABORT, 'workspace currency change requires an empty workspace'); END;
--> statement-breakpoint
CREATE TRIGGER `records_identity_immutable` BEFORE UPDATE OF `id`,`workspace_id`,`object_type`,`owner_user_id`,`created_at` ON `records`
BEGIN SELECT RAISE(ABORT, 'record identity is immutable'); END;
--> statement-breakpoint
UPDATE `connector_connections`
SET `status` = 'disconnected', `health` = 'disconnected', `credential_ref` = NULL,
    `credential_metadata_json` = '{}', `retry_count` = 0, `credential_generation` = `credential_generation` + 1,
    `last_error_code` = 'credential_reconnect_required', `updated_at` = CURRENT_TIMESTAMP
WHERE `connector_key` = 'webhook-simulator'
  AND (`credential_ref` IS NULL OR `credential_ref` NOT GLOB 'sha256:*' OR length(`credential_ref`) <> 71);
--> statement-breakpoint
UPDATE `connector_connections`
SET `credential_generation` = 1
WHERE `connector_key` = 'webhook-simulator' AND `status` = 'connected' AND `credential_generation` = 0;
--> statement-breakpoint
CREATE TRIGGER `connector_connections_validate_insert` BEFORE INSERT ON `connector_connections`
WHEN NEW.`connector_key` NOT IN ('csv','webhook-simulator')
  OR NEW.`status` NOT IN ('connected','disconnected','error')
  OR NEW.`health` NOT IN ('healthy','degraded','disconnected','unknown')
  OR NEW.`retry_count` < 0
  OR NEW.`credential_generation` < 0
  OR json_valid(NEW.`credential_metadata_json`) <> 1
  OR json_valid(NEW.`scopes_json`) <> 1
  OR (NEW.`connector_key` = 'webhook-simulator' AND NEW.`status` = 'connected' AND (NEW.`credential_ref` NOT GLOB 'sha256:*' OR length(NEW.`credential_ref`) <> 71))
BEGIN SELECT RAISE(ABORT, 'invalid connector state'); END;
--> statement-breakpoint
CREATE TRIGGER `connector_connections_validate_update` BEFORE UPDATE ON `connector_connections`
WHEN NEW.`workspace_id` <> OLD.`workspace_id`
  OR NEW.`id` <> OLD.`id`
  OR NEW.`connector_key` <> OLD.`connector_key`
  OR NEW.`status` NOT IN ('connected','disconnected','error')
  OR NEW.`health` NOT IN ('healthy','degraded','disconnected','unknown')
  OR NEW.`retry_count` < 0
  OR NEW.`credential_generation` < OLD.`credential_generation`
  OR json_valid(NEW.`credential_metadata_json`) <> 1
  OR json_valid(NEW.`scopes_json`) <> 1
  OR (NEW.`connector_key` = 'webhook-simulator' AND NEW.`status` = 'connected' AND (NEW.`credential_ref` NOT GLOB 'sha256:*' OR length(NEW.`credential_ref`) <> 71))
BEGIN SELECT RAISE(ABORT, 'invalid connector state'); END;
--> statement-breakpoint
CREATE TRIGGER `webhook_deliveries_validate_insert` BEFORE INSERT ON `webhook_deliveries`
WHEN length(trim(NEW.`provider_delivery_id`)) NOT BETWEEN 1 AND 128
  OR NEW.`status` NOT IN ('received','processed','failed')
  OR NEW.`attempts` < 0
  OR length(NEW.`payload_hash`) <> 64
  OR NEW.`payload_hash` GLOB '*[^0-9a-f]*'
  OR NEW.`credential_generation` < 1
  OR NOT EXISTS (SELECT 1 FROM `connector_connections` WHERE `workspace_id` = NEW.`workspace_id` AND `id` = NEW.`connection_id` AND `connector_key` = 'webhook-simulator' AND `status` = 'connected' AND `credential_generation` = NEW.`credential_generation`)
BEGIN SELECT RAISE(ABORT, 'webhook credential changed or delivery is invalid'); END;
