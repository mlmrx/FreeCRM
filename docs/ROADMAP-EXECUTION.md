# Roadmap implementation ledger

This is the implementation checklist for the accepted community roadmap, not
a claim that every planned feature exists. The linked issues keep their original
acceptance criteria. An open issue closes only after its complete behavior and
failure paths are verified; a schema, mock, plan, or demo is not enough.

Baseline checked: `2406e09` on 2026-09-11. GitHub had **14 open accepted items**
and **3 closed items**. New work is isolated on `ml/roadmap-pending`; unfinished
language work stays on `ml/platform-languages`. Neither branch's unfinished work
should be described as published.

The independently tested S3 slice from `ml/roadmap-storage` is now integrated
into this milestone. Remaining security choices are in the
[proposed decision record](ROADMAP-DESIGN-DECISIONS.md); it does not grant
permission for production changes.

## Every accepted item

| Issue | Work | Implementation state | What must be proven before completion |
| --- | --- | --- | --- |
| [#11](https://github.com/mlmrx/FreeCRM/issues/11) | No-card Vercel data-plane boundary | Pending design | Review the changed machine-authentication threat model; expiry, replay, rate limits, rotation, and rollback tests. Keep Access protection until an alternative is explicitly selected and verified. Provider pricing is not a permanent guarantee. |
| [#12](https://github.com/mlmrx/FreeCRM/issues/12) | Recoverable Cloudflare upgrades | Pending implementation | Staging, preflight, canary, resumable cutover, and rollback after a verified backup. Code rollback must not pretend to roll back D1 or R2; schema compatibility must be declared. |
| [#13](https://github.com/mlmrx/FreeCRM/issues/13) | Full backup and restore | Pending implementation | Consistent tenant tables plus document bytes, versioned encrypted manifest, counts/hashes, interrupted restore recovery, tenant rejection, and restore into an empty sealed target. Existing JSON export is not a recovery backup. |
| [#14](https://github.com/mlmrx/FreeCRM/issues/14) | Deployment readiness checklist | Baseline implemented | Existing readiness guide/page and regression coverage; retain release checks. |
| [#15](https://github.com/mlmrx/FreeCRM/issues/15) | Invitations and membership lifecycle | Pending design | Verified invited-user admission, explicit workspace selection, hashed single-use expiring invitations, audited suspend/reactivate/remove, race/replay/tenant tests, and last-owner protection. Keep sealed single-owner mode as the default. |
| [#16](https://github.com/mlmrx/FreeCRM/issues/16) | Roles and permission explanations | Pending implementation | Build on #15: server-derived permission explanations, authorized role changes, owner-transfer rules, escalation/self-lockout protection, and accessible full-state UI. |
| [#17](https://github.com/mlmrx/FreeCRM/issues/17) | Audit filters and CSV export | Implemented, not released | Bounded filtering/pagination, allowlisted output, explicit historical unknown outcomes, formula-safe CSV, audit/export authorization, tenant and scan-limit tests, and useful empty/error states. |
| [#18](https://github.com/mlmrx/FreeCRM/issues/18) | Read-only MCP server | Pending design | Select transport and machine identity; bounded typed CRM tools, grant/record/time constraints before reads, discovery/versioning/disablement, and adversarial isolation tests. A simulator is not MCP. |
| [#19](https://github.com/mlmrx/FreeCRM/issues/19) | Policy editor and dry run | Implemented, not released | Versioned policy model, strict server validation, owner-bounded authority, no-write/no-tool dry run, explainable decisions, append-only version/audit evidence, and enforcement at proposal and execution. |
| [#20](https://github.com/mlmrx/FreeCRM/issues/20) | Agent safety evaluation harness | Baseline implemented | Eight required deterministic scenarios, machine-readable report, CI gate, and contributor instructions. This does not measure AI model quality. |
| [#21](https://github.com/mlmrx/FreeCRM/issues/21) | PostgreSQL adapter | Pending implementation | Shared domain/transaction contract plus real PostgreSQL conformance, migrations, tenant/audit/reset/replay parity. SQLite-specific SQL and triggers need a deliberate port, not a driver swap. |
| [#22](https://github.com/mlmrx/FreeCRM/issues/22) | S3-compatible object storage | Implemented, not released | Explicit provider selection, server-only credentials, private-bucket verification, bounded byte/header integrity, tenant/epoch cleanup and retry tests, default local/R2/Blob preservation, and real disposable Node/workerd conformance. Not certification of every provider. |
| [#23](https://github.com/mlmrx/FreeCRM/issues/23) | Durable outbound delivery | Pending design | Choose the first adapter and credential/idempotency contract; atomic leases, retry/dead-letter/replay controls, secret-safe attempt history, reconciliation after ambiguous timeout, and real adapter verification. Never send customer messages during tests. |
| [#24](https://github.com/mlmrx/FreeCRM/issues/24) | Editorial accessibility | Baseline implemented | Existing responsive, keyboard, focus, and reduced-motion regression/matrix coverage. |
| [#33](https://github.com/mlmrx/FreeCRM/issues/33) | Installable mobile distribution | Proposed ADR and verified browser slice; native work pending | Accept the PWA/native-shell decision and security policy first; automated device matrix, reproducible Android artifacts/provenance, signing/distribution ownership, and gated release/rollback. PWA installation is not a signed native app. |
| [#34](https://github.com/mlmrx/FreeCRM/issues/34) | Safe CSV templates | Implemented, not released | All canonical fields once, inert fictional UTF-8 examples, accessible downloads beside import, documented optional fields, real preview compatibility, MIME and path-safety tests. No parser behavior change. |
| [#35](https://github.com/mlmrx/FreeCRM/issues/35) | Plain-language CRM glossary | Implemented, not released | At least 20 original definitions, implemented/general distinction, repository references, alphabetic navigation, metadata/sitemap, and keyboard/mobile regression coverage. |

## Additional unfinished request

**Platform-wide languages:** 54 language choices are targeted in the separate
language branch. Shared persistence and right-to-left support are implemented
there, but the 53 non-English catalogs are not release-ready. Rejected model
drafts are outside deployable assets. Finish generation and meaning review,
then the source/placeholder/coverage and runtime language checks. Interface copy
may be translated during development; customer content must not be sent out.

## Dependency order

1. Review and release the verified independent slices: #34, #35, #17, #19, and #22.
2. Build on object-storage conformance (#22) to complete verified recovery
   (#13), then the recoverable upgrade protocol (#12). Review #11 separately
   because it changes the machine trust boundary.
3. Settle membership admission and workspace/owner invariants, implement #15,
   and build #16 on those guarantees.
4. Settle #18 machine transport and #23 first-delivery adapter contracts. Keep
   external execution disabled until those complete their own safety checks.
5. Port and verify PostgreSQL (#21); complete the mobile design/test/artifact
   path (#33). Preserve the existing local-first and PWA paths throughout.

The initial S3/PostgreSQL audit found no running Docker daemon or PostgreSQL
client on this machine. A standalone loopback S3 test server has since passed
real adapter conformance in Node and workerd. PostgreSQL still needs its own
real disposable runtime; unit doubles do not replace that gate.

## Verified first milestone

The following are implemented in this branch, not claims about the live site:

- **#34:** three inert fictional CSV downloads beside import, canonical field
  mappings, guide, strict public filename allowlist, and real parser previews.
  See [CSV import](CSV_IMPORT.md).
- **#35:** 30 original plain-language definitions, clear current-product
  boundaries, documentation links, alphabet/term navigation, sitemap, and mobile
  keyboard checks at [the glossary source](../app/glossary/page.tsx).
- **#17:** bounded indexed history filters and pagination, explicit unknown
  outcomes, page-only formula-safe CSV, separate export authorization, receipt,
  retry/error states, and actual mobile workspace interaction. See
  [audit history](AUDIT_HISTORY.md).
- **#19:** immutable policy versions, strict grant/record/budget controls,
  no-write/no-tool dry-run, optimistic idempotent activation, cancelled stale
  proposals, and SQL enforcement at authorization/execution. Browser tests
  cover a lost save receipt with a newer competing version and revoked-tool
  recovery. Safety changes invalidate previews while preserving unsaved drafts;
  late responses cannot restore stale state. See [agent policies](AGENT_POLICIES.md).
- **#22:** opt-in private S3 storage with explicit server credentials, privacy
  checks, bounded uploads/reads/deletes, SHA-256 and header verification,
  conditional recovery, tenant/epoch reset cleanup, and Unicode download names.
  Default local/R2/Blob remains available. Real Node and workerd tests use a
  separate synthetic RustFS evaluation server. No customer bucket, production
  provider migration, or all-provider certification is claimed. See
  [S3 setup and evidence boundaries](S3_OBJECT_STORAGE.md).

The additional #33 browser slice verifies 51 cases in Chromium and WebKit. It
also fixed a small tour touch target, mobile workspace header overflow, and
redirected offline fallback. Private routes still never enter Cache Storage.
See [mobile evidence and limits](MOBILE-BROWSER-MATRIX.md); the native decision
is **proposed**, and #33 remains unfinished.

Final combined validation on 2026-09-11 passed working-tree/history secret
scans, lint, typecheck, all 1,045 tests in 86 suites (one optional live-Ollama
test skipped), eight deterministic agent-safety scenarios, database invariants
and drift, both Worker and native Vercel production builds, and the ancestry
guard. Dependency audit reported zero vulnerabilities. The integrated branch
includes 21 migrations, 52 tables, and 93 security triggers. Coverage is 93.19%
statements, 88.52% branches, 95.07% functions, and 97.59% lines; thresholds were
not lowered.

The built application passed the default-provider API smoke, roadmap API
checks, policy-editor and audit-viewer browser checks, and all 51 mobile-browser
cases. A separate HTTP run of the actual built Worker, fresh D1, and disposable
S3 service verified health, upload/download, replay/conflict handling, anonymous
denial, deletion, reset cleanup, newer-file preservation, and fail-closed private
storage checks without an R2 binding. Neither browser build contains the S3
credential identifiers or server-only privacy-check implementation. These are
local synthetic results, not hosted CI or production verification.

The new runtime commands are `smoke:roadmap`, `smoke:policy-editor`, and
`smoke:audit-viewer`. They require a literal loopback URL and the explicit
`FREE_CRM_ROADMAP_QA=synthetic-disposable` acknowledgement. Never aim them at an
owner's real local database. They leave fictional records and immutable test
history only in the disposable state. CI runs them after its normal smoke test.

`smoke:s3` is a separate, opt-in Windows conformance command. It starts its own
pinned loopback test service with an empty generated directory and random
process-only credentials, then stops that exact child process. It never accepts
an existing bucket or a customer's credentials. See the S3 guide for prerequisites.

Merge, hosted CI/container verification, production migrations, and deployment
remain separate gates. The local Docker daemon was unavailable; a local Docker
container run is not claimed. No cloud configuration or customer data changed.

## Not silently added to implementation scope

[#25 contact deduplication](https://github.com/mlmrx/FreeCRM/issues/25) and
[#26 connector catalog](https://github.com/mlmrx/FreeCRM/issues/26) remain RFC
ideas, not accepted feature work. They require a separate acceptance decision.
Likewise, signing memberships, paid services, production identity changes,
production migrations, secret rotation, external messages, and deployment need
their own explicit authority and prerequisites.

## Release definition

Run every check in `AGENTS.md`, plus the native Vercel build, history secret
scan, migration ancestry/drift guards, dependency audit, and relevant synthetic
runtime tests. Update the issue, source evidence, docs, and this ledger together.
Only mark a slice implemented after its acceptance criteria pass; only call it
released after merge and deployment verification. No status change here should
waive an unresolved test or substitute for a working feature.
