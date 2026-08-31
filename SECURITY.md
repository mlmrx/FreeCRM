# Security

FREE CRM has four explicit runtime states:

- **Device/container:** a fixed owner is accepted only on a literal loopback hostname; local D1/R2 state is persisted under `.wrangler/state` or the Docker volume.
- **Vercel:** `authjs` mode accepts only an encrypted GitHub OAuth session for the exact configured verified owner email.
- **Cloudflare:** `cloudflare-access` mode verifies the Access JWT signature, RS256 algorithm, exact issuer/audience, expiry, subject, email, and exact configured owner.
- **Sealed:** missing or invalid identity configuration returns `503 deployment_locked` before CRM data access.

These boundaries do not encrypt data from someone who controls the host, browser profile, deployment account, or backups. Use device encryption, MFA, HTTPS, least privilege, and protected recovery copies.

## Report a vulnerability

Do not open a public issue for a suspected vulnerability. Use the private security-advisory flow in the repository that hosts the affected fork. Include the route, reproduction, impact, and whether customer data or credentials could be exposed.

## Enforced boundaries

- The runtime establishes workspace membership: exact-owner GitHub OAuth on Vercel, a verified Access JWT on Cloudflare, or the fixed loopback-only owner in device mode; request JSON cannot choose a tenant.
- Data queries include `workspace_id`; composite foreign keys and triggers reject cross-workspace edges, receipts, connectors, and deliveries.
- Record-version claims and connector-cursor claims make concurrent mutations fail closed. Idempotency keys make exact retries replay safely.
- Native Vercel reaches the D1 RPC Worker only through a dedicated Cloudflare Access Service Auth token and an independent HMAC signature. Mutating RPC nonces are atomically claimed in D1 across Worker isolates; bounded expiry pruning cannot push an invocation over the Workers Free 50-query ceiling.
- Capability/profile quotas are enforced at both the service and database insert boundary. Transaction-scoped maintenance sessions are the only internal seed/reset exception.
- Managed invoice, quote, lead, and ticket transitions cannot be forged through generic record updates. Invoice payment receipts are immutable except inside an explicitly confirmed owner reset transaction.
- Audit events, agent traces, and execution receipts are append-only. Agent execution rechecks scope, tool grant, budget, capability, approval, pause, and emergency-stop state at commit time.
- External agent execution is disabled. Only the bounded non-external local simulator can execute.
- Connector destinations require credential-free HTTPS URLs. Provider OAuth remains unavailable until a fork implements its own reviewed flow.
- On device and protected Cloudflare runtimes, each connected webhook simulator has a separate workspace key; only its SHA-256 hash is stored. Deliveries are bounded, rate-limited, tenant-scoped, and deduplicated by event ID plus payload hash. Native Vercel rejects machine webhook ingress before database access until a free, rate-limited service-auth boundary exists. Clean/demo reset retains those minimal delivery receipts, and scrubs unexpired command receipts to replay-only tombstones, so delayed retries cannot recreate data that the reset removed. Webhook receipts become eligible for tenant-and-connection-scoped deletion after 30 days; each new delivery prunes at most 100 expired rows in its own transaction, while a database counter fails closed at 50,000 retained rows and can recover incrementally from an upgraded over-cap database.
- New document objects are stored below a fixed-width workspace mutation-epoch namespace. Reset storage cleanup receives its captured epoch and can delete only legacy or older-epoch keys, so an expired/stale reset lease cannot remove bytes uploaded after a newer reset completed.
- Document MIME/signature/size checks precede storage; object keys are workspace-prefixed; downloads are private and `no-store`; deletion uses a tombstone/outbox sequence.
- API JSON and authenticated workspace HTML are `no-store`; security headers deny framing and MIME sniffing.

## Deployment checklist

1. Never enable `FREE_CRM_LOCAL_MODE` in cloud production.
2. On Vercel, keep one canonical OAuth origin, restrict Production to protected `main`, and verify non-owner access is denied. On Cloudflare, protect the whole Worker, custom domains, and previews with the exact-owner Access application. Verify unauthenticated health never returns `200`, then verify authenticated health is ready.
3. For machine webhooks on Cloudflare, create a separate exact-path Access application with Service Auth. Never add Everyone/Bypass or a second policy to the installer-managed owner application. Keep native Vercel webhook ingress disabled until an equivalent boundary is implemented.
4. Keep R2 private: no `r2.dev` URL and no public bucket domain.
5. Require protected `main`, green exact-SHA CI, code ownership, and an independent reviewer for the `cloudflare-production` GitHub Environment.
6. Run `npm run security:secrets:history`, `npm run check`, and `npm audit --audit-level=moderate` before release.
7. Back up device/Docker state before upgrades. Automated upgrades of an existing cloud Worker are disabled in this release; any future reviewed cloud upgrade must first capture a D1 Time Travel bookmark and separate R2 recovery copy and test restoration away from production.
8. Do not expose the native/Docker local-owner runtime to a network; use loopback or an authenticated tunnel.
9. Review OAuth scopes, token encryption, callback state/nonce/PKCE, disconnect, and rotation before enabling any provider adapter.

## Credential handling

- FREE CRM ships no Cloudflare, GitHub, Vercel, Google, Microsoft, Slack, or shared provider credential.
- The D1 Access service token and RPC HMAC are server-only Production variables. Never prefix them with `NEXT_PUBLIC_`, expose them to Vercel previews, or put them in Worker variables other than the HMAC secret required by the RPC Worker.
- Cloud releases use the operator's Wrangler login or protected short-lived token. Missing required CI credentials stop before provisioning.
- The guided installer scrubs deployment credentials from build/test subprocesses, passes them only to provider commands, redacts captured output, and never writes them to Worker variables, D1, or R2.
- The workspace webhook key is generated/entered in Integrations and never returned after connection. Reconnecting rotates it. There is no global `FREE_CRM_WEBHOOK_KEY`.
- `.env*`, `.dev.vars*`, Wrangler state/configuration, private keys, local databases, exports, and customer files are excluded from Git and Docker contexts.
- The credential scanner checks the working tree, reachable history blobs, and commit/tag messages without printing matched values.

## Data handling and recovery

- Treat JSON/CSV exports, local state, D1 exports/bookmarks, R2 objects, volume snapshots, and downloaded documents as sensitive customer data.
- The portable JSON snapshot is not a recovery backup. Its embedded scope lists exclusions and returned/total counts.
- Device recovery uses a stopped `.wrangler/state` copy. Docker recovery uses a stopped volume snapshot. Cloud recovery requires both D1 and R2.
- Uploaded files have an explicit MIME allowlist and a 10 MB limit on device/Cloudflare or 4 MB on Vercel, but operators remain responsible for malware controls appropriate to their environment.
- Do not put access tokens, passwords, or regulated secrets in notes, fields, tags, webhook payloads, integration URLs, or agent summaries.
- Webhooks retain a bounded summary, delivery hash, and audit/outbox evidence rather than the arbitrary raw payload.

## Connector contributions

New adapters must implement OAuth state/nonce/PKCE where relevant, least-privilege scopes, encrypted token storage, cursor pagination, bounded retries with `Retry-After`, signature verification, replay protection, deterministic mapping, provenance, disconnect/credential deletion, tenant/concurrency tests, and redaction tests. Never use real credentials or customer data in fixtures.
