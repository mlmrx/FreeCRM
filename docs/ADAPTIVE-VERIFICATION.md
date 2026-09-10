# Adaptive CRM verification

Local acceptance run: September 9, 2026. This report covers the adaptive layer
on the separate local-first second-brain change. It is not a production deployment
or a claim of universal CRM feature parity.

## Implemented and exercised

- Private `/today` briefing derived from actual tenant-owned records and sources.
- Explicit-feedback learning, a three-distinct-signal threshold, bounded ranking,
  reviewed follow-up timing, pinned defaults, pause, inspection, and forgetting.
- Real, confirmed CRM task creation with source-version guards and durable
  duplicate protection even after bounded feed history is pruned.
- Source and record deep links; enabled/disabled capability behavior and undo.
- Guide answers without a model, and source-cited local Ollama answers through
  the actual Worker API and browser. Text has no tools or mutation authority.
- A live opted-in public GitHub release scan, a local implementation proposal,
  and its Markdown download. No downloaded code or remote issue was executed.
- Loopback-only local watcher and an existing-workspace-only Cloudflare scheduler.
  The scheduler was bundled in dry-run mode; it was not deployed.

## Validation evidence

The repository suite passed 652 tests with one deliberately opt-in local-model
test skipped in the ordinary run. Overall configured coverage was 94.68%
statements, 90.28% branches, 95.10% functions, and 99.14% lines. The separate
real-Ollama run passed all 103 adapter tests, including its live embedding/chat
case. This establishes the exercised cases, not general model-answer quality.

Passed commands:

```bash
npm run security:secrets
npm run lint
npm run typecheck
npm run test:coverage
npm run test:db
npm run db:check
npm run db:drift
npm run agent:safety
npm run build
npm run build:vercel
npm audit --audit-level=moderate
npm run security:secrets:history
npm run smoke:api
npm run adaptive:scheduler:check
```

Database validation covered all 20 forward migrations, 51 tables, and 86 security
triggers. All migrations were also applied to an isolated Wrangler local database.
The expanded HTTP smoke suite exercised the existing CRM, connector, file, agent,
reset and second-brain flows as well as the new adaptive flow. It uses synthetic
data and does not enable release scanning or AI.

Separate Chrome checks exercised the real screens at 390, 768 and 1440 pixels,
with no horizontal overflow or browser runtime errors. A mobile task confirmation
test deliberately discarded a successful HTTP response; the in-dialog retry reused
the exact operation ID and left exactly one task in the database.

## Release boundaries

Merge approval, cloud migrations, production deployment, cloud identity setup,
and enabling the optional scheduler remain operator actions. GitHub/Vercel check
status is recorded live on the pull request; this document does not predeclare it.

Learning currently uses deliberate feedback and reviewed timing, not passive
surveillance, weight training, or arbitrary autonomous UI changes. The release
scout covers a curated public-repository list, not every CRM on the internet.
Related bundled packs are not equivalent implementations of vendor features.
Novel features become reviewed implementation proposals. Signed updater delivery,
automatic implementation/testing of arbitrary new capabilities, and automatic
production rollout are not part of this release.

See [the user and operator guide](ADAPTIVE-CRM.md) for retention, limits, consent,
and runner requirements. FREE CRM remains one shared platform with user-owned
storage and credentials.
