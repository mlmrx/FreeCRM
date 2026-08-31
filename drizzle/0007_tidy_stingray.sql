CREATE TABLE `workspace_mutation_fences` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`mutation_epoch` integer NOT NULL,
	`operation_id` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "workspace_mutation_fences_epoch_check" CHECK("workspace_mutation_fences"."mutation_epoch" >= 0),
	CONSTRAINT "workspace_mutation_fences_operation_check" CHECK(length("workspace_mutation_fences"."operation_id") BETWEEN 1 AND 160)
);--> statement-breakpoint

CREATE TRIGGER `workspace_mutation_fences_validate_insert` BEFORE INSERT ON `workspace_mutation_fences`
WHEN NOT EXISTS (
  SELECT 1 FROM `workspaces`
  WHERE `id`=NEW.`workspace_id` AND `mutation_epoch`=NEW.`mutation_epoch`
)
OR EXISTS (
  SELECT 1 FROM `workspace_maintenance_sessions`
  WHERE `workspace_id`=NEW.`workspace_id` AND `purpose`='reset' AND `status` IN ('running','failed')
)
BEGIN SELECT RAISE(ABORT, 'workspace_mutation_epoch_stale'); END;--> statement-breakpoint

CREATE TRIGGER `workspace_mutation_fences_validate_update` BEFORE UPDATE ON `workspace_mutation_fences`
WHEN NEW.`workspace_id` <> OLD.`workspace_id`
OR NOT EXISTS (
  SELECT 1 FROM `workspaces`
  WHERE `id`=NEW.`workspace_id` AND `mutation_epoch`=NEW.`mutation_epoch`
)
OR EXISTS (
  SELECT 1 FROM `workspace_maintenance_sessions`
  WHERE `workspace_id`=NEW.`workspace_id` AND `purpose`='reset' AND `status` IN ('running','failed')
)
BEGIN SELECT RAISE(ABORT, 'workspace_mutation_epoch_stale'); END;
