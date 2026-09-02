# Agent safety evaluations

FREE CRM has a required deterministic evaluation suite for the platform-level
agent contract. It exercises the real agent service and every forward D1/SQLite
migration against synthetic `example.test` identities. It does not call a model,
provider, remote tool, or customer workspace.

## Run the release gate

```bash
npm run agent:safety
```

The command exits non-zero if an invariant fails, a required scenario is missing,
a scenario identifier is duplicated, or the runner cannot produce valid results.
`npm run check` includes this gate.

For a JSON-only CI artifact, suppress npm's command banner and redirect stdout:

```bash
npm --silent run agent:safety > agent-safety-results.json
```

The stable report envelope contains `schemaVersion`, `suite`, `evaluationKind`,
`required`, `externalExecution`, `success`, a count summary, contract errors, and
one result for every scenario. Durations, generated IDs, timestamps, and fixture
paths are intentionally omitted from successful output.

The scenario registry is
[`fixtures/agent-safety-scenarios.json`](../fixtures/agent-safety-scenarios.json).
The required controls cover human approval, budget exhaustion, execution replay,
proposal idempotency, emergency stop, grant expiration, tool denial, and the
non-external fixture boundary.

## Deterministic platform checks versus model quality

The required suite answers whether FREE CRM enforces authorization and safety
invariants. Its inputs and expected outcomes are fixed, and all tool execution is
the local simulator. These checks must remain independent of network access,
provider credentials, model sampling, and natural-language scoring.

Optional model-quality evaluations answer different questions, such as whether a
model selected a useful tool or produced a good draft. Keep those in a separate
optional suite and result artifact. They must identify the provider/model and
evaluation rubric, use contributor-supplied credentials, avoid customer data, and
must never replace or weaken a required platform invariant. External execution
remains disabled in both the checked-in fixtures and required release gate.

## Add a tool-specific scenario

1. Add one entry with a durable `SAF-<CONTROL>-NNN` identifier to
   `fixtures/agent-safety-scenarios.json`. State one observable invariant; do not
   describe an implementation detail.
2. Add exactly one test whose title starts with that identifier in
   `tests/agent-safety-evaluation.test.ts`.
3. Use only generated synthetic identities and an in-memory database. Create the
   tool with `transport='local-simulator'` and `external=0`. Never add a provider
   credential, production payload, network request, or customer-derived fixture.
4. Exercise the public agent-plane boundary and assert both the allowed/denied
   result and its durable effect. For race-sensitive controls, also assert the
   database trigger that protects the final write.
5. Run `npm run agent:safety`, `npm run test:coverage`, and `npm run test:db`.
   Inspect the JSON report and confirm a missing manifest entry or failing test
   causes a non-zero exit.

Tool grants may set nullable `agent_tool_grants.expires_at`. `NULL` preserves the
existing non-expiring behavior. A parseable timestamp at or before the current
time fails both proposal and execution checks, and database triggers prevent a
stale or bypassed grant from creating a run or execution receipt.
