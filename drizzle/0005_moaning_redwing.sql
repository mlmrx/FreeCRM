PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workspace_reset_operations` (
	`workspace_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`mode` text NOT NULL,
	`token` text NOT NULL,
	`lease_token` text,
	`status` text DEFAULT 'running' NOT NULL,
	`response_json` text,
	`last_error_code` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `operation_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "workspace_reset_operation_id_check" CHECK(length("__new_workspace_reset_operations"."operation_id") = 36),
	CONSTRAINT "workspace_reset_mode_check" CHECK("__new_workspace_reset_operations"."mode" IN ('clean','demo')),
	CONSTRAINT "workspace_reset_token_check" CHECK(length("__new_workspace_reset_operations"."token") BETWEEN 32 AND 128),
	CONSTRAINT "workspace_reset_status_check" CHECK("__new_workspace_reset_operations"."status" IN ('running','failed','completed')),
	CONSTRAINT "workspace_reset_lease_check" CHECK(("__new_workspace_reset_operations"."status" = 'failed' AND "__new_workspace_reset_operations"."lease_token" IS NULL) OR ("__new_workspace_reset_operations"."status" IN ('running','completed') AND length("__new_workspace_reset_operations"."lease_token") BETWEEN 32 AND 128)),
	CONSTRAINT "workspace_reset_response_check" CHECK("__new_workspace_reset_operations"."response_json" IS NULL OR json_valid("__new_workspace_reset_operations"."response_json") = 1)
);
--> statement-breakpoint
INSERT INTO `__new_workspace_reset_operations`("workspace_id", "operation_id", "mode", "token", "lease_token", "status", "response_json", "last_error_code", "created_at", "updated_at") SELECT o."workspace_id", o."operation_id", o."mode", o."token", CASE WHEN o."status" = 'failed' THEN NULL ELSE COALESCE((SELECT m."lease_token" FROM `workspace_maintenance_sessions` m WHERE m."workspace_id"=o."workspace_id" AND m."purpose"='reset' AND m."token"=o."token"),o."token") END, o."status", o."response_json", o."last_error_code", o."created_at", o."updated_at" FROM `workspace_reset_operations` o;--> statement-breakpoint
DROP TABLE `workspace_reset_operations`;--> statement-breakpoint
ALTER TABLE `__new_workspace_reset_operations` RENAME TO `workspace_reset_operations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_workspace_reset_token` ON `workspace_reset_operations` (`workspace_id`,`token`);
--> statement-breakpoint
CREATE TRIGGER `workspace_reset_operations_validate_insert` BEFORE INSERT ON `workspace_reset_operations`
WHEN (NEW.`status` = 'completed' AND NEW.`response_json` IS NULL)
  OR (NEW.`status` <> 'completed' AND NEW.`response_json` IS NOT NULL)
  OR (NEW.`status` = 'running' AND NOT EXISTS (
       SELECT 1 FROM `workspace_maintenance_sessions`
       WHERE `workspace_id`=NEW.`workspace_id` AND `purpose`='reset' AND `operation_id`=NEW.`operation_id`
         AND `token`=NEW.`token` AND `lease_token`=NEW.`lease_token` AND `status`='running'
     ))
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
  OR (NEW.`status` IN ('running','failed','completed') AND NOT EXISTS (
       SELECT 1 FROM `workspace_maintenance_sessions`
       WHERE `workspace_id`=OLD.`workspace_id` AND `purpose`='reset' AND `operation_id`=OLD.`operation_id`
         AND `token`=OLD.`token` AND `lease_token`=COALESCE(NEW.`lease_token`,OLD.`lease_token`) AND `status`='running'
     ))
BEGIN SELECT RAISE(ABORT, 'invalid workspace reset operation transition'); END;
--> statement-breakpoint
CREATE TRIGGER `workspace_reset_operations_append_only_delete` BEFORE DELETE ON `workspace_reset_operations`
BEGIN SELECT RAISE(ABORT, 'workspace reset operations are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `workspace_maintenance_reset_completion_receipt` BEFORE UPDATE OF `status` ON `workspace_maintenance_sessions`
WHEN OLD.`purpose`='reset' AND NEW.`status`='completed' AND NOT EXISTS (
  SELECT 1 FROM `workspace_reset_operations`
  WHERE `workspace_id`=OLD.`workspace_id` AND `operation_id`=OLD.`operation_id` AND `token`=OLD.`token`
    AND `lease_token`=OLD.`lease_token` AND `status`='completed' AND `response_json`=NEW.`response_json`
)
BEGIN SELECT RAISE(ABORT, 'reset completion receipt missing'); END;
--> statement-breakpoint
CREATE TRIGGER `workspace_maintenance_reset_failure_receipt` BEFORE UPDATE OF `status` ON `workspace_maintenance_sessions`
WHEN OLD.`purpose`='reset' AND NEW.`status`='failed' AND NOT EXISTS (
  SELECT 1 FROM `workspace_reset_operations`
  WHERE `workspace_id`=OLD.`workspace_id` AND `operation_id`=OLD.`operation_id` AND `token`=OLD.`token` AND `status`='failed'
)
BEGIN SELECT RAISE(ABORT, 'reset failure receipt missing'); END;
