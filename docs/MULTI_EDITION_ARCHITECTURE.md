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
- Audit events, execution receipts, and agent traces are append-only at the database boundary. Receipts store hashes and bounded metadata, not provider payloads.
- Reference connector credentials are never returned in snapshots. The webhook adapter stores only a workspace key's SHA-256 hash; future OAuth adapters must use an encrypted provider/secret-store reference plus non-secret metadata.
- Agents default to no external execution. Scope, budget, pause/kill state, autonomy, policy, and approval are checked before execution. Destructive actions always require approval.
- Webhook consumers authenticate with a workspace-specific key, validate bounded payloads, deduplicate delivery IDs, and enqueue durable outbox intent. A future MCP adapter must use the same tool-scope, policy, receipt, and stop boundary; no MCP transport is implemented today.

## Storage and deployment

D1/SQLite is the current relational adapter. The repository boundary avoids D1-specific domain objects so PostgreSQL can be added later. File callers use an `ObjectStorage` interface implemented by local/R2 today and suitable for S3-compatible adapters later. Migration `0001_multi_edition_foundation.sql` is forward-only and non-destructive.

Reference connectors are deliberately limited to a CSV export simulator and an authenticated inbound webhook simulator; neither is presented as a synchronized third-party account. Sync cursors, idempotency keys, retry state, health, scope disclosure, disconnect, credential deletion, and audit are enforced framework requirements.

## Known limitations and next milestone

The agent plane now persists proposals, resolves approvals, executes only a locally simulated non-external tool, writes immutable receipts/traces/audit evidence, enforces budgets and emergency stop, and exposes recent state in the workspace UI. It does not call external tools or providers.

Business and enterprise profiles currently provide one-schema capability defaults and higher limits for an exact-single-owner workspace. Invitations, shared identity administration, advanced policy authoring, MCP/external agent transports, provider OAuth, production PostgreSQL/S3 adapters, and a generic outbox delivery worker remain intentionally unimplemented.
