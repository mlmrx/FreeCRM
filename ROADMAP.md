# FREE CRM community roadmap

FREE CRM is one open, self-hostable relationship operating system. Personal,
business, and enterprise are workspace profiles on the same platform. Agentic
CRM is a governed capability layer, not a separate fork.

This roadmap makes unfinished work visible so contributors can choose a useful
vertical slice. A milestone communicates sequence and product intent, not a
promised release date. The linked GitHub issue is the source of truth for scope,
design discussion, acceptance criteria, and current status.

## Start contributing

- [Good first issues](https://github.com/mlmrx/FreeCRM/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
- [Help wanted](https://github.com/mlmrx/FreeCRM/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)
- [Accepted roadmap work](https://github.com/mlmrx/FreeCRM/issues?q=is%3Aissue+is%3Aopen+label%3Aroadmap)
- [Ideas and RFCs](https://github.com/mlmrx/FreeCRM/issues?q=is%3Aissue+is%3Aopen+label%3Aidea)
- [Open an issue](https://github.com/mlmrx/FreeCRM/issues/new/choose)

Before taking an issue, comment with the slice you intend to deliver and the
tests you expect to add. A maintainer may refine the boundary before code starts.
Read [`CONTRIBUTING.md`](CONTRIBUTING.md) and never use a public issue for a
suspected vulnerability.

## What is working today

The current platform includes tenant-fenced relationship, sales, billing, work,
service, analytics, workflow, integration, document, administration, and guarded
agent foundations. It runs on one device, in Docker, on Cloudflare, and through
a native Vercel architecture. The product is exact-single-owner today; external
provider OAuth and external agent execution are deliberately not claimed.

See [`README.md`](README.md) for the precise implemented capability and limit
table. Issues should close a documented gap rather than create a second product
edition or duplicate a working module.

## 0.2 — Private production

Goal: make an owner-controlled deployment dependable to activate, upgrade,
back up, restore, and diagnose without weakening the sealed-by-default model.

| Issue | Contribution | Why it matters |
| --- | --- | --- |
| [#11](https://github.com/mlmrx/FreeCRM/issues/11) | Design a no-card native Vercel data-plane boundary | Removes a payment-detail barrier while preserving machine authentication, replay protection, and rate limits. |
| [#12](https://github.com/mlmrx/FreeCRM/issues/12) | Implement a recoverable Cloudflare upgrade protocol | Replaces first-install-only refusal with staged, verified upgrades and rollback. |
| [#13](https://github.com/mlmrx/FreeCRM/issues/13) | Add verified full backup and restore including document bytes | Turns portable data into a complete, integrity-checked recovery path. |
| [#14](https://github.com/mlmrx/FreeCRM/issues/14) | Add a deployment readiness checklist | Gives a new contributor a focused documentation-first entry point. |

[View the 0.2 milestone](https://github.com/mlmrx/FreeCRM/milestone/1)

## 0.3 — Team CRM

Goal: support invited humans in one shared workspace while keeping identity,
authorization, audit, and tenant boundaries explicit.

| Issue | Contribution | Why it matters |
| --- | --- | --- |
| [#15](https://github.com/mlmrx/FreeCRM/issues/15) | Add workspace invitations and membership lifecycle | Moves beyond exact-single-owner with expiring invitations and audited membership changes. |
| [#16](https://github.com/mlmrx/FreeCRM/issues/16) | Build role administration with permission explainability | Makes least privilege understandable without moving authorization into the browser. |
| [#17](https://github.com/mlmrx/FreeCRM/issues/17) | Add audit filters and safe CSV export | Helps teams answer who changed what without exposing secrets or spreadsheet formulas. |

[View the 0.3 milestone](https://github.com/mlmrx/FreeCRM/milestone/2)

## 0.4 — Agentic CRM

Goal: let agents use CRM context and tools through governed contracts with
identity, policy, approval, receipts, evaluation, and an emergency stop.

| Issue | Contribution | Why it matters |
| --- | --- | --- |
| [#18](https://github.com/mlmrx/FreeCRM/issues/18) | Expose a read-only MCP server with scoped CRM tools | Establishes a machine interface without screen scraping or external writes. |
| [#19](https://github.com/mlmrx/FreeCRM/issues/19) | Build agent policy authoring and dry-run evaluation | Lets owners understand a policy decision before an agent can act. |
| [#20](https://github.com/mlmrx/FreeCRM/issues/20) | Create an agent safety evaluation harness | Makes approval, budget, replay, expiry, and stop invariants repeatable in CI. |

[View the 0.4 milestone](https://github.com/mlmrx/FreeCRM/milestone/3)

## Future — Portable enterprise

Goal: add production infrastructure choices and delivery operations without
forking the domain model or abandoning SQLite, D1, local files, or R2.

| Issue | Contribution | Why it matters |
| --- | --- | --- |
| [#21](https://github.com/mlmrx/FreeCRM/issues/21) | Add PostgreSQL adapter conformance and implementation | Proves the repository contract across a production relational target. |
| [#22](https://github.com/mlmrx/FreeCRM/issues/22) | Add an S3-compatible object-storage adapter | Extends private file portability behind the existing storage interface. |
| [#23](https://github.com/mlmrx/FreeCRM/issues/23) | Build a durable outbox delivery worker | Turns persisted intent into observable, retry-safe external delivery. |

[View the portable-enterprise milestone](https://github.com/mlmrx/FreeCRM/milestone/4)

## Future — Installable mobile

Goal: make the same FREE CRM platform dependable on phones and tablets without
splitting personas into separate repositories. The standards-based PWA remains
the baseline; a thin native shell must earn its maintenance and security cost
through concrete device capabilities.

| Issue | Contribution | Why it matters |
| --- | --- | --- |
| [#33](https://github.com/mlmrx/FreeCRM/issues/33) | Plan installable mobile distribution without product forks | Defines the PWA, reproducible Android artifact, iOS signing, offline, security, cost, and release boundaries before choosing a wrapper. |

Source code and community Android artifacts can remain free, but app-store
memberships, signing identities, domains, and cloud services are owned by each
distributor and may have provider costs. No signing key belongs in this
repository.

## Good first contributions

- [#34 — Safe CSV import templates](https://github.com/mlmrx/FreeCRM/issues/34)
- [#35 — Open CRM glossary](https://github.com/mlmrx/FreeCRM/issues/35)

The public editorial accessibility pass in
[#24](https://github.com/mlmrx/FreeCRM/issues/24) has been implemented in the
current release candidate, including focused regression coverage and the
synthetic cross-device test matrix.

“Good first issue” means the scope is bounded and documented. It does not waive
tests, accessibility, security, or release checks. Maintainers should keep at
least two genuinely available starter issues labeled and close or relabel work
as soon as its status changes.

## Ideas open for community design

Ideas are not implementation approval. They need a useful RFC, synthetic
examples, tradeoffs, security and privacy analysis, and an acceptance decision
before a large pull request begins.

- [#25 — Privacy-preserving contact deduplication and merge receipts](https://github.com/mlmrx/FreeCRM/issues/25)
- [#26 — Community connector catalog without credential centralization](https://github.com/mlmrx/FreeCRM/issues/26)

Other welcome idea areas include offline multi-device synchronization, ethical
enrichment, operator-owned email and calendar connectors, explainable reporting,
customer knowledge bases, and accessibility. Open an Idea / RFC issue rather
than presenting a speculative module as finished product behavior.

## Roadmap rules

1. Preserve one shared platform and reversible workspace profiles.
2. Prefer a complete vertical slice over a placeholder module.
3. Keep local-first operation and user-owned cloud credentials.
4. Treat tenant isolation, audit evidence, and safe failure as acceptance criteria.
5. Do not claim a connector, agent action, backup, or deployment path that has
   not completed a real end-to-end verification.
6. Keep issue scope and roadmap status honest as the implementation changes.

