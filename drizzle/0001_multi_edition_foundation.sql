ALTER TABLE `workspaces` ADD `profile` text DEFAULT 'personal' NOT NULL;
--> statement-breakpoint
CREATE TABLE `capability_overrides` (`workspace_id` text NOT NULL,`capability_key` text NOT NULL,`enabled` integer NOT NULL,`config_json` text DEFAULT '{}' NOT NULL,`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,PRIMARY KEY(`workspace_id`,`capability_key`),FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade);
--> statement-breakpoint
CREATE TABLE `actors` (`id` text NOT NULL,`workspace_id` text NOT NULL,`kind` text NOT NULL CHECK (`kind` IN ('human','organization','service','agent')),`display_name` text NOT NULL,`status` text DEFAULT 'active' NOT NULL,`metadata_json` text DEFAULT '{}' NOT NULL,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,PRIMARY KEY(`workspace_id`,`id`),FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade);
--> statement-breakpoint
CREATE INDEX `idx_actors_workspace_kind` ON `actors` (`workspace_id`,`kind`,`status`);
--> statement-breakpoint
CREATE TABLE `party_relationships` (`id` text NOT NULL,`workspace_id` text NOT NULL,`source_actor_id` text NOT NULL,`target_actor_id` text NOT NULL,`relationship_type` text NOT NULL,`valid_from` text,`valid_to` text,`metadata_json` text DEFAULT '{}' NOT NULL,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,PRIMARY KEY(`workspace_id`,`id`),FOREIGN KEY (`workspace_id`,`source_actor_id`) REFERENCES `actors`(`workspace_id`,`id`) ON DELETE cascade,FOREIGN KEY (`workspace_id`,`target_actor_id`) REFERENCES `actors`(`workspace_id`,`id`) ON DELETE cascade);
--> statement-breakpoint
CREATE INDEX `idx_party_relationships_workspace_source` ON `party_relationships` (`workspace_id`,`source_actor_id`);
--> statement-breakpoint
CREATE TABLE `timeline_activities` (`id` text NOT NULL,`workspace_id` text NOT NULL,`actor_id` text,`subject_type` text NOT NULL,`subject_id` text NOT NULL,`activity_type` text NOT NULL,`occurred_at` text NOT NULL,`summary` text NOT NULL,`metadata_json` text DEFAULT '{}' NOT NULL,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,PRIMARY KEY(`workspace_id`,`id`),FOREIGN KEY (`workspace_id`,`actor_id`) REFERENCES `actors`(`workspace_id`,`id`) ON DELETE set null);
--> statement-breakpoint
CREATE INDEX `idx_timeline_workspace_subject` ON `timeline_activities` (`workspace_id`,`subject_type`,`subject_id`,`occurred_at`);
--> statement-breakpoint
CREATE TABLE `work_objects` (`id` text NOT NULL,`workspace_id` text NOT NULL,`kind` text NOT NULL CHECK (`kind` IN ('work_item','opportunity','case','artifact','goal','policy')),`title` text NOT NULL,`status` text DEFAULT 'open' NOT NULL,`owner_actor_id` text,`data_json` text DEFAULT '{}' NOT NULL,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,PRIMARY KEY(`workspace_id`,`id`),FOREIGN KEY (`workspace_id`,`owner_actor_id`) REFERENCES `actors`(`workspace_id`,`id`) ON DELETE set null);
--> statement-breakpoint
CREATE INDEX `idx_work_objects_workspace_kind_status` ON `work_objects` (`workspace_id`,`kind`,`status`);
--> statement-breakpoint
CREATE TABLE `agent_identities` (`id` text NOT NULL,`workspace_id` text NOT NULL,`actor_id` text NOT NULL,`owner_actor_id` text NOT NULL,`autonomy_level` text DEFAULT 'observe' NOT NULL,`status` text DEFAULT 'paused' NOT NULL,`monthly_budget_cents` integer DEFAULT 0 NOT NULL,`spent_cents` integer DEFAULT 0 NOT NULL,`emergency_stopped_at` text,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,PRIMARY KEY(`workspace_id`,`id`),FOREIGN KEY (`workspace_id`,`actor_id`) REFERENCES `actors`(`workspace_id`,`id`) ON DELETE cascade,FOREIGN KEY (`workspace_id`,`owner_actor_id`) REFERENCES `actors`(`workspace_id`,`id`) ON DELETE restrict);
--> statement-breakpoint
CREATE INDEX `idx_agents_workspace_status` ON `agent_identities` (`workspace_id`,`status`);
--> statement-breakpoint
CREATE TABLE `agent_goals` (`id` text NOT NULL,`workspace_id` text NOT NULL,`agent_id` text NOT NULL,`title` text NOT NULL,`status` text DEFAULT 'active' NOT NULL,`success_json` text DEFAULT '{}' NOT NULL,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,PRIMARY KEY(`workspace_id`,`id`),FOREIGN KEY (`workspace_id`,`agent_id`) REFERENCES `agent_identities`(`workspace_id`,`id`) ON DELETE cascade);
--> statement-breakpoint
CREATE TABLE `agent_tools` (`id` text NOT NULL,`workspace_id` text NOT NULL,`name` text NOT NULL,`transport` text NOT NULL,`external` integer DEFAULT true NOT NULL,`scopes_json` text DEFAULT '[]' NOT NULL,`input_schema_json` text DEFAULT '{}' NOT NULL,`enabled` integer DEFAULT false NOT NULL,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,PRIMARY KEY(`workspace_id`,`id`));
--> statement-breakpoint
CREATE TABLE `agent_tool_grants` (`workspace_id` text NOT NULL,`agent_id` text NOT NULL,`tool_id` text NOT NULL,`scopes_json` text DEFAULT '[]' NOT NULL,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,PRIMARY KEY(`workspace_id`,`agent_id`,`tool_id`),FOREIGN KEY (`workspace_id`,`agent_id`) REFERENCES `agent_identities`(`workspace_id`,`id`) ON DELETE cascade,FOREIGN KEY (`workspace_id`,`tool_id`) REFERENCES `agent_tools`(`workspace_id`,`id`) ON DELETE cascade);
--> statement-breakpoint
CREATE TABLE `agent_runs` (`id` text NOT NULL,`workspace_id` text NOT NULL,`agent_id` text NOT NULL,`goal_id` text,`status` text DEFAULT 'proposed' NOT NULL,`budget_reserved_cents` integer DEFAULT 0 NOT NULL,`idempotency_key` text NOT NULL,`started_at` text,`finished_at` text,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,PRIMARY KEY(`workspace_id`,`id`),FOREIGN KEY (`workspace_id`,`agent_id`) REFERENCES `agent_identities`(`workspace_id`,`id`) ON DELETE cascade,FOREIGN KEY (`workspace_id`,`goal_id`) REFERENCES `agent_goals`(`workspace_id`,`id`) ON DELETE set null);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_agent_runs_workspace_idempotency` ON `agent_runs` (`workspace_id`,`idempotency_key`);
--> statement-breakpoint
CREATE TABLE `approval_requests` (`id` text NOT NULL,`workspace_id` text NOT NULL,`run_id` text NOT NULL,`requested_by_actor_id` text NOT NULL,`decided_by_actor_id` text,`status` text DEFAULT 'pending' NOT NULL,`action_summary` text NOT NULL,`expires_at` text NOT NULL,`decided_at` text,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,PRIMARY KEY(`workspace_id`,`id`),FOREIGN KEY (`workspace_id`,`run_id`) REFERENCES `agent_runs`(`workspace_id`,`id`) ON DELETE cascade);
--> statement-breakpoint
CREATE INDEX `idx_approvals_workspace_status` ON `approval_requests` (`workspace_id`,`status`,`expires_at`);
--> statement-breakpoint
CREATE TABLE `execution_receipts` (`id` text NOT NULL,`workspace_id` text NOT NULL,`run_id` text NOT NULL,`tool_id` text NOT NULL,`outcome` text NOT NULL,`input_hash` text NOT NULL,`output_hash` text,`cost_cents` integer DEFAULT 0 NOT NULL,`metadata_json` text DEFAULT '{}' NOT NULL,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,PRIMARY KEY(`workspace_id`,`id`),FOREIGN KEY (`workspace_id`,`run_id`) REFERENCES `agent_runs`(`workspace_id`,`id`) ON DELETE restrict,FOREIGN KEY (`workspace_id`,`tool_id`) REFERENCES `agent_tools`(`workspace_id`,`id`) ON DELETE restrict);
--> statement-breakpoint
CREATE INDEX `idx_receipts_workspace_run` ON `execution_receipts` (`workspace_id`,`run_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `agent_traces` (`id` text NOT NULL,`workspace_id` text NOT NULL,`run_id` text NOT NULL,`sequence` integer NOT NULL,`event_type` text NOT NULL,`detail_json` text DEFAULT '{}' NOT NULL,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,PRIMARY KEY(`workspace_id`,`id`),FOREIGN KEY (`workspace_id`,`run_id`) REFERENCES `agent_runs`(`workspace_id`,`id`) ON DELETE cascade);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_agent_traces_workspace_sequence` ON `agent_traces` (`workspace_id`,`run_id`,`sequence`);
--> statement-breakpoint
CREATE TABLE `connector_connections` (`id` text NOT NULL,`workspace_id` text NOT NULL,`connector_key` text NOT NULL,`auth_type` text NOT NULL,`credential_ref` text,`credential_metadata_json` text DEFAULT '{}' NOT NULL,`scopes_json` text DEFAULT '[]' NOT NULL,`status` text DEFAULT 'disconnected' NOT NULL,`health` text DEFAULT 'unknown' NOT NULL,`sync_cursor` text,`retry_count` integer DEFAULT 0 NOT NULL,`last_error_code` text,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,PRIMARY KEY(`workspace_id`,`id`),FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE cascade);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_connectors_workspace_key` ON `connector_connections` (`workspace_id`,`connector_key`);
--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (`id` text NOT NULL,`workspace_id` text NOT NULL,`connection_id` text NOT NULL,`provider_delivery_id` text NOT NULL,`status` text DEFAULT 'received' NOT NULL,`attempts` integer DEFAULT 0 NOT NULL,`payload_hash` text NOT NULL,`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,`processed_at` text,PRIMARY KEY(`workspace_id`,`id`),FOREIGN KEY (`workspace_id`,`connection_id`) REFERENCES `connector_connections`(`workspace_id`,`id`) ON DELETE cascade);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_webhooks_workspace_delivery` ON `webhook_deliveries` (`workspace_id`,`connection_id`,`provider_delivery_id`);
