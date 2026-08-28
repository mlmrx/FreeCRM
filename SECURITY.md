# Security

FREE CRM has two supported runtime modes:

- **Device/container:** D1 and R2 are emulated locally and persisted under `.wrangler/state` or the Docker volume.
- **Private cloud:** OpenAI Sites supplies authenticated-user headers and binds managed D1/R2 resources.

Neither mode encrypts data against someone who already controls the host, browser profile, deployment account, or backup files. Use full-disk encryption, strong account security, HTTPS, and protected backups.

## Report a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub’s private security-advisory flow for the repository hosting your fork. Include the affected route, reproduction steps, expected impact, and whether customer data or credentials could be exposed.

## Security boundaries

- Production APIs fail closed without trusted authenticated-user headers.
- Localhost development uses a clearly scoped local owner identity.
- Workspace identity comes from verified membership, never request JSON.
- Every data-plane query includes `workspace_id`; composite foreign keys block cross-workspace relationships.
- Mutations use prepared statements, runtime validation, optimistic versions, idempotency records, atomic audit/outbox writes, and no-store responses.
- Connector URLs require HTTPS. Provider OAuth is disabled until credentials exist.
- The inbound webhook requires a server secret, constant-time verification, a bounded JSON body, and replay IDs.
- Audit events redact contact bodies and connector configuration.
- The service worker never caches APIs or authenticated HTML.
- Document keys are workspace-prefixed; downloads are private and `no-store`.

## Deployment checklist

1. Keep Sites access private unless a public identity flow has been reviewed.
2. Configure `FREE_CRM_WEBHOOK_KEY` only if inbound automation is required; use a long random value and rotate it after suspected exposure.
3. Never commit `.env*`, `.dev.vars`, `.wrangler/state`, exports, or customer files.
4. Run `npm ci && npm run check` before deployment.
5. Run the live API canary against staging and verify `/api/v1/health` before sending traffic.
6. Review migrations, take a D1 backup/Time Travel checkpoint, and use forward-only expand/backfill/contract changes.
7. Review OAuth scopes and secret storage before enabling any provider adapter.
8. Restrict deployment administration, GitHub write access, and backup access with MFA.

## Data handling

- Treat JSON/CSV exports, `.wrangler/state`, D1 backups, and R2 objects as sensitive.
- Uploaded files are limited to 10 MB and an explicit MIME allowlist, but operators remain responsible for malware controls appropriate to their environment.
- Do not place access tokens or passwords in notes, custom fields, tags, webhook payloads, or integration URLs.
- The webhook stores a bounded event summary rather than the arbitrary raw payload.
- Removing a real uploaded document deletes both its CRM record and R2 object. Archiving other records is reversible.

## Connector contributions

New adapters must implement OAuth state/nonce/PKCE where applicable, least-privilege scopes, encrypted token storage, cursor pagination, backoff and `Retry-After`, signature verification, replay protection, deterministic field mapping, provenance, disconnect, and secret-redaction tests. Never use real credentials in CI fixtures.
