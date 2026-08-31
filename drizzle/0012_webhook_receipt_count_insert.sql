CREATE TRIGGER `webhook_deliveries_count_insert` AFTER INSERT ON `webhook_deliveries`
BEGIN UPDATE `connector_connections` SET `webhook_receipt_count`=`webhook_receipt_count`+1 WHERE `workspace_id`=NEW.`workspace_id` AND `id`=NEW.`connection_id`; END;
