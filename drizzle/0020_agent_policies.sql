CREATE TABLE `agent_policy_versions` (
	`workspace_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`version` integer NOT NULL,
	`document_json` text NOT NULL,
	`operation_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `agent_id`, `version`),
	FOREIGN KEY (`workspace_id`,`agent_id`) REFERENCES `agent_identities`(`workspace_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "agent_policy_version_range" CHECK("agent_policy_versions"."version" BETWEEN 1 AND 200),
	CONSTRAINT "agent_policy_document_json" CHECK(json_valid("agent_policy_versions"."document_json") AND length("agent_policy_versions"."document_json")<=16000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_agent_policy_operation` ON `agent_policy_versions` (`workspace_id`,`agent_id`,`operation_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_events_workspace_created_id` ON `audit_events` (`workspace_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE TRIGGER agent_policy_versions_immutable_update BEFORE UPDATE ON agent_policy_versions
BEGIN SELECT RAISE(ABORT, 'agent policy history is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER agent_policy_versions_immutable_delete BEFORE DELETE ON agent_policy_versions
BEGIN SELECT RAISE(ABORT, 'agent policy history is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER agent_policy_versions_validate BEFORE INSERT ON agent_policy_versions
WHEN NEW.version <> (SELECT COALESCE(MAX(version),0)+1 FROM agent_policy_versions WHERE workspace_id=NEW.workspace_id AND agent_id=NEW.agent_id)
  OR length(NEW.operation_id) NOT BETWEEN 1 AND 128
  OR length(NEW.request_hash)<>64 OR NEW.request_hash GLOB '*[^0-9a-f]*'
  OR NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND (w.owner_user_id=NEW.created_by OR EXISTS (SELECT 1 FROM memberships m WHERE m.workspace_id=w.id AND m.user_id=NEW.created_by AND m.role IN ('owner','admin'))))
  OR CASE WHEN json_valid(NEW.document_json)<>1 THEN 1 ELSE
    json_type(NEW.document_json)<>'object'
    OR (SELECT COUNT(*) FROM json_each(NEW.document_json))<>9
    OR COALESCE(json_extract(NEW.document_json,'$.schemaVersion'),0)<>1
    OR COALESCE(json_type(NEW.document_json,'$.allowedToolIds'),'')<>'array'
    OR json_array_length(NEW.document_json,'$.allowedToolIds')>16
    OR (SELECT COUNT(*) FROM json_each(NEW.document_json,'$.allowedToolIds'))<>(SELECT COUNT(DISTINCT value) FROM json_each(NEW.document_json,'$.allowedToolIds'))
    OR EXISTS (SELECT 1 FROM json_each(NEW.document_json,'$.allowedToolIds') item WHERE item.type<>'text' OR NOT EXISTS (
      SELECT 1 FROM agent_tool_grants g JOIN agent_tools t ON t.workspace_id=g.workspace_id AND t.id=g.tool_id
      WHERE g.workspace_id=NEW.workspace_id AND g.agent_id=NEW.agent_id AND t.id=item.value AND t.enabled=1 AND t.external=0 AND t.transport='local-simulator'
        AND (g.expires_at IS NULL OR julianday(g.expires_at)>julianday('now'))
        AND EXISTS (SELECT 1 FROM json_each(g.scopes_json) WHERE value='records:read')
        AND EXISTS (SELECT 1 FROM json_each(t.scopes_json) WHERE value='records:read')))
    OR COALESCE(json_type(NEW.document_json,'$.budgetCents'),'')<>'integer'
    OR json_extract(NEW.document_json,'$.budgetCents') NOT BETWEEN 0 AND (SELECT monthly_budget_cents FROM agent_identities WHERE workspace_id=NEW.workspace_id AND id=NEW.agent_id)
    OR COALESCE(json_type(NEW.document_json,'$.maxActionCostCents'),'')<>'integer'
    OR json_extract(NEW.document_json,'$.maxActionCostCents') NOT BETWEEN 0 AND json_extract(NEW.document_json,'$.budgetCents')
    OR COALESCE(json_type(NEW.document_json,'$.requireApproval'),'') NOT IN ('true','false')
    OR COALESCE(json_type(NEW.document_json,'$.stopped'),'') NOT IN ('true','false')
    OR COALESCE(json_type(NEW.document_json,'$.approvalThresholdCents'),'') NOT IN ('null','integer')
    OR (json_type(NEW.document_json,'$.approvalThresholdCents')='integer' AND json_extract(NEW.document_json,'$.approvalThresholdCents') NOT BETWEEN 0 AND json_extract(NEW.document_json,'$.maxActionCostCents'))
    OR COALESCE(json_type(NEW.document_json,'$.expiresAt'),'') NOT IN ('null','text')
    OR (json_type(NEW.document_json,'$.expiresAt')='text' AND (length(json_extract(NEW.document_json,'$.expiresAt'))<>24 OR julianday(json_extract(NEW.document_json,'$.expiresAt')) IS NULL OR julianday(json_extract(NEW.document_json,'$.expiresAt'))<=julianday('now') OR strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(NEW.document_json,'$.expiresAt'))<>json_extract(NEW.document_json,'$.expiresAt')))
    OR COALESCE(json_type(NEW.document_json,'$.recordScope'),'')<>'object'
    OR (SELECT COUNT(*) FROM json_each(NEW.document_json,'$.recordScope'))<>3
    OR COALESCE(json_type(NEW.document_json,'$.recordScope.objectTypes'),'')<>'array'
    OR json_array_length(NEW.document_json,'$.recordScope.objectTypes') NOT BETWEEN 1 AND 12
    OR (SELECT COUNT(*) FROM json_each(NEW.document_json,'$.recordScope.objectTypes'))<>(SELECT COUNT(DISTINCT value) FROM json_each(NEW.document_json,'$.recordScope.objectTypes'))
    OR EXISTS (SELECT 1 FROM json_each(NEW.document_json,'$.recordScope.objectTypes') WHERE type<>'text' OR value NOT IN ('lead','contact','company','opportunity','activity','task','campaign','product','quote','invoice','ticket','document'))
    OR COALESCE(json_type(NEW.document_json,'$.recordScope.maxRecords'),'')<>'integer'
    OR json_extract(NEW.document_json,'$.recordScope.maxRecords') NOT BETWEEN 1 AND 1000
    OR COALESCE(json_type(NEW.document_json,'$.recordScope.recordIds'),'') NOT IN ('null','array')
    OR (json_type(NEW.document_json,'$.recordScope.recordIds')='array' AND (
      json_array_length(NEW.document_json,'$.recordScope.recordIds') NOT BETWEEN 1 AND 50
      OR (SELECT COUNT(*) FROM json_each(NEW.document_json,'$.recordScope.recordIds'))<>(SELECT COUNT(DISTINCT value) FROM json_each(NEW.document_json,'$.recordScope.recordIds'))
      OR EXISTS (SELECT 1 FROM json_each(NEW.document_json,'$.recordScope.recordIds') item WHERE item.type<>'text' OR length(item.value) NOT BETWEEN 1 AND 128 OR NOT EXISTS (SELECT 1 FROM records r WHERE r.workspace_id=NEW.workspace_id AND r.id=item.value AND r.object_type IN (SELECT value FROM json_each(NEW.document_json,'$.recordScope.objectTypes'))))))
  END
BEGIN SELECT RAISE(ABORT, 'invalid agent policy or stale version'); END;
--> statement-breakpoint
CREATE TRIGGER agent_policy_versions_invalidate_work AFTER INSERT ON agent_policy_versions
BEGIN
  UPDATE approval_requests SET status='cancelled',decided_by_actor_id=NULL,decided_at=NEW.created_at,decision_id='policy-version:' || NEW.version || ':' || id
    WHERE workspace_id=NEW.workspace_id AND status='pending' AND run_id IN (SELECT id FROM agent_runs WHERE workspace_id=NEW.workspace_id AND agent_id=NEW.agent_id AND status IN ('awaiting_approval','authorized','running'));
  INSERT INTO agent_traces (id,workspace_id,run_id,sequence,event_type,detail_json,created_at)
    SELECT lower(hex(randomblob(16))),r.workspace_id,r.id,COALESCE((SELECT MAX(sequence)+1 FROM agent_traces t WHERE t.workspace_id=r.workspace_id AND t.run_id=r.id),1),'policy_changed',json_object('version',NEW.version),NEW.created_at
    FROM agent_runs r WHERE r.workspace_id=NEW.workspace_id AND r.agent_id=NEW.agent_id AND r.status IN ('awaiting_approval','authorized','running');
  UPDATE agent_runs SET status='cancelled',finished_at=NEW.created_at WHERE workspace_id=NEW.workspace_id AND agent_id=NEW.agent_id AND status IN ('awaiting_approval','authorized','running');
END;
--> statement-breakpoint
-- Shared predicate used at every durable execution boundary, including raced writes.
CREATE VIEW agent_policy_run_permissions AS
SELECT r.workspace_id,r.id AS run_id,
  CASE WHEN p.version IS NULL THEN CASE WHEN COALESCE(json_extract(r.action_json,'$.policyVersion'),0)=0 THEN 1 ELSE 0 END
  WHEN json_extract(r.action_json,'$.policyVersion')=p.version
    AND json_extract(p.document_json,'$.stopped')=0
    AND (json_type(p.document_json,'$.expiresAt')='null' OR julianday(json_extract(p.document_json,'$.expiresAt'))>julianday('now'))
    AND r.tool_id IN (SELECT value FROM json_each(p.document_json,'$.allowedToolIds'))
    AND r.budget_reserved_cents<=json_extract(p.document_json,'$.maxActionCostCents')
    AND ai.spent_cents+r.budget_reserved_cents<=json_extract(p.document_json,'$.budgetCents')
    AND json_type(r.action_json,'$.records.objectTypes')='array' AND json_array_length(r.action_json,'$.records.objectTypes') BETWEEN 1 AND 12
    AND NOT EXISTS (SELECT 1 FROM json_each(r.action_json,'$.records.objectTypes') item WHERE item.type<>'text' OR item.value NOT IN (SELECT value FROM json_each(p.document_json,'$.recordScope.objectTypes')))
    AND json_type(r.action_json,'$.records.maxRecords')='integer' AND json_extract(r.action_json,'$.records.maxRecords') BETWEEN 1 AND json_extract(p.document_json,'$.recordScope.maxRecords')
    AND json_type(r.action_json,'$.records.recordIds') IN ('null','array')
    AND (json_type(p.document_json,'$.recordScope.recordIds')='null' OR (
      json_type(r.action_json,'$.records.recordIds')='array'
      AND NOT EXISTS (SELECT 1 FROM json_each(r.action_json,'$.records.recordIds') item WHERE item.type<>'text' OR item.value NOT IN (SELECT value FROM json_each(p.document_json,'$.recordScope.recordIds')))))
  THEN 1 ELSE 0 END AS allowed,
  CASE WHEN p.version IS NOT NULL AND (json_extract(p.document_json,'$.requireApproval')=1 OR (json_type(p.document_json,'$.approvalThresholdCents')='integer' AND r.budget_reserved_cents>json_extract(p.document_json,'$.approvalThresholdCents'))) THEN 1 ELSE 0 END AS approval_required
FROM agent_runs r JOIN agent_identities ai ON ai.workspace_id=r.workspace_id AND ai.id=r.agent_id
LEFT JOIN agent_policy_versions p ON p.workspace_id=r.workspace_id AND p.agent_id=r.agent_id AND p.version=(SELECT MAX(v.version) FROM agent_policy_versions v WHERE v.workspace_id=r.workspace_id AND v.agent_id=r.agent_id);
--> statement-breakpoint
CREATE TRIGGER agent_policy_run_insert AFTER INSERT ON agent_runs
WHEN NEW.status IN ('awaiting_approval','authorized','running') AND EXISTS (
  SELECT 1 FROM agent_policy_run_permissions p WHERE p.workspace_id=NEW.workspace_id AND p.run_id=NEW.id
    AND (p.allowed<>1 OR (NEW.status IN ('authorized','running') AND p.approval_required=1 AND NOT EXISTS (SELECT 1 FROM approval_requests ap WHERE ap.workspace_id=NEW.workspace_id AND ap.run_id=NEW.id AND ap.status='approved'))))
BEGIN SELECT RAISE(ABORT, 'agent policy no longer permits the run'); END;
--> statement-breakpoint
CREATE TRIGGER agent_policy_run_authorize BEFORE UPDATE OF status ON agent_runs
WHEN NEW.status IN ('authorized','running') AND EXISTS (
  SELECT 1 FROM agent_policy_run_permissions p WHERE p.workspace_id=NEW.workspace_id AND p.run_id=NEW.id
    AND (p.allowed<>1 OR (p.approval_required=1 AND NOT EXISTS (SELECT 1 FROM approval_requests ap WHERE ap.workspace_id=NEW.workspace_id AND ap.run_id=NEW.id AND ap.status='approved'))))
BEGIN SELECT RAISE(ABORT, 'agent policy no longer permits authorization'); END;
--> statement-breakpoint
CREATE TRIGGER agent_policy_receipt_guard BEFORE INSERT ON execution_receipts
WHEN NOT EXISTS (
  SELECT 1 FROM agent_policy_run_permissions p WHERE p.workspace_id=NEW.workspace_id AND p.run_id=NEW.run_id AND p.allowed=1
    AND (p.approval_required=0 OR EXISTS (SELECT 1 FROM approval_requests ap WHERE ap.workspace_id=NEW.workspace_id AND ap.run_id=NEW.run_id AND ap.status='approved')))
BEGIN SELECT RAISE(ABORT, 'agent policy no longer permits execution'); END;
