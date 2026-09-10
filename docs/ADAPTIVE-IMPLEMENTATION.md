# Adaptive CRM implementation contract

This describes the adaptive CRM implementation and its bounded interfaces.
Validation and deployment status belong in the change's pull request, not this API contract.
One private workspace, three connected loops: learning, contextual signals, and
capability discovery. Existing second-brain and CRM authorization remain intact.

## HTTP and UI

Private `/today` UI. `/api/v1/adaptive` GET returns `{data: AdaptiveSnapshot}`;
GET `?export=json` exports a private JSON snapshot and appends an export audit
event. Ordinary GET reads perform no writes, network scans, or model inference.
POST requires safe same-origin JSON, identity, workspace permissions and UUID
`operationId` except for the read-only `ask` action; response `{data: ...}`.

Actions:

- `settings.update`: `expectedRevision`, all editable settings from AdaptiveSettings
  (server owns revision/timestamps/scan status). Owner/admin only.
- `refresh`: refresh release inventory if opted in and six-hour interval elapsed.
  Internal feed always derives from current DB state. Readable status on failures.
- `feedback`: `signalId`, `fingerprint`, `value: useful|dismissed|snoozed|new`;
  `snoozeDays` 1..30 for snoozed. Server re-derives evidence before accepting.
- `followup.create`: `signalId`, `fingerprint`, `title` <=200, `dueAt` ISO datetime,
  `followUpDays` 1..30. Explicit user confirmation required. Creates one real CRM
  task with provenance and receipt, never external communication. Guard stale
  source versions, reset epoch and policy revision; replay cannot create duplicates.
- `learning.forget`: `expectedRevision`, `confirm: FORGET`; clears private
  observation memory, resets learned adaptations, preserves operational CRM tasks.
- `pack.set`: `id`, `version`, `enabled`, `expectedRevision`. Activates only a
  server-bundled reviewed declarative pack, no downloaded code or permissions.
- `pack.rollback`: `id`, `expectedRevision`; restore prior on/off/version state.
- `proposal.create`: `releaseId`; creates a local implementation proposal, not an
  issue/PR on a remote repo. `proposal.dismiss`: `id`.
- `ask`: `question` <=2000; conversational read-only briefing. Use configured
  local Ollama only when device+brain opt-in; otherwise transparent deterministic
  guide (never pretend model-generated). No tools or mutations from text.

Reuse ephemeral request retry semantics; private content stays out of browser
storage/service-worker cache. Settings are inspectable, forgettable and reversible.
Do not claim background activity if no runner is active: refresh while page is
open; provide an explicit local watcher and an optional operator-deployed cron
worker for closed-browser scans. No automatic production deployments.

## Learning and feeds

Learning starts OFF. Only explicit feed feedback and accepted follow-up timing
are observations, not keystrokes, browsing, inferred sensitive traits or global
training. Retain at most 500 observations, 30 days. At least three distinct
signals before a learned recommendation. autoAdapt permits bounded feed-ranking
and unpinned follow-up defaults only; pinned choices win. Pause stops learning,
adaptation, release scans and new assisted actions; ordinary private reads work.

Signals derive from current records/knowledge: evidence-backed possible promises,
overdue tasks, upcoming activities, stale opportunities, open tickets, useful
knowledge revisits, and opted-in public releases relevant to focus/goals/usage.
Never claim an unrecorded completion is proof of failure. No source-derived text
is persisted in feedback/observations; revisions invalidate prior signal actions.

## Evolution boundary

Public release scout fetches a curated allowlist of official CRM GitHub releases;
never sends private goals, notes or CRM data to providers. Strict URL/redirect,
response-size, date, timeout and pagination bounds. Vendor text is untrusted and
displayed as announcements. No downloaded code executes. Bundled packs actually
change feed/view behavior and have per-workspace enable/undo controls. Unmatched
capabilities become portable, local proposals with sources, limits and acceptance
criteria. Signed software update distribution is a separate operator action;
discovery is not a guarantee of instant implementation or feature parity.

## Persistence

Forward-only migration 0019 adds the tenant-owned adaptive storage.
Tables: adaptive_settings, adaptive_feedback, adaptive_observations,
adaptive_packs, adaptive_releases, adaptive_proposals, adaptive_receipts.
Use tenant composite keys, bounded data, indexes, idempotency and append-only
existing audit events. Every write has an atomic reset fence and optimistic guard.
Reset scrubs adaptation data; receipts retain hashes/IDs only and reject prior
epochs. Source changes/deletion must not leak stale excerpts through saved state.
