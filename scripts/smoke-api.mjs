import assert from 'node:assert/strict';

const base = (process.env.FREE_CRM_BASE_URL || 'http://localhost:3481').replace(/\/$/, '');
const identity = {
  'oai-authenticated-user-id': 'free-crm-release-smoke',
  'oai-authenticated-user-email': 'release-smoke@free-crm.local',
  'oai-authenticated-user-full-name': encodeURIComponent('Release smoke'),
  'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8',
};
const otherIdentity = {
  'oai-authenticated-user-id': 'free-crm-isolation-smoke',
  'oai-authenticated-user-email': 'isolation-smoke@free-crm.local',
};

async function request(path, init = {}, expected = 200) {
  const expectedStatuses = Array.isArray(expected) ? expected : [expected];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...identity, ...(init.headers || {}) },
    });
    const responseBody = await response.arrayBuffer();
    const responseText = new TextDecoder().decode(responseBody);
    if (response.status === 503 && responseText.includes('worker restarted mid-request') && attempt < 2) continue;
    assert.ok(expectedStatuses.includes(response.status), `${init.method || 'GET'} ${path} expected ${expectedStatuses.join(' or ')}, received ${response.status}: ${responseText}`);
    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }
  throw new Error(`${init.method || 'GET'} ${path} exhausted local worker restart retries.`);
}

async function json(path, init = {}, expected = 200) {
  return request(path, init, expected).then((response) => response.json());
}

function command(type, payload, key, expected = 200, headers = identity) {
  return json('/api/v1/commands', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json', 'idempotency-key': key },
    body: JSON.stringify({ type, payload }),
  }, expected);
}

function postJson(path, body, expected = 200, headers = {}) {
  return json(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }, expected);
}

function connector(operation, payload = {}, expected = 200, idempotencyKey = crypto.randomUUID()) {
  return postJson('/api/v1/connectors', { operation, ...payload }, expected, { 'idempotency-key': idempotencyKey });
}

function agent(operation, payload = {}, expected = 200) {
  return postJson('/api/v1/agents/actions', { operation, ...payload }, expected, { 'idempotency-key': crypto.randomUUID() });
}

function csvImport(body, expected = 200, idempotencyKey) {
  return postJson('/api/v1/imports/csv', body, expected, idempotencyKey ? { 'idempotency-key': idempotencyKey } : {});
}

const root = await request('/');
assert.match(root.headers.get('content-type') || '', /text\/html/);
assert.equal(root.headers.get('x-frame-options'), 'DENY');
assert.equal(root.headers.get('x-content-type-options'), 'nosniff');
assert.equal(root.headers.get('cross-origin-opener-policy'), 'same-origin');
const contentSecurityPolicy = root.headers.get('content-security-policy') || '';
assert.match(contentSecurityPolicy, /default-src 'self'/);
assert.match(contentSecurityPolicy, /frame-ancestors 'none'/);
assert.match(contentSecurityPolicy, /object-src 'none'/);
assert.doesNotMatch(contentSecurityPolicy, /'unsafe-eval'/);
const rootHtml = await root.text();
assert.match(rootHtml, /aria-label="Celebrate Love of FREE CRM"/);
assert.doesNotMatch(rootHtml, /Opening FREE CRM/);
const workspaceShell = await request('/workspace');
assert.match(workspaceShell.headers.get('content-type') || '', /text\/html/);
const workspaceHtml = await workspaceShell.text();
assert.match(workspaceHtml, /Opening FREE CRM/);
assert.doesNotMatch(workspaceHtml, /aria-label="Celebrate Love of FREE CRM"/);
const deployCenter = await request('/deploy');
assert.match(deployCenter.headers.get('content-type') || '', /text\/html/);
const deployHtml = await deployCenter.text();
assert.match(deployHtml, /Deploy your own/);
assert.match(deployHtml, /FREE CRM never receives your provider credentials/);
assert.match(deployHtml, /vercel\.com\/new\/clone\?repository-url=/);
assert.match(deployHtml, /GitHub main/);
assert.doesNotMatch(deployHtml, /chatgpt\.site|auth\.openai\.com/i);

const health = await json('/api/v1/health');
assert.equal(health.status, 'ready');
assert.equal(health.database, 'connected');
assert.equal(health.objectStorage, 'connected');

const bootstrap = await json('/api/v1/bootstrap');
assert.equal(bootstrap.data.modules.length, 12);
assert.equal(bootstrap.data.workspace.role, 'owner');
assert.ok(bootstrap.data.integrations.every((item) => item.provider === 'csv' || item.status !== 'connected'), 'External providers must not be presented as connected');
const workspaceId = bootstrap.data.workspace.id;

for (let denialAttempt = 0; denialAttempt < 4; denialAttempt += 1) {
  await json('/api/v1/commands', { method: 'POST', headers: { origin: 'https://attacker.example.test', 'content-type': 'application/json', 'idempotency-key': `cross-origin-command-${denialAttempt}` }, body: JSON.stringify({ type: 'record.create', payload: { objectType: 'contact', name: 'Blocked' } }) }, 403);
  await json('/api/v1/connectors', { method: 'POST', headers: { origin: 'https://attacker.example.test', 'content-type': 'application/json' }, body: JSON.stringify({ operation: 'connect', connectorKey: 'csv' }) }, 403);
  await json('/api/v1/agents/actions', { method: 'POST', headers: { origin: 'https://attacker.example.test', 'content-type': 'application/json' }, body: JSON.stringify({ operation: 'agent.create', name: 'Blocked' }) }, 403);
  const blockedForm = new FormData();
  blockedForm.append('file', new Blob(['blocked'], { type: 'text/plain' }), 'blocked.txt');
  await json('/api/v1/files', { method: 'POST', headers: { origin: 'https://attacker.example.test' }, body: blockedForm }, 403);
}
await json('/api/v1/connectors', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ operation: 'connect', connectorKey: 'csv', padding: 'x'.repeat(65_000) }),
}, 413);
await json(`/api/v1/webhooks/${workspaceId}`, {
  method: 'POST',
  headers: { 'content-type': 'text/plain', 'x-free-crm-webhook-key': 'x'.repeat(32) },
  body: '{}',
}, 415);
const postDenialHealth = await json('/api/v1/health');
assert.equal(postDenialHealth.status, 'ready', 'Rejected request bodies must not destabilize the worker');

await command('demo.reset', { confirm: 'RESET', mode: 'clean', operationId: crypto.randomUUID() }, `smoke-reset-start-${Date.now()}`);
await command('workspace.update', { currency: 'EUR' }, `smoke-currency-eur-${Date.now()}`);
await command('demo.reset', { confirm: 'RESET', mode: 'demo', operationId: crypto.randomUUID() }, `smoke-reset-demo-eur-${Date.now()}`);
const euroDemo = await json('/api/v1/bootstrap');
assert.ok(euroDemo.data.records.length > 0);
assert.ok(euroDemo.data.records.every((record) => record.currency === 'EUR'), 'Demo seed must use the workspace reporting currency');
const euroInvoices = euroDemo.data.records.filter((record) => record.objectType === 'invoice' && Number(record.fields.paidCents || 0) > 0);
assert.ok(euroInvoices.every((invoice) => euroDemo.data.invoicePayments.some((payment) => payment.invoiceId === invoice.id)), 'Seeded paid balances require immutable payment receipts');
await command('demo.reset', { confirm: 'RESET', mode: 'clean', operationId: crypto.randomUUID() }, `smoke-reset-after-eur-${Date.now()}`);
await command('workspace.update', { currency: 'USD' }, `smoke-currency-usd-${Date.now()}`);
const csvBody = { objectType: 'contact', csv: 'Full Name,Email,Company\r\nCSV Smoke Contact,csv-smoke@example.test,FREE CRM', mapping: { name: 'Full Name', email: 'Email', companyName: 'Company' } };
const csvPreview = await csvImport({ mode: 'preview', ...csvBody });
assert.equal(csvPreview.data.mode, 'preview');
assert.equal(csvPreview.data.objectType, 'contact');
assert.deepEqual(csvPreview.data.columns, ['Full Name', 'Email', 'Company']);
assert.deepEqual(csvPreview.data.mapping, csvBody.mapping);
assert.deepEqual([csvPreview.data.totalRows, csvPreview.data.validRows, csvPreview.data.invalidRows], [1, 1, 0]);
assert.deepEqual(csvPreview.data.preview, [{ row: 2, name: 'CSV Smoke Contact', email: 'csv-smoke@example.test', phone: null, companyName: 'FREE CRM', status: null }]);
assert.deepEqual(csvPreview.data.errors, []);
assert.ok(csvPreview.data.limits.maxRows >= 1 && csvPreview.data.limits.maxBytes >= Buffer.byteLength(csvBody.csv));
await csvImport({ mode: 'commit', objectType: 'contact', csv: 'name,email\nInvalid CSV,bad-email' }, 422, `smoke-csv-invalid-${Date.now()}`);
const csvCommitKey = `smoke-csv-commit-${Date.now()}`;
const csvCommit = await csvImport({ mode: 'commit', ...csvBody }, 201, csvCommitKey);
assert.equal(csvCommit.data.imported, 1);
assert.equal(csvCommit.data.recordIds.length, 1);
const csvReplay = await csvImport({ mode: 'commit', ...csvBody }, 200, csvCommitKey);
assert.equal(csvReplay.replayed, true);
assert.deepEqual(csvReplay.data.recordIds, csvCommit.data.recordIds);
await csvImport({ mode: 'commit', ...csvBody, csv: `${csvBody.csv}\r\nConflicting Row,conflict@example.test,FREE CRM` }, 409, csvCommitKey);
const afterCsv = await json('/api/v1/bootstrap');
assert.ok(afterCsv.data.records.some((record) => record.id === csvCommit.data.recordIds[0] && record.name === 'CSV Smoke Contact'), 'Committed CSV records must appear in the live workspace snapshot');
await command('legacy.import', { records: [{ objectType: 'invoice', name: 'Forged paid import', status: 'paid', amountCents: 100, fields: { paidCents: 100 } }] }, `smoke-import-managed-${Date.now()}`, 409);
await command('legacy.import', { records: [{ objectType: 'document', name: 'Forged object', status: 'active', fields: { objectKey: 'another/workspace/file' } }] }, `smoke-import-object-${Date.now()}`, 400);
await command('legacy.import', { records: [{ objectType: 'opportunity', name: 'Wrong-currency import', status: 'exploring', amountCents: 100, currency: 'EUR' }] }, `smoke-import-currency-${Date.now()}`, 400);
const createBody = { objectType: 'contact', name: 'Smoke Contact', status: 'active', lifecycle: 'prospect', email: 'smoke@example.test', companyName: 'Smoke Company', source: 'Release suite', tags: ['Smoke'] };
await command('record.create', { ...createBody, name: 'Wrong Currency', currency: 'EUR' }, `smoke-currency-${Date.now()}`, 400);
const idempotencyKey = `smoke-create-${Date.now()}`;
const [firstCreate, concurrentReplay] = await Promise.all([
  command('record.create', createBody, idempotencyKey),
  command('record.create', createBody, idempotencyKey),
]);
const contact = firstCreate.result.record || concurrentReplay.result.record;
assert.ok(contact.id);
assert.ok(firstCreate.replayed || concurrentReplay.replayed, 'A concurrent duplicate should replay the committed mutation');

const replay = await command('record.create', createBody, idempotencyKey);
assert.equal(replay.replayed, true);
await command('record.create', { ...createBody, name: 'Conflicting payload' }, idempotencyKey, 409);

const updated = await command('record.update', { id: contact.id, version: contact.version, status: 'customer', tags: ['Smoke', 'Verified'] }, `smoke-update-${Date.now()}`);
assert.equal(updated.result.record.status, 'customer');
const concurrentVersion = updated.result.record.version;
const concurrentMutation = (name, key) => request('/api/v1/commands', {
  method: 'POST',
  headers: { ...identity, 'content-type': 'application/json', 'idempotency-key': key },
  body: JSON.stringify({ type: 'record.update', payload: { id: contact.id, version: concurrentVersion, name } }),
}, [200, 409]);
const concurrentUpdates = await Promise.all([
  concurrentMutation('Smoke Contact A', `smoke-concurrent-a-${Date.now()}`),
  concurrentMutation('Smoke Contact B', `smoke-concurrent-b-${Date.now()}`),
]);
assert.deepEqual(concurrentUpdates.map((response) => response.status).sort(), [200, 409], 'Exactly one writer may claim a record version');
await command('record.update', { id: contact.id, version: contact.version, status: 'nurture' }, `smoke-stale-${Date.now()}`, 409);
await command('note.create', { recordId: contact.id, kind: 'test', body: 'Release suite timeline note.' }, `smoke-note-${Date.now()}`);
const recordBeforeArchive = (await json('/api/v1/bootstrap')).data.records.find((record) => record.id === contact.id);
const archived = await command('record.archive', { id: contact.id, version: recordBeforeArchive.version }, `smoke-archive-${Date.now()}`);
assert.ok(archived.result.archivedAt);
const restored = await command('record.restore', { id: contact.id, version: archived.result.version }, `smoke-restore-${Date.now()}`);
assert.equal(restored.result.archivedAt, null);

await command('record.create', { objectType: 'invoice', name: 'Invalid issued invoice', status: 'sent', amountCents: 10_000 }, `smoke-invalid-invoice-${Date.now()}`, 409);
const invoiceCreate = await command('record.create', { objectType: 'invoice', name: 'Release invoice', status: 'draft', amountCents: 10_000 }, `smoke-invoice-${Date.now()}`);
const invoice = invoiceCreate.result.record;
const issued = await command('invoice.issue', { id: invoice.id, version: invoice.version, dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString() }, `smoke-issue-${Date.now()}`);
assert.equal(issued.result.status, 'sent');
assert.match(issued.result.invoiceNumber, /^INV-/);
const payment = await command('invoice.record_payment', { id: invoice.id, version: issued.result.version, paymentCents: 4_000 }, `smoke-payment-${Date.now()}`);
assert.equal(payment.result.paymentCents, 4_000);
await command('invoice.record_payment', { id: invoice.id, version: payment.result.version, paymentCents: 7_000 }, `smoke-overpayment-${Date.now()}`, 400);
await command('invoice.record_payment', { id: invoice.id, version: issued.result.version, paymentCents: 1_000 }, `smoke-stale-payment-${Date.now()}`, 409);

const otherBootstrap = await json('/api/v1/bootstrap', { headers: otherIdentity });
if (otherBootstrap.data.workspace.id !== workspaceId) {
  assert.ok(!otherBootstrap.data.records.some((record) => record.id === contact.id));
  await command('record.update', { id: contact.id, version: 2, status: 'nurture' }, `smoke-idor-${Date.now()}`, 404, otherIdentity);
} else {
  assert.equal(otherBootstrap.data.workspace.ownerEmail, 'owner@free-crm.local', 'The local identity boundary should ignore spoofed identity headers');
}

const csvConnected = await connector('connect', { connectorKey: 'csv' });
const csvConnectionId = csvConnected.data.id;
const syncKey = `smoke-sync-${Date.now()}`;
const csvSync = await connector('sync', { connectionId: csvConnectionId }, 200, syncKey);
assert.equal(csvSync.data.replayed, false);
assert.equal((await connector('sync', { connectionId: csvConnectionId }, 200, syncKey)).data.replayed, true);
await connector('disconnect', { connectionId: csvConnectionId });
const csvReconnected = await connector('connect', { connectorKey: 'csv' });
assert.equal(csvReconnected.data.id, csvConnectionId, 'Reconnect must retain connector identity and its monotonic cursor');
const csvResync = await connector('sync', { connectionId: csvConnectionId }, 200, `smoke-resync-${Date.now()}`);
assert.ok(Number(csvResync.data.cursor) > Number(csvSync.data.cursor));

const webhookKey = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
const webhookConnection = await connector('connect', { connectorKey: 'webhook-simulator', webhookKey });
const webhookEventId = `smoke-webhook-${Date.now()}`;
const webhookBody = { eventId: webhookEventId, name: 'Release webhook activity', provider: 'release-smoke', status: 'completed' };
const webhookHeaders = { 'content-type': 'application/json', 'x-free-crm-webhook-key': webhookKey };
const webhookFirst = await json(`/api/v1/webhooks/${workspaceId}`, { method: 'POST', headers: webhookHeaders, body: JSON.stringify(webhookBody) }, 202);
assert.equal(webhookFirst.duplicate, false);
assert.equal((await json(`/api/v1/webhooks/${workspaceId}`, { method: 'POST', headers: webhookHeaders, body: JSON.stringify(webhookBody) })).duplicate, true);
await json(`/api/v1/webhooks/${workspaceId}`, { method: 'POST', headers: webhookHeaders, body: JSON.stringify({ ...webhookBody, name: 'Conflicting replay' }) }, 409);
const rotatedWebhookKey = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
await connector('connect', { connectorKey: 'webhook-simulator', webhookKey: rotatedWebhookKey });
await json(`/api/v1/webhooks/${workspaceId}`, { method: 'POST', headers: webhookHeaders, body: JSON.stringify({ ...webhookBody, eventId: `${webhookEventId}-old-key` }) }, 401);
const rotatedWebhookHeaders = { 'content-type': 'application/json', 'x-free-crm-webhook-key': rotatedWebhookKey };
await json(`/api/v1/webhooks/${workspaceId}`, { method: 'POST', headers: rotatedWebhookHeaders, body: JSON.stringify({ ...webhookBody, eventId: `${webhookEventId}-rotated` }) }, 202);
await connector('disconnect', { connectionId: webhookConnection.data.id });
await json(`/api/v1/webhooks/${workspaceId}`, { method: 'POST', headers: rotatedWebhookHeaders, body: JSON.stringify({ ...webhookBody, eventId: `${webhookEventId}-disconnected` }) }, 401);

const agentStateBefore = await json('/api/v1/agents/actions');
if (agentStateBefore.data.agents.length === 0) {
  const createdAgent = await agent('agent.create', { name: 'Release analyst', autonomy: 'policy-autonomous', monthlyBudgetCents: 100 }, 201);
  const { agentId, toolId } = createdAgent.data;
  await agent('agent.safety', { agentId, status: 'active' });
  const proposalKey = `smoke-agent-read-${Date.now()}`;
  const proposalBody = { agentId, toolId, summary: 'Count active CRM records', requestedScope: 'records:read', estimatedCostCents: 2, destructive: false, idempotencyKey: proposalKey };
  const proposal = await agent('action.propose', proposalBody, 201);
  assert.equal(proposal.data.status, 'authorized');
  assert.equal((await agent('action.propose', proposalBody, 201)).data.replayed, true);
  const execution = await agent('run.execute', { runId: proposal.data.runId });
  assert.equal(execution.data.status, 'succeeded');
  assert.equal((await agent('run.execute', { runId: proposal.data.runId })).data.replayed, true);

  const guarded = await agent('action.propose', { ...proposalBody, summary: 'Run a human-approved guarded read', destructive: true, estimatedCostCents: 3, idempotencyKey: `smoke-agent-approval-${Date.now()}` }, 201);
  assert.equal(guarded.data.status, 'awaiting_approval');
  const decideApproval = () => request('/api/v1/agents/actions', { method: 'POST', headers: { ...identity, 'content-type': 'application/json' }, body: JSON.stringify({ operation: 'approval.decide', approvalId: guarded.data.approvalId, decision: 'approved' }) });
  const decisions = await Promise.all([decideApproval(), decideApproval()]);
  const decisionBodies = await Promise.all(decisions.map((response) => response.json()));
  assert.deepEqual(decisionBodies.map((body) => Boolean(body.data.replayed)).sort(), [false, true], 'Exactly one approval decision may commit; its duplicate must replay');
  assert.equal((await agent('run.execute', { runId: guarded.data.runId })).data.status, 'succeeded');

  const cancellable = await agent('action.propose', { ...proposalBody, summary: 'Run cancelled by emergency stop', idempotencyKey: `smoke-agent-stop-${Date.now()}` }, 201);
  assert.equal(cancellable.data.status, 'authorized');
  const stopped = await agent('agent.safety', { agentId, emergencyStop: true });
  assert.ok(stopped.data.emergencyStoppedAt);
  await agent('run.execute', { runId: cancellable.data.runId }, 409);
  const cleared = await agent('agent.safety', { agentId, emergencyStop: false });
  assert.equal(cleared.data.status, 'paused');
} else {
  assert.ok(agentStateBefore.data.receipts.length > 0, 'A retained release-smoke agent must have immutable execution receipts');
}

const form = new FormData();
form.append('file', new Blob(['FREE CRM R2 smoke'], { type: 'text/plain' }), 'release-smoke.txt');
const uploaded = await json('/api/v1/files', { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: form }, 201);
const documentId = uploaded.result.id;
const downloaded = await request(`/api/v1/files?id=${encodeURIComponent(documentId)}`);
assert.equal(await downloaded.text(), 'FREE CRM R2 smoke');
await json(`/api/v1/files?id=${encodeURIComponent(documentId)}`, { method: 'DELETE', headers: { 'idempotency-key': crypto.randomUUID() } });
await request(`/api/v1/files?id=${encodeURIComponent(documentId)}`, {}, 404);

const snapshot = await request('/api/v1/export');
assert.match(snapshot.headers.get('content-disposition') || '', /free-crm-snapshot/);
assert.equal(snapshot.headers.get('x-free-crm-export-scope'), 'portable-crm-metadata; not-a-recovery-backup');
const snapshotText = await snapshot.text();
assert.ok(!snapshotText.includes(webhookKey), 'Portable snapshots must never include the workspace webhook key');
assert.ok(!snapshotText.includes('credential_ref'), 'Portable snapshots must not expose connector credential storage fields');
const portableSnapshot = JSON.parse(snapshotText);
assert.equal(portableSnapshot.scope.recoveryBackup, false);
assert.ok(portableSnapshot.invoicePayments.some((item) => item.id === payment.result.paymentId));
const csv = await request('/api/v1/export?format=csv');
assert.match(csv.headers.get('content-type') || '', /text\/csv/);
assert.match(await csv.text(), /^type,name,status/);
const calendar = await request('/api/v1/calendar');
assert.match(await calendar.text(), /BEGIN:VCALENDAR/);
await json(`/api/v1/webhooks/${workspaceId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId: 'unauthenticated-smoke' }) }, 401);

const resetReplayWebhookKey = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
await connector('connect', { connectorKey: 'webhook-simulator', webhookKey: resetReplayWebhookKey });
const resetReplayWebhookBody = { eventId: `smoke-reset-webhook-${Date.now()}`, name: 'Removed reset webhook activity', provider: 'release-smoke' };
const resetReplayWebhookHeaders = { 'content-type': 'application/json', 'x-free-crm-webhook-key': resetReplayWebhookKey };
await json(`/api/v1/webhooks/${workspaceId}`, { method: 'POST', headers: resetReplayWebhookHeaders, body: JSON.stringify(resetReplayWebhookBody) }, 202);
const resetReplayCommandBody = { objectType: 'contact', name: 'Removed reset command contact', email: 'reset-replay@example.test' };
const resetReplayCommandKey = `smoke-reset-command-${Date.now()}`;
await command('record.create', resetReplayCommandBody, resetReplayCommandKey);
const kernelActorBody = { operation: 'actor.create', kind: 'human', displayName: 'Disposable reset actor' };
const kernelActorKey = `smoke-kernel-actor-${Date.now()}`;
const kernelActor = await postJson('/api/v1/kernel', kernelActorBody, 201, { 'idempotency-key': kernelActorKey });
const kernelActorReplay = await postJson('/api/v1/kernel', kernelActorBody, 201, { 'idempotency-key': kernelActorKey });
assert.equal(kernelActorReplay.replayed, true, 'Kernel create retries must replay their durable receipt');
assert.equal(kernelActorReplay.data.id, kernelActor.data.id, 'Kernel create retries must not create duplicate actors');
await postJson('/api/v1/kernel', { ...kernelActorBody, displayName: 'Conflicting kernel actor' }, 409, { 'idempotency-key': kernelActorKey });
const finalResetOperationId = crypto.randomUUID();
await command('demo.reset', { confirm: 'RESET', mode: 'clean', operationId: finalResetOperationId }, `smoke-reset-end-${Date.now()}`);
const clean = await json(`/api/v1/bootstrap?resetOperationId=${encodeURIComponent(finalResetOperationId)}`);
assert.equal(clean.data.records.length, 0);
assert.equal(clean.data.demo, false);
assert.deepEqual(clean.data.resetReceipt, { operationId: finalResetOperationId, mode: 'clean', completedAt: clean.data.resetReceipt.completedAt }, 'Bootstrap must reconcile the exact durable reset receipt after a lost response');
assert.ok(!Number.isNaN(Date.parse(clean.data.resetReceipt.completedAt)), 'Reset receipt completion time must be valid');
const commandAfterReset = await command('record.create', resetReplayCommandBody, resetReplayCommandKey);
assert.equal(commandAfterReset.replayed, true, 'A pre-reset command retry must replay instead of recreating deleted data');
assert.deepEqual(commandAfterReset.result, { discardedByReset: true }, 'Reset must scrub deleted response data from retained command receipts');
await command('record.create', { ...resetReplayCommandBody, name: 'Conflicting post-reset retry' }, resetReplayCommandKey, 409);
const webhookAfterReset = await json(`/api/v1/webhooks/${workspaceId}`, { method: 'POST', headers: resetReplayWebhookHeaders, body: JSON.stringify(resetReplayWebhookBody) });
assert.equal(webhookAfterReset.duplicate, true, 'A delayed pre-reset webhook retry must remain deduplicated');
await json(`/api/v1/webhooks/${workspaceId}`, { method: 'POST', headers: resetReplayWebhookHeaders, body: JSON.stringify({ ...resetReplayWebhookBody, name: 'Conflicting post-reset retry' }) }, 409);
assert.equal((await json('/api/v1/bootstrap')).data.records.length, 0, 'Retry receipts must not recreate records after reset');
await json('/api/v1/bootstrap?resetOperationId=not-a-uuid', {}, 400);
const kernelAfterReset = await json('/api/v1/kernel');
assert.ok(!kernelAfterReset.data.actors.some((actor) => actor.id === kernelActor.data.id), 'Clean reset must remove non-control-plane human actors');
await postJson('/api/v1/kernel', kernelActorBody, 409, { 'idempotency-key': kernelActorKey });
assert.ok(!(await json('/api/v1/kernel')).data.actors.some((actor) => actor.id === kernelActor.data.id), 'A pre-reset kernel retry must not recreate discarded data');
const removedByNewerReset = await command('record.create', { objectType: 'contact', name: 'Removed by the newer reset' }, `smoke-between-resets-${Date.now()}`);
const newerResetOperationId = crypto.randomUUID();
await command('demo.reset', { confirm: 'RESET', mode: 'clean', operationId: newerResetOperationId }, `smoke-reset-newer-${Date.now()}`);
assert.ok(!(await json('/api/v1/bootstrap')).data.records.some((record) => record.id === removedByNewerReset.result.record.id), 'The newer reset must execute exactly once');
const survivorOne = await command('record.create', { objectType: 'contact', name: 'Must survive delayed old reset replay' }, `smoke-post-newer-a-${Date.now()}`);
const survivorTwo = await command('record.create', { objectType: 'company', name: 'Also survives delayed old reset replay' }, `smoke-post-newer-b-${Date.now()}`);
const resetReplay = await command('demo.reset', { confirm: 'RESET', mode: 'clean', operationId: finalResetOperationId }, `smoke-reset-replay-new-http-key-${Date.now()}`);
assert.equal(resetReplay.replayed, true, 'A completed reset operation must replay even with a new HTTP idempotency key');
const afterDelayedReplay = await json('/api/v1/bootstrap');
assert.ok(afterDelayedReplay.data.records.some((record) => record.id === survivorOne.result.record.id), 'Delayed reset response replay must not delete newer data');
assert.ok(afterDelayedReplay.data.records.some((record) => record.id === survivorTwo.result.record.id), 'Durable reset receipts must preserve all post-reset data');
await command('demo.reset', { confirm: 'RESET', mode: 'demo', operationId: finalResetOperationId }, `smoke-reset-mode-conflict-${Date.now()}`, 409);
await command('demo.reset', { confirm: 'RESET', mode: 'clean', operationId: crypto.randomUUID() }, `smoke-final-clean-${Date.now()}`);

console.log('FREE CRM smoke passed: public surfaces, security headers and live cross-origin rejection, D1 CRUD, CSV preview/atomic commit/replay/conflict recovery, archive/restore, currency-aware demo/payment ledger, concurrent mutation and idempotency fences, tenant isolation, connector reconnect/sync, webhook replay/key-rotation/disconnect protection, agent proposal/concurrent approval/execution/emergency stop, R2 lifecycle, portable exports, calendar, actor cleanup, reset replay tombstones, and idempotent reset recovery.');
