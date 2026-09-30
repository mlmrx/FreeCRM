# Roadmap security decisions

Status: **PROPOSED — awaiting owner review.** Prepared September 11, 2026.

This is a decision aid, not an approval, implementation claim, or deployment
instruction. The issue bodies were checked against the current source. None of
the proposed choices below has been accepted by this document.

## The short version

We can build much of this safely with synthetic workspaces. The decisions are
about who may enter a workspace, which software may read it, and when data may
leave it—not whether FREE CRM should become a different product.

| Decision | Recommended starting point | What needs an explicit decision |
| --- | --- | --- |
| [#11: no-card data connection](https://github.com/mlmrx/FreeCRM/issues/11) | Keep the existing protected connection as the default. Review an optional signed-request gateway with durable replay and usage controls. | Accept its changed security/availability tradeoff in #11 before implementing the alternative boundary. A free tier is not proof of no-card onboarding. |
| [#15: invitations](https://github.com/mlmrx/FreeCRM/issues/15) and [#16: roles](https://github.com/mlmrx/FreeCRM/issues/16) | Invite-only teams; owner-managed membership and role changes initially; no public registration or automatic team creation. | Accept the admission policy and owner/admin authority split before enabling shared access. |
| [#18: read-only MCP](https://github.com/mlmrx/FreeCRM/issues/18) | An opt-in local `stdio` adapter, with one revocable, narrowly scoped agent credential; hosted HTTP comes later. | Choose the first supported client/transport and approve its data disclosure. Hosted authorization/discovery requires its own reviewed choice. |
| [#23: outbound delivery](https://github.com/mlmrx/FreeCRM/issues/23) | One signed HTTPS event-notification adapter to an operator-controlled receiver, initially tested only against a synthetic receiver. | Accept this first adapter, permitted event fields, receiver, credential storage, and replay semantics before live delivery. |

Accepting a design permits the corresponding implementation scope; it does not
authorize production deployment, paid resources, invitations to real people,
or messages to external recipients. Those are separate gates. An issue label
or a general roadmap implementation request does not settle the choices above.

## What exists today

These are repository facts, not a live production configuration audit:

- Hosted access is exact-single-owner. Cloudflare Access verifies the configured
  issuer/audience and matches the configured owner email. Native Vercel verifies
  a GitHub account's verified owner email and its subsequent session. Device
  mode is a single local identity; it is not a team identity provider.
  See [request context](../server/request-context.ts) and
  [Vercel authentication](../server/vercel-auth.ts).
- A membership table and six roles already exist. Memberships have no lifecycle
  status. `ensureWorkspace` selects the user's oldest membership and otherwise
  creates an owner workspace with seed data. Both `owner` and `admin` currently
  receive the same permission list. This is groundwork, not working team
  admission or role administration. See [control plane](../server/control-plane.ts),
  [authorization](../server/authorization.ts), and [schema](../db/schema.ts).
- `/tour` and `/demo` are public, synthetic experiences. They do not confer
  private workspace access. Keep them independent of team identity, machine
  credentials, MCP discovery, and external delivery. See
  [synthetic tour](SYNTHETIC-TOUR.md) and [presentation demo](PLATFORM-DEMO.md).
- Native Vercel's D1 client requires both an Access service token and a separate
  HMAC secret. The Worker admits bounded SQL batches; it is not a tenant-aware
  end-user API. Mutation replay claims are durable and in the mutation batch;
  all-SELECT replay tracking is currently an isolate-local map. See
  [client](../server/vercel/d1-rpc.ts), [Worker](../workers/d1-rpc.ts),
  [signed protocol](../lib/d1-rpc-protocol.ts), and
  [deployment runbook](VERCEL_DEPLOYMENT.md).
- Agent execution is a local insights simulator with grants, policy checks,
  approval, emergency stop, and receipts—not an MCP transport or an external
  action executor. Connector simulation and authenticated inbound webhook
  handling do not constitute outbound provider delivery. Ordinary CRM commands
  already record minimal outbox intent; document cleanup has a specialized
  outbox consumer. See [agent execution](../server/agent-plane.ts),
  [connectors](../server/connectors.ts), [commands](../server/commands.ts), and
  [file cleanup](../server/file-mutations.ts).

All four proposals preserve one platform, workspace profiles, local operation,
server-derived tenant context, and SQLite/D1 support. They do not depend on a
PostgreSQL migration. They do not replace the separate
[deduplication RFC #25](https://github.com/mlmrx/FreeCRM/issues/25),
[connector-catalog RFC #26](https://github.com/mlmrx/FreeCRM/issues/26), or the
standalone personal relationship-assistant specification.

## 1. No-card Vercel-to-D1 boundary — #11

### Proposed choice

Keep Access plus HMAC as the existing default. Compare and, only after the
coordination explicitly required by #11, implement a separately selected
signed-gateway mode. Do not make Access credentials optional in today's client
or change the deployed Access policy as a shortcut.

| Candidate | Benefit | Cost or threat |
| --- | --- | --- |
| Existing Access Service Auth + HMAC | Separate admission layer before the Worker; compatible with today's client. | Onboarding/account requirements may defeat the no-card goal; operator maintains two credentials. |
| Signed gateway + durable nonce and quota coordinator | Can avoid an Access service-token dependency while retaining authenticated machine requests. | Publicly reachable authentication code consumes Worker capacity even for invalid callers; one machine key loses the independent Access protection. Adds durable coordination and its quotas. |
| Send a provider account API token from Vercel directly to the data API | Fewer application components. | Moves a powerful provider credential into the application deployment; conflicts with the current credential boundary. Not recommended. |

The recommended *candidate* is a versioned HMAC gateway plus a SQLite-backed
Durable Object for authenticated per-key admission/rate accounting. Preserve
the D1 transaction's nonce claim for mutation atomicity. An additional
coordinator is not a distributed transaction with D1: if it accepts a nonce
and the subsequent database request fails, fail closed and require an
explicitly safe retry. Do not infer that nothing committed after a timeout.

This trades an independent edge gate for an application-managed gate. The
owner must accept or reject that tradeoff; the issue's requirement not to
weaken authentication is not satisfied merely by having an HMAC. Invalid
requests must never reach D1 or create durable per-attacker state, but they can
still consume public Worker quota. If comparable admission/availability
protection cannot be demonstrated without billing enrollment, report that
limit and retain the existing mode rather than advertising a solved no-card
path.

Cloudflare documents SQLite-backed Durable Objects on Workers Free, with
operations failing at free-tier limits. Its fast rate-limit binding is
location-local and eventually consistent, so it is a useful coarse filter,
not a global security/accounting limit. These facts establish feasibility,
not an account-specific no-card guarantee.
[Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
[rate-limit behavior](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

### Proposed implementation contract

- Retain method, path, protocol, timestamp, nonce, and body-digest signing;
  add a signed key ID and deployment audience. Separate production, preview,
  test, and development keys. Never accept browser sessions, CORS access,
  provider account tokens, or agent credentials here.
- Use a bounded current/previous key ring with explicit expiry; unknown,
  revoked, or malformed keys fail closed. Retain the existing five-minute
  request-age bound initially; retain nonce claims beyond the entire accepted
  timestamp window. Read replays must be rejected across isolates/restarts,
  not just within one process.
- Perform cheap route/header/size/expiry rejection and bounded signature
  verification before durable work. Authenticated callers receive both a
  short-window limit and a deployment budget; limiter outages deny access.
  Keep bounded SQL, parameters, batch size, response size, and deadlines.
- Database RPC keys remain deployment-wide data-plane credentials. Tenant
  enforcement still happens in the application/repository; signing a
  browser-selected workspace ID does not make raw SQL tenant-safe. Never
  reuse this gateway as the future MCP API.
- Log key ID, request ID, decision, duration, and bounded counters—not SQL,
  bindings, signatures, tokens, or customer payloads. Preserve application
  audit events for the authenticated human/service operation.

### Tests and release gates

1. Before approval: document threat cases and extend a synthetic protocol
   test harness without changing the active authentication boundary.
2. After design acceptance in #11: test accepted, expired, future-dated,
   wrong-audience, malformed, unauthorized, oversized, and altered requests;
   read/write replay across instances; nonce races; rate exhaustion; limiter
   failure; key overlap/revocation; database timeouts and ambiguous commits.
   Assert zero repository execution on authentication failure.
3. Prove two synthetic tenants remain isolated through ordinary application
   requests; preserve current Access mode and device operation. Test the
   exact query budget including internal claims.
4. Before advertising no-card onboarding: an authorized operator must validate
   fresh-account enrollment, current provider terms/limits, abuse behavior,
   and the complete deployment path without supplying billing details.
   No account creation, paid upgrade, or provider changes are implied here.
5. Rehearse rollout/rotation/rollback in a nonproduction environment: add new
   verifier key, switch signer, expire old key, then remove it. Disable the
   alternative endpoint before returning to the protected path; never leave
   an alternate hostname or old key as a bypass. Keep replay evidence through
   the overlap window. Production cutover needs separate approval.

Normal implementer choices: module layout, typed envelopes, test fixtures, and
conservative bounded limits. Owner/security decision: accepting the new
boundary and its residual availability/credential-compromise risk. The
coordinate-before-implementation requirement is specific and explicit in #11.

## 2. Team membership and understandable roles — #15 and #16

### Proposed choice

Invite-only admission, initially controlled by an owner. Preserve exact-owner
mode as the default. Add a separate, disabled-by-default team admission mode
only with verified runtime identity plus an active membership or a valid
invitation acceptance. Do not turn on unrestricted GitHub/Access sign-in and
let today's auto-create behavior allocate owner workspaces.

Use owner-copied invite links first; an email-sending service is not required
for the lifecycle. Propose a 24-hour expiry and a 32-byte random one-time
token. These numbers are suggested defaults, not existing issue requirements.
Store only its digest, intended workspace, invited verified email, proposed
role, creator, expiry, and terminal status. Acceptance binds the provider's
stable issuer/subject to that membership; an email change must not silently
transfer membership to another identity.

The invitation is permission to request membership, not a login credential.
Require verified identity before acceptance. Consume the token, create the
membership, and append the audit transition atomically. Do not log the token
or put it in analytics/referrers. An invite landing page must strip any token
from the visible URL after capture, use no third-party resources, and reveal
no workspace/member details to an unverified visitor. Reissue invalidates the
old invitation; suspension/removal invalidate outstanding admission paths.

### Authority and tenant rules

- Owners manage invitations, suspension, reactivation, removal, and role
  assignment initially. Admins retain their existing ordinary CRM powers but
  do not gain membership/role administration by accident through
  `workspace:manage`. Add explicit server-side membership/role permissions.
  Delegating a constrained subset to admins is a later owner decision.
- A human invite cannot create an `agent` role. Agent registration and tool
  grants remain in the agent plane. Invite defaults should be the existing
  `member` role, with an explicit permission preview before confirmation.
- Keep at least one active owner in every workspace. Reject last-owner
  demotion, suspension, or removal, including two concurrent owners attempting
  reciprocal removals. Fail closed on a self-lockout path; make ownership
  transfer a deliberate operation, not a dropdown shortcut.
- Replace oldest-membership selection for team sessions with an explicit
  server-validated active workspace context. A selection is only a request
  to use a membership the identity already holds; every read/mutation checks
  active membership and role. Never use tenant IDs supplied in command JSON
  as authorization. Preserve existing owner workspace IDs.
- Reconcile `workspaces.owner_user_id`/`owner_email` with any ownership
  transfer; those legacy fields and the deployment's configured admission
  email must not become conflicting sources of role authority. Membership
  determines team permissions. Changing a workspace role does not silently
  reconfigure the deployment's identity provider or recovery owner.
- Check membership status and a version/revocation fence at request time and
  again when sensitive work commits. An eight-hour browser session must not
  preserve removed permissions. Removal does not delete the person's CRM
  records or historical audit identity. Local device mode remains single
  owner and must not impersonate invited users.
- Explain effective permissions using the server's actual role grants plus
  capability and policy constraints. A visible feature is not a permission;
  a hidden feature does not necessarily revoke its underlying permission.
  Show useful denial reasons without disclosing another tenant or its policy.

### Tests and gates

1. Build additive migrations, transactional admission services, and permission
   explanations against synthetic identities with team mode off. Test that
   disabled mode preserves current hosted-owner and device behavior.
2. Cover expiry, replay, digest-only token storage, wrong verified email,
   wrong issuer/subject, concurrent acceptance, revoked/reissued invitations,
   cross-tenant IDs, concurrent role changes, last-owner races, suspended
   sessions, and denied commits after revocation. Missing membership must not
   trigger automatic team/workspace creation.
3. Exercise owner, admin, operator, member, auditor, and agent effective
   permissions. Verify append-only transition history and no token leakage.
   Complete keyboard/mobile/loading/empty/success/error UX tests in #16.
4. Before real admission: approve who may invite, which verified identity
   providers are supported, and whether admins may manage any roles. Then
   configure admission/provider policies in an explicitly authorized staging
   deployment. Sending real invitations and enabling shared production access
   remain separate actions.

#15/#16 do not explicitly impose #11's issue-comment coordination prerequisite.
Their opt-in repository implementation can proceed with conservative defaults;
this proposal does not invent a global block on schema, tests, or disabled UI.

## 3. Read-only MCP access — #18

### Proposed choice

Start with an explicitly enabled local `stdio` adapter and the same bounded
read service that a future hosted adapter would use. Do not expose a public
`/mcp` route, copy owner cookies into a client, or treat localhost as sufficient
agent authentication. A local client may forward returned CRM content to its
own model/provider; explain that before granting it access.

Propose a local pairing operation, performed by the already authenticated
owner, which issues a short-lived, revocable credential for one registered
agent, workspace, and tool set. Store only the token digest server-side; pass
the credential to the `stdio` subprocess through its protected environment,
never command-line arguments or logs. If a local HTTP bridge is needed to
reach the Worker/D1 runtime, bind it to literal loopback, authenticate this
distinct credential on every request, validate origin/host, and refuse all
generic owner-mode fallback on that route. A subprocess with direct database
credentials is not an acceptable substitute for scoped authorization.

`stdio` and HTTP have different authorization models. The current MCP
authorization specification directs `stdio` implementations to obtain
credentials from their environment; its HTTP model uses resource-specific
access tokens and authorization-server discovery. A browser OAuth session is
not automatically an MCP access token.
[MCP authorization, revision 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).

For a later hosted transport, recommend Streamable HTTP with a reviewed
OAuth authorization server, explicit client consent, exact resource audience,
short-lived scopes, revocation, protected-resource metadata, and token
validation on every request. Never pass a provider's token through to CRM or
reuse #11's database credential. Pin the supported protocol/SDK versions and
test the intended clients: revision 2026-07-28 changed HTTP sessions and
request routing, so legacy GET/SSE/session assumptions are not an implementation
specification. Validate origins and header/body routing agreement.
[Current Streamable HTTP specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).

### Read contract and acceptance

- Implement explicit versioned contact, company, opportunity, task, and
  timeline read schemas; no arbitrary SQL, arbitrary object traversal,
  write tools, prompts that execute code, or open-ended search/export.
- Before CRM repository access, resolve authenticated actor, active workspace
  admission, live tool grant, policy, allowed fields and record scope, page
  cap, time range, and execution budget. Suggested starting caps: 100 records,
  64 KiB output, and a five-second application deadline. Reject over-limit
  requests rather than loading unrestricted data and trimming afterwards.
  Project explicitly allowed fields in the query; omit private notes,
  documents, emails, and arbitrary custom fields by default. Any broader
  projection needs an explicit scoped disclosure decision.
- An application deadline is not proof that D1 stopped an in-flight query.
  Use bounded indexed queries, provider execution limits, cancellation where
  supported, and measure worst-case capacity. Do not advertise a hard database
  cancellation guarantee the runtime cannot enforce.
- Bind opaque cursors to actor/grant/workspace/query/version and expire them.
  Reject altered/foreign cursors. Repeat reads reauthorize and consume limits;
  a JSON-RPC request ID is not a credential, replay defense, or authorization
  cache key. Never share private responses through a public cache.
- Reuse policy/stop/grant revocation semantics. Audit each decision with
  actor, workspace, tool/version, grant/policy version, bounded counts, timing,
  and outcome; exclude returned records and unnecessary search text. No
  write-capable execution is authorized by a successful read.

Stages: build the pure read core and synthetic adapter first; test schema
fuzzing, cross-tenant enumeration, expired/revoked credentials, ungranted
tools, field escape, cursor tampering, over-budget reads, revocation races,
and emergency stop. Then run actual protocol/client conformance tests and
document discovery, version support, launch, credential removal, and complete
disablement. Local pairing against real data requires the owner's deliberate
grant. Hosted exposure waits for authorization-server/client choices and
separate deployment approval—not for every other roadmap issue to finish.

## 4. First durable outbound adapter — #23

### Proposed choice

A signed HTTPS event notification to an operator-controlled receiver is the
recommended first complete adapter. It avoids choosing an email/calendar
provider or contacting customers. It is still an external data disclosure:
even record IDs and event timing can be sensitive. Initially send only a
versioned event ID, event type, timestamp, and expressly selected opaque
entity references. Do not automatically include customer names, notes,
attachments, or full record snapshots.

Require the receiver to validate the signature and atomically deduplicate a
stable delivery ID before applying its effect. Ship a synthetic loopback
receiver and crash/failure fixtures as conformance evidence. The adapter is
not production-grade merely because a mock endpoint returns 200; prove the
real HTTP protocol, persistence, failure handling, credential lifecycle, and
operator controls before claiming that milestone.

### Delivery and credential contract

- Preserve existing outbox intents and specialized file-cleanup behavior.
  Add tenant-scoped delivery/attempt records tied to an enabled subscription
  and connector generation. Do not suddenly deliver historical `crm.*`
  backlog; activation explicitly chooses a start watermark and event allowlist.
- Claim due work atomically with a unique attempt/lease token and bounded
  lease. Only the current lease holder may commit an outcome. Query and
  transition by workspace as well as delivery ID. Recheck connection
  generation, pause state, and authorization immediately before dispatch.
  Multiple workers must not obtain the same active lease.
- Use bounded exponential backoff with jitter, finite attempts/age, bounded
  `Retry-After`, request timeout, and small response limits. Permanent errors
  go to visible dead-letter state. Classify post-send timeouts/crashes as
  unknown outcomes, not definitely failed deliveries.
- Atomic claims prevent normal concurrent sending; fencing prevents stale
  database completion. Neither can guarantee exactly-once remote effects
  after a crash or network timeout. Retain the same delivery ID across safe
  retries; require receiver-side durable idempotency. If the receiver cannot
  deduplicate, pause ambiguous delivery for operator reconciliation rather
  than retrying blindly.
- Keep opaque credential IDs in delivery metadata, never secret values. Use
  a deployment-local secret store or versioned authenticated-encryption
  records with the encryption key outside the database. Bind encrypted
  material to workspace, connection, purpose, and generation; fail closed
  when unavailable. Existing inbound webhook hashes cannot sign outbound
  requests and must not be reinterpreted as decryptable secrets.
- The proposed portable baseline is runtime-supplied encryption/signing-key
  material plus encrypted per-connection credentials, with a documented
  secret-store interface. Key IDs, re-encryption/rotation, nonces, redacted
  errors, backup/restore key dependence, and disconnect cleanup require
  tests. No central credential broker, new paid vault, or cloud account is
  assumed. Provider OAuth consent/refresh is a separate adapter decision.
- Restrict destinations to explicit operator-approved HTTPS origins/paths;
  reject embedded credentials, local/private/metadata addresses, redirects,
  and DNS-rebinding paths. Pin/validate the actual network destination using
  a runtime-supported egress control; hostname validation alone is inadequate.
  If the runtime cannot enforce this, restrict to reviewed fixed endpoints
  or leave arbitrary destinations disabled. Loopback is only a separate
  synthetic test mode, never a production allowlist exception.
- Persist minimal attempt/outcome metadata and bounded error codes, not raw
  provider response bodies. Pause stops new dispatches but cannot recall an
  in-flight request. Resume preserves the existing idempotency identity.
  Disconnect fences queued/stale workers and removes usable credentials,
  while preserving minimal audit history.
- Replay is a new audited decision showing the original outcome and duplicate
  risk. Retrying an unresolved logical delivery retains its delivery ID;
  intentionally delivering again creates a linked new logical delivery/key
  only after explicit confirmation. Never silently change keys on timeout.
  Agent-triggered delivery additionally requires current policy, grant,
  approval where required, receipt, and stop checks; an outbox row alone is
  not agent execution permission.

### Tests and gates

1. Implement the queue state machine, additive schema, synthetic receiver,
   credential interface, and disabled-by-default operator UI. No external
   provider account or production scheduler is needed for this work.
2. Exercise real local HTTP delivery, atomic claim races, lease expiry, crash
   before/after receipt, lost acknowledgment, retry exhaustion, `429`/`5xx`,
   permanent errors, oversized/slow responses, ambiguous replay, pause/resume,
   disconnect/rotation during delivery, wrong encryption context, SSRF, and
   cross-tenant tampering. Verify no automatic historical-backlog dispatch.
3. Complete keyboard/mobile/loading/empty/success/error retry visibility.
   Measure bounded work per scheduler run and stale-lease recovery on each
   supported runtime. Existing cleanup workers must continue to pass.
4. Before live delivery, approve the receiver, exact fields/events, credential
   storage, operational retry budget, and person authorized to replay.
   Destination registration, secret provisioning, paid services, deployment,
   enabling a scheduler, and first real delivery each require appropriate
   explicit authority. Passing a synthetic test does not authorize them.

## Work can continue without pretending these decisions are settled

The next safe work is not a blanket pause:

- Prepare #11 threat/replay/rotation test fixtures and obtain its required
  design coordination before implementing the alternative boundary.
- Implement #15/#16 as an opt-in synthetic-tested vertical slice, preserving
  current admission by default. Keep owner-only membership administration
  until a different authority split is accepted.
- Build #18's bounded read core and local protocol conformance harness without
  exposing real records or a hosted endpoint.
- Build #23's durable lifecycle and signed synthetic receiver; keep all live
  destinations, credentials, and delivery scheduling disabled.

For each implementation milestone, run the repository's required checks:
`security:secrets`, `lint`, `typecheck`, `test:coverage`, `test:db`, `db:check`,
and `build`; run `security:secrets:history` before the final PR. Include the
runtime-specific build, integration/conformance tests, and regression cases
above. Passing checks does not accept a proposal or complete an issue whose
acceptance criteria remain unimplemented.

Record any owner decision with its issue, chosen option, limits, approver,
date, and separately authorized rollout scope. Keep unresolved alternatives
visible rather than quietly treating this document's recommendation as
consent. The [execution ledger](ROADMAP-EXECUTION.md) remains the place to track
actual implementation and verification status.
