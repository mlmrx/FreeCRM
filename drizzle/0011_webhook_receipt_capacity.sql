CREATE TRIGGER `webhook_deliveries_capacity_insert` BEFORE INSERT ON `webhook_deliveries`
WHEN (SELECT `webhook_receipt_count` FROM `connector_connections` WHERE `workspace_id`=NEW.`workspace_id` AND `id`=NEW.`connection_id`) >= 50000
BEGIN SELECT RAISE(ABORT, 'webhook receipt capacity exceeded'); END;
