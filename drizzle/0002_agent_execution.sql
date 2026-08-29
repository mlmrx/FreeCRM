ALTER TABLE `agent_runs` ADD `tool_id` text;
--> statement-breakpoint
ALTER TABLE `agent_runs` ADD `action_json` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_agent_runs_workspace_status` ON `agent_runs` (`workspace_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `audit_events_append_only_update` BEFORE UPDATE ON `audit_events` BEGIN SELECT RAISE(ABORT, 'audit_events are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `audit_events_append_only_delete` BEFORE DELETE ON `audit_events` BEGIN SELECT RAISE(ABORT, 'audit_events are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `execution_receipts_append_only_update` BEFORE UPDATE ON `execution_receipts` BEGIN SELECT RAISE(ABORT, 'execution_receipts are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `execution_receipts_append_only_delete` BEFORE DELETE ON `execution_receipts` BEGIN SELECT RAISE(ABORT, 'execution_receipts are append-only'); END;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_execution_receipts_workspace_run` ON `execution_receipts` (`workspace_id`,`run_id`);
