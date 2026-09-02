ALTER TABLE `agent_tool_grants` ADD `expires_at` text;
--> statement-breakpoint
CREATE TRIGGER `agent_tool_grants_expiry_validate_insert` BEFORE INSERT ON `agent_tool_grants`
WHEN NEW.`expires_at` IS NOT NULL AND julianday(NEW.`expires_at`) IS NULL
BEGIN SELECT RAISE(ABORT, 'invalid agent tool grant expiry'); END;
--> statement-breakpoint
CREATE TRIGGER `agent_tool_grants_expiry_validate_update` BEFORE UPDATE OF `expires_at` ON `agent_tool_grants`
WHEN NEW.`expires_at` IS NOT NULL AND julianday(NEW.`expires_at`) IS NULL
BEGIN SELECT RAISE(ABORT, 'invalid agent tool grant expiry'); END;
--> statement-breakpoint
DROP TRIGGER `agent_runs_validate_insert`;
--> statement-breakpoint
CREATE TRIGGER `agent_runs_validate_insert` BEFORE INSERT ON `agent_runs`
WHEN NEW.`tool_id` IS NULL
  OR NEW.`request_hash` IS NULL
  OR length(NEW.`request_hash`) <> 64
  OR NEW.`request_hash` GLOB '*[^0-9a-f]*'
  OR length(trim(NEW.`idempotency_key`)) NOT BETWEEN 1 AND 128
  OR NEW.`status` NOT IN ('proposed','constrained','awaiting_approval','authorized','running','succeeded','failed','rejected','expired','cancelled')
  OR NEW.`budget_reserved_cents` < 0
  OR CASE WHEN json_valid(NEW.`action_json`) = 1 THEN
       COALESCE(json_type(NEW.`action_json`, '$.summary'), '') <> 'text'
       OR length(trim(json_extract(NEW.`action_json`, '$.summary'))) NOT BETWEEN 1 AND 500
       OR COALESCE(json_type(NEW.`action_json`, '$.scope'), '') <> 'text'
       OR length(trim(json_extract(NEW.`action_json`, '$.scope'))) NOT BETWEEN 1 AND 120
       OR length(NEW.`action_json`) > 8192
     ELSE 1 END
  OR (NEW.`goal_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `agent_goals` WHERE `workspace_id` = NEW.`workspace_id` AND `id` = NEW.`goal_id` AND `agent_id` = NEW.`agent_id`))
  OR NOT EXISTS (
       SELECT 1 FROM `agent_tools` t
       JOIN `agent_tool_grants` g ON g.`workspace_id` = t.`workspace_id` AND g.`tool_id` = t.`id`
       WHERE t.`workspace_id` = NEW.`workspace_id`
         AND t.`id` = NEW.`tool_id`
         AND g.`agent_id` = NEW.`agent_id`
         AND t.`enabled` = 1
         AND (g.`expires_at` IS NULL OR julianday(g.`expires_at`) > julianday('now'))
     )
  OR EXISTS (SELECT 1 FROM `capability_overrides` WHERE `workspace_id` = NEW.`workspace_id` AND `capability_key` = 'agentPlane' AND `enabled` = 0)
BEGIN SELECT RAISE(ABORT, 'invalid agent run'); END;
--> statement-breakpoint
DROP TRIGGER `execution_receipts_validate_insert`;
--> statement-breakpoint
CREATE TRIGGER `execution_receipts_validate_insert` BEFORE INSERT ON `execution_receipts`
WHEN NEW.`outcome` NOT IN ('succeeded','failed')
  OR NEW.`cost_cents` < 0
  OR length(NEW.`input_hash`) <> 64
  OR NEW.`input_hash` GLOB '*[^0-9a-f]*'
  OR (NEW.`output_hash` IS NOT NULL AND (length(NEW.`output_hash`) <> 64 OR NEW.`output_hash` GLOB '*[^0-9a-f]*'))
  OR (NEW.`outcome` = 'succeeded' AND NEW.`output_hash` IS NULL)
  OR json_valid(NEW.`metadata_json`) <> 1
  OR length(NEW.`metadata_json`) > 16384
  OR NOT EXISTS (
       SELECT 1 FROM `agent_runs` r
       JOIN `agent_identities` ai ON ai.`workspace_id` = r.`workspace_id` AND ai.`id` = r.`agent_id`
       JOIN `agent_tools` t ON t.`workspace_id` = r.`workspace_id` AND t.`id` = r.`tool_id`
       JOIN `agent_tool_grants` g ON g.`workspace_id` = r.`workspace_id` AND g.`agent_id` = r.`agent_id` AND g.`tool_id` = r.`tool_id`
       WHERE r.`workspace_id` = NEW.`workspace_id`
         AND r.`id` = NEW.`run_id`
         AND r.`tool_id` = NEW.`tool_id`
         AND r.`status` = 'authorized'
         AND r.`budget_reserved_cents` = NEW.`cost_cents`
         AND ai.`status` = 'active'
         AND ai.`emergency_stopped_at` IS NULL
         AND ai.`spent_cents` + NEW.`cost_cents` <= ai.`monthly_budget_cents`
         AND t.`enabled` = 1
         AND t.`external` = 0
         AND t.`transport` = 'local-simulator'
         AND (g.`expires_at` IS NULL OR julianday(g.`expires_at`) > julianday('now'))
         AND EXISTS (SELECT 1 FROM json_each(g.`scopes_json`) WHERE value = json_extract(r.`action_json`, '$.scope'))
         AND EXISTS (SELECT 1 FROM json_each(t.`scopes_json`) WHERE value = json_extract(r.`action_json`, '$.scope'))
         AND ((ai.`autonomy_level` = 'policy-autonomous' AND COALESCE(json_extract(r.`action_json`, '$.destructive'), 0) = 0) OR EXISTS (SELECT 1 FROM `approval_requests` ap WHERE ap.`workspace_id` = r.`workspace_id` AND ap.`run_id` = r.`id` AND ap.`status` = 'approved'))
         AND NOT EXISTS (SELECT 1 FROM `capability_overrides` c WHERE c.`workspace_id` = r.`workspace_id` AND c.`capability_key` = 'agentPlane' AND c.`enabled` = 0)
     )
BEGIN SELECT RAISE(ABORT, 'run is not executable'); END;
