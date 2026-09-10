CREATE TABLE `adaptive_feedback` (
	`workspace_id` text NOT NULL,
	`signal_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`state` text NOT NULL,
	`snoozed_until` text,
	`topic` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `signal_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `adaptive_settings`(`workspace_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "adaptive_feedback_bounds" CHECK(length("adaptive_feedback"."signal_id") BETWEEN 1 AND 200 AND length("adaptive_feedback"."fingerprint")=64 AND "adaptive_feedback"."fingerprint" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "adaptive_feedback_state" CHECK("adaptive_feedback"."state" IN ('new','useful','dismissed','snoozed','actioned') AND (("adaptive_feedback"."state"='snoozed' AND "adaptive_feedback"."snoozed_until" IS NOT NULL) OR ("adaptive_feedback"."state"<>'snoozed' AND "adaptive_feedback"."snoozed_until" IS NULL))),
	CONSTRAINT "adaptive_feedback_topic" CHECK("adaptive_feedback"."topic" IN ('relationships','sales','service','knowledge'))
);
--> statement-breakpoint
CREATE INDEX `idx_adaptive_feedback_updated` ON `adaptive_feedback` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `adaptive_observations` (
	`workspace_id` text NOT NULL,
	`id` text NOT NULL,
	`signal_id` text NOT NULL,
	`topic` text NOT NULL,
	`outcome` text NOT NULL,
	`followup_days` integer,
	`observed_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `adaptive_settings`(`workspace_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "adaptive_observation_bounds" CHECK(length("adaptive_observations"."id")=36 AND length("adaptive_observations"."signal_id") BETWEEN 1 AND 200),
	CONSTRAINT "adaptive_observation_topic" CHECK("adaptive_observations"."topic" IN ('relationships','sales','service','knowledge')),
	CONSTRAINT "adaptive_observation_outcome" CHECK(("adaptive_observations"."outcome" IN ('useful','dismissed') AND "adaptive_observations"."followup_days" IS NULL) OR ("adaptive_observations"."outcome"='follow-up' AND "adaptive_observations"."followup_days" BETWEEN 1 AND 30 AND "adaptive_observations"."followup_days" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_adaptive_observation_outcome` ON `adaptive_observations` (`workspace_id`,`signal_id`,`outcome`);--> statement-breakpoint
CREATE INDEX `idx_adaptive_observations_observed` ON `adaptive_observations` (`workspace_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `adaptive_packs` (
	`workspace_id` text NOT NULL,
	`pack_id` text NOT NULL,
	`version` text NOT NULL,
	`enabled` integer NOT NULL,
	`previous_version` text,
	`previous_enabled` integer,
	`installed_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `pack_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `adaptive_settings`(`workspace_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "adaptive_pack_bounds" CHECK(length("adaptive_packs"."pack_id") BETWEEN 1 AND 100 AND length("adaptive_packs"."version") BETWEEN 1 AND 100 AND ("adaptive_packs"."previous_version" IS NULL OR length("adaptive_packs"."previous_version") BETWEEN 1 AND 100)),
	CONSTRAINT "adaptive_pack_flags" CHECK("adaptive_packs"."enabled" IN (0,1) AND ("adaptive_packs"."previous_enabled" IS NULL OR "adaptive_packs"."previous_enabled" IN (0,1)) AND (("adaptive_packs"."previous_version" IS NULL AND "adaptive_packs"."previous_enabled" IS NULL) OR ("adaptive_packs"."previous_version" IS NOT NULL AND "adaptive_packs"."previous_enabled" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE `adaptive_proposals` (
	`workspace_id` text NOT NULL,
	`id` text NOT NULL,
	`release_id` text NOT NULL,
	`title` text NOT NULL,
	`problem` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `adaptive_settings`(`workspace_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`release_id`) REFERENCES `adaptive_releases`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "adaptive_proposal_bounds" CHECK(length("adaptive_proposals"."id") BETWEEN 1 AND 200 AND length("adaptive_proposals"."title") BETWEEN 1 AND 200 AND length("adaptive_proposals"."problem") BETWEEN 1 AND 12000 AND length(CAST("adaptive_proposals"."title"||"adaptive_proposals"."problem" AS BLOB))<=65536),
	CONSTRAINT "adaptive_proposal_status" CHECK("adaptive_proposals"."status" IN ('proposed','dismissed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_adaptive_proposal_release` ON `adaptive_proposals` (`workspace_id`,`release_id`);--> statement-breakpoint
CREATE TABLE `adaptive_receipts` (
	`workspace_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`action` text NOT NULL,
	`result_json` text NOT NULL,
	`affected` integer NOT NULL,
	`mutation_epoch` integer NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `operation_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "adaptive_write_conflict" CHECK("adaptive_receipts"."affected"=1),
	CONSTRAINT "adaptive_receipt_bounds" CHECK(length("adaptive_receipts"."operation_id")=36 AND length("adaptive_receipts"."fingerprint")=64 AND "adaptive_receipts"."fingerprint" NOT GLOB '*[^0-9a-f]*' AND length("adaptive_receipts"."action") BETWEEN 1 AND 64 AND "adaptive_receipts"."mutation_epoch">=0),
	CONSTRAINT "adaptive_receipt_result" CHECK(json_valid("adaptive_receipts"."result_json") AND json_type("adaptive_receipts"."result_json")='object' AND length(CAST("adaptive_receipts"."result_json" AS BLOB))<=1024)
);
--> statement-breakpoint
CREATE INDEX `idx_adaptive_receipts_created` ON `adaptive_receipts` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `adaptive_releases` (
	`workspace_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`version` text NOT NULL,
	`body` text NOT NULL,
	`url` text NOT NULL,
	`published_at` text NOT NULL,
	`fetched_at` text NOT NULL,
	`topics_json` text DEFAULT '[]' NOT NULL,
	`suggested_pack_ids_json` text DEFAULT '[]' NOT NULL,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `adaptive_settings`(`workspace_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "adaptive_release_bounds" CHECK(length("adaptive_releases"."id") BETWEEN 1 AND 200 AND length("adaptive_releases"."project_id") BETWEEN 1 AND 100 AND length("adaptive_releases"."title") BETWEEN 1 AND 200 AND length("adaptive_releases"."version") BETWEEN 1 AND 100 AND length("adaptive_releases"."body")<=12000 AND length("adaptive_releases"."url") BETWEEN 1 AND 2048 AND length(CAST("adaptive_releases"."title"||"adaptive_releases"."version"||"adaptive_releases"."body"||"adaptive_releases"."url" AS BLOB))<=65536),
	CONSTRAINT "adaptive_release_topics" CHECK(json_valid("adaptive_releases"."topics_json") AND json_type("adaptive_releases"."topics_json")='array' AND json_array_length("adaptive_releases"."topics_json")<=4 AND length(CAST("adaptive_releases"."topics_json" AS BLOB))<=256),
	CONSTRAINT "adaptive_release_packs" CHECK(json_valid("adaptive_releases"."suggested_pack_ids_json") AND json_type("adaptive_releases"."suggested_pack_ids_json")='array' AND json_array_length("adaptive_releases"."suggested_pack_ids_json")<=20 AND length(CAST("adaptive_releases"."suggested_pack_ids_json" AS BLOB))<=2048)
);
--> statement-breakpoint
CREATE INDEX `idx_adaptive_releases_published` ON `adaptive_releases` (`workspace_id`,`published_at`);--> statement-breakpoint
CREATE TABLE `adaptive_settings` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`learning_enabled` integer DEFAULT 0 NOT NULL,
	`auto_adapt` integer DEFAULT 0 NOT NULL,
	`paused` integer DEFAULT 0 NOT NULL,
	`goals` text DEFAULT '' NOT NULL,
	`focus` text DEFAULT 'balanced' NOT NULL,
	`followup_days` integer DEFAULT 3 NOT NULL,
	`followup_pinned` integer DEFAULT 0 NOT NULL,
	`digest_size` integer DEFAULT 5 NOT NULL,
	`watch_enabled` integer DEFAULT 0 NOT NULL,
	`watch_projects_json` text DEFAULT '[]' NOT NULL,
	`last_scan_at` text,
	`last_scan_error` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "adaptive_settings_flags" CHECK("adaptive_settings"."learning_enabled" IN (0,1) AND "adaptive_settings"."auto_adapt" IN (0,1) AND "adaptive_settings"."paused" IN (0,1) AND "adaptive_settings"."followup_pinned" IN (0,1) AND "adaptive_settings"."watch_enabled" IN (0,1)),
	CONSTRAINT "adaptive_settings_bounds" CHECK("adaptive_settings"."revision">=0 AND "adaptive_settings"."followup_days" BETWEEN 1 AND 30 AND "adaptive_settings"."digest_size" BETWEEN 3 AND 20 AND length("adaptive_settings"."goals")<=500 AND length(CAST("adaptive_settings"."goals" AS BLOB))<=2000 AND ("adaptive_settings"."last_scan_error" IS NULL OR length("adaptive_settings"."last_scan_error")<=500)),
	CONSTRAINT "adaptive_settings_focus" CHECK("adaptive_settings"."focus" IN ('balanced','relationships','sales','service','knowledge')),
	CONSTRAINT "adaptive_settings_projects" CHECK(json_valid("adaptive_settings"."watch_projects_json") AND json_type("adaptive_settings"."watch_projects_json")='array' AND json_array_length("adaptive_settings"."watch_projects_json")<=4 AND length(CAST("adaptive_settings"."watch_projects_json" AS BLOB))<=512)
);
--> statement-breakpoint
CREATE TRIGGER adaptive_feedback_capacity BEFORE INSERT ON adaptive_feedback
WHEN NOT EXISTS(SELECT 1 FROM adaptive_feedback WHERE workspace_id=NEW.workspace_id AND signal_id=NEW.signal_id)
 AND (SELECT count(*) FROM adaptive_feedback WHERE workspace_id=NEW.workspace_id)>=1000
BEGIN SELECT RAISE(ABORT,'adaptive_capacity_feedback'); END;
--> statement-breakpoint
CREATE TRIGGER adaptive_feedback_identity BEFORE UPDATE ON adaptive_feedback
WHEN NEW.workspace_id<>OLD.workspace_id OR NEW.signal_id<>OLD.signal_id
BEGIN SELECT RAISE(ABORT,'adaptive_write_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER adaptive_observations_capacity BEFORE INSERT ON adaptive_observations
WHEN NOT EXISTS(SELECT 1 FROM adaptive_observations WHERE workspace_id=NEW.workspace_id AND (id=NEW.id OR (signal_id=NEW.signal_id AND outcome=NEW.outcome)))
 AND (SELECT count(*) FROM adaptive_observations WHERE workspace_id=NEW.workspace_id)>=500
BEGIN SELECT RAISE(ABORT,'adaptive_capacity_observations'); END;
--> statement-breakpoint
CREATE TRIGGER adaptive_observations_identity BEFORE UPDATE ON adaptive_observations
WHEN NEW.workspace_id<>OLD.workspace_id OR NEW.id<>OLD.id
BEGIN SELECT RAISE(ABORT,'adaptive_write_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER adaptive_packs_capacity BEFORE INSERT ON adaptive_packs
WHEN NOT EXISTS(SELECT 1 FROM adaptive_packs WHERE workspace_id=NEW.workspace_id AND pack_id=NEW.pack_id)
 AND (SELECT count(*) FROM adaptive_packs WHERE workspace_id=NEW.workspace_id)>=20
BEGIN SELECT RAISE(ABORT,'adaptive_capacity_packs'); END;
--> statement-breakpoint
CREATE TRIGGER adaptive_packs_identity BEFORE UPDATE ON adaptive_packs
WHEN NEW.workspace_id<>OLD.workspace_id OR NEW.pack_id<>OLD.pack_id
BEGIN SELECT RAISE(ABORT,'adaptive_write_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER adaptive_releases_capacity BEFORE INSERT ON adaptive_releases
WHEN NOT EXISTS(SELECT 1 FROM adaptive_releases WHERE workspace_id=NEW.workspace_id AND id=NEW.id)
 AND (SELECT count(*) FROM adaptive_releases WHERE workspace_id=NEW.workspace_id)>=20
BEGIN SELECT RAISE(ABORT,'adaptive_capacity_releases'); END;
--> statement-breakpoint
CREATE TRIGGER adaptive_releases_identity BEFORE UPDATE ON adaptive_releases
WHEN NEW.workspace_id<>OLD.workspace_id OR NEW.id<>OLD.id
BEGIN SELECT RAISE(ABORT,'adaptive_write_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER adaptive_proposals_capacity BEFORE INSERT ON adaptive_proposals
WHEN NOT EXISTS(SELECT 1 FROM adaptive_proposals WHERE workspace_id=NEW.workspace_id AND id=NEW.id)
 AND (SELECT count(*) FROM adaptive_proposals WHERE workspace_id=NEW.workspace_id)>=20
BEGIN SELECT RAISE(ABORT,'adaptive_capacity_proposals'); END;
--> statement-breakpoint
CREATE TRIGGER adaptive_proposals_identity BEFORE UPDATE ON adaptive_proposals
WHEN NEW.workspace_id<>OLD.workspace_id OR NEW.id<>OLD.id
BEGIN SELECT RAISE(ABORT,'adaptive_write_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER adaptive_releases_bytes_insert BEFORE INSERT ON adaptive_releases
WHEN (SELECT coalesce(sum(length(CAST(title||version||body||url||topics_json||suggested_pack_ids_json AS BLOB))),0) FROM adaptive_releases WHERE workspace_id=NEW.workspace_id AND id<>NEW.id)
 +length(CAST(NEW.title||NEW.version||NEW.body||NEW.url||NEW.topics_json||NEW.suggested_pack_ids_json AS BLOB))>524288
BEGIN SELECT RAISE(ABORT,'adaptive_capacity_releases_bytes'); END;
--> statement-breakpoint
CREATE TRIGGER adaptive_releases_bytes_update BEFORE UPDATE ON adaptive_releases
WHEN (SELECT coalesce(sum(length(CAST(title||version||body||url||topics_json||suggested_pack_ids_json AS BLOB))),0) FROM adaptive_releases WHERE workspace_id=NEW.workspace_id AND id<>OLD.id)
 +length(CAST(NEW.title||NEW.version||NEW.body||NEW.url||NEW.topics_json||NEW.suggested_pack_ids_json AS BLOB))>524288
BEGIN SELECT RAISE(ABORT,'adaptive_capacity_releases_bytes'); END;
--> statement-breakpoint
CREATE TRIGGER adaptive_proposals_bytes_insert BEFORE INSERT ON adaptive_proposals
WHEN (SELECT coalesce(sum(length(CAST(title||problem AS BLOB))),0) FROM adaptive_proposals WHERE workspace_id=NEW.workspace_id AND id<>NEW.id)
 +length(CAST(NEW.title||NEW.problem AS BLOB))>262144
BEGIN SELECT RAISE(ABORT,'adaptive_capacity_proposals_bytes'); END;
--> statement-breakpoint
CREATE TRIGGER adaptive_proposals_bytes_update BEFORE UPDATE ON adaptive_proposals
WHEN (SELECT coalesce(sum(length(CAST(title||problem AS BLOB))),0) FROM adaptive_proposals WHERE workspace_id=NEW.workspace_id AND id<>OLD.id)
 +length(CAST(NEW.title||NEW.problem AS BLOB))>262144
BEGIN SELECT RAISE(ABORT,'adaptive_capacity_proposals_bytes'); END;
