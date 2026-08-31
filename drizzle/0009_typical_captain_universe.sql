ALTER TABLE `connector_connections` ADD `webhook_receipt_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `connector_connections`
SET `webhook_receipt_count` = (
  SELECT COUNT(*) FROM `webhook_deliveries`
  WHERE `workspace_id`=`connector_connections`.`workspace_id`
    AND `connection_id`=`connector_connections`.`id`
);
