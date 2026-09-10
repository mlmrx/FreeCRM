# FREE CRM technical reference

Start with the [README](../README.md) for the demo and setup choices. This
reference keeps implementation and operational details separate from that introduction.

## Implemented capabilities

These are source capabilities, not a claim that the public website offers an
activated workspace. A real installation needs its own runtime and storage.

| Area | Implemented capability |
| --- | --- |
| Relationships | Leads, contacts, companies, conversion, lifecycle, tags, sources, archive, links, notes, and Customer 360 |
| Sales and billing | Opportunities, products, quotes, quote-to-invoice conversion, guarded invoice issue/payment transitions, and immutable payment receipts |
| Work and service | Activities, tasks, calendar export, campaigns, support tickets, resolution history, and private document lifecycle |
| Reports | Pipeline, weighted forecast, revenue, source, activity, task, invoice-aging, and support analytics |
| Automation | Audited trigger/condition/action rules, atomic task creation, enable/pause control, and recent run history |
| Integrations | Preview-first CSV import, CSV/JSON export, ICS export, a cursor/idempotency reference connector, and authenticated workspace webhook ingestion on device/Cloudflare |
| Agents | Identity, time-bounded revocable tool grants, scope/budget policy, approval, local simulated execution, immutable receipts/traces, replay protection, and emergency stop |
| Administration | Identity-derived workspaces, role checks, capability profiles, health, append-only security records, idempotency, outbox intent, and clean/demo reset |
| Web app installation | Responsive PWA shell, install metadata/icons, update recovery, and public-only offline fallback; private workspace/auth/API access remains network-only |

One owner is supported today. Personal, business, and enterprise select
reversible capability/limit defaults in one schema, not separate editions or
shared-team accounts. Agents are a capability layer across profiles. Provider
OAuth connectors, shared administration, advanced policy authoring, production
PostgreSQL/S3 adapters, and general external agent execution remain unfinished.
Outbox rows are durable intent; there is no generic external delivery worker.

The public `/tour` also contains explicitly labeled development previews for
knowledge, adaptive Today, and capability discovery. Those simulations do not
make their underlying development branches part of the released workspace.

## Architecture

```text
Runtime-established identity
        |
        +-- control: workspace, roles, capabilities, audit
        +-- data: records, links, notes, payments, reports, files
        +-- integration: connections, cursors, deliveries, outbox intent
        +-- agents: identity, grants, policy, approval, receipts, stop
                         |
                         +-- D1 / SQLite relational state
                         +-- local files / R2 / private Vercel Blob
```

Vercel accepts the configured owner through GitHub OAuth; Cloudflare verifies
an Access JWT; device mode accepts one fixed owner only on literal loopback.
Request JSON cannot choose a workspace. Composite workspace foreign keys,
database triggers, record-version and connector-cursor claims, delivery IDs,
and idempotency records protect isolation and concurrent retries.

Sensitive operations append audit, receipt, or trace evidence. Document object
keys include a workspace mutation epoch so stale reset cleanup cannot remove
post-reset uploads. Read [SECURITY.md](../SECURITY.md) for enforced boundaries
and [the architecture guide](MULTI_EDITION_ARCHITECTURE.md) for actor/profile design.

Source entry points: [schema](../db/schema.ts), [forward migrations](../drizzle/),
[commands](../server/commands.ts), [capacity constants](../lib/platform-limits.ts),
and [profile defaults](../lib/multi-edition.ts).

## Capacity limits

The complete-workspace API currently enforces these ceilings. Profile-specific
module limits may be lower. Writes fail with a capacity error instead of
silently truncating bootstrap or export data.

| Resource | Workspace ceiling | Additional limit |
| --- | --- | --- |
| CRM records | 1,000 total, including archived records | Profile/module limits also apply |
| Notes | 2,500 | 50 per record |
| Explicit record links | 5,000 | — |
| Payment receipts | 5,000 | 100 per invoice |
| Agent identities | 100 | — |

CSV import batches are atomic and limited to 40 rows and 256,000 encoded bytes.
The authenticated `POST /api/v1/imports/csv` endpoint infers common headers,
preserves unmapped columns as custom fields, and returns row-specific preview
errors. Commit requires an `Idempotency-Key` and refuses partial imports. See
[the CSV guide](CSV_IMPORT.md) for all limits and examples.

## Backups and exports

The portable JSON snapshot contains CRM metadata, a scope description, and
returned/total counts. It excludes document bytes, provider backups,
operational queues, connector credentials, and agent-governance evidence.
There is no portable snapshot restore command: an export is not a recovery backup.

- **Device:** stop FREE CRM, then make an encrypted copy of `.wrangler/state` before an upgrade. The launcher uses this directory for persistent local database and file state.
- **Docker:** stop the container and snapshot the `free-crm-data` volume. `docker compose down` preserves it; `docker compose down --volumes` permanently deletes it.
- **Cloudflare:** use D1 Time Travel/export plus a separate private R2 object backup.
- **Vercel:** use D1 recovery plus a separate private Vercel Blob backup.

Test recovery on a separate installation before relying on a backup. Protect
exports, documents, deployment accounts, and browser profiles as customer data.
See the [deployment guide](CLOUD_DEPLOYMENT.md) and [Vercel runbook](VERCEL_DEPLOYMENT.md).

## Webhook integration

Machine webhook ingress works on device and protected Cloudflare runtimes.
Native Vercel deliberately rejects it before database access until a suitable
rate-limited machine-auth boundary exists. Browser sign-in is not machine authentication.

On a supported runtime, open **Integrations**, connect the Webhook simulator,
and save the generated workspace key immediately. Only its SHA-256 hash is
stored. Send JSON to `/api/v1/webhooks/<workspace-id>` with:

```text
Content-Type: application/json
x-free-crm-webhook-key: <your saved workspace key>
```

Include a unique `eventId` in the body. Exact retries are acknowledged once;
conflicting reuse is rejected. Reconnect to rotate the key. There is no global
`FREE_CRM_WEBHOOK_KEY`.

Cloudflare Access also protects the route. External systems need a separate
exact-path Access application with Service Auth and its service-token headers,
in addition to the workspace key. Do not add a bypass or second policy to the
installer-managed owner application. Follow the [cloud runbook](CLOUD_DEPLOYMENT.md).

Replay receipts become eligible for bounded deletion after 30 days. Each
connection fails closed at 50,000 retained receipts. Detailed retention,
rate-limiting, reset, and replay controls are documented in [SECURITY.md](../SECURITY.md).

## Deployment and contributor reference

- [Vercel deployment](VERCEL_DEPLOYMENT.md): native Next.js from protected `main`, exact-owner GitHub OAuth, user-owned narrow D1 Worker, and private Blob storage. No ChatGPT login or Sites proxy.
- [Cloudflare deployment](CLOUD_DEPLOYMENT.md): first-install provisioning, sealed deployment, Access activation, migration order, and recovery. Existing Workers are refused by the automated installer.
- [Contributor checks](../CONTRIBUTING.md#validate-before-opening-a-pull-request): shared gates, native Vercel build, history secret scan, and dependency audit.
- [Agent safety evaluations](AGENT_SAFETY_EVALUATIONS.md): deterministic approval, budget, replay, grant, and stop checks using synthetic fixtures, separate from model-quality evaluation.

`npm run smoke:api` checks the built Worker across identity, database/files,
invoice receipts, concurrent retries, connectors, webhooks, agent execution and
stop, exports, reset, and security headers.

Fork maintainers should run their own fork's workflow and set
`NEXT_PUBLIC_FREE_CRM_REPOSITORY_URL` to that repository.
`NEXT_PUBLIC_SITE_URL` can set the final HTTPS origin for social metadata.
Provider credentials belong in the chosen platform's protected environment
or secret store, never in Git or public environment variables.
