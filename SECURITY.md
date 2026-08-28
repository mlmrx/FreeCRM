# Security

FREE CRM has four explicit runtime states:

- **Device/container:** a fixed owner is accepted only on literal loopback; D1 and R2 are emulated locally and persisted under `.wrangler/state` or the Docker volume.
- **OpenAI Sites private cloud:** explicit `sites` mode trusts only identity headers supplied by the private Sites gateway.
- **Cloudflare private cloud:** explicit `cloudflare-access` mode verifies the Access JWT signature, issuer, audience, RS256 algorithm, expiry, subject, email, and configured exact owner. Sites identity headers are ignored.
- **Sealed cloud:** missing, locked, or invalid identity-provider configuration returns `503 deployment_locked` before CRM data access.

Neither mode encrypts data against someone who already controls the host, browser profile, deployment account, or backup files. Use full-disk encryption, strong account security, HTTPS, and protected backups.

## Report a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub’s private security-advisory flow for the repository hosting your fork. Include the affected route, reproduction steps, expected impact, and whether customer data or credentials could be exposed.

## Security boundaries

- Production APIs fail closed without a verified identity for the explicitly configured runtime mode.
- Localhost development uses a clearly scoped local owner identity.
- Workspace identity comes from verified membership, never request JSON.
- Every data-plane query includes `workspace_id`; composite foreign keys block cross-workspace relationships.
- Mutations use prepared statements, runtime validation, optimistic versions, idempotency records, atomic audit/outbox writes, and no-store responses.
- Connector URLs require HTTPS and reject embedded credentials, fragments, and credential-like query parameters. Provider OAuth is disabled until credentials exist.
- The inbound webhook requires a server secret, constant-time verification, a bounded JSON body, and replay IDs.
- Audit events redact contact bodies and connector configuration.
- The service worker never caches APIs or authenticated HTML.
- Document keys are workspace-prefixed; downloads are private and `no-store`.

## Deployment checklist

1. Keep Sites access owner-only. On Cloudflare, protect the entire Worker, including `workers.dev`, custom domains, and previews; audit more-specific hostname/path Access applications.
2. Confirm unauthenticated `/api/v1/health` never returns `200`, then confirm authenticated health returns `status: ready` before entering data.
3. Never set `FREE_CRM_LOCAL_MODE` on a cloud deployment.
4. Configure `FREE_CRM_WEBHOOK_KEY` only if inbound automation is required; use a long random value and rotate it after suspected exposure.
5. Never commit `.env*`, `.dev.vars*`, `.wrangler/state`, `wrangler.user.*`, exports, or customer files.
6. Run `npm ci && npm run check` before deployment. CI also scans reachable Git-history text blobs for credential patterns and reports locations without printing matched values.
7. Review migrations and take a D1 backup/Time Travel checkpoint before running the installer; it does not make arbitrary migrations non-destructive.
8. Review OAuth scopes and secret storage before enabling any provider adapter.
9. Restrict deployment administration, GitHub write access, and backup access with MFA.

## Credential handling

- FREE CRM ships no Cloudflare, GitHub, OpenAI, Google, Microsoft, Slack, or other shared provider credential.
- Cloud deployment requires the operator's own Wrangler login or protected account-scoped token. Missing protected CI credentials stop the workflow before provisioning.
- Native and Docker device modes require no cloud credentials and bind to loopback by default.
- `.env*`, `.dev.vars*`, generated Wrangler configuration/state, private-key formats, local databases, and build archives are excluded from Git and Docker build contexts.
- The guided installer passes deployment credentials only through child-process environments, scrubs them from the application build, redacts sensitive values from captured command output, and never writes them to Worker variables, D1, or R2.
- Run `npm run security:secrets:history` before publishing a repository if its history has not already passed CI.

## Data handling

- Treat JSON/CSV exports, `.wrangler/state`, D1 backups, and R2 objects as sensitive.
- Uploaded files are limited to 10 MB and an explicit MIME allowlist, but operators remain responsible for malware controls appropriate to their environment.
- Do not place access tokens or passwords in notes, custom fields, tags, webhook payloads, or integration URLs.
- The webhook stores a bounded event summary rather than the arbitrary raw payload.
- Removing a real uploaded document deletes both its CRM record and R2 object. Archiving other records is reversible.

## Connector contributions

New adapters must implement OAuth state/nonce/PKCE where applicable, least-privilege scopes, encrypted token storage, cursor pagination, backoff and `Retry-After`, signature verification, replay protection, deterministic field mapping, provenance, disconnect, and secret-redaction tests. Never use real credentials in CI fixtures.
