# FREE CRM launch package

This is the launch handoff for the current FREE CRM release. It keeps the
public story, demo evidence, and operational boundaries aligned with the
canonical production release.

## Release status

| Item | Current state | Evidence or next action |
| --- | --- | --- |
| Canonical public origin | Public shell and category comparison live | [`https://www.freecrm.dev`](https://www.freecrm.dev) |
| Authenticated workspace | **Sealed / not ready** | [`https://www.freecrm.dev/workspace`](https://www.freecrm.dev/workspace) currently shows “Finish workspace setup”; `/api/v1/health` returns `503 deployment_locked` |
| Public demo routes | Live from protected `main` | [`/tour`](https://www.freecrm.dev/tour) for the guided tour; [`/demo`](https://www.freecrm.dev/demo) for the presenter flow |
| Demo recording | Local master received; edit before publishing | 74:40, 1080×720, H.264/AAC. Initial spot-check shows a presenter webcam overlay and local development URLs; create a public cut and scrub before sharing |
| Verified production commit | Published | `030349c`; post-merge CI and Vercel production deployment passed |
| Local demo preview | Available when the device Worker is running | [`http://127.0.0.1:3477/demo`](http://127.0.0.1:3477/demo) on the development machine |
| Mobile experience | Same responsive installable PWA | Use **Add to Home Screen** or **Install app** from the HTTPS origin |
| Native Android/iOS packages | Not shipped | Tracked in [issue #33](https://github.com/mlmrx/FreeCRM/issues/33) |
| Production release gate | Green for this release | Re-run the commands in [Release gate](#release-gate) for the next release |

The public origin currently redirects `freecrm.dev` to `www.freecrm.dev` and
serves the public shell, guided tour, and presenter demo. The hosted workspace
is intentionally sealed until the owner identity provider, D1 RPC data plane,
and private Blob storage are configured. Do not enter customer data or describe
the hosted workspace as ready until the authenticated health check passes.

## Positioning

### One sentence

**FREE CRM is the open-source relationship operating system that keeps your
people, work, money, knowledge, and guarded automation in one workspace you
can run and own.**

### Short description (280 characters)

FREE CRM is a self-hostable relationship operating system for people and small
teams. Manage relationships, sales, work, billing, knowledge, analytics, and
guarded agent workflows in one MIT-licensed workspace with user-owned data.

### Long description

Most CRMs split the relationship from the work around it. FREE CRM keeps
contacts and companies connected to opportunities, quotes, invoices, tasks,
service, documents, notes, analytics, and the decisions that need attention
today. A second-brain layer connects source-backed notes to CRM records, while
the agent plane makes permissions, approvals, budgets, receipts, replay
protection, and emergency stop visible. The result is a private, local-first
relationship system that can grow from one operator to a business foundation
without handing ownership of the data to a black box.

### Who it is for

- Individual operators who want a useful CRM without a per-seat tax or a
  forced cloud account.
- Small and growing businesses that need relationships, pipeline, work,
  billing, and service in one operating view.
- Human-and-agent teams that need explicit authority, review, and receipts
  before automation can act.
- Open-source contributors who want a self-hostable CRM with clear security
  boundaries and a practical path toward shared workspaces.

### What makes it different

1. **One relationship graph:** people, organizations, services, notes, work,
   money, and files remain connected.
2. **Ownership as a product feature:** MIT-licensed source, local device mode,
   SQLite/D1 today, and user-owned cloud credentials.
3. **Agent actions with brakes:** policy, time-bounded grants, approval,
   budget, immutable receipts, replay protection, and emergency stop.
4. **Evidence before adaptation:** Today signals and learning are opt-in,
   reviewable, and reversible.
5. **A real mobile path:** the same responsive PWA can be installed on a phone
   or tablet; there is no second mobile data model to drift from the platform.
6. **A multilingual foundation:** English, Spanish, French, Portuguese, German,
   and Arabic are available across the public landing experience and primary
   CRM shell. The workspace owns the preference, locale-aware formatting is
   built in, and Arabic receives an RTL layout without translating user data.

### Comparison style

Compare product patterns, not company names. Help people recognize the world
they already know—contact lists, record-first CRM, cloud-first CRM, enterprise
suites, or AI-first tools—then show the FREE CRM shift: connected context,
inspectable source, user-owned infrastructure, portable data, and guarded
agent action. Keep the tone confident and welcoming; do not build the product
story around affiliation disclaimers or a vendor-by-vendor scorecard.

## Public launch copy

### Homepage hero

**Your relationships are the business.**

FREE CRM brings contacts, companies, pipeline, work, billing, knowledge, and
guarded automation into one private workspace you can run and own.

Primary CTA (publish after owner activation): **Open the workspace** →
[`/workspace`](https://www.freecrm.dev/workspace)

Secondary CTA: **See how it works** → `/how-it-works`

Trust line: **MIT licensed · local-first · no vendor lock-in · agents stay
under your control**

### GitHub repository description

Open-source, self-hostable relationship operating system for people, teams,
and human-and-agent work. CRM, pipeline, work, billing, knowledge, analytics,
and guarded automation in one owner-controlled workspace.

### GitHub release title

**FREE CRM 0.1 — the relationship operating system you can own**

### GitHub release body

FREE CRM brings the working parts of a relationship business into one
owner-controlled workspace: relationships, sales and billing, work and service,
documents, analytics, a local-first second brain, adaptive Today signals, and a
guarded agent plane.

This release includes:

- Leads, contacts, companies, lifecycle, tags, notes, links, and Customer 360.
- Opportunities, products, quotes, guarded invoice transitions, and immutable
  payment receipts.
- Activities, tasks, calendar export, campaigns, tickets, and document
  lifecycle.
- Pipeline, forecast, revenue, source, activity, task, aging, and support
  analytics.
- Tenant-owned notes and imports, explicit knowledge links, graph exploration,
  search, export, and optional device-only Ollama assistance.
- Opt-in, evidence-backed Today briefing and reviewed capability discovery.
- Audited automation rules and a guarded local agent simulator with grants,
  policy, approvals, receipts, replay protection, and emergency stop.
- Responsive PWA install metadata and a public-only offline shell.

Start with the [README](../README.md), run locally with the device launcher, or
follow the [Vercel](VERCEL_DEPLOYMENT.md) or
[Cloudflare](CLOUD_DEPLOYMENT.md) deployment guide.

Important boundaries: this release is exact-single-owner; enterprise is a
foundation/preview, not a finished shared-identity product. Provider OAuth,
native mobile packages, SSO/SCIM, production PostgreSQL/S3 adapters, external
autonomous agents, and charging payments are not shipped. Agent execution is a
local simulator, and payment records are not payment processing.

### Product Hunt / directory blurb

**A CRM you can actually own.** FREE CRM connects relationships to pipeline,
work, billing, knowledge, and guarded agent workflows. Run it on your device,
deploy it to your own Cloudflare or Vercel account, and keep the authority,
data, and receipts in your hands.

### LinkedIn post

We built FREE CRM for the part of work that ordinary CRMs leave scattered:
the relationship context around every opportunity, task, invoice, note, and
decision.

It is open source and self-hostable, with a local-first device mode, a
responsive installable web app, a second brain connected to CRM records, and a
guarded agent plane where permissions, approvals, budgets, receipts, and
emergency stop are explicit.

Workspace after owner activation: https://www.freecrm.dev/workspace
Read the source: https://github.com/mlmrx/FreeCRM

The current release is deliberately honest about its boundaries: one owner,
local agent simulation, and reviewed proposals instead of autonomous external
actions. That is the foundation we want to extend in public.

### Short social post

FREE CRM: an open-source relationship operating system you can run and own.
Relationships, pipeline, work, billing, knowledge, and guarded agent workflows
in one responsive PWA.

Workspace after owner activation: https://www.freecrm.dev/workspace
Source: https://github.com/mlmrx/FreeCRM

### Launch email

**Subject:** Meet FREE CRM — a relationship operating system you can own

Hi,

We’re opening FREE CRM, an MIT-licensed, self-hostable workspace for the work
around your relationships. It connects contacts and companies to pipeline,
tasks, billing, service, documents, knowledge, analytics, and carefully guarded
automation.

After the owner deployment is activated, you can try the workspace at
https://www.freecrm.dev/workspace and install the responsive PWA on a phone or
tablet. Until then, run the source on your own device or cloud account.

The project is intentionally clear about authority: the current release is
single-owner, agent execution is a local simulator, and external provider
sync, native mobile packages, and payment charging are not claimed. If that
kind of ownership-first CRM is useful to you, try it, open an issue, or send a
small improvement.

Source and setup: https://github.com/mlmrx/FreeCRM

Thanks,
The FREE CRM maintainers

## Demo and onboarding path

### Five-minute product tour

1. Open the public origin and choose **See how it works**.
2. Show the relationship record and its linked work, notes, and activity.
3. Move to pipeline, quote/invoice guards, and the immutable payment receipt.
4. Open **Second brain** and connect a source-backed note to a CRM record.
5. Open **Today** and show that a follow-up is created only after review.
6. Open the agent controls and show grant, approval, budget, receipt, and stop.
7. End with ownership: local launcher, PWA install, export, and deployment docs.

### Screen-share demo

For the ten-chapter presenter flow, use [`PLATFORM-DEMO.md`](PLATFORM-DEMO.md).
It includes keyboard controls, synthetic-data guidance, live-link handling,
and the exact boundary language for previews and unavailable integrations.

Before sharing a live workspace, use synthetic records, verify `/workspace`,
`/brain`, and `/today`, and never expose provider keys or private notes.

### Demo recording

The finished recording is launch evidence for the public, synthetic-data path.
The current local master is approximately 74 minutes 40 seconds at 1080×720
with H.264 video and AAC audio. Before publishing it:

1. Create a focused launch cut (roughly two to five minutes) or add clear
   chapter timestamps to the full recording.
2. Put the final video at a stable, shareable URL and add that URL to the
   release notes, launch post, and any directory submission.
3. Confirm the opening frame identifies the public tour or presenter demo and
   that the recording does not imply the sealed hosted workspace is ready.
4. Scrub local development URLs, browser tabs, chats, notifications, and any
   personal or private details. Decide deliberately whether the presenter
   webcam remains visible.
5. Check that every visible record, email, document, and key is synthetic or
   public-safe.
6. Keep the repository source-only; do not commit the video binary. If the URL
   changes, update this section and the launch copy together.

### Mobile callout

The mobile experience is the same responsive PWA. On the live HTTPS origin,
open the browser menu and choose **Add to Home Screen** / **Install app**. The
public shell can fall back offline; authenticated workspace data, sign-in,
files, exports, and API mutations require the live owner-controlled origin.

## Setup links

| Audience | Start here |
| --- | --- |
| Hosted workspace (after owner activation) | [`www.freecrm.dev/workspace`](https://www.freecrm.dev/workspace) |
| Run on one device | [`README.md#run-on-one-device`](../README.md#run-on-one-device) |
| Run with Docker | [`README.md#run-with-docker`](../README.md#run-with-docker) |
| Deploy native Next.js | [`VERCEL_DEPLOYMENT.md`](VERCEL_DEPLOYMENT.md) |
| Deploy a protected Cloudflare install | [`CLOUD_DEPLOYMENT.md`](CLOUD_DEPLOYMENT.md) |
| Understand security boundaries | [`SECURITY.md`](../SECURITY.md) |
| Contribute | [`CONTRIBUTING.md`](../CONTRIBUTING.md) |
| See the roadmap | [`ROADMAP.md`](../ROADMAP.md) |

## FAQ and objection handling

### Is FREE CRM really free?

The source and local/device runtime are MIT licensed and subscription-free.
Cloud providers, domains, storage, identity providers, store memberships, and
devices can still charge according to their own terms and quotas.

### Does it replace a mature CRM today?

It is a complete vertical foundation for an owner-operated CRM, not a claim of
feature parity with every mature suite. Shared identity administration,
provider OAuth, production PostgreSQL/S3 adapters, and a generic outbound
delivery worker remain future work.

### Is there a native mobile app?

Not yet. The shipped mobile artifact is the same responsive installable PWA.
Reproducible Android packages and user-signed iOS distribution are tracked in
issue #33.

### Does the hosted deployment need an OpenAI API key?

No. FREE CRM does not configure or require `OPENAI_API_KEY`. The hosted Vercel
path needs the owner identity, D1 RPC, private Blob, and authentication secrets
listed in the deployment guide. The optional AI feature is device-local Ollama,
with explicit opt-in and no cloud provider key. If an OpenAI-key error appears
in another environment, it is not the expected configuration for this release;
check that environment's build and integration rather than adding a key to the
FREE CRM deployment.

### Does the agent send messages or move money?

No. Agent execution is limited to a local simulator in this release. FREE CRM
does not autonomously communicate with customers or move money. Payment data
is recorded as receipts; it is not charged through a payment provider.

### Can I bring my own data?

Yes. CSV import has preview and bounded, tenant-scoped, idempotent commit
semantics. CSV/JSON export and a portable snapshot are available, with the
document-byte and provider-backup limits described in the data-ownership
section of the README.

### How is access protected?

Device mode accepts one fixed owner only on literal loopback. Vercel uses an
exact-owner GitHub OAuth session. Cloudflare uses a verified Access JWT. The
server derives the workspace boundary; request JSON cannot choose a tenant.

## Release gate

Run these from the exact checkout intended for the release. A failed command is
an open launch item, not a footnote:

```sh
npm ci
npm run security:secrets
npm run security:secrets:history
npm run lint
npm run typecheck
npm run test:coverage
npm run agent:safety
npm run test:db
npm run db:check
npm run db:drift
npm run build
npm run build:vercel
npm audit --audit-level=moderate
```

After deployment, verify the authenticated `/api/v1/health`, create/read a
disposable record and (where applicable) document, verify D1/R2 readiness, and
run `npm run smoke:api` against the deployed or release-equivalent Worker.

## Go / no-go checklist

### Go when

- The reviewed branch is merged to protected `main` and the full CI workflow is
  green.
- The canonical origin serves the intended commit, including `/demo` if it is
  included in launch copy.
- Owner authentication and tenant isolation are verified on the production
  origin.
- D1/SQLite schema is current; R2/Blob storage is private and tested.
- The mobile PWA install and narrow offline-shell behavior are checked on one
  iOS/Safari device and one Android/Chrome device.
- The release post, repository links, support path, and boundary language have
  an owner.

### No-go when

- A preview branch is being represented as production.
- Any secret, token, real customer record, or private document appears in a
  screenshot, fixture, log, or release artifact.
- A provider integration, payment charge, native app, SSO/SCIM feature, or
  autonomous external agent is described as shipped when it is not.
- A migration, Access policy, or production deployment is being attempted
  without explicit operator approval and a recovery point.

## After launch

Use GitHub Issues for bugs and roadmap requests. Ask every report for the
release commit, runtime (device/Docker/Vercel/Cloudflare), route, reproduction,
and whether synthetic data was used. Keep security reports in the repository's
private advisory path; never ask reporters to paste credentials or tokens into
an issue.

The first public feedback loop should measure activation (workspace opened,
first record created, first export), retention (returning workspace users), and
trust (agent-control views, approvals, stops, and issue quality). Do not use
customer content as telemetry without a separately reviewed opt-in design.

## Maintainer handoff

Before publishing, replace no product-boundary language with optimistic
marketing claims. Instead, update the status table with the verified commit,
deployment timestamp, smoke-check result, and the person responsible for
rollback. Keep this file beside the release so launch copy and operational
truth evolve together.
