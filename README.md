# FREE CRM

![FREE CRM — your relationships, your workspace](public/og.png)

FREE CRM helps you keep track of people, conversations, sales, and promises in
one workspace. CRM means **customer relationship management**, but the platform
also supports personal relationships and work involving agents.

The software is free and open source. Run your own copy on your computer or in
your cloud account. You control the data; you also manage setup, updates, and
backups. Cloud services and other infrastructure may cost money.

[Try the demo](https://www.freecrm.dev/tour) · [Present the platform](https://www.freecrm.dev/demo) · [Find your setup path](https://www.freecrm.dev/start) · [Contribute](CONTRIBUTING.md)

## Try it first

Open the [public demo](https://www.freecrm.dev/tour). No installation, sign-in,
or API key is needed.

Explore a fictional workspace through five audience paths: Personal & solo,
Business, Enterprise, Humans + agents, and Building for agents. Try sample
workflows across 21 areas, from a first introduction to an invoice and payment
record. It works in a desktop or mobile browser. For a guided presentation,
open the [ten-chapter platform demo](https://www.freecrm.dev/demo).

Everything in both demos is synthetic. Actions affect only the demo, and reset
or reload clears your changes. The tour uses self-contained examples even when
matching workspace features are available; future features are labeled. The demo is not a shared account for your own records; those belong in
your own installation. See the [tour guide](docs/SYNTHETIC-TOUR.md) for a walkthrough.

## What can you do?

- **Remember people:** keep contacts, companies, notes, and conversation history together.
- **Build private knowledge:** connect source notes to CRM records, search them, and optionally use device-only Ollama for source-cited answers.
- **Choose what adapts:** review evidence-backed Today signals, confirm follow-ups, and opt in separately to learning or release discovery.
- **Follow up:** manage leads, tasks, activities, and support requests.
- **Track business:** manage opportunities, products, quotes, invoices, and recorded payments.
- **See the whole picture:** connect documents, campaign plans, and reports to your work.
- **Stay in control:** preview CSV imports, export records, run workflow rules, and explore agent approvals and receipts.

Personal, business, and enterprise are profiles within **one application**, not
separate products. Agent capabilities can be enabled across profiles.

Today, each installation supports **one owner**. Individuals and solo business
operators can use it now; enterprise evaluators and developers can inspect the
foundations. Shared team access is not yet available.

## Run on one device

This is the simplest way to use real records without setting up cloud accounts.
You need [Node.js 22.13.0 or newer](https://nodejs.org/) and internet access for
the first installation. No API key is required.

1. On this repository's GitHub page, choose **Code → Download ZIP**, then extract it. Developers can clone the repository instead.
2. Open the extracted project folder and start FREE CRM:

   - **Windows:** double-click `START-FREE-CRM.cmd`.
   - **macOS/Linux:** open a terminal in that folder and run:

     ```sh
     chmod +x scripts/start-local.sh
     ./scripts/start-local.sh
     ```

3. Keep the launcher window open. Once startup finishes, open [your workspace on this computer](http://127.0.0.1:3477/workspace).

The launcher installs dependencies, builds the app, and prepares local storage.
Use it only on the same computer; do not expose this local server to the internet.

### Run with Docker

If you already use Docker, run this from the project folder:

```sh
docker compose up --build
```

Then open [your local workspace](http://127.0.0.1:3477/workspace). This is also a single-owner,
local-only setup. See [storage and backup guidance](docs/OPERATIONS_REFERENCE.md#backups-and-exports).

## Use your own cloud

A cloud installation lets you reach your workspace from other devices. It needs
provider accounts, owner sign-in, and private database/file storage configuration.
Ask someone technical to help if this is unfamiliar.

- [Vercel setup](docs/VERCEL_DEPLOYMENT.md): Next.js, GitHub owner sign-in, Cloudflare D1, and private Vercel Blob.
- [Cloudflare setup](docs/CLOUD_DEPLOYMENT.md): Workers, D1, private R2, and Cloudflare Access.

Cloudflare starts locked. Follow the guide's **Save/Deploy** activation and
readiness checks before entering data. Its installer is for new installations,
not upgrades of an existing Worker. Never put credentials in this repository.

## Install on a phone or tablet

Open your configured HTTPS installation in a mobile browser and choose
**Add to Home Screen** or **Install app**, where supported. This uses the same
responsive web app, not a separate edition. Workspace data needs a live
connection to your installation. Native iOS, Android, and APK apps are not shipped.

## Data ownership and current limits

- **Free software, not guaranteed free hosting.** Provider costs and limits remain your responsibility.
- **Exports are not full backups.** They exclude uploaded files. Stop the local app before backing up `.wrangler/state`; Docker uses the `free-crm-data` volume. Cloud backups need both database and files. [Backup details](docs/OPERATIONS_REFERENCE.md#backups-and-exports).
- **Agents are simulated locally.** They cannot contact customers, call external providers, or move money. Recording a payment does not charge anyone.
- **Not yet released:** shared team accounts, enterprise single sign-on, live email/calendar account sync, production PostgreSQL/S3 adapters, and general external agent execution. Release discovery prepares a proposal for review; it never installs or deploys code.

Review the [Community roadmap](ROADMAP.md) and [security guidance](SECURITY.md)
before choosing FREE CRM for sensitive or business-critical work. Check the
[capacity limits](docs/OPERATIONS_REFERENCE.md#capacity-limits) for your expected data size.

## Development and release verification

Developers need Node.js 22.13.0+ and npm:

```sh
npm ci
npm run dev
```

Before submitting a change, follow the [contribution and validation guide](CONTRIBUTING.md#validate-before-opening-a-pull-request).
It covers `npm run check`, both build targets, secret scanning, and dependency checks.

## Learn more or help improve it

- [Technical reference](docs/OPERATIONS_REFERENCE.md): capabilities, architecture, limits, and webhooks.
- [Platform demo guide](docs/PLATFORM-DEMO.md), [launch package](docs/LAUNCH-PACKAGE.md), [Second brain guide](docs/SECOND-BRAIN.md), and [adaptive CRM guide](docs/ADAPTIVE-CRM.md).
- [CSV import guide](docs/CSV_IMPORT.md) and [agent safety checks](docs/AGENT_SAFETY_EVALUATIONS.md).
- [Good first issues](https://github.com/mlmrx/FreeCRM/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22), [ideas and proposals](https://github.com/mlmrx/FreeCRM/issues?q=is%3Aissue+is%3Aopen+label%3Aidea), and [contribution guidance](CONTRIBUTING.md).

Documentation, design feedback, accessibility testing, and code contributions
are all welcome. Report suspected security vulnerabilities privately using
[SECURITY.md](SECURITY.md), not a public issue.

## License

[MIT](LICENSE). Your copy and your data remain yours. FREE CRM is an independent
project and is not affiliated with YouSpot, HubSpot, or connector providers.
