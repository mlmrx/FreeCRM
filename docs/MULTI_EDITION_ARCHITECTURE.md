# Multi-edition platform foundation

FREE CRM remains one application and one data model. A workspace profile is a reversible set of defaults—not an edition fork or a data migration. Capability overrides let an owner expose only what is useful while preserving every record when profiles change.

## Plane boundaries

| Plane | Responsibility | Current boundary |
| --- | --- | --- |
| Control | workspace profile, capabilities, membership, roles, policy and audit | `server/control-plane.ts`, capability registry |
| Data | actors, party graph, CRM objects, relationships and timeline | tenant-scoped D1 repositories and composite foreign keys |
| Integration | connectors, user-owned credential references, cursors, webhooks, retry/outbox | connector contracts and connection tables |
| Agent | identities, goals, runs, tools, approvals, receipts, traces and stop controls | fail-closed policy evaluator and agent tables |

The shared kernel models humans, organizations, services, and agents as actors. Parties can be connected through typed relationships. Activities provide a unified timeline; work items, opportunities, cases, artifacts, and goals use explicit tenant ownership. Repository APIs take `workspaceId` as a mandatory argument so a future PostgreSQL adapter can preserve the same boundary.

## Profiles and capabilities

`personal`, `business`, and `enterprise` select defaults for navigation, limits, and policies. Agentic CRM is the `agentPlane` capability across all profiles. “Humans + agents” onboarding enables that capability; it is not a fourth storage profile. Overrides are durable and reversible. Disabling a capability hides entry points but never deletes its data.

## Security decisions

- Server identity establishes workspace membership before any repository call. Roles are owner, admin, operator, member, auditor, and agent; permissions are evaluated server-side.
- Every new row carries `workspace_id`; graph foreign keys include it to prevent cross-tenant edges.
- Audit and execution receipt tables are append-only by both application contract and SQLite/D1 mutation-blocking triggers. Receipts store hashes and bounded metadata, not provider payloads.
- Credentials are never stored in connector configuration. Only an opaque secret-store reference and non-secret metadata are retained. Deployment supplies its own secret store/provider credentials.
- Agents default to no external execution. Scope, budget, pause/kill state, autonomy, policy, and approval are checked before execution. Destructive actions always require approval.
- Webhook consumers must authenticate, validate bounded payloads, deduplicate delivery IDs, and enqueue work through the outbox. MCP tools use the same tool scopes and policy decision.

## Storage and deployment

D1/SQLite is the current relational adapter. The repository boundary avoids D1-specific domain objects so PostgreSQL can be added later. Document callers use the `TenantObjectStorage` contract and `R2TenantObjectStorage` adapter today; every put/get/delete derives its object key from the authenticated workspace and rejects traversal or ambiguous segments. The same contract is suitable for local-file and S3-compatible adapters without allowing a mutable CRM field to select another tenant's object. Migration `0001_multi_edition_foundation.sql` is forward-only and non-destructive.

Reference connectors are deliberately limited to real local simulators (CSV and webhook); neither is presented as an authenticated third-party connection. OAuth/API-key connectors retain only credential metadata and opaque references. Sync cursors, idempotency keys, retry state, health, scope disclosure, disconnect, credential deletion, and audit are framework requirements.

## Known limitations and next milestone

This milestone includes an end-to-end, deliberately local agent execution path: create a paused owned agent, grant its local simulator, activate or emergency-stop it, propose an action, resolve approval, re-check stop and budget state, execute the simulator, and persist hashed receipts, traces, and audit events. Connector lifecycle operations likewise execute only the CSV/webhook simulators and never imply a third-party connection.

External providers and production PostgreSQL/S3 adapters remain intentionally unimplemented: adding them requires provider-specific threat modeling, credential-store integration, and deployment approval. The exact next milestone is a PostgreSQL repository adapter contract test suite plus an encrypted, deployment-owned credential-store adapter; it must not add a real provider until connect, refresh, revoke, deletion, retry, and audit behavior pass those contracts.

## API surface

- `GET /api/v1/bootstrap` returns resolved capabilities and bounded agent control-plane summaries.
- `POST /api/v1/commands` persists profile/onboarding choices and audited capability overrides. Record creation rejects disabled capabilities and configured limits.
- `GET|POST /api/v1/agents/actions` manages agents, pause/kill state, proposals, approvals, local execution, and receipts. Client-supplied autonomy, grants, budgets, or external-policy claims are never trusted; policy inputs are read from tenant-scoped rows.
- `POST /api/v1/connectors` connects, idempotently syncs, and disconnects the two local simulators. Disconnect clears credential references and metadata even though simulators do not require secrets.
- `GET|POST /api/v1/kernel` exposes the tenant-scoped shared kernel for actors, party relationships, timeline activities, and work items/opportunities/cases/artifacts/goals/policies. Composite database keys and mandatory workspace context prevent cross-tenant graph edges.

The workspace UI exposes the full safe reference workflows rather than decorative cards: an owner can create and activate an approval-first agent, propose a local read action using its server-issued grant, approve or reject it, execute the authorized simulator, and inspect the resulting receipt. The integrations view likewise connects, idempotently runs, and disconnects each local simulator while showing its persisted health and cursor. External execution remains unavailable by design.

Inbound webhook requests additionally require the deployment-owned `FREE_CRM_WEBHOOK_KEY` and an explicitly connected tenant webhook simulator. Accepted payloads are byte-bounded, reduced to an allowlisted activity summary, SHA-256 hashed, deduplicated by tenant/connection/provider delivery ID, written to the delivery ledger, and queued through the outbox. Concurrent duplicate delivery attempts rely on the database unique fence and atomic D1 batch rather than a race-prone preflight alone.
