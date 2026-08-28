CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`before_json` text,
	`after_json` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`request_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_audit_events_workspace_created` ON `audit_events` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_events_workspace_entity` ON `audit_events` (`workspace_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `idempotency_records` (
	`workspace_id` text NOT NULL,
	`operation` text NOT NULL,
	`key` text NOT NULL,
	`request_hash` text NOT NULL,
	`status_code` integer NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `operation`, `key`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_idempotency_records_expiry` ON `idempotency_records` (`expires_at`);--> statement-breakpoint
CREATE TABLE `integration_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`integration_id` text NOT NULL,
	`direction` text NOT NULL,
	`status` text NOT NULL,
	`cursor` text,
	`processed` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`integration_id`) REFERENCES `integrations`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_integration_jobs_workspace_started` ON `integration_jobs` (`workspace_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_integration_jobs_status` ON `integration_jobs` (`status`,`started_at`);--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`auth_type` text DEFAULT 'oauth' NOT NULL,
	`sync_direction` text DEFAULT 'two_way' NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`last_sync_at` text,
	`next_sync_at` text,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_integrations_workspace_id` ON `integrations` (`workspace_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_integrations_workspace_provider` ON `integrations` (`workspace_id`,`provider`);--> statement-breakpoint
CREATE INDEX `idx_integrations_workspace_status` ON `integrations` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'owner' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_memberships_user_workspace` ON `memberships` (`user_id`,`workspace_id`);--> statement-breakpoint
CREATE TABLE `module_configs` (
	`workspace_id` text NOT NULL,
	`module_key` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `module_key`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_module_configs_workspace_position` ON `module_configs` (`workspace_id`,`position`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`record_id` text NOT NULL,
	`kind` text DEFAULT 'note' NOT NULL,
	`body` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`occurred_at` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`record_id`) REFERENCES `records`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notes_workspace_record_occurred` ON `notes` (`workspace_id`,`record_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `outbox_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`topic` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_outbox_events_status_available` ON `outbox_events` (`status`,`available_at`);--> statement-breakpoint
CREATE INDEX `idx_outbox_events_workspace_created` ON `outbox_events` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `record_links` (
	`workspace_id` text NOT NULL,
	`source_id` text NOT NULL,
	`target_id` text NOT NULL,
	`relationship` text NOT NULL,
	`label` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `source_id`, `target_id`, `relationship`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`source_id`) REFERENCES `records`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`target_id`) REFERENCES `records`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_record_links_workspace_source` ON `record_links` (`workspace_id`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_record_links_workspace_target` ON `record_links` (`workspace_id`,`target_id`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`object_type` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`lifecycle` text DEFAULT 'active' NOT NULL,
	`owner_user_id` text NOT NULL,
	`email` text,
	`phone` text,
	`company_name` text,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`probability` integer DEFAULT 0 NOT NULL,
	`source` text,
	`priority` text,
	`due_at` text,
	`closed_at` text,
	`fields_json` text DEFAULT '{}' NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_records_workspace_id` ON `records` (`workspace_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_records_workspace_type_updated` ON `records` (`workspace_id`,`object_type`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_records_workspace_type_status` ON `records` (`workspace_id`,`object_type`,`status`);--> statement-breakpoint
CREATE INDEX `idx_records_workspace_due` ON `records` (`workspace_id`,`due_at`);--> statement-breakpoint
CREATE INDEX `idx_records_workspace_email` ON `records` (`workspace_id`,`email`);--> statement-breakpoint
CREATE INDEX `idx_records_workspace_company` ON `records` (`workspace_id`,`company_name`);--> statement-breakpoint
CREATE TABLE `workflow_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`trigger_type` text NOT NULL,
	`conditions_json` text DEFAULT '[]' NOT NULL,
	`actions_json` text DEFAULT '[]' NOT NULL,
	`last_run_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_workflow_rules_workspace_id` ON `workflow_rules` (`workspace_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_workflow_rules_workspace_enabled` ON `workflow_rules` (`workspace_id`,`enabled`);--> statement-breakpoint
CREATE TABLE `workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`workflow_id` text NOT NULL,
	`record_id` text,
	`status` text NOT NULL,
	`output_json` text DEFAULT '{}' NOT NULL,
	`error` text,
	`idempotency_key` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`workflow_id`) REFERENCES `workflow_rules`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_workflow_runs_workspace_key` ON `workflow_runs` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_workspace_started` ON `workflow_runs` (`workspace_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`timezone` text DEFAULT 'America/Los_Angeles' NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`locale` text DEFAULT 'en-US' NOT NULL,
	`settings_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_workspaces_owner_user` ON `workspaces` (`owner_user_id`);
--> statement-breakpoint
PRAGMA optimize;
