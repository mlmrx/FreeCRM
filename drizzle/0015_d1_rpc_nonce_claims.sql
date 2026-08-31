CREATE TABLE `d1_rpc_nonce_claims` (
	`nonce` text PRIMARY KEY NOT NULL,
	`claimed_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "d1_rpc_nonce_claims_nonce_check" CHECK(length("d1_rpc_nonce_claims"."nonce") = 36),
	CONSTRAINT "d1_rpc_nonce_claims_expiry_check" CHECK("d1_rpc_nonce_claims"."claimed_at" >= 0 AND "d1_rpc_nonce_claims"."expires_at" >= "d1_rpc_nonce_claims"."claimed_at")
);
--> statement-breakpoint
CREATE INDEX `idx_d1_rpc_nonce_claims_expiry` ON `d1_rpc_nonce_claims` (`expires_at`);
--> statement-breakpoint
CREATE TRIGGER `d1_rpc_nonce_replay_guard` BEFORE INSERT ON `d1_rpc_nonce_claims`
WHEN EXISTS (SELECT 1 FROM `d1_rpc_nonce_claims` WHERE `nonce` = NEW.`nonce`)
BEGIN SELECT RAISE(ABORT, 'd1_rpc_nonce_replayed'); END;
