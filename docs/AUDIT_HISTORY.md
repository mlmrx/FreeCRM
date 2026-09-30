# Audit history and page exports

Open **Administration → Who changed what** in your own workspace. Choose a UTC
date range and optionally an exact actor ID, action family (such as `record` or
`agent`), outcome, or affected record ID. Apply filters to start a new search.
Actor IDs are stable runtime identifiers, not names or email addresses.

Viewing requires `audit:read`. Downloading CSV requires both `audit:read` and
`data:export`. Owners and admins currently have both; auditors can view but not
export. Browser controls do not grant permissions: every request checks the
server-resolved membership and role. These features do not enable team login.

## What the history proves

History shows recorded events, not every attempted operation. Existing events
often have no explicit outcome. They are **Unknown / not recorded**, never
retroactively labeled successful. Only these exact event names establish the
displayed outcome:

| Event | Outcome |
| --- | --- |
| `agent.approval.approved` | approved; not executed |
| `agent.approval.rejected` | rejected |
| `agent.approval.expired` | expired |
| `agent.approval.cancelled` | cancelled |
| `agent.run.executed` | executed by the local simulator; not an external action |
| Every other event | unknown |

The viewer and export contain only identifiers, action names, timestamps and
the above outcome classification. They never return before/after record values,
notes, credentials, arbitrary metadata, provider responses or payloads. Invalid
technical identifiers are shown as unavailable. Malformed events are omitted
with an explicit partial-results warning; stored evidence is not rewritten.

## Bounded pages, not an unlimited scan

- Maximum date window: 366 days; initial view: the last 30 UTC calendar days.
- Maximum matching results: 50 per page.
- Maximum examined candidates: 500 per request, plus one lookahead row.
- One workspace/time/ID indexed query, with no full-history count or offset scan.
- Additional filters apply within that bounded candidate page.

A page with no matches can still have a **Next page**. Continue scanning or
narrow the date range; an empty intermediate page does not mean there are no
matching events later. Previous page and retries reuse their exact query and
cursor. Results stay visible if the next request fails.

The results table scrolls within a bounded region, with column headings kept
visible. This keeps pagination and export within reach on a phone even when a
page contains 50 events. Focus the labeled table region to scroll by keyboard.

Order is descending stored UTC timestamp, then event ID. Legacy SQLite timestamp
strings are displayed as UTC; differing legacy timestamp formats can affect
within-day storage order. Cursors preserve this stable storage order. Date
boundaries are applied to normalized UTC instants, including legacy timestamps.
The end boundary is exclusive. UI **Through date** includes that entire UTC day.

Search is not a database snapshot or a complete backup. Concurrent or backdated
events can change a repeated page. Existing append-only and reset fences remain
in place; no audit row is updated or deleted by this feature.

## CSV schema, version 1

**Export page as CSV** refreshes the applied page query and downloads up to 50
matching events. New or backdated events may change the rows between viewing
and exporting; this is not a frozen copy of the displayed rows or all history.
Repeating or changing pages requires another explicit download. Each file uses
UTF-8, a header row, CRLF record
separators, quoted values, and doubled embedded quotes.

| Column | Meaning |
| --- | --- |
| `event_id` | Immutable event identifier |
| `created_at_utc` | Normalized UTC ISO timestamp |
| `actor_id` | Runtime actor/user identifier, not email |
| `action` | Exact recorded action name |
| `action_family` | First dot-separated action segment |
| `outcome` | Explicit classification above, or `unknown` |
| `entity_type` | Affected object type |
| `entity_id` | Affected record/object identifier; empty when absent |
| `request_id` | Request correlation identifier |

Cells beginning with spreadsheet formula markers (`=`, `+`, `-`, `@`), including
after leading whitespace/control characters, receive a leading apostrophe.
Treat any export as private. Downloaded copies are outside FREE CRM's control.

Export preparation appends `audit.export.prepared`, containing actor/request IDs
and bounded page counts, never row contents or filters. It confirms preparation,
not delivery to a person or successful download. If that receipt cannot be
recorded, the server releases no CSV. Retrying a download records another
preparation attempt; viewing and pagination do not append events.

## API

`GET /api/v1/audit` accepts `from`, `to` (complete UTC ISO strings), `actor`,
`family`, `outcome`, `record`, `cursor`, and `format=json|csv`. Unknown or repeated
parameters are rejected. Workspace selection never comes from this request.
JSON returns `{data: {events, filters, nextCursor, scanned, scanLimit, pageSize,
partial, warnings, canExport}}`.

The cursor binds workspace and filters, carries the same UTC window, and advances
by timestamp/ID. Passing just the returned cursor resumes the query. Changed
filters require a new search. A cursor is opaque pagination state, not a secret,
an authorization token or a signed proof; tenant and role checks remain mandatory.

CSV responses disclose page scope, returned/scanned counts, partial state and
continuation through `x-free-crm-audit-*` headers. All responses are private
`no-store`; CSV includes `nosniff` and an attachment filename. The public service
worker never caches API responses. No client audit data is saved in localStorage.

Validation covers real SQLite indexes and append-only triggers, tenant isolation,
roles, tied-timestamp pagination, cursor scope, sparse filters and scan limits,
date bounds, safe outcomes, malformed rows, storage retry, export receipts,
formula injection, route headers, client retry and accessible rendering.
