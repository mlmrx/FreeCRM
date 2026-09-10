# Adaptive CRM: your private daily briefing

Open `/today` from your authenticated FREE CRM installation. The same workspace
connects CRM records, second-brain notes, explicit feedback, and optional public
release discovery. This is a capability layer across workspace profiles.

## A briefing with evidence

The daily briefing surfaces current record and note signals: possible promises,
overdue tasks, upcoming activities, stale opportunities, open tickets, knowledge
revisits, and opted-in public announcements. Every card distinguishes a recorded
fact, a possible interpretation, or a vendor announcement. Missing completion in
the database is not proof that a person failed to do something.

Expand a source to inspect the excerpt and version. `Open note` navigates to
`/brain?source=…`; `Open CRM record` navigates to `/workspace?record=…`. Use
**Correct** to edit the original evidence or dismiss an inaccurate suggestion.
Updated sources are used on the next read. Filters and **Include handled signals**
help inspect current feed state without changing source records.

The briefing reads at most the 1,000 most recently updated active CRM records and
200 most recently updated knowledge sources. It shows the chosen digest of 3–20
active signals plus up to 30 handled signals. These are bounded views, not an
exhaustive scan of every historical record or action.

**Useful**, **Dismiss**, **Snooze**, and **Reset feedback** are explicit controls.
Snooze lasts 1–30 days. **Review follow-up** opens an editable review of the actual
task title and due timestamp. **Confirm & create CRM task** creates one real task,
with provenance and an audit receipt. It does not send an email or message.
Dates are edited in the browser's displayed time zone and saved as exact timestamps.
Learning, when enabled, uses the confirmed due date for follow-up timing.

Ask the briefing a question to inspect the current context. The result identifies
**Workspace guide · no model used** or **Local AI · check the evidence**. Local AI
requires the configured device-local Ollama setup and existing second-brain opt-in.
Questions are read-only: text never grants permission to take an action. The UI
keeps the current question and answer in memory, clears answers when briefing
context changes, and does not claim persistent chat history.

## Learning and control

Learning, automatic adaptation, and public release discovery start **off**.
`Learning & controls` exposes the settings, retained observation count, per-topic
feedback counts, ranking weights, explanations, and effective follow-up interval.
An authorized export downloads the private inspection JSON, including retained
observation metadata. Treat downloaded exports as private copies.

Only explicit useful/dismissed feedback and accepted follow-up timing can become
learning observations. There is no keystroke collection, browsing-history analysis,
sensitive-trait inference, or global model training. Observation records omit note
and message text. At most 500 recent entries are eligible for learning. An
observation becomes ineligible for learning and inspection export after 30 days;
expired rows are physically deleted on the next adaptive write. `FORGET` removes
observation rows immediately. There is no promise of a timed deletion job running
while the application is idle. Learned recommendations require evidence from at
least three distinct signals.

Automatic adaptation, if separately enabled, can adjust bounded feed ranking and
an unpinned follow-up default. Pinning the interval keeps the explicit choice in
control. Settings use revision guards; a concurrent change leaves the local draft
visible and asks the user to reload the current settings before saving again.

**Pause assistance** stops learning, adaptation, release scans, and new assisted
actions. Ordinary private reads remain available. **Forget learning** requires the
literal confirmation `FORGET`, clears private observation memory and learned
adaptations, and preserves existing CRM tasks. It does not delete downloaded
exports. Owners and administrators manage settings and packs; ordinary write and
export permissions remain independently enforced on the server.

## Capabilities and public releases

The capability library contains reviewed declarative packs bundled with the
installed software. A pack shows its concrete effects, permissions, source, and
version. Activate or turn off a pack per workspace; **Undo last change** restores
the available prior activation state. No downloaded release code is executed.
All five bundled packs begin enabled: Commitment review, Relationship radar,
Pipeline watch, Service watch, and Knowledge revisit. Their source-based rules
work independently of the separate learning and automatic-adaptation opt-ins.

Public release discovery is a separate opt-in for selected official repositories.
Scans use a curated allowlist and never send private goals, notes, or CRM data to
the public providers. The server limits scans to its eligible interval, normally
six hours, and reports a readable status if a provider fails. Vendor announcement
text is displayed as text with a source link; it is not verified feature parity.

**Prepare local proposal** creates a local implementation proposal. The Markdown
download includes the announcement source, limitations, and acceptance criteria
for reviewed implementation. It does not open a remote issue or PR, install code,
grant permissions, or deploy software. Signed software update delivery and
production deployment are separate operator responsibilities.

## Refresh, privacy, and failure handling

The page reads the briefing on open, when it becomes visible, and once a minute
while visible. Overlapping reads share one request. Eligible opted-in scans run
through an explicit POST and are throttled on the server. GET reads perform no
scan or model inference. Keeping the browser closed requires a separately running
local watcher or an operator-deployed scheduled worker; the page does not assert
that a background runner is active.

### Keep a device-local watcher running

Start your configured local FREE CRM device server first, normally with
`npm run device`, and enable public release discovery for selected projects in
`/today`. The watcher never turns on consent for you. From another terminal, run
one check:

```bash
npm run adaptive:watch -- --once
```

To keep checking after the browser closes, leave this process running:

```bash
npm run adaptive:watch
```

The default address is `http://127.0.0.1:3477`. Set `FREE_CRM_BASE_URL` to use a
different local port, or provide the overriding flag:

```bash
npm run adaptive:watch -- --base-url http://127.0.0.1:3477 --once
```

If PowerShell's `npm.ps1` consumes forwarded flags, use the direct equivalent:

```bash
node scripts/adaptive-watch.mjs --base-url http://127.0.0.1:3477 --once
```

Only literal loopback addresses are accepted; `localhost` is pinned to
`127.0.0.1`. The watcher sends no credentials, rejects redirects, verifies a ready
device workspace, and honors its saved opt-in and pause controls. Each check has
a 20-second timeout. The long-running process checks every 15 minutes; the server
still controls whether a release scan is due, normally every six hours with a
15-minute retry interval after scan errors. Output contains status codes, not
workspace excerpts or goals. `Ctrl+C` stops the watcher. The local server and
watcher must both remain running; no OS service is installed automatically.

### Optional cloud companion

`wrangler.adaptive.example.jsonc` and `workers/adaptive-scheduler.ts` provide an
optional six-hour scheduled worker for an existing cloud workspace. The example
is disabled and contains placeholder identifiers. Prepare an uncommitted operator
copy named `wrangler.adaptive.user.jsonc` alongside the example, bind `DB` to the
workspace's existing D1 database, and set its exact
`FREE_CRM_ADAPTIVE_WORKSPACE_ID`. Set `FREE_CRM_ADAPTIVE_SCHEDULER_ENABLED` to
`true` only when ready to enable this companion. Supply your own Cloudflare
credentials through the normal operator environment; never put them in the file.

The companion does not create or activate a workspace. It honors that workspace's
saved release opt-in, selected projects, pause, scan interval, revision guards, and
audit trail. Its public HTTP handler returns 404 and cannot accept arbitrary
actions. The scheduled service is recorded as its own actor. No production
deployment is automatic: review the configured existing database and workspace,
complete required validation, and obtain explicit deployment approval. Disabling
the companion or pausing assistance stops eligible scheduled scans.

### HTTP contract

`GET /api/v1/adaptive` returns `{data: AdaptiveSnapshot}` without writes, network
scans, or inference. `GET /api/v1/adaptive?export=json` is an authorized private
export and **does append an export audit event**. POST accepts same-origin JSON
and returns `{data: …}`; mutations require a UUID `operationId`. The read-only
`ask` action is exempt from the operation-ID requirement and returns an
`AdaptiveAnswer`. It does not persist a conversation or execute tools. The UI may
still attach a session request ID when asking. See
[the implementation contract](ADAPTIVE-IMPLEMENTATION.md) for the exact action
fields and reset/version guarantees.

Requests use same-origin credentials and `no-store`. Private state and retry
payloads stay in mounted-page memory, not browser storage or a service-worker
cache. A transport failure, ambiguous server failure, or incomplete success receipt
retains the same operation ID. The UI offers **Retry exact request** and stops new
assisted actions until that uncertainty is resolved. A follow-up dialog provides
the retry button inside the modal. Reloading loses this in-memory retry identity;
check the CRM before repeating an uncertain action after reload. Server receipts,
source-version checks, tenant guards, and reset fences also prevent duplicate or
stale actions.

This feature does not imply production readiness. Required repository checks,
security controls, deployment approval, and operator configuration still apply.
