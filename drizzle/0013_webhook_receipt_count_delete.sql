CREATE TRIGGER `webhook_deliveries_count_delete` AFTER DELETE ON `webhook_deliveries`
BEGIN UPDATE `connector_connections` SET `webhook_receipt_count`=MAX(`webhook_receipt_count`-1, 0) WHERE `workspace_id`=OLD.`workspace_id` AND `id`=OLD.`connection_id`; END;
