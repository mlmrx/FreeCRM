# FREE CRM

![FREE CRM — Your relationships, remembered](public/og.png)

**FREE CRM, FREE FOR ALL, FREE FOREVER.**

Your private, open-source relationship workspace. FREE CRM remembers people, context, promises, and opportunities without requiring a subscription, an account, or an API key.

This is an original, clean-room project inspired by the broad idea of an AI-native personal CRM. It is not affiliated with YouSpot or HubSpot.

## What works today

- A focused Today view with relationship health and overdue follow-ups
- People, companies, and a lightweight opportunity board
- Evidence-backed “ask your network” answers using local notes and metadata
- Native browser search with `Ctrl/⌘ + K`
- Add people, notes, and follow-ups; complete tasks; advance opportunities
- Native IndexedDB persistence with a localStorage fallback
- CSV import with email deduplication
- Full JSON backup/restore and portable CSV export
- Installable PWA shell with offline caching
- No analytics, ads, sign-in, external AI, or server-side customer database

## One-click device launch

### Windows

Install [Node.js 22+](https://nodejs.org/), then double-click `START-FREE-CRM.cmd`. The first launch installs dependencies and opens FREE CRM at `http://localhost:3477`.

### macOS or Linux

```sh
chmod +x scripts/start-local.sh
./scripts/start-local.sh
```

You can also run `npm ci && npm run dev`. In a supported browser, open **Import & backup → Install FREE CRM** to pin it like a native app.

## One-command self-hosting

With Docker running:

```sh
docker compose up --build
```

Open `http://localhost:3477`. The container serves the application; each browser still owns its separate local CRM database.

## Cloud deployment

The repository includes the OpenAI Sites/Cloudflare-compatible build configuration in `.openai/hosting.json`. Publish it with Sites for an HTTPS deployment, or deploy the Docker image to any platform that accepts a `Dockerfile`.

Because the default architecture is local-first, cloud hosting does not expose or centralize customer data. Cross-device encrypted sync, authentication, and opt-in connectors belong on the public roadmap rather than being rushed into the privacy boundary.

## Data and privacy model

```text
CSV / JSON import ──→ browser IndexedDB ──→ Today, Search, Ask, People
                             │
                             └────────────→ JSON backup / CSV export

Cloud or local server ──→ app files only; no CRM records
```

Clearing browser data removes that browser’s FREE CRM workspace. Export a JSON backup before clearing storage, moving devices, or testing destructive changes.

## Development

Requirements: Node.js 22.13 or newer.

```sh
npm ci
npm run dev
npm run lint
npm run build
```

The application uses React 19, Vinext, Vite, and Tailwind’s build pipeline. Product data types and demo fixtures live in `lib/crm.ts`; persistence lives in `lib/storage.ts`; the interaction surface lives in `app/crm-app.tsx`.

## Roadmap

- Encrypted, opt-in multi-device sync
- BYO-model adapters for OpenAI, Anthropic, and local Ollama
- Gmail and Calendar connectors that store derived context, not message bodies
- Contact merge review and richer CSV mapping
- Relationship graph visualization and cited full-text search
- Human-approved drafts—never autonomous sending by default

## Free forever

The code and the no-subscription local mode are licensed under the repository’s **MIT License**. Nobody can revoke your copy. Third-party hosting, domains, connectors, and model APIs may have their own limits or costs; FREE CRM does not require them.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
