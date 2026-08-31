CREATE TABLE `workspace_reset_operations` (
	`workspace_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`mode` text NOT NULL,
	`token` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`response_json` text,
	`last_error_code` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `operation_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "workspace_reset_operation_id_check" CHECK(length("workspace_reset_operations"."operation_id") = 36),
	CONSTRAINT "workspace_reset_mode_check" CHECK("workspace_reset_operations"."mode" IN ('clean','demo')),
	CONSTRAINT "workspace_reset_token_check" CHECK(length("workspace_reset_operations"."token") BETWEEN 32 AND 128),
	CONSTRAINT "workspace_reset_status_check" CHECK("workspace_reset_operations"."status" IN ('running','failed','completed')),
	CONSTRAINT "workspace_reset_response_check" CHECK("workspace_reset_operations"."response_json" IS NULL OR json_valid("workspace_reset_operations"."response_json") = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_workspace_reset_token` ON `workspace_reset_operations` (`workspace_id`,`token`);
--> statement-breakpoint
CREATE TRIGGER `workspace_reset_operations_validate_insert` BEFORE INSERT ON `workspace_reset_operations`
WHEN (NEW.`status` = 'completed' AND NEW.`response_json` IS NULL)
  OR (NEW.`status` <> 'completed' AND NEW.`response_json` IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'invalid workspace reset operation'); END;
--> statement-breakpoint
CREATE TRIGGER `workspace_reset_operations_identity_immutable` BEFORE UPDATE OF `workspace_id`,`operation_id`,`mode`,`token`,`created_at` ON `workspace_reset_operations`
BEGIN SELECT RAISE(ABORT, 'workspace reset operation identity is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `workspace_reset_operations_state_machine` BEFORE UPDATE ON `workspace_reset_operations`
WHEN OLD.`status` = 'completed'
  OR (NEW.`status` <> OLD.`status` AND NOT (
       (OLD.`status` = 'running' AND NEW.`status` IN ('failed','completed'))
    OR (OLD.`status` = 'failed' AND NEW.`status` = 'running')
  ))
  OR (NEW.`status` = 'completed' AND NEW.`response_json` IS NULL)
  OR (NEW.`status` <> 'completed' AND NEW.`response_json` IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'invalid workspace reset operation transition'); END;
--> statement-breakpoint
CREATE TRIGGER `workspace_reset_operations_append_only_delete` BEFORE DELETE ON `workspace_reset_operations`
BEGIN SELECT RAISE(ABORT, 'workspace reset operations are append-only'); END;
