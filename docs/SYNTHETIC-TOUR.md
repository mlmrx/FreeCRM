# The public synthetic workspace tour

Open `/tour`. Five audience journeys cover Personal & solo, Business,
Enterprise, Humans + agents, and Building for agents. Audience selection
changes the recommended sequence, not feature access or a real workspace
profile. **Explore all 21 areas** and search cover the complete catalog.

All twelve CRM modules are represented, together with reports, workflows,
integrations, governance, actor architecture, ownership/mobile setup, community,
and the roadmap. Knowledge, adaptive Today, and capability discovery are
available in an installed workspace; the tour rehearses them with embedded
fiction and never touches private workspace data.

## Behaviors worth demonstrating

- Convert Riley's lead and find the contact in People & companies.
- Move Workshop refresh to Proposal, convert Q-104 to INV-104, issue it, and
  record a $4,800 sample payment. Inspect the receipt and Reports.
- Complete the launch follow-up or resolve T-208, then open Avery's timeline.
- Search `launch` in Second brain; inspect N-104, its connection, and Today.
- Review and confirm a fictional follow-up. Learning starts off; opt in,
  pause, and forget are bounded demonstrations in page memory.
- Run the sample workflow twice; it creates one fictional task. Pause blocks
  new runs. Fix the sample CSV, re-preview, and simulate a two-contact import.
- Evaluate the Local CRM insights request. Approval is required before the
  read-only simulation. Test missing scope, budget, grant expiry/revocation,
  blocked external sending, receipt replay, and emergency stop.
- Compare profiles, inspect actors and boundaries, and choose a setup path.

Sections link to related tour scenes, never to the sealed owner workspace.
Public exit links lead to the presentation demo, setup, documentation, the
shared roadmap, or the repository.

## Isolation and state

`lib/tour-model.ts` defines the authored catalog and guarded tour transitions.
`app/tour/tour-scenes.tsx` renders the fictional working surfaces. No tour
module imports a private client, calls an API, accepts files, reads browser
storage, or obtains credentials. Search text and simulated changes exist only
in React memory. Reload/reset discards them. There are no models, OpenAI keys,
live vendor scans, messages, or payment processing in this tour.

The URL fragment stores only validated audience/section identifiers, e.g.
`/tour#business/billing`; it never contains a query or record data. Reloading
that link restores navigation with fresh sample records. The site-wide PWA
still loads public assets under its existing caching policy; private routes
retain their existing authorization and network-only behavior.

## Acceptance checks

Check all five audience buttons, every destination in the feature catalog,
search (including no matches), related links, previous/next, reload/deep links,
and reset. Use keyboard navigation and 320/390/768 px mobile/tablet widths plus
desktop. Verify that payment-before-issue, invalid CSV import, unapproved agent
execution, external execution, and execution after stop remain blocked.
Receipts must remain visible after stop; workflow/agent replay must not create
a duplicate effect. Verify reporting values reflect the sample actions.

Run the repository's required release checks and both build targets. This tour
changes no database schema, owner permissions, or production credentials.
