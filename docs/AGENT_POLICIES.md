# Agent policies and zero-write dry-run

Agent policies add explicit limits to the existing agent safeguards. They do not
grant tools, activate agents, clear emergency stops, expand workspace access, or
enable external execution. One shared implementation works across personal,
business, and enterprise workspaces.

## Use the editor

Open an agent's **Policy & dry-run** panel. Owners and admins can choose granted
local tools, record types and optional IDs, a read limit, total and per-action
cost ceilings, approval rules, expiry, and a policy stop. The default draft asks
for human approval for every action. An empty allowed-tool list permits no tools.

**Dry-run — no changes** evaluates a representative proposal against the draft
and the current agent state. It returns a decision, the matched rule, and a plain
language explanation. It does not create an agent run, approval, receipt, audit
event, seed workspace, write to storage, call a model, or execute a tool. Explicit
record IDs are checked for membership and type without loading record contents.
The result is a preview, never an authorization for a later action.

Changing an agent's safety controls, autonomy, budget, or grants clears its old
preview and refreshes the editor's safety information without discarding the
unsaved draft. Expiring grants and policies also invalidate the preview. A late
response from an earlier state cannot replace the current editor. Changes from
another browser still require a workspace refresh; the server independently
rechecks the current safeguards before every real action.

**Save and activate new version** asks for confirmation. A successful save creates
an immutable version and an audit event in the same transaction. All pending,
authorized, or running proposals for that agent are cancelled, even if the new
policy appears less restrictive. Propose fresh work against the new version.
Completed receipts remain available and replayable without another execution.

The editor uses a stable retry key after an uncertain connection. A concurrent
save produces a conflict instead of overwriting another person's policy. Reload
after a conflict; your unsaved draft is kept until you choose to replace it. A
replayed old save receipt proves that version was saved, not that it remains
active: the editor fetches the current version before presenting it as active.
Revoked tool grants remain visible as removable selections in an existing draft.

## What is enforced

- Tenant membership and `agents:manage` plus `records:read` authorization.
- Current enabled tool grants, grant expiry, local simulator transport, and the
  owner's agent budget. Authored policy cannot expand any of these limits.
- Policy stop, policy expiry, allowed tool IDs, record types, optional exact
  record IDs, maximum records read, total budget, and per-action budget.
- Existing autonomy and destructive-action approval requirements, followed by
  additional policy approval requirements. A cost threshold requires approval
  strictly **above** the threshold; equal cost is not above it.
- The exact active policy version at proposal, approval, and receipt creation.
  SQLite/D1 triggers independently enforce these boundaries at the durable write
  so a policy, grant, or budget change racing a request cannot produce a receipt.

The `advancedPolicies` capability controls the editor/settings/save/dry-run API;
`agentPlane` is also required. Disabling authoring does **not** disable enforcement
of an active policy. Existing agents without authored policies retain platform
safeguards. New policies are never silently added to existing agents.

Execution remains limited to the **non-external local record-summary simulator**.
Record types, IDs, and the read cap are parameterized SQL filters applied before
aggregation. No MCP server, network connector, provider write, or arbitrary code
execution is enabled by this feature. `external_execution_disabled` remains the
execution boundary for unsupported external transports.

Budget values are integer cents against the agent's existing spending counter.
The existing `monthly_budget_cents` field does not implement an automatic monthly
reset: policy changes never reset spending. A lower ceiling can immediately stop
further spending. The simulator uses the proposal's validated cost estimate as its
recorded cost; these are not provider billing measurements.

## API contract

`GET /api/v1/agents/policies?agentId=<id>` returns the active version (or null),
draft, current grants, owner budget ceiling, current spending, safety state, and
the latest 20 version headers. It never initializes a workspace.

`POST /api/v1/agents/policies` accepts JSON with an `operation` of `dry-run` or
`save`, an `agentId`, and a complete strict policy document. Unknown or missing
policy fields are rejected; there is no executable policy expression language.

```json
{
  "schemaVersion": 1,
  "allowedToolIds": ["<currently-granted-local-tool-id>"],
  "recordScope": {
    "objectTypes": ["contact", "company"],
    "recordIds": null,
    "maxRecords": 100
  },
  "budgetCents": 100,
  "maxActionCostCents": 10,
  "requireApproval": true,
  "approvalThresholdCents": null,
  "expiresAt": null,
  "stopped": false
}
```

For `dry-run`, include a `proposal` object containing `toolId`, `requestedScope`
(`records:read` for the current simulator), `estimatedCostCents`, and `destructive`.
An optional `records` object has the same shape as `recordScope`; omission tests
the entire draft scope. Past expiry is allowed for testing the deny rule.

For `save`, include `expectedVersion` (0 when no authored policy exists) and an
`Idempotency-Key` header. Expiry must be null or a future canonical UTC timestamp
such as `2099-01-01T00:00:00.000Z`. The save receipt includes `agentId`, `active`
(the version saved by that operation), and `replayed`. Fetch settings to determine
which version is current after replay.

Limits: 32,000-byte request body; 16,000-character stored policy; 16 selected tools;
50 explicit record IDs; 1–1,000 records per read; 200 immutable versions per agent.
Lists are normalized for stable retry hashing. Record IDs must belong to this
workspace and selected types. Version history is append-only; physical deletion
of an agent with retained policy history is intentionally restricted.

## Storage and verification

Forward migration `0020_agent_policies.sql` adds `agent_policy_versions`, durable
uniqueness for operation IDs, immutable-history and validation triggers, policy
activation cancellation, and run/receipt safety guards. It also adds the audit
viewer's tenant/time/ID pagination index. Apply migrations with the existing
deployment workflow; this change does not automatically migrate production.

The existing portable CRM snapshot intentionally excludes the agent control
plane, including policy history. Retrieve the current policy through the settings
API; retain user-owned SQLite/D1 database backups for complete immutable policy
history and recovery. A portable CRM export is not a policy-history backup.

Targeted tests use the actual forward migrations on in-memory SQLite, a D1-shaped
adapter, and synthetic data. Coverage includes no-write/no-network dry-run through
the authenticated route, capability and permission checks, tenant boundaries,
optimistic save/replay, append-only history, approval enforcement, scoped reads,
revoked grant recovery, concurrent policy/grant/record/budget changes, and client
receipt integrity. Editor tests verify static semantics and recovery controls;
actual keyboard/mobile interaction still belongs in release browser QA.

`scripts/smoke-policy-editor.mjs` performs actual Chromium interaction against an
isolated loopback Worker: keyboard disclosure and visible focus, no-write dry-run,
a real committed save with a malformed receipt and competing newer version,
revoked-grant recovery, and 390px editor reflow. It requires
`FREE_CRM_ROADMAP_QA=synthetic-disposable` and `FREE_CRM_BASE_URL` pointing at
disposable test state, because it creates fictional agents and immutable history.
Never point it at an owner's real local workspace.

```bash
npx vitest run tests/agent-policy.test.ts tests/agent-policy-service.test.ts tests/agent-policy-route.test.ts tests/agent-policy-client.test.ts tests/agent-policy-editor.test.ts
npm run test:db
npm run db:check
npm run db:drift
```

These focused checks supplement, not replace, the repository's full release gates.
