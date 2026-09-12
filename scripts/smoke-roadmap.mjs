import assert from 'node:assert/strict';

// This suite creates fictional records and policy history. Never point it at an
// owner's local workspace: require an explicit disposable-state acknowledgement.
assert.equal(process.env.FREE_CRM_ROADMAP_QA, 'synthetic-disposable', 'Set FREE_CRM_ROADMAP_QA=synthetic-disposable only for an isolated test Worker.');
const base = new URL(process.env.FREE_CRM_BASE_URL || '');
assert.ok(base.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(base.hostname) && base.port && !base.username && !base.password && base.pathname === '/' && !base.search && !base.hash, 'Use a credential-free literal-loopback origin with an explicit port.');
async function request(path, body, expected = 200, key = crypto.randomUUID()) {
  const response = await fetch(new URL(path, base), body === undefined ? { cache: 'no-store' } : {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body),
  });
  assert.equal(response.status, expected, `${path}: expected ${expected}, received ${response.status}`);
  return response;
}
async function json(path, body, expected = 200, key) { return (await request(path, body, expected, key)).json(); }
const command = (type, payload) => json('/api/v1/commands', { type, payload });
const agent = (operation, payload, expected = 200) => json('/api/v1/agents/actions', { operation, idempotencyKey: crypto.randomUUID(), ...payload }, expected);
const policyRoute = '/api/v1/agents/policies';

const glossary = await request('/glossary');
assert.match(await glossary.text(), /Good relationships/);
for (const name of ['contacts', 'companies', 'leads']) {
  const file = `freecrm-${name}-template.csv`;
  const response = await request(`/templates/import/${file}`);
  assert.match(response.headers.get('content-type'), /text\/csv; charset=utf-8/i);
  assert.equal(response.headers.get('content-disposition'), `attachment; filename="${file}"`);
  const csv = await response.text();
  assert.equal(csv.split('\r\n')[0], 'name,firstName,lastName,email,phone,companyName,status,source,tags');
  assert.ok(csv.endsWith('\r\n'));
}
await request('/templates/import/not-a-template.csv', undefined, 404);

const before = (await json('/api/v1/bootstrap')).data;
assert.equal(before.runtime.mode, 'device', 'Only isolated device-mode test Workers are supported.');
assert.equal(before.workspace.role, 'owner');
await command('workspace.update', { profile: 'business' });
await command('capability.update', { key: 'advancedPolicies', enabled: true });
const contact = (await command('record.create', { objectType: 'contact', name: 'Fictional roadmap contact', email: 'roadmap@example.test', status: 'active' })).result.record;
const created = (await agent('agent.create', { name: 'Fictional roadmap policy agent', autonomy: 'policy-autonomous', monthlyBudgetCents: 100 }, 201)).data;
const { agentId, toolId } = created;
await agent('agent.safety', { agentId, status: 'active' });
const initial = (await json(`${policyRoute}?agentId=${agentId}`)).data;
assert.equal(initial.active, null);
const policy = { ...initial.draft, recordScope: { objectTypes: ['contact'], recordIds: [contact.id], maxRecords: 1 }, requireApproval: true };
const proposal = { toolId, requestedScope: 'records:read', estimatedCostCents: 0, destructive: false };
const stateBefore = (await json('/api/v1/agents/actions')).data;
const dry = (await json(policyRoute, { operation: 'dry-run', agentId, policy, proposal })).data;
assert.equal(dry.dryRun, true);
assert.equal(dry.writes, false);
assert.equal(dry.externalExecution, false);
assert.equal(dry.decision.decision, 'require-approval');
assert.deepEqual((await json('/api/v1/agents/actions')).data, stateBefore, 'Dry-run must not create runs, approvals, receipts, or change agent state.');
assert.equal((await json(`${policyRoute}?agentId=${agentId}`)).data.active, null);

const save = { operation: 'save', agentId, policy, expectedVersion: 0 };
const key = crypto.randomUUID();
assert.equal((await json(policyRoute, save, 200, key)).data.active.version, 1);
assert.equal((await json(policyRoute, save, 200, key)).data.replayed, true);
await json(policyRoute, { ...save, policy: { ...policy, stopped: true } }, 409, key);
const approved = (await agent('action.propose', { agentId, ...proposal, summary: 'Read one fictional contact under the authored policy' }, 201)).data;
assert.equal(approved.status, 'awaiting_approval');
await agent('approval.decide', { approvalId: approved.approvalId, decision: 'approved' });
const execution = (await agent('run.execute', { runId: approved.runId })).data;
assert.equal(execution.status, 'succeeded');
assert.equal(execution.output.policyVersion, 1);
assert.deepEqual(execution.output.recordCounts, { contact: 1 });
assert.equal(execution.output.readLimit, 1);

const stale = (await agent('action.propose', { agentId, ...proposal, summary: 'Fictional proposal invalidated by policy activation' }, 201)).data;
await json(policyRoute, { operation: 'save', agentId, policy: { ...policy, stopped: true }, expectedVersion: 1 });
const cancelled = (await json('/api/v1/agents/actions')).data;
assert.equal(cancelled.runs.find((run) => run.id === stale.runId).status, 'cancelled');
assert.equal(cancelled.approvals.find((approval) => approval.id === stale.approvalId).status, 'cancelled');
await agent('run.execute', { runId: stale.runId }, 409);
await command('capability.update', { key: 'advancedPolicies', enabled: false });
await json(`${policyRoute}?agentId=${agentId}`, undefined, 403);
const denied = (await agent('action.propose', { agentId, ...proposal, summary: 'Saved stop survives disabled authoring' }, 201)).data;
assert.equal(denied.decision.decision, 'deny');
assert.equal(denied.decision.matchedRule, 'policy.stop');
await command('capability.update', { key: 'advancedPolicies', enabled: true });
await agent('agent.safety', { agentId, status: 'paused' });

const query = new URLSearchParams({ from: new Date(Date.now() - 3_600_000).toISOString(), to: new Date(Date.now() + 60_000).toISOString(), family: 'agent', record: agentId });
const audit = (await json(`/api/v1/audit?${query}`)).data;
assert.ok(audit.events.some((event) => event.action === 'agent.policy.activated'));
assert.ok(audit.events.every((event) => event.entityId === agentId && event.family === 'agent'));
assert.ok(audit.events.every((event) => !('metadata' in event) && !('metadataJson' in event)));
query.set('format', 'csv');
const csv = await request(`/api/v1/audit?${query}`);
assert.equal(csv.headers.get('cache-control'), 'no-store');
assert.equal(csv.headers.get('x-free-crm-audit-scope'), 'current-page; not-complete-history');
assert.match(await csv.text(), /^event_id,created_at_utc,actor_id,action,action_family,outcome,entity_type,entity_id,request_id\r\n/);
await request('/api/v1/audit?outcome=made-up', undefined, 400);
console.log('Roadmap smoke passed: glossary and three downloadable CSVs; no-write policy preview; versioned save/replay/conflict; approved record-scoped execution; stale proposal cancellation; enforcement with authoring disabled; bounded private-field-free audit and page CSV. Fictional QA records and immutable history remain only in the disposable test state.');
