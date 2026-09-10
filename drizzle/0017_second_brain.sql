CREATE TABLE `brain_chunks` (
	`workspace_id` text NOT NULL,
	`id` text NOT NULL,
	`source_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`content` text NOT NULL,
	`embedding` blob,
	`embedding_model` text,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`,`source_id`) REFERENCES `brain_sources`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "brain_chunk_bound" CHECK("brain_chunks"."ordinal" BETWEEN 0 AND 39 AND length("brain_chunks"."content") BETWEEN 1 AND 2000),
	CONSTRAINT "brain_embedding_bound" CHECK(("brain_chunks"."embedding" IS NULL AND "brain_chunks"."embedding_model" IS NULL) OR ("brain_chunks"."embedding" IS NOT NULL AND "brain_chunks"."embedding_model" IS NOT NULL AND length("brain_chunks"."embedding") BETWEEN 4 AND 4096 AND length("brain_chunks"."embedding")%4=0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_brain_chunk_ordinal` ON `brain_chunks` (`workspace_id`,`source_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `brain_conversations` (
	`workspace_id` text NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "brain_conversation_title" CHECK(length("brain_conversations"."title") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE INDEX `idx_brain_conversations_updated` ON `brain_conversations` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `brain_links` (
	`workspace_id` text NOT NULL,
	`source_id` text NOT NULL,
	`target_id` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `source_id`, `target_id`),
	FOREIGN KEY (`workspace_id`,`source_id`) REFERENCES `brain_sources`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`target_id`) REFERENCES `brain_sources`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "brain_link_distinct" CHECK("brain_links"."source_id"<>"brain_links"."target_id")
);
--> statement-breakpoint
CREATE TABLE `brain_messages` (
	`workspace_id` text NOT NULL,
	`id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`citations_json` text DEFAULT '[]' NOT NULL,
	`mode` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`,`conversation_id`) REFERENCES `brain_conversations`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "brain_message_role" CHECK("brain_messages"."role" IN ('user','assistant')),
	CONSTRAINT "brain_message_mode" CHECK("brain_messages"."mode" IN ('question','search','ollama')),
	CONSTRAINT "brain_message_content" CHECK(length("brain_messages"."content") BETWEEN 1 AND 24000),
	CONSTRAINT "brain_message_citations" CHECK(json_valid("brain_messages"."citations_json") AND json_type("brain_messages"."citations_json")='array' AND length("brain_messages"."citations_json")<=40000)
);
--> statement-breakpoint
CREATE INDEX `idx_brain_messages_conversation` ON `brain_messages` (`workspace_id`,`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `brain_receipts` (
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
	CONSTRAINT "brain_write_conflict" CHECK("brain_receipts"."affected"=1),
	CONSTRAINT "brain_receipt_result" CHECK(json_valid("brain_receipts"."result_json") AND length("brain_receipts"."result_json")<=1024)
);
--> statement-breakpoint
CREATE INDEX `idx_brain_receipts_created` ON `brain_receipts` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `brain_record_links` (
	`workspace_id` text NOT NULL,
	`source_id` text NOT NULL,
	`record_id` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `source_id`, `record_id`),
	FOREIGN KEY (`workspace_id`,`source_id`) REFERENCES `brain_sources`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`record_id`) REFERENCES `records`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `brain_settings` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "brain_settings_enabled" CHECK("brain_settings"."enabled" IN (0,1) AND "brain_settings"."revision">=1)
);
--> statement-breakpoint
CREATE TABLE `brain_sources` (
	`workspace_id` text NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`kind` text DEFAULT 'note' NOT NULL,
	`source_url` text,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`pinned` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "brain_source_title" CHECK(length("brain_sources"."title") BETWEEN 1 AND 200),
	CONSTRAINT "brain_source_body" CHECK(length("brain_sources"."body") BETWEEN 1 AND 40000),
	CONSTRAINT "brain_source_kind" CHECK("brain_sources"."kind" IN ('note','clip','import')),
	CONSTRAINT "brain_source_tags" CHECK(json_valid("brain_sources"."tags_json") AND json_type("brain_sources"."tags_json")='array' AND length("brain_sources"."tags_json")<=2048),
	CONSTRAINT "brain_source_version" CHECK("brain_sources"."version">=1 AND "brain_sources"."pinned" IN (0,1))
);
--> statement-breakpoint
CREATE INDEX `idx_brain_sources_updated` ON `brain_sources` (`workspace_id`,`updated_at`);
--> statement-breakpoint
CREATE TRIGGER brain_sources_capacity BEFORE INSERT ON brain_sources
WHEN (SELECT count(*) FROM brain_sources WHERE workspace_id=NEW.workspace_id)>=200
BEGIN SELECT RAISE(ABORT,'brain_capacity_sources'); END;
--> statement-breakpoint
CREATE TRIGGER brain_conversations_capacity BEFORE INSERT ON brain_conversations
WHEN (SELECT count(*) FROM brain_conversations WHERE workspace_id=NEW.workspace_id)>=100
BEGIN SELECT RAISE(ABORT,'brain_capacity_conversations'); END;
--> statement-breakpoint
CREATE TRIGGER brain_messages_capacity BEFORE INSERT ON brain_messages
WHEN (SELECT count(*) FROM brain_messages WHERE workspace_id=NEW.workspace_id AND conversation_id=NEW.conversation_id)>=100
BEGIN SELECT RAISE(ABORT,'brain_capacity_messages'); END;
--> statement-breakpoint
-- Cumulative UTF-8 quotas keep complete-workspace search/export below the free RPC and Worker envelope.
CREATE TRIGGER brain_source_bytes_insert BEFORE INSERT ON brain_sources
WHEN (SELECT coalesce(sum(length(CAST(body||title||tags_json||coalesce(source_url,'') AS BLOB))),0) FROM brain_sources WHERE workspace_id=NEW.workspace_id)
  +length(CAST(NEW.body||NEW.title||NEW.tags_json||coalesce(NEW.source_url,'') AS BLOB))>3145728
BEGIN SELECT RAISE(ABORT,'brain_capacity_source_bytes'); END;
--> statement-breakpoint
CREATE TRIGGER brain_source_bytes_update BEFORE UPDATE ON brain_sources
WHEN (SELECT coalesce(sum(length(CAST(body||title||tags_json||coalesce(source_url,'') AS BLOB))),0) FROM brain_sources WHERE workspace_id=NEW.workspace_id AND id<>OLD.id)
  +length(CAST(NEW.body||NEW.title||NEW.tags_json||coalesce(NEW.source_url,'') AS BLOB))>3145728
BEGIN SELECT RAISE(ABORT,'brain_capacity_source_bytes'); END;
--> statement-breakpoint
CREATE TRIGGER brain_message_bytes_insert BEFORE INSERT ON brain_messages
WHEN (SELECT coalesce(sum(length(CAST(content||citations_json AS BLOB))),0) FROM brain_messages WHERE workspace_id=NEW.workspace_id)
  +length(CAST(NEW.content||NEW.citations_json AS BLOB))>3145728
BEGIN SELECT RAISE(ABORT,'brain_capacity_message_bytes'); END;
--> statement-breakpoint
CREATE TRIGGER brain_message_bytes_update BEFORE UPDATE ON brain_messages
WHEN (SELECT coalesce(sum(length(CAST(content||citations_json AS BLOB))),0) FROM brain_messages WHERE workspace_id=NEW.workspace_id AND id<>OLD.id)
  +length(CAST(NEW.content||NEW.citations_json AS BLOB))>3145728
BEGIN SELECT RAISE(ABORT,'brain_capacity_message_bytes'); END;
