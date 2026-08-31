# Contributing to FREE CRM

Thank you for helping build a humane, user-owned CRM.

1. Fetch the repository and create a focused branch from the latest `origin/main` (`git fetch origin main && git switch -c <branch> origin/main`). Never continue a new PR from a branch whose earlier work was already merged.
2. Run `npm ci` and `npm run dev`.
3. Keep new features workspace-scoped, exportable, accessible, and truthful about connector state.
4. Run `npm run check:pr -- origin/main`, `npm run check`, `npm run security:secrets:history`, and `npm audit --audit-level=moderate` before opening a pull request. `npm run check` includes migration execution, physical migration-to-snapshot parity, a future-generation drift probe, and the production build. If the base guard reports a stale ancestor, create a clean branch from `origin/main` and apply only the genuinely new delta; do not resolve the problem by resubmitting the aggregate branch.
5. Treat every migration already present on `main` as immutable. Add the next numbered forward-only migration and tenant-isolation tests for data changes; explain new collection, network calls, or permissions prominently.

## Avoiding repeated PR conflicts

Each merged milestone becomes the base for the next milestone. Do not open multiple PRs containing the same foundation under different commit IDs: Git cannot infer that independently committed blocks are conceptually identical, so every shared schema, migration journal, and UI line will conflict.

When resolving a real conflict, inspect both sides and write one coherent result. “Keep both” is rarely correct for imports, JSON, schema declarations, SQL migrations, or `drizzle/meta/_journal.json`. During a normal merge, “current” is the checked-out branch and “incoming” is the merged branch; rebase tools can present the sides differently, so verify with `git status` rather than relying on the labels.

Once a PR merges, close superseded aggregate PRs and start the continuation with:

```bash
git fetch origin main
git switch -c ml/<next-milestone> origin/main
npm run check:pr -- origin/main
```

Contributions are accepted under the repository’s MIT License. Please use a Developer Certificate of Origin sign-off (`git commit -s`) rather than assigning copyright.
