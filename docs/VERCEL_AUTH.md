# Vercel authentication

The Vercel runtime uses Auth.js with one GitHub OAuth provider and stateless,
encrypted session cookies. It does not use ChatGPT Sites identity. A request is
authorized only when the GitHub account owns the exact verified email in
`FREE_CRM_OWNER_EMAIL`.

## GitHub OAuth application

Create a GitHub OAuth app under the account that will own the deployment:

- Homepage URL: `https://freecrm.dev`
- Authorization callback URL: `https://freecrm.dev/api/auth/callback/github`

Copy its client ID and a newly generated client secret into Vercel environment
variables. Do not put either value in a `NEXT_PUBLIC_` variable, a Vercel build
log, or this repository.

GitHub OAuth apps accept one callback URL. Keep `freecrm.dev` as the canonical
application origin and redirect `lovecrm.org` to it at the Vercel domain layer.
This also prevents separate cross-domain login cookies and callback ambiguity.

## Required Vercel environment variables

Set all five values for the Production environment before enabling the GitHub
deployment:

| Variable | Value |
| --- | --- |
| `NEXTAUTH_URL` | `https://freecrm.dev` |
| `AUTH_SECRET` | A user-generated random value of at least 32 characters |
| `AUTH_GITHUB_ID` | GitHub OAuth app client ID |
| `AUTH_GITHUB_SECRET` | GitHub OAuth app client secret |
| `FREE_CRM_OWNER_EMAIL` | An exact, verified email on the owner GitHub account |

A suitable secret can be generated locally with `openssl rand -base64 32` or an
equivalent cryptographically secure password generator. Store it only in the
Vercel encrypted environment variable store. Use separate OAuth credentials and
secrets for local or preview environments if those environments need sign-in.

The deployment deliberately returns a sealed `503` response from the auth route
when any required value is absent or malformed. GitHub API failures, unverified
emails, and accounts outside the single-owner allowlist all fail closed.

## Routes and integration

- Start sign-in: `/api/auth/signin`
- OAuth callback: `/api/auth/callback/github`
- Read the browser session: `/api/auth/session`
- Sign out: `/api/auth/signout`

Server API authorization should call `authorizeVercelRequest(request)` from
`server/vercel-auth.ts`. It returns `authorized`, `unauthenticated`, or
`forbidden`; only the first state may enter the CRM data plane.
