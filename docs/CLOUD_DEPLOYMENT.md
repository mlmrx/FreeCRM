# Deploy FREE CRM with your credentials

FREE CRM has no credential broker. Your deployment account owns the Worker, database, files, identity boundary, and credentials. Provider credentials never pass through the FREE CRM web UI or CRM tables.

## Choose a runtime

| Runtime | Intended use | Durable state | Credential boundary |
| --- | --- | --- | --- |
| Native device | One operator on one computer | `.wrangler/state` | No cloud credential |
| Docker | One operator on one device/private host | `free-crm-data` volume | No cloud credential |
| Cloudflare | Private personal cloud | User-owned D1 and private R2 | User-owned Wrangler login/token + Access |
| GitHub first install | Reviewed protected Cloudflare first install | User-owned D1 and R2 | Protected GitHub Environment |
| OpenAI Sites | Maintainer/private Sites deployment | Provisioned D1 and R2 | Sites identity gateway |

Native and Docker use Wrangler's loopback-only local runtime. Do not expose either directly to the internet.

## Device and Docker

Node.js 22.13.0+ and internet access are required for the first native dependency installation. No cloud account or API key is required.

```text
Windows: double-click START-FREE-CRM.cmd
macOS/Linux: ./scripts/start-local.sh
Docker: docker compose up --build
```

Open `http://127.0.0.1:3477`.

Before a native upgrade, stop the process and copy `.wrangler/state` to encrypted storage. Before a Docker upgrade, stop the container and snapshot the `free-crm-data` volume. Verify the restored copy on a separate test path before treating it as a recovery point. `docker compose down` preserves the volume; `docker compose down --volumes` permanently deletes it.

## Canonical Cloudflare deploy button

[Deploy the canonical upstream template](https://deploy.workers.cloudflare.com/?url=https://github.com/mlmrx/FreeCRM)

The button provisions a Worker, D1 database, and R2 bucket in the user's Cloudflare account. It is for a first install only and refuses an existing Worker. A new deployment is sealed until Cloudflare Access is activated. Do not enter customer data while `/api/v1/health` returns `503 deployment_locked`.

Manual activation:

1. Protect the Worker and its custom/preview routes with a Cloudflare Access self-hosted application.
2. Add one Allow policy for the exact owner email; do not use Everyone or Bypass.
3. Copy the application audience and Zero Trust team domain.
4. Add these non-secret Worker variables:

   ```text
   FREE_CRM_AUTH_MODE=cloudflare-access
   FREE_CRM_ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
   FREE_CRM_ACCESS_AUD=the-application-audience
   FREE_CRM_OWNER_EMAIL=you@example.com
   ```

5. In the Worker dashboard, use the configuration **Save/Deploy** action so those values reach the deployed Worker. Do not rerun the repository's Workers Build or first-install script; both intentionally refuse an existing Worker.
6. Open the app through Access and verify authenticated `/api/v1/health` reports D1 and R2 ready.

The Worker verifies Cloudflare's Access JWT again with the exact issuer, audience, algorithm, expiry, subject, and configured owner email. Spoofed Sites headers are ignored in this mode.

## Audited guided installer

Requirements: Node.js 22.13.0+, Git, and a Cloudflare account.

```sh
git clone https://github.com/mlmrx/FreeCRM.git free-crm
cd free-crm
npm ci
npx wrangler login
npm run deploy:cloudflare
```

Before remote mutation the installer runs:

- the reachable-history credential scan, including commit/tag messages;
- lint, typecheck, coverage, migration/invariant checks, Drizzle drift detection, and build;
- a full dependency-tree vulnerability audit.

It then refuses any existing Worker before mutation. For a new Worker it inventories same-name D1/R2 resources, validates recognizable migration history before explicit data-store adoption, proves R2 has no public URL/domain, deploys and verifies a sealed Worker, captures a D1 Time Travel bookmark when adopting a database, applies migrations, and records the installation marker only after every required canary succeeds.

The supported release posture is intentionally narrow:

- A new install deploys sealed first. With automated Access credentials it creates/reads back the exact-owner policy and then activates.
- Every existing Worker is refused before D1/R2 creation, migration, Access mutation, or deployment. `FREE_CRM_ADOPT_EXISTING` cannot override that fence.
- A failed first install may leave a verified sealed Worker. Inspect it manually and choose new resource names; this release will not treat a retry as an upgrade.

For automated Access activation, supply all three values together in the process environment:

```text
CLOUDFLARE_ACCOUNT_ID=your-32-character-account-id
CLOUDFLARE_API_TOKEN=a-short-lived-account-token
FREE_CRM_OWNER_EMAIL=you@example.com
```

Optional non-secret settings are `FREE_CRM_WORKER_NAME`, `FREE_CRM_D1_NAME`, `FREE_CRM_R2_NAME`, and `FREE_CRM_DEPLOYMENT_URL`. Use a short-lived account-scoped token with only the Worker, D1, R2, Access app/policy, and Access organization permissions needed for this installation. The token is passed only through scrubbed child-process environments, never command arguments, source files, builds, Worker variables, D1, R2, or logs. Revoke it after setup.

Automated existing-Worker upgrades are not implemented in this release. Use provider backups and a separately reviewed upgrade procedure; do not repurpose the first-install script.

### Explicit one-time adoption

Same-name resources are never silently reused. When no Worker exists, you may independently verify an existing D1 and/or private R2 and set this for one installer run:

```text
FREE_CRM_ADOPT_EXISTING=true
```

Adoption applies only to D1/R2 data stores and never to a Worker. The installer requires a recognizable empty or FREE CRM D1 fingerprint and known migration names, rejects R2-without-D1 and any existing Worker, rejects mismatched markers or changed database IDs, and requires private R2 access. Remove the adoption value after the marker is written.

## Protected GitHub releases

Fork the repository and create a GitHub Environment named `cloudflare-production` with:

- secrets `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `FREE_CRM_OWNER_EMAIL`;
- optional variables `FREE_CRM_WORKER_NAME`, `FREE_CRM_D1_NAME`, `FREE_CRM_R2_NAME`, and `FREE_CRM_DEPLOYMENT_URL`.

Require at least one independent environment reviewer, restrict deployment branches to protected `main`, require green CI for the exact commit, protect workflow/deployment-script changes with code ownership, and prevent self-review. The checked-in workflow requires `refs/heads/main`, fetches the exact current `origin/main`, uses read-only repository permissions, serializes first installs, and accepts D1/R2-only adoption as a one-time dispatch input.

An unauthenticated-denial canary proves the app is not publicly open; it does not prove owner readiness through Access. After every release, an owner must open authenticated `/api/v1/health`, create/read a disposable record and document if appropriate, and verify D1/R2 before entering new customer data.

## Workspace webhook behind Access

1. In FREE CRM, open **Integrations**, connect the Webhook simulator, and save the generated workspace key. Only its SHA-256 hash is stored.
2. Send JSON to `/api/v1/webhooks/<workspace-id>` with a unique `eventId` and `x-free-crm-webhook-key`.
3. Reconnect the simulator to rotate a lost or exposed workspace key.

Cloudflare Access protects the webhook path before the Worker sees it. For a machine sender, create a **separate, more-specific self-hosted Access application** for `https://your-host/api/v1/webhooks/*`; add a Service Auth policy scoped to a dedicated service token. More-specific Access paths take precedence. Send:

```text
CF-Access-Client-Id: <service-token client id>
CF-Access-Client-Secret: <service-token client secret>
x-free-crm-webhook-key: <workspace key>
Content-Type: application/json
```

Do not add a Bypass or Service Auth policy to the installer-managed whole-Worker owner application. Store both service-token values and the workspace key in the sending provider's secret store. Rotate them independently.

## Recovery is provider state, not the portable snapshot

The in-app JSON download is a portable CRM metadata snapshot. It explicitly reports completeness counts and exclusions. It contains no R2 bytes, provider backup, operational queues, connector credentials, or full agent-governance history, and there is no snapshot restore endpoint.

Cloud recovery requires both data stores:

1. For an explicitly adopted database, record the pre-migration D1 Time Travel bookmark printed by the installer. Cloudflare retains Time Travel only for the provider's current retention window.
2. Maintain a separate encrypted R2 object inventory/backup under your account. D1 recovery does not restore R2.
3. For longer retention, schedule a user-owned D1 export plus R2 copy to separate protected storage.
4. A D1 Time Travel restore overwrites the database and is destructive. Review the printed command, stop writes, restore only with explicit operator approval, then verify migrations, authenticated health, record counts, sample invoices/payment receipts, and sample document bytes.

Do not call a release recoverable until a restore drill has successfully verified both D1 and R2. Keep GitHub, Cloudflare, and identity-provider recovery codes outside the CRM deployment.

Cloudflare, GitHub, and OpenAI may impose account requirements, quotas, retention limits, or charges. FREE CRM's source and device modes remain MIT licensed and subscription-free.
