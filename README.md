# FREE CRM

![FREE CRM — run your customer business](public/og.png)

**FREE CRM, FREE FOR ALL, FREE FOREVER.**

FREE CRM is an MIT-licensed, self-hostable relationship and customer operating system for individual operators. It combines relationship context, sales, work, billing, service, documents, analytics, automation, integrations, and guarded agents in one private workspace.

[Community roadmap](ROADMAP.md) · [Good first issues](https://github.com/mlmrx/FreeCRM/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) · [Ideas and RFCs](https://github.com/mlmrx/FreeCRM/issues?q=is%3Aissue+is%3Aopen+label%3Aidea) · [Contribute to FREE CRM](CONTRIBUTING.md) · [Deploy native Next.js from GitHub `main` to Vercel](docs/VERCEL_DEPLOYMENT.md) · [Deploy the canonical upstream template to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/mlmrx/FreeCRM)

The landing experience is at `/`, the working CRM is at `/workspace`, the product tour is at `/how-it-works`, contribution guidance is at `/contribute`, and deployment guidance is at `/deploy`. This is an original clean-room project in the personal-CRM category; it is not affiliated with YouSpot, HubSpot, or any connector provider.

## What works now

| Area | Implemented capability |
| --- | --- |
| Relationships | Leads, contacts, companies, conversion, lifecycle, tags, sources, archive, links, notes, and Customer 360 |
| Sales and billing | Opportunities, products, quotes, quote-to-invoice conversion, guarded invoice issue/payment transitions, and immutable payment receipts |
| Work and service | Activities, tasks, calendar export, campaigns, support tickets, resolution history, and R2-backed document lifecycle |
| Intelligence | Pipeline, weighted forecast, revenue, source, activity, task, invoice-aging, and support analytics |
| Automation | Audited trigger/condition/action rules, atomic task creation, enable/pause control, and recent run history |
| Integrations | Preview-first CSV import, CSV/JSON export, ICS export, a cursor/idempotency reference connector, and per-workspace authenticated webhook ingestion on device/Cloudflare runtimes |
| Agent plane | Agent identity, time-bounded and revocable tool grants, scope/budget policy, approval, local simulated execution, immutable receipt/trace, replay protection, and emergency stop |
| Administration | Identity-derived workspaces, role checks, capability profiles, health, append-only security records, idempotency, outbox intent, and clean/demo reset |
| Installable web app | Responsive PWA shell, install metadata and icons, update recovery, and a public-only offline fallback; workspace data, authentication, and APIs remain network-only |

External connector OAuth providers are deliberately shown as unavailable until an operator implements and authorizes their own reviewed client. Vercel owner sign-in uses a separate, implemented GitHub OAuth boundary. FREE CRM does not claim external synchronization that has not happened.

## Architecture

```text
Runtime-established identity boundary
        │
        ├── control plane: workspace · roles · capabilities · audit
        ├── data plane: records · links · notes · payments · analytics · files
        ├── integration plane: connections · cursors · deliveries · outbox intent
        └── agent plane: identity · grants · policy · approval · receipt · stop
                         │
                         ├── D1 / SQLite relational state
                         └── R2 / Vercel Blob / local object bytes
```

The runtime establishes the workspace boundary: Vercel uses an exact-owner GitHub OAuth session, Cloudflare uses a verified Access JWT, and device mode uses one fixed owner accepted only on literal loopback. Request JSON cannot choose a tenant. Composite workspace foreign keys, database triggers, record-version claims, connector-cursor claims, delivery IDs, and idempotency records fence cross-tenant access and concurrent retries. Sensitive operations append audit, receipt, or trace evidence. Webhook replay receipts are eligible for bounded deletion after 30 days and fail closed at 50,000 retained receipts per connection. Document object keys include their workspace mutation epoch so stale reset cleanup cannot touch post-reset uploads. Agent execution is limited to the non-external local simulator in this release.

The Drizzle schema is in [`db/schema.ts`](db/schema.ts), reviewed forward migrations are in [`drizzle/`](drizzle/), and the command boundary is in [`server/commands.ts`](server/commands.ts).

### Import contacts, companies, or leads from CSV

The authenticated `POST /api/v1/imports/csv` boundary accepts an Excel-compatible CSV string, infers common headers, preserves unmapped columns as custom fields, and returns row-specific validation results in `preview` mode. A `commit` request requires an `Idempotency-Key`, refuses partial imports, enforces the active workspace profile and record limits, and appends the normal audit/outbox receipt. Batches are capped at 40 rows and 256 KB so one import remains atomic on both local SQLite and the free-tier D1 bridge. API details are in [`docs/CSV_IMPORT.md`](docs/CSV_IMPORT.md).

## Run on one device

Requirements: [Node.js 22.13.0 or newer](https://nodejs.org/). The first dependency installation needs internet access; normal use needs no cloud account or API key.

Windows: double-click `START-FREE-CRM.cmd`.

macOS/Linux:

```sh
chmod +x scripts/start-local.sh
./scripts/start-local.sh
```

Open `http://127.0.0.1:3477`. The launcher synchronizes dependencies when the lockfile, Node runtime, OS, or CPU changes; builds the Worker; applies local migrations; and persists D1/R2 state under `.wrangler/state`. The local-owner runtime binds only to loopback.

Before an upgrade, stop FREE CRM and make an encrypted copy of `.wrangler/state`. A portable JSON snapshot is useful for inspection and migration, but it is not a recovery backup and contains no document bytes.

## Run with Docker

```sh
docker compose up --build
```

Open `http://127.0.0.1:3477`. Compose binds only to loopback and persists state in the `free-crm-data` volume. This is a single-user device/private-host mode built on Wrangler's local runtime, not a hardened public container server. Stop the container and snapshot the volume before upgrades. Never use `docker compose down --volumes` unless permanent deletion is intended.

## Install on a phone or tablet

From a deployed HTTPS origin, use the browser's **Add to Home Screen** or
**Install app** action. The current mobile artifact is the same responsive PWA,
not a separate CRM edition: it shares the same profiles, authorization, tenant
fences, and release stream. Only the public shell has an offline fallback;
workspace data, sign-in, exports, files, and API mutations always require the
live owner-controlled deployment.

The reviewed path toward reproducible Android packages and user-signed iOS
distribution is tracked in [issue #33](https://github.com/mlmrx/FreeCRM/issues/33).
Source and community APK artifacts can be free, while store memberships,
signing identities, domains, devices, and cloud services may have provider
costs. Signing credentials must never be added to this repository.

## Deploy from GitHub `main` to Vercel

The native Vercel target uses Next.js directly—there is no ChatGPT Sites proxy or ChatGPT login. Vercel builds the protected `main` branch with `npm ci` and `npm run build:vercel`. GitHub OAuth admits only the configured verified owner email, a Cloudflare Access service token plus independent HMAC signature protect the user-owned narrow D1 Worker without giving Vercel a Cloudflare account token, and a private Vercel Blob store holds documents.

The deployer supplies every credential in Vercel's encrypted environment store. No owner token, OAuth secret, database credential, or Blob credential belongs in Git. `freecrm.dev` is the canonical origin and `lovecrm.org` redirects to it.

See [`docs/VERCEL_DEPLOYMENT.md`](docs/VERCEL_DEPLOYMENT.md) for D1 migration, Blob, GitHub OAuth, Git integration, environment variables, release ordering, and smoke checks. The source and local/Docker runtime remain free and open source forever; Vercel Hobby is a provider-controlled personal/non-commercial free tier with quotas, not a permanent hosting guarantee.

## Deploy to your Cloudflare account

The upstream deploy button is a protected first-install path that provisions a Worker, D1, and private R2 in the user's account. It starts sealed until Cloudflare Access is configured. Manual activation must set the four Access variables in the Worker's dashboard configuration, use the dashboard's Save/Deploy action, and verify authenticated `/api/v1/health` before data entry. Do not rerun the repository build for activation: this release intentionally refuses automated changes when the Worker already exists.

For the audited guided installer:

```sh
git clone https://github.com/mlmrx/FreeCRM.git free-crm
cd free-crm
npm ci
npx wrangler login
npm run deploy:cloudflare
```

Before any Cloudflare mutation the installer runs the reachable-history secret scan, the complete release gate, and a full dependency audit in a credential-scrubbed environment. It refuses any existing Worker, verifies D1/R2 provenance and privacy, deploys a sealed Worker, and only then migrates a new or explicitly adopted database. An adopted D1 receives a Time Travel recovery bookmark first.

With short-lived `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `FREE_CRM_OWNER_EMAIL` values supplied together, a new install is activated only after an exact-owner Access policy is read back. Every existing Worker is refused before D1/R2 creation, migration, Access mutation, or deployment until a real zero-downtime upgrade protocol is implemented.

Fork maintainers should run their fork's workflow and set `NEXT_PUBLIC_FREE_CRM_REPOSITORY_URL` to their repository URL. `NEXT_PUBLIC_SITE_URL` may be set to the final HTTPS origin for absolute social metadata.

See [`docs/CLOUD_DEPLOYMENT.md`](docs/CLOUD_DEPLOYMENT.md) for Access, protected GitHub releases, webhook service access, and recovery procedures.

## Webhook integration

Machine webhook ingress is available on device and protected Cloudflare runtimes. It is deliberately disabled before database access on native Vercel until a free, rate-limited machine-auth boundary is implemented; GitHub browser sessions are not machine credentials.

On a supported runtime, open **Integrations**, connect the Webhook simulator, and save the generated workspace key immediately. Only its SHA-256 hash is stored. Send JSON to `/api/v1/webhooks/<workspace-id>` with:

```text
Content-Type: application/json
x-free-crm-webhook-key: <your saved workspace key>
```

The body needs a unique `eventId`. Exact retries are acknowledged once; conflicting reuse is rejected. Reconnect to rotate the key. Do not create a global `FREE_CRM_WEBHOOK_KEY`; it is not used.

Cloudflare Access protects this route too. External systems should use a separate exact-path Access application with Service Auth and send its service-token headers in addition to the workspace key. Do not add a bypass or second policy to the installer-managed owner application.

## Development and release verification

```sh
npm ci
npm run dev
```

Required gates:

```sh
npm run security:secrets
npm run security:secrets:history
npm run lint
npm run typecheck
npm run test:coverage
npm run agent:safety
npm run test:db
npm run db:check
npm run db:drift
npm run build
npm run build:vercel
npm audit --audit-level=moderate
```

`npm run smoke:api` exercises the built Worker across identity, D1, R2, invoice receipts, concurrent idempotency, connector reconnect, webhook replay/conflict handling, guarded agent execution and stop, exports, reset, and security headers.

`npm run agent:safety` emits a machine-readable, deterministic release-gate report for approval, budget, replay, idempotency, emergency-stop, grant-expiration, and tool-denial invariants. It uses only synthetic local fixtures and keeps model-quality evaluation separate. See [`docs/AGENT_SAFETY_EVALUATIONS.md`](docs/AGENT_SAFETY_EVALUATIONS.md).

## Data ownership and current limits

- The portable JSON snapshot contains CRM metadata and explicit completeness counts. It excludes R2 bytes, provider backups, operational queues, connector credentials, and agent-governance evidence; there is no snapshot restore command.
- Device recovery uses a stopped `.wrangler/state` copy. Docker recovery uses a stopped volume snapshot. Cloud recovery uses D1 Time Travel/export plus a separate private R2 object backup.
- The current complete-workspace API envelope is 1,000 total records (active and archived), 2,500 notes (50 per record), 5,000 explicit record links, 5,000 payment receipts (100 per invoice), and 100 agent identities. Writes fail with a clear capacity error instead of silently truncating bootstrap or export data. Profile-specific module limits can be lower.
- Personal, business, and enterprise are reversible capability/limit profiles in one schema. The product is exact-single-owner today; invitations, shared identity administration, advanced policy authoring, production PostgreSQL/S3 adapters, and provider OAuth clients are not complete.
- Outbox rows are durable intent records; no generic external delivery worker is claimed.
- FREE CRM never autonomously communicates with customers or moves money.

Protect exports, backups, documents, deployment accounts, and browser profiles as customer data. Read [`SECURITY.md`](SECURITY.md) before exposing a fork and [`CONTRIBUTING.md`](CONTRIBUTING.md) before contributing.

## License

MIT. Your copy and your data remain yours.
