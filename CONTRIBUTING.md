# Contributing to FREE CRM

Thank you for helping build a humane, user-owned CRM. Contributions are welcome across product code, documentation, testing, deployment guidance, security, performance, design, and accessibility.

## Find a useful contribution

- Browse the repository's existing issues and pull requests before starting.
- Prefer one complete vertical slice over a placeholder module or a broad rewrite.
- Preserve one shared platform across personal, business, and enterprise profiles.
- Keep every feature workspace-scoped, exportable, accessible, local-first, and truthful about connector state.
- Never include credentials, private keys, real customer information, exports, or production data in code, fixtures, screenshots, logs, or pull requests.

Suspected vulnerabilities are different: **do not open a public issue or pull request.** Follow [`SECURITY.md`](SECURITY.md) and use the affected repository's private security-advisory flow.

## Prepare your fork

You need Git, npm, and Node.js 22.13 or newer.

1. Fork FREE CRM on GitHub, then clone your fork.
2. Add the canonical repository as `upstream`.
3. Create a focused branch from the latest `upstream/main`.

```bash
git clone https://github.com/<your-account>/FreeCRM.git
cd FreeCRM
git remote add upstream https://github.com/mlmrx/FreeCRM.git
git fetch upstream main
git switch -c ml/<short-description> upstream/main
npm ci
npm run dev
```

Maintainers whose `origin` points to the canonical repository can use `origin/main` instead. Never continue a new pull request from a branch whose earlier work was already merged.

## Build a complete change

- Include tests for behavior and failure paths.
- Keep control-plane, data-plane, integration-plane, and agent-plane boundaries explicit.
- Preserve SQLite/D1 support and do not couple storage code to one cloud provider.
- Treat every migration already on `main` as immutable. Add the next numbered forward-only migration and tenant-isolation tests for data changes.
- Explain any new data collection, network call, permission, credential, or deployment requirement prominently.
- For user-interface work, verify keyboard operation, focus visibility, responsive layouts, reduced motion where relevant, and clear empty/error states.
- Update documentation when setup, behavior, limitations, security, or deployment changes.

## Validate before opening a pull request

Run the base guard against the remote that represents the canonical repository, then run the complete release checks:

```bash
npm run check:pr -- upstream/main
npm run check
npm run build:vercel
npm run security:secrets:history
npm audit --audit-level=moderate
```

`npm run check` runs the shared secret scan, lint, typecheck, coverage, database validation, drift probe, and Vinext production build as one command. The native Vercel build remains a separate required check.

If the base guard reports a stale ancestor, create a clean branch from the latest upstream `main` and apply only the genuinely new delta. Do not resubmit already-merged work.

## Submit the pull request

1. Sign each commit for the Developer Certificate of Origin: `git commit -s`.
2. Push the focused branch to your fork and open a pull request against `mlmrx/FreeCRM:main`.
3. Complete the pull-request template with the behavior, validation, tenant/security impact, deployment or migration implications, known limitations, and exact remaining work.
4. Include before/after images for visible interface changes, without customer data or secrets.
5. Respond to review with new commits. Do not force-push over a review unless a maintainer specifically requests a cleaned history.

Contributions are accepted under the repository's [MIT License](LICENSE).

## Avoid repeated pull-request conflicts

Each merged milestone becomes the base for the next milestone. Do not open multiple pull requests containing the same foundation under different commit IDs: Git cannot infer that independently committed blocks are conceptually identical, so every shared schema, migration journal, and UI line will conflict.

When resolving a real conflict, inspect both sides and write one coherent result. “Keep both” is rarely correct for imports, JSON, schema declarations, SQL migrations, or `drizzle/meta/_journal.json`. During a normal merge, “current” is the checked-out branch and “incoming” is the merged branch; rebase tools can present the sides differently, so verify with `git status` rather than relying on those labels.

Once a pull request merges, close superseded aggregate pull requests and start the continuation with:

```bash
git fetch upstream main
git switch -c ml/<next-milestone> upstream/main
npm run check:pr -- upstream/main
```
