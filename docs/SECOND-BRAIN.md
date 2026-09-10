# Your second brain, on your terms

FREE CRM's second brain is part of the same workspace, not a separate product
fork. Start at `/brain`; the public setup guide is at `/brain/help`. It combines a
source library, explicit knowledge links, retrieval, and optional local
conversation. The library does not require an API key or a running model.

## What this release does

- Capture notes and manually pasted clips, including an optional source URL.
  Import plain-text `.txt` and Markdown `.md` files. A URL is provenance, not a
  request to fetch or crawl a website.
- Organize, edit, and search saved sources. Create explicit links between sources
  and existing CRM records. The graph represents links you made; it is not an
  automatically inferred account of what is true.
- Use keyword retrieval without AI. With local AI enabled, index sources for
  semantic retrieval and ask questions against retrieved source excerpts.
- Keep conversations and their citations in the workspace database. Follow a
  citation back to its source and check the evidence before relying on an answer.
- Export readable JSON and Markdown. Exported files contain your knowledge and
  may contain personal information; protect them like database backups.

The current workspace limits are 200 sources, 40,000 characters per source, and
40 retrieval chunks per source, plus 100 conversations with 100 messages each.
Cumulative UTF-8 budgets also apply: 3 MiB for source text and metadata, and 3 MiB
for conversation messages, citations, and source-dependency metadata. Whichever limit is reached first
applies; large sources can fill the library before its count limit. This is not
an unbounded archive or a large-scale vector database.

This is a bounded local-first release, not feature parity with every knowledge
product. Automatic web clipping, email/calendar/drive synchronization, PDF/OCR,
audio transcription, native mobile applications, autonomous actions, and hosted
model providers are not included. OpenAI is not configured or required.

## Start without AI

Use Node.js 22.13 or later and the repository's existing local launcher, or run
the following commands from the repository root:

```sh
npm ci
npm run device
```

Open `http://127.0.0.1:3477/brain`. Keep the local-owner runtime on loopback: it is
for one trusted operator on the device, not an internet-facing multi-user server.
Capture a short note, reload the page, and search for a distinctive word in it.
Your library lives in the local SQLite/D1 state, not only in browser storage.

For an existing installation, stop FREE CRM and make an encrypted backup of
`.wrangler/state` before an upgrade. The device command applies local migrations;
it does not deploy cloud infrastructure.

## Add optional local AI

1. Install Ollama using its [official installation guide](https://docs.ollama.com/quickstart).
2. Disable Ollama's cloud features with `OLLAMA_NO_CLOUD=1` in the environment of
   the **Ollama server**, then restart it. See the
   [official platform-specific environment instructions](https://docs.ollama.com/faq#how-do-i-configure-ollama-server).
   Setting this only on the FREE CRM process does not configure an already-running
   Ollama service.
3. Review the model licenses and resource requirements, then deliberately download
   the two models below. FREE CRM does not install Ollama or pull models for you.
4. Start FREE CRM, open `/brain`, and enable local AI in the workspace controls.
   Source capture remains available with this control off.
5. Index a saved source, then ask a question that its text can answer. Open the
   returned citations and compare the answer with the actual passage.

```sh
ollama pull gemma3:1b
ollama pull embeddinggemma
ollama list
```

The chat default is [`gemma3:1b`](https://ollama.com/library/gemma3:1b); the
embedding default is [`embeddinggemma`](https://ollama.com/library/embeddinggemma).
Use a current Ollama release; the EmbeddingGemma model page requires version
0.11.10 or later. These model weights have their own terms, separate from FREE
CRM's MIT license. Model downloads require internet access and disk space;
inference uses your hardware and electricity. RAM, disk needs, answer quality,
and response times depend on the model and hardware. Free software is not a
promise of free cloud hosting or unlimited compute.

Ollama normally listens on `127.0.0.1:11434`. Leave it private. FREE CRM calls it
from its server, not directly from the browser. Do not add a public tunnel, open
the model port to the internet, or loosen browser-origin restrictions to make
this setup work. [Ollama network and cloud controls](https://docs.ollama.com/faq)
describe the underlying server behavior.

## Configuration and runtime boundary

| Server setting | Default | Purpose |
| --- | --- | --- |
| `FREE_CRM_OLLAMA_URL` | `http://127.0.0.1:11434` | Private model server; the Docker companion uses `http://ollama:11434`. |
| `FREE_CRM_OLLAMA_CHAT_MODEL` | `gemma3:1b` | Installed local chat model. |
| `FREE_CRM_OLLAMA_EMBED_MODEL` | `embeddinggemma` | Installed embedding model. |

These are non-secret server configuration values, not browser API keys. Model
choices are read-only in the workspace UI. Arbitrary remote endpoints are not
accepted. A Vercel or Cloudflare deployment can use the authenticated library,
but this release does not run local-model requests from those cloud runtimes.
`127.0.0.1` on a cloud server is not your laptop.

The device runtime runs through Wrangler. For a custom local configuration,
provide Wrangler bindings explicitly, not just shell environment variables:

```sh
npm run build
npm run db:local:migrate
npx wrangler dev -c dist/server/wrangler.json --ip 127.0.0.1 --port 3477 --persist-to .wrangler/state --var FREE_CRM_LOCAL_MODE:true --var FREE_CRM_OLLAMA_URL:http://127.0.0.1:11434 --var FREE_CRM_OLLAMA_CHAT_MODEL:gemma3:1b --var FREE_CRM_OLLAMA_EMBED_MODEL:embeddinggemma
```

Changing or updating the embedding model requires indexing sources again, even
when its Ollama tag stays the same. Indexes are compared against the installed
model's content digest automatically: old-weight vectors are ignored rather
than mixed with new ones. Source edits
invalidate their old embeddings; manually re-index the edited source before
expecting semantic results from the new text. Keyword search remains useful
while a model is unavailable. A keyword-only result is not an AI answer.

## Docker companion

The optional override keeps the existing `free-crm-data` volume and binds the CRM
UI to host loopback. Ollama has a separate persistent model volume and **no
published host port**. Only the app container uses its private service address.

Run from the repository root:

```sh
docker compose -f compose.yaml -f compose.brain.yaml up -d --build
docker compose -f compose.yaml -f compose.brain.yaml exec ollama ollama pull gemma3:1b
docker compose -f compose.yaml -f compose.brain.yaml exec ollama ollama pull embeddinggemma
docker compose -f compose.yaml -f compose.brain.yaml exec ollama ollama list
```

Then open `http://127.0.0.1:3477/brain` and enable local AI. The companion starts
CPU-only for portability; GPU acceleration needs host-specific configuration.
Consult the [official Ollama Docker guide](https://docs.ollama.com/docker) before
making those changes. The image and model pulls download third-party software;
review and pin versions/digests for a managed installation.

Stop the services without deleting their volumes:

```sh
docker compose -f compose.yaml -f compose.brain.yaml down
```

Do not add `--volumes` unless you deliberately intend to permanently remove the
stored CRM database/files and model downloads. Before an upgrade, stop the
services, snapshot `free-crm-data` to encrypted storage, and test restoring a
copy on a separate installation. The project-prefixed Docker volume name may
differ from this Compose volume key.

## Trust, deletion, and recovery

- Local AI is opt-in per workspace. The emergency stop prevents new model work
  and discards in-flight results when the server observes the changed setting;
  it cannot guarantee the model process itself stops computing immediately.
  Use it before investigating unexpected behavior. This release has no tool
  execution, message sending, browser automation, or CRM-changing model action.
- The server sends the question and selected source context to your configured
  local model. Retrieved material is untrusted input, not an instruction to run
  commands. Treat model output as a suggestion, even when it has citations.
- Authentication and workspace scoping still apply. Running on a device is not
  encryption at rest: protect the OS account, disk, browser profile, and backups.
- Deleting a source is permanent and also removes conversations citing that
  source or using it as retrieved context, not merely their visible citation
  badge. This includes sources the model read but did not select as citations.
  The server records all supplied source IDs independently of the model's output.
  Export anything you need before confirming deletion. This is not a trash/recycle-bin flow.
- Saving a source revision also removes conversations citing it or using it
  as retrieved context so old quoted material is not retained as current evidence. Review the confirmation and
  export any conversation you need before saving the edit.
- JSON and Markdown exports are portable inspection copies, not a full-system
  restore. Embeddings are derived data and are regenerated, not exported. This
  release does not provide a JSON restore/import workflow.
- Conversation JSON exports include source-dependency IDs separately from visible
  citations, so the context used for an answer is inspectable without exporting
  model vectors. These IDs are set by the server, never by the model.
- Back up the actual database and file storage together. Native recovery uses a
  stopped `.wrangler/state` copy; Docker uses a stopped volume snapshot. Cloud
  installations need D1 recovery/export and a separate private R2 or configured
  object-store backup. See [cloud deployment and recovery](CLOUD_DEPLOYMENT.md).
- Exports, downloads, local conversation history, and backups may all include
  personal information. No automatic deletion of your external backup copies is
  implied by deleting a source in the app.

## Acceptance checklist on your device

Use synthetic notes, not customer data, for this first run.

- [ ] With Ollama stopped and local AI off, capture a note and import a small
  `.txt` or `.md` file. Reload, edit, and find them by keyword.
- [ ] Connect two sources and a CRM record. Inspect the explicit graph links and
  their source details; no inferred relationship should be presented as fact.
- [ ] Enable local AI with installed models. Index a source and run a semantic
  query. Ask a supported question and inspect its source citations.
- [ ] Ask a question absent from the library. Do not accept invented evidence;
  check the answer's limitations and source list.
- [ ] Reload and reopen the saved conversation. Review the edit confirmation,
  change a source, and confirm citing conversations are removed and its semantic
  index needs refreshing.
- [ ] Stop local AI and confirm that model work is refused while note capture,
  keyword retrieval, and exports still work.
- [ ] Export JSON and Markdown; inspect them locally, never in a public paste
  service. Confirm they contain the material you intended to preserve.
- [ ] Delete a disposable source and confirm the disclosed conversation cleanup.
  Restart the app and confirm the source remains deleted.
- [ ] Restore a stopped-state backup to a separate test instance before relying
  on your backup procedure.

## Troubleshooting

**Library opens but the model is unavailable:** verify Ollama is running, inspect
`ollama list`, and check that both configured model names are installed. Enable
local AI in this workspace. On Docker, run `ollama list` inside the `ollama`
service, not the host's separate installation.

**Model requests fail in cloud:** this is an intentional runtime boundary. Use
the local/device or Docker setup for this release's model features. Do not
disable authentication or point a public browser at an exposed model port.

**No semantic matches after an edit:** index the source again. After changing
embedding models or updating weights behind the same Ollama tag, rebuild the
relevant indexes with the new model. Try a
distinctive word to verify keyword retrieval independently.

**Slow or failed generation:** check free disk/RAM, Ollama status and logs, and
the installed model. CPU-only inference can be slow. Avoid concurrent long
requests; do not assume a larger model fits your device.

**An answer is wrong:** open its citations, correct the source if needed, and
ask a narrower question. Citations identify context, not a guarantee that every
generated claim is supported. Do not let an answer authorize an external action.

## Next contributions, not current promises

Useful follow-on work includes a reviewed import/restore format, permissioned
connectors and background ingestion, richer document extraction, model-quality
evaluations, scalable retrieval indexes, and accessible mobile capture. Each
needs its own security controls and acceptance tests. Keep these capabilities in
the shared platform, preserve data portability, and prefer a working vertical
slice over a disconnected demo.
