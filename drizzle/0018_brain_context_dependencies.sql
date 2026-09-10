-- Use an additive column instead of Drizzle's table rebuild so existing message
-- capacity triggers, indexes, foreign keys, and saved conversation rows survive.
ALTER TABLE `brain_messages` ADD COLUMN `context_source_ids_json` text NOT NULL DEFAULT '[]'
  CONSTRAINT `brain_message_context_sources` CHECK(
    json_valid(context_source_ids_json) AND json_type(context_source_ids_json)='array'
    AND json_array_length(context_source_ids_json)<=8 AND length(context_source_ids_json)<=512
  );
--> statement-breakpoint
-- Include dependency metadata in the existing cumulative 3 MiB message budget.
DROP TRIGGER brain_message_bytes_insert;
--> statement-breakpoint
DROP TRIGGER brain_message_bytes_update;
--> statement-breakpoint
CREATE TRIGGER brain_message_bytes_insert BEFORE INSERT ON brain_messages
WHEN (SELECT coalesce(sum(length(CAST(content||citations_json||context_source_ids_json AS BLOB))),0) FROM brain_messages WHERE workspace_id=NEW.workspace_id)
  +length(CAST(NEW.content||NEW.citations_json||NEW.context_source_ids_json AS BLOB))>3145728
BEGIN SELECT RAISE(ABORT,'brain_capacity_message_bytes'); END;
--> statement-breakpoint
CREATE TRIGGER brain_message_bytes_update BEFORE UPDATE ON brain_messages
WHEN (SELECT coalesce(sum(length(CAST(content||citations_json||context_source_ids_json AS BLOB))),0) FROM brain_messages WHERE workspace_id=NEW.workspace_id AND id<>OLD.id)
  +length(CAST(NEW.content||NEW.citations_json||NEW.context_source_ids_json AS BLOB))>3145728
BEGIN SELECT RAISE(ABORT,'brain_capacity_message_bytes'); END;
