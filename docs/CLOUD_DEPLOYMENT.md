# Deploy FREE CRM with your credentials

FREE CRM has no credential broker. Cloudflare Access authenticates people using the deployed CRM; GitHub or Wrangler holds deployment credentials only. Provider credentials never pass through the FREE CRM web interface or database.

## Choose a deployment path

| Path | Best for | Data location | Credential handling |
| --- | --- | --- | --- |
| Deploy to Cloudflare | Fastest personal cloud | Your D1 database and private R2 bucket | Cloudflare account sign-in |
| Guided Wrangler installer | Automated, auditable setup | Your Cloudflare account | Wrangler login or process-only API token |
| GitHub Actions | Repeatable reviewed releases | Your Cloudflare account | Protected GitHub Environment secrets |
| Docker | One device or private VM | `free-crm-data` Docker volume | No cloud credential required |

Open the same guide inside the product at `/deploy`.

## Cloudflare: one-click infrastructure

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mlmrx/FreeCRM)

Cloudflare clones the public repository into your Git provider, provisions the D1 and R2 bindings described by `wrangler.jsonc`, applies the migrations, builds, and deploys the Worker.

The first release is deliberately **sealed**. Public landing assets may load, but every CRM data API returns `503 deployment_locked` until a verified Cloudflare Access application supplies identity. Do not enter customer data until Access is enabled and authenticated health returns `ready`.

### Activate private access

1. In Cloudflare, open **Workers & Pages → free-crm → Settings → Domains & Routes → Access**.
2. Protect the Worker and all preview deployments. Select **All traffic**.
3. Add one Allow policy for the exact owner email. Do not use an Everyone rule.
4. In **Zero Trust → Access → Applications**, open the new application and copy its **Application Audience (AUD)**.
5. Copy the account's team domain, such as `your-team.cloudflareaccess.com`.
6. Add these non-secret Worker variables:

   ```text
   FREE_CRM_AUTH_MODE=cloudflare-access
   FREE_CRM_ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
   FREE_CRM_ACCESS_AUD=the-application-audience
   FREE_CRM_OWNER_EMAIL=you@example.com
   ```

7. Rerun the Cloudflare Workers Build created by the deploy button. Do not run the template `npm run deploy` from a pristine clone because its provisioning database ID is intentionally a placeholder until Cloudflare rewrites it.
8. Open the workspace through Cloudflare Access, then go to **Settings → Portability → Download full JSON backup**.

FREE CRM validates the `Cf-Access-Jwt-Assertion` again inside the Worker with Cloudflare's JWKS, exact issuer, exact audience, RS256, expiry, subject, and email checks. It then compares the verified email to `FREE_CRM_OWNER_EMAIL`, so a later broad policy edit still cannot open CRM data to another identity. Static Assets do not pass Cloudflare's Worker `ctx.access` object to application code, so this second verification is intentional.

## Guided Wrangler installer

Requirements: Node.js 22.13+, Git, and a Cloudflare account.

```sh
git clone https://github.com/mlmrx/FreeCRM.git
cd FreeCRM
npm ci
npx wrangler login
npm run deploy:cloudflare
```

The installer:

1. resolves the selected Cloudflare account;
2. inventories the Worker, D1 database, and R2 bucket before any migration;
3. aborts on unowned same-name resources unless you explicitly adopt resources you have verified;
4. records non-secret local state plus a remote D1 installation marker for safe reruns;
5. verifies that R2 has neither an `r2.dev` URL nor a public custom domain;
6. builds without deployment credentials in the build environment, applies migrations, and deploys an explicit locked configuration;
7. verifies the exact locked JSON response or a trusted Access denial.

Wrangler stores its login using its own credential mechanism. FREE CRM does not read or store that login. If the login can access more than one account, set `CLOUDFLARE_ACCOUNT_ID` for the current shell.

### Fully guided Access activation

The installer can also create or strictly verify the Access application when these process environment values are present together:

```text
CLOUDFLARE_ACCOUNT_ID=your-32-character-account-id
CLOUDFLARE_API_TOKEN=a-short-lived-account-token
FREE_CRM_OWNER_EMAIL=you@example.com
```

Optional names are `FREE_CRM_WORKER_NAME`, `FREE_CRM_D1_NAME`, and `FREE_CRM_R2_NAME`. Names must use lowercase letters, numbers, and interior hyphens.

Use a short-lived token restricted to the selected account. It needs:

- Workers Scripts: Edit
- D1: Edit
- Workers R2 Storage: Edit
- Access: Apps and Policies: Edit, only for automated Access activation
- Access: Organizations, Identity Providers, and Groups: Read, so the installer can discover the Zero Trust team domain

The token stays in the installer process environment. It is not put on a command line, written to the generated Wrangler file, bound to the Worker, inserted into D1/R2, exposed to the application build, or printed. Revoke or rotate it after setup. Reruns trust the recorded installation provenance rather than names alone. The installer performs no intentional resource deletion, but migrations or an earlier locked deployment may have completed before a later step fails.

If Zero Trust onboarding is incomplete, a policy is broader than the exact owner, or the token lacks Access permission, the command fails after leaving the newest deployment locked. Reconcile Access and rerun it.

### Explicit adoption

An existing resource with the requested name is never silently reused. If you intentionally move a deploy-button installation or older FREE CRM installation under the guided installer, first confirm the Worker, D1 database, and R2 bucket names in Cloudflare; confirm the D1 schema is FREE CRM; and confirm R2 has no public URL or domain. Then run the installer once with:

```text
FREE_CRM_ADOPT_EXISTING=true
```

The installer still rejects an unrecognized D1 schema, a mismatched remote installation marker, or public R2 access. Remove the adoption value after the provenance marker is written. Never use adoption for an unknown same-name resource.

## GitHub Actions

Fork the repository and create a GitHub Environment named `cloudflare-production`. Add:

- secret `CLOUDFLARE_ACCOUNT_ID`
- secret `CLOUDFLARE_API_TOKEN`
- secret `FREE_CRM_OWNER_EMAIL`

Optional environment variables:

- `FREE_CRM_WORKER_NAME`
- `FREE_CRM_D1_NAME`
- `FREE_CRM_R2_NAME`
- `FREE_CRM_ADOPT_EXISTING=true` only for a one-time, verified adoption

Open **Actions → Deploy FREE CRM → Run workflow**. The workflow is manual-only, has `contents: read`, serializes production releases without cancelling one in progress, runs the full release suite, requires all three owner credentials before provisioning, and reports success only after policy read-back and unauthenticated denial pass. Add required reviewers to the GitHub Environment if desired.

Do not deploy secrets from pull requests or use `pull_request_target`. Keep the Cloudflare token account-scoped and replace it after suspected exposure.

## Docker on a device or private VM

```sh
docker compose up --build
```

Open `http://localhost:3477`. Compose binds to `127.0.0.1`, so the fixed local owner cannot be reached from another machine.

For a private VM, leave port 3477 blocked in the firewall and create an SSH tunnel from your computer:

```sh
ssh -L 3477:127.0.0.1:3477 user@your-server
```

Then open `http://localhost:3477`. Never expose the local-owner runtime directly to the internet.

The `free-crm-data` named volume holds local D1 and R2 state. Snapshot it before upgrades and keep an encrypted copy on a second device. `docker compose down` preserves it; `docker compose down --volumes` deletes it and should not be used for a production workspace.

## Webhooks behind Cloudflare Access

Worker-level Access also protects `/api/v1/webhooks/*`. Integrators must either send Cloudflare Access service-token headers plus `x-free-crm-webhook-key`, or you must create an exact-path Access bypass for the webhook path. The application webhook key remains mandatory either way.

Set it through the Worker secret store, never through Wrangler `vars`.

Guided Wrangler installation:

```sh
npx wrangler secret put FREE_CRM_WEBHOOK_KEY --config wrangler.user.jsonc
```

For deploy-button / Workers Builds and GitHub deployments, add `FREE_CRM_WEBHOOK_KEY` as an encrypted Worker secret in the Cloudflare dashboard. A GitHub secret with that name is not uploaded automatically. For device development use an ignored `.env.local` or `.dev.vars`; for Docker inject it at runtime and never bake environment files into the image.

Cloudflare Access service-token headers work only after an appropriate Service Auth policy exists. If you instead use a bypass, scope it exactly to `/api/v1/webhooks/*`; the application webhook key remains mandatory.

## Release and recovery checklist

- Protect production, `workers.dev`, custom domains, and preview deployments with Access.
- Confirm an unauthenticated `/api/v1/health` request never returns `200`.
- Keep the R2 bucket private; do not enable `r2.dev` or a public bucket domain.
- Download a full JSON backup after setup and before meaningful upgrades.
- Use expand/backfill/contract database migrations so old and new code can coexist during rollout.
- Keep GitHub and Cloudflare recovery codes outside the CRM deployment.
- Treat a changed identity-provider subject as a new identity and verify workspace ownership before switching providers.

Cloudflare and GitHub may impose their own limits, account requirements, or usage charges. FREE CRM's source code and device deployment remain MIT licensed and subscription-free.
