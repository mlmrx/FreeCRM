CREATE INDEX `idx_webhook_deliveries_retention` ON `webhook_deliveries` (`workspace_id`,`connection_id`,`received_at`);
