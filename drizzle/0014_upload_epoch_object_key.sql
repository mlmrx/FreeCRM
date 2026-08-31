CREATE TRIGGER `upload_intents_epoch_object_key_insert` BEFORE INSERT ON `upload_intents`
WHEN NEW.`object_key` <> NEW.`workspace_id` || '/~epoch/' || printf('%020d', NEW.`mutation_epoch`) || '/' || NEW.`id` || '/blob'
BEGIN SELECT RAISE(ABORT, 'upload intent object epoch mismatch'); END;
