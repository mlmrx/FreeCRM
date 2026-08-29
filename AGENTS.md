# FREE CRM engineering instructions

## Product mission

FREE CRM is an open-source, self-hostable relationship operating system for
individuals, businesses, enterprises, humans working with agents, and eventually
agents themselves.

Maintain one shared platform. Do not create separate product forks.

## Architecture

- Use workspace profiles: personal, business, and enterprise.
- Implement Agentic CRM as a capability layer available across profiles.
- Treat humans, organizations, services, and agents as first-class actors.
- Keep control-plane, data-plane, integration-plane, and agent-plane boundaries explicit.
- Preserve local-first operation and user-owned cloud credentials.
- Keep SQLite/D1 working while designing storage interfaces that can support PostgreSQL.
- Keep local files/R2 working while allowing future S3-compatible storage.
- Prefer complete vertical slices over placeholder modules.

## Technology

- Node.js 22+
- TypeScript
- React 19
- Next.js/Vinext
- Drizzle ORM
- Cloudflare Workers, D1, and R2
- Vitest
- npm with `package-lock.json`

Do not rewrite the stack without a demonstrated blocker.

## Security

- Never commit secrets, credentials, tokens, private keys, or real customer information.
- Use environment variables and documented user-supplied credentials.
- Enforce tenant isolation in storage queries and APIs.
- Use least-privilege authorization.
- Record security-sensitive operations in an append-only audit trail.
- Agent actions require policy evaluation, receipts, and an emergency stop mechanism.
- Do not execute production deployment, destructive migrations, or secret rotation without explicit approval.

## Git workflow

- Start from the latest `origin/main`.
- Work on a branch prefixed `ml/` unless the user explicitly requests another branch.
- Preserve unrelated work.
- Make coherent commits after verified milestones.
- Never force-push or overwrite `main`.
- Prepare a pull request with completed functionality, tests, risks, and remaining work.

## Required validation

Before declaring a milestone complete, run:

```bash
npm run security:secrets
npm run lint
npm run typecheck
npm run test:coverage
npm run test:db
npm run db:check
npm run build
```

Run `npm run security:secrets:history` before the final pull request.

A failing check must be fixed or reported honestly. Never claim production readiness
when required checks, security controls, or documented acceptance criteria remain incomplete.
