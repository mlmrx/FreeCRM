CREATE TABLE `upload_intents` (
	`workspace_id` text NOT NULL,
	`id` text NOT NULL,
	`object_key` text NOT NULL,
	`mutation_epoch` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`lease_expires_at` text,
	`last_error_code` text,
	`cleanup_attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "upload_intents_epoch_check" CHECK("upload_intents"."mutation_epoch" >= 0),
	CONSTRAINT "upload_intents_status_check" CHECK("upload_intents"."status" IN ('pending','committed','cleanup_pending','cleaned')),
	CONSTRAINT "upload_intents_object_key_check" CHECK(length("upload_intents"."object_key") BETWEEN length("upload_intents"."workspace_id") + 2 AND 1029 AND substr("upload_intents"."object_key", 1, length("upload_intents"."workspace_id") + 1) = "upload_intents"."workspace_id" || '/'),
	CONSTRAINT "upload_intents_lease_check" CHECK(("upload_intents"."status" = 'pending' AND "upload_intents"."lease_expires_at" IS NOT NULL) OR ("upload_intents"."status" <> 'pending' AND "upload_intents"."lease_expires_at" IS NULL)),
	CONSTRAINT "upload_intents_error_check" CHECK(("upload_intents"."status" = 'cleanup_pending' AND length("upload_intents"."last_error_code") BETWEEN 1 AND 64) OR ("upload_intents"."status" <> 'cleanup_pending' AND "upload_intents"."last_error_code" IS NULL)),
	CONSTRAINT "upload_intents_cleanup_attempts_check" CHECK("upload_intents"."cleanup_attempts" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_upload_intents_workspace_object` ON `upload_intents` (`workspace_id`,`object_key`);--> statement-breakpoint
CREATE INDEX `idx_upload_intents_workspace_epoch_status` ON `upload_intents` (`workspace_id`,`mutation_epoch`,`status`,`lease_expires_at`);--> statement-breakpoint
ALTER TABLE `workspaces` ADD `mutation_epoch` integer DEFAULT 0 NOT NULL;--> statement-breakpoint

CREATE TRIGGER `workspaces_mutation_epoch_guard` BEFORE UPDATE OF `mutation_epoch` ON `workspaces`
WHEN NEW.`mutation_epoch` <> OLD.`mutation_epoch` AND (
  NEW.`mutation_epoch` <> OLD.`mutation_epoch` + 1
  OR NOT EXISTS (
    SELECT 1
    FROM `workspace_maintenance_sessions` AS `maintenance`
    JOIN `workspace_reset_operations` AS `operation`
      ON `operation`.`workspace_id`=`maintenance`.`workspace_id`
      AND `operation`.`operation_id`=`maintenance`.`operation_id`
      AND `operation`.`token`=`maintenance`.`token`
      AND `operation`.`lease_token`=`maintenance`.`lease_token`
      AND `operation`.`status`='running'
    WHERE `maintenance`.`workspace_id`=OLD.`id`
      AND `maintenance`.`purpose`='reset'
      AND `maintenance`.`status`='running'
      AND length(`maintenance`.`lease_token`) BETWEEN 32 AND 128
  )
)
BEGIN SELECT RAISE(ABORT, 'workspace_mutation_epoch_guard'); END;--> statement-breakpoint

CREATE TRIGGER `upload_intents_validate_insert` BEFORE INSERT ON `upload_intents`
WHEN NEW.`status` <> 'pending'
  OR NEW.`lease_expires_at` IS NULL
  OR NEW.`last_error_code` IS NOT NULL
  OR NEW.`cleanup_attempts` <> 0
  OR NOT EXISTS (
    SELECT 1 FROM `workspaces`
    WHERE `id`=NEW.`workspace_id` AND `mutation_epoch`=NEW.`mutation_epoch`
  )
BEGIN SELECT RAISE(ABORT, 'upload_intent_invalid'); END;--> statement-breakpoint

CREATE TRIGGER `upload_intents_reset_fence` BEFORE INSERT ON `upload_intents`
WHEN EXISTS (
  SELECT 1 FROM `workspace_maintenance_sessions`
  WHERE `workspace_id`=NEW.`workspace_id` AND `purpose`='reset' AND `status` IN ('running','failed')
)
BEGIN SELECT RAISE(ABORT, 'workspace_reset_in_progress'); END;--> statement-breakpoint

CREATE TRIGGER `upload_intents_capacity_insert` BEFORE INSERT ON `upload_intents`
WHEN (SELECT COUNT(*) FROM `upload_intents` WHERE `workspace_id`=NEW.`workspace_id` AND `status`='pending') >= 100
  OR (SELECT COUNT(*) FROM `upload_intents` WHERE `workspace_id`=NEW.`workspace_id`) >= 51200
BEGIN SELECT RAISE(ABORT, 'upload_intent_capacity'); END;--> statement-breakpoint

CREATE TRIGGER `upload_intents_identity_immutable` BEFORE UPDATE OF `workspace_id`,`id`,`object_key`,`mutation_epoch`,`created_at` ON `upload_intents`
BEGIN SELECT RAISE(ABORT, 'upload_intent_identity_immutable'); END;--> statement-breakpoint

CREATE TRIGGER `upload_intents_cleanup_attempts_monotonic` BEFORE UPDATE ON `upload_intents`
WHEN NEW.`cleanup_attempts` < OLD.`cleanup_attempts`
  OR (NEW.`status`='cleanup_pending' AND OLD.`status` <> 'cleanup_pending' AND NEW.`cleanup_attempts` <= OLD.`cleanup_attempts`)
BEGIN SELECT RAISE(ABORT, 'upload_intent_cleanup_attempts_invalid'); END;--> statement-breakpoint

CREATE TRIGGER `upload_intents_state_machine` BEFORE UPDATE OF `status` ON `upload_intents`
WHEN NOT (
  NEW.`status`=OLD.`status`
  OR (OLD.`status`='pending' AND NEW.`status` IN ('committed','cleanup_pending','cleaned'))
  OR (OLD.`status`='committed' AND NEW.`status`='cleaned')
  OR (OLD.`status`='cleanup_pending' AND NEW.`status`='cleaned')
  OR (OLD.`status`='cleaned' AND NEW.`status`='cleanup_pending')
)
BEGIN SELECT RAISE(ABORT, 'upload_intent_state_invalid'); END;--> statement-breakpoint

CREATE TRIGGER `records_document_upload_intent_fence` BEFORE INSERT ON `records`
WHEN NEW.`object_type`='document' AND json_type(NEW.`fields_json`, '$.objectKey') IS NOT NULL AND (
  json_type(NEW.`fields_json`, '$.objectKey') IS NOT 'text'
  OR NOT EXISTS (
    SELECT 1 FROM `upload_intents` AS `intent`
    JOIN `workspaces` AS `workspace` ON `workspace`.`id`=`intent`.`workspace_id`
    WHERE `intent`.`workspace_id`=NEW.`workspace_id`
      AND `intent`.`id`=NEW.`id`
      AND `intent`.`object_key`=json_extract(NEW.`fields_json`, '$.objectKey')
      AND `intent`.`status`='pending'
      AND `intent`.`mutation_epoch`=`workspace`.`mutation_epoch`
      AND NOT EXISTS (
        SELECT 1 FROM `workspace_maintenance_sessions`
        WHERE `workspace_id`=NEW.`workspace_id` AND `purpose`='reset' AND `status` IN ('running','failed')
      )
  )
)
BEGIN SELECT RAISE(ABORT, 'upload_intent_epoch_stale'); END;--> statement-breakpoint

CREATE TRIGGER `upload_intents_commit_fence` BEFORE UPDATE OF `status` ON `upload_intents`
WHEN OLD.`status`='pending' AND NEW.`status`='committed' AND (
  NOT EXISTS (
    SELECT 1 FROM `workspaces`
    WHERE `id`=OLD.`workspace_id` AND `mutation_epoch`=OLD.`mutation_epoch`
  )
  OR EXISTS (
    SELECT 1 FROM `workspace_maintenance_sessions`
    WHERE `workspace_id`=OLD.`workspace_id` AND `purpose`='reset' AND `status` IN ('running','failed')
  )
  OR NOT EXISTS (
    SELECT 1 FROM `records`
    WHERE `workspace_id`=OLD.`workspace_id` AND `id`=OLD.`id` AND `object_type`='document'
      AND json_extract(`fields_json`, '$.objectKey')=OLD.`object_key`
  )
)
BEGIN SELECT RAISE(ABORT, 'upload_intent_epoch_stale'); END;--> statement-breakpoint

CREATE TRIGGER `audit_events_mutation_epoch_fence` BEFORE INSERT ON `audit_events`
WHEN (json_extract(NEW.`metadata_json`, '$.source') IN ('api','file-api') OR json_type(NEW.`metadata_json`, '$.mutationEpoch') IS NOT NULL) AND (
  json_type(NEW.`metadata_json`, '$.mutationEpoch') IS NOT 'integer'
  OR NOT EXISTS (
    SELECT 1 FROM `workspaces`
    WHERE `id`=NEW.`workspace_id`
      AND `mutation_epoch`=CAST(json_extract(NEW.`metadata_json`, '$.mutationEpoch') AS INTEGER)
  )
)
BEGIN SELECT RAISE(ABORT, 'workspace_mutation_epoch_stale'); END;--> statement-breakpoint

CREATE TRIGGER `document_upload_audit_fence` BEFORE INSERT ON `audit_events`
WHEN NEW.`action`='document.upload' AND NOT EXISTS (
  SELECT 1 FROM `upload_intents`
  WHERE `workspace_id`=NEW.`workspace_id` AND `id`=NEW.`entity_id` AND `status`='committed'
)
BEGIN SELECT RAISE(ABORT, 'upload_intent_not_committed'); END;--> statement-breakpoint

CREATE TRIGGER `workspace_maintenance_reset_upload_intents` BEFORE UPDATE OF `status` ON `workspace_maintenance_sessions`
WHEN OLD.`purpose`='reset' AND NEW.`status`='completed' AND EXISTS (
  SELECT 1 FROM `upload_intents` AS `intent`
  JOIN `workspaces` AS `workspace` ON `workspace`.`id`=`intent`.`workspace_id`
  WHERE `intent`.`workspace_id`=OLD.`workspace_id`
    AND `intent`.`mutation_epoch` < `workspace`.`mutation_epoch`
    AND `intent`.`status` <> 'cleaned'
)
BEGIN SELECT RAISE(ABORT, 'workspace_reset_upload_intents_active'); END;
