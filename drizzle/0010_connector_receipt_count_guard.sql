CREATE TRIGGER `connector_webhook_receipt_count_guard` BEFORE UPDATE OF `webhook_receipt_count` ON `connector_connections`
WHEN NEW.`webhook_receipt_count` < 0
  OR (NEW.`webhook_receipt_count` > 50000 AND NEW.`webhook_receipt_count` >= OLD.`webhook_receipt_count`)
BEGIN SELECT RAISE(ABORT, 'invalid webhook receipt count'); END;
