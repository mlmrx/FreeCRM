# Native Vercel deployment

This path deploys the Next.js application from GitHub `main` directly to
Vercel. It does not proxy to ChatGPT Sites and it does not use ChatGPT login.
The canonical origin is `https://freecrm.dev`; `https://lovecrm.org` redirects
to it so OAuth callbacks and session cookies have one origin.

The application remains MIT-licensed and free to run locally forever. Vercel
Hobby, Workers Free, D1 Free, and Blob each have provider-controlled terms and
quotas; this runbook does not promise permanently free cloud hosting.

## 1. Create the user-owned D1 data plane

Vercel must not receive a Cloudflare account API token. Instead, deploy the
small checked-in Worker in `workers/d1-rpc.ts` to the same Cloudflare account as
your D1 database. A Cloudflare Access Service Auth application admits only the
dedicated Vercel service token at the network edge. Vercel also signs every
request with a separate 32-byte HMAC secret; the Worker validates the signature,
timestamp, nonce, size, SQL shape, and binding types before executing one atomic
batch through its real `env.DB` D1 binding. The endpoint rejects schema and
transaction-control SQL. Access is configured in Cloudflare, not in this Worker.

From a trusted checkout:

```sh
npm ci
npx wrangler login
npx wrangler d1 create free-crm-db
cp wrangler.d1-rpc.jsonc wrangler.d1-rpc.user.jsonc
```

On PowerShell, use
`Copy-Item wrangler.d1-rpc.jsonc wrangler.d1-rpc.user.jsonc`. The user config is
gitignored. Put the returned database ID into its `database_id` field and keep
`database_name` aligned with the database you created.

Apply the reviewed migrations with Wrangler's canonical `d1_migrations`
ledger, then deploy the initially sealed Worker:

```sh
npm run db:d1-rpc:migrate
npm run deploy:d1-rpc
```

Generate the shared secret, save it in a password manager, and paste it into
Wrangler's hidden prompt. Never commit it or pass it as a command argument.

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
npx wrangler secret put FREE_CRM_D1_RPC_SECRET -c wrangler.d1-rpc.user.jsonc
```

Record the deployed endpoint exactly as
`https://<worker-host>/v1/d1`. The same generated value becomes the sensitive
Vercel variable `FREE_CRM_D1_RPC_SECRET`. Wrangler login or a short-lived
operator token is needed only to provision, migrate, and deploy Cloudflare
resources; it never belongs in Vercel.

In Cloudflare Zero Trust, add a Workers Access application and select the
deployed D1 RPC Worker by name. Protect its production deployment and previews
so no alternate Worker hostname bypasses Access. Create a dedicated Service
Token, then create a **Service Auth** policy whose Include rule contains only
that token. Do not add an Everyone, Bypass, or browser-login policy. Cloudflare
shows the token's Client ID and Client Secret once; store them directly as the
sensitive Vercel variables `FREE_CRM_D1_ACCESS_CLIENT_ID` and
`FREE_CRM_D1_ACCESS_CLIENT_SECRET`. The native server sends them as
`CF-Access-Client-Id` and `CF-Access-Client-Secret`; Cloudflare Access rejects
the request before the Worker runs, while the Worker itself still accepts only
the exact `/v1/d1` route. Keep the independent HMAC secret enabled as defense
in depth.

Treat the Access service token and RPC HMAC as separate database data-plane
credentials. Possession of either removes one protection layer; possession of
both grants read/write access even though the gateway refuses schema-control
SQL. Never expose either value to Preview deployments or logs. If exposure is
suspected, revoke/rotate the affected credential in both providers before
resuming production traffic.

Cloudflare currently documents 100,000 Workers requests per day on Workers
Free and a 500 MB maximum D1 database size on the Free plan. D1 also has daily
row read/write allowances, and every RPC call consumes a Worker request. Check
the current [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) before
relying on a free tier. FREE CRM exposes at most 48 application statements per
RPC. A mutating request adds one bounded expiry-prune statement and one atomic
nonce-claim statement, keeping the Worker at or below 50 D1 queries. All-SELECT
batches do not write nonce rows.

## 2. Create private Blob storage

In the Vercel project, create a **Private** Blob store. Vercel adds
`BLOB_READ_WRITE_TOKEN` to the project automatically. Private documents are
served only after FREE CRM authorizes the owner request. This runtime accepts
files up to 4 MB; local and Cloudflare runtimes retain the 10 MB limit.

## 3. Create owner authentication

Follow [VERCEL_AUTH.md](VERCEL_AUTH.md). Create a GitHub OAuth application with:

- Homepage: `https://freecrm.dev`
- Callback: `https://freecrm.dev/api/auth/callback/github`

Only the exact verified `FREE_CRM_OWNER_EMAIL` is authorized. Sessions are
encrypted, stateless, and expire after eight hours.

## 4. Configure Vercel

Import the GitHub repository into the `free-crm` Vercel project and set:

- Production Branch: `main`
- Framework: Next.js
- Node.js: 22.x
- Root Directory: repository root
- Build Command: `npm run build:vercel` (also declared in `vercel.json`)
- Install Command: `npm ci` (also declared in `vercel.json`)

Set these variables for **Production only**. Do not give untrusted preview
deployments the production database or storage secrets.

| Variable | Purpose |
| --- | --- |
| `FREE_CRM_AUTH_MODE=authjs` | Enables app-owned GitHub authentication |
| `NEXTAUTH_URL=https://freecrm.dev` | Canonical OAuth/session origin |
| `NEXT_PUBLIC_SITE_URL=https://freecrm.dev` | Absolute metadata origin |
| `FREE_CRM_OWNER_EMAIL` | Exact verified owner email |
| `AUTH_SECRET` | Random secret, at least 32 characters |
| `AUTH_GITHUB_ID` | User-owned GitHub OAuth client ID |
| `AUTH_GITHUB_SECRET` | User-owned GitHub OAuth client secret |
| `FREE_CRM_D1_RPC_URL` | Exact HTTPS D1 Worker endpoint ending in `/v1/d1` |
| `FREE_CRM_D1_RPC_SECRET` | Same base64url 32-byte secret stored in the Worker |
| `FREE_CRM_D1_ACCESS_CLIENT_ID` | Client ID of the dedicated Cloudflare Access service token |
| `FREE_CRM_D1_ACCESS_CLIENT_SECRET` | Client secret of that dedicated Access service token |
| `BLOB_READ_WRITE_TOKEN` | Injected by the connected private Blob store |

Attach both domains to the same project. Keep `freecrm.dev` canonical; the
checked-in Vercel redirect sends every `lovecrm.org` path to the equivalent
`freecrm.dev` path.

## 5. Connect Git and release

Vercel Git deployments should build pull requests as previews and deploy only
the protected `main` branch to Production. Require the repository validation
suite before merge. A schema-changing release is ordered as follows:

1. Back up D1 and private Blob data.
2. Point the ignored `wrangler.d1-rpc.user.jsonc` at the production D1 database.
3. Run `npm run db:d1-rpc:migrate` from the exact reviewed release checkout.
4. Run `npm run deploy:d1-rpc` if the RPC Worker changed.
5. Merge the same reviewed commit to `main` and let Vercel deploy it.
6. Verify `/`, `/api/auth/signin`, authenticated `/api/v1/health`, workspace
   bootstrap, create/update/delete, export, and document upload/download.

Never put migrations in a Vercel build hook: previews and retries would then be
able to mutate production data. CI builds the native Vercel target without live
provider credentials; authenticated D1 RPC plus private Blob health, workspace
CRUD, export, and upload/download must be exercised as a post-deploy smoke test.
The authenticated health check reads Wrangler's canonical `d1_migrations`
ledger and compares it with the checked-in Drizzle journal before checking Blob.
An empty, partial, reordered, or unexpected ledger returns
`503 database_schema_not_ready`; request handling never applies migrations.

## 6. Fail-closed behavior

- Missing or malformed authentication settings seal auth and CRM APIs with 503.
- Missing/malformed D1 RPC, Access service-token, or Blob settings fail health
  and data requests; the
  application never falls back to an in-memory production database.
- The D1 Worker has no browser CORS surface. Cloudflare Access requires the
  dedicated service token, then the Worker accepts only fresh, HMAC-signed
  server-to-server POST requests at the exact `/v1/d1` path.
- Mutating RPCs atomically claim their nonce in D1, so replay protection spans
  Worker isolates. Expired claims are pruned at most 100 rows per mutation.
- Missing/invalid sessions return 401; a signed session for a non-owner returns
  403.
- Machine webhook ingress returns 503 before database or Blob access. GitHub
  browser sessions are not machine credentials; webhook ingestion remains
  available on device and protected Cloudflare runtimes until a free,
  rate-limited Vercel machine-auth boundary exists.
- Cross-origin browser mutations are rejected.
- D1 continues to enforce composite tenant foreign keys and database triggers.
