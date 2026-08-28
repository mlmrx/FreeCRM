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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...identity, ...(init.headers || {}) },
    });
    const responseText = await response.clone().text();
    if (response.status === 503 && responseText.includes('worker restarted mid-request') && attempt < 2) continue;
    assert.equal(response.status, expected, `${init.method || 'GET'} ${path} expected ${expected}, received ${response.status}: ${responseText}`);
    return response;
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

const root = await request('/');
assert.match(root.headers.get('content-type') || '', /text\/html/);
assert.equal(root.headers.get('x-frame-options'), 'DENY');
assert.equal(root.headers.get('x-content-type-options'), 'nosniff');
const rootHtml = await root.text();
assert.match(rootHtml, /aria-label="Celebrate Love of CRM"/);
assert.doesNotMatch(rootHtml, /Opening FREE CRM/);
const workspaceShell = await request('/workspace');
assert.match(workspaceShell.headers.get('content-type') || '', /text\/html/);
const workspaceHtml = await workspaceShell.text();
assert.match(workspaceHtml, /Opening FREE CRM/);
assert.doesNotMatch(workspaceHtml, /aria-label="Celebrate Love of CRM"/);

const health = await json('/api/v1/health');
assert.equal(health.status, 'ready');
assert.equal(health.database, 'connected');
assert.equal(health.objectStorage, 'connected');

const bootstrap = await json('/api/v1/bootstrap');
assert.equal(bootstrap.data.modules.length, 12);
assert.equal(bootstrap.data.workspace.role, 'owner');
assert.ok(bootstrap.data.integrations.every((item) => item.provider === 'csv' || item.status !== 'connected'), 'External providers must not be presented as connected');
const workspaceId = bootstrap.data.workspace.id;

await command('demo.reset', { confirm: 'RESET', mode: 'clean' }, `smoke-reset-start-${Date.now()}`);
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
await command('record.update', { id: contact.id, version: contact.version, status: 'nurture' }, `smoke-stale-${Date.now()}`, 409);
await command('note.create', { recordId: contact.id, kind: 'test', body: 'Release suite timeline note.' }, `smoke-note-${Date.now()}`);

const otherBootstrap = await json('/api/v1/bootstrap', { headers: otherIdentity });
if (otherBootstrap.data.workspace.id !== workspaceId) {
  assert.ok(!otherBootstrap.data.records.some((record) => record.id === contact.id));
  await command('record.update', { id: contact.id, version: 2, status: 'nurture' }, `smoke-idor-${Date.now()}`, 404, otherIdentity);
} else {
  assert.equal(otherBootstrap.data.workspace.ownerEmail, 'owner@free-crm.local', 'The local Sites identity gateway should overwrite spoofed identity headers');
}

const form = new FormData();
form.append('file', new Blob(['FREE CRM R2 smoke'], { type: 'text/plain' }), 'release-smoke.txt');
const uploaded = await json('/api/v1/files', { method: 'POST', body: form }, 201);
const documentId = uploaded.result.id;
const downloaded = await request(`/api/v1/files?id=${encodeURIComponent(documentId)}`);
assert.equal(await downloaded.text(), 'FREE CRM R2 smoke');
await json(`/api/v1/files?id=${encodeURIComponent(documentId)}`, { method: 'DELETE' });
await request(`/api/v1/files?id=${encodeURIComponent(documentId)}`, {}, 404);

const backup = await request('/api/v1/export');
assert.match(backup.headers.get('content-disposition') || '', /free-crm-backup/);
assert.ok(!(await backup.text()).includes('webhookUrl'), 'Exports must not include connector endpoint secrets');
const csv = await request('/api/v1/export?format=csv');
assert.match(csv.headers.get('content-type') || '', /text\/csv/);
assert.match(await csv.text(), /^type,name,status/);
const calendar = await request('/api/v1/calendar');
assert.match(await calendar.text(), /BEGIN:VCALENDAR/);
await json(`/api/v1/webhooks/${workspaceId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId: 'smoke' }) }, 503);

await command('demo.reset', { confirm: 'RESET', mode: 'clean' }, `smoke-reset-end-${Date.now()}`);
const clean = await json('/api/v1/bootstrap');
assert.equal(clean.data.records.length, 0);
assert.equal(clean.data.demo, false);

console.log('FREE CRM smoke passed: landing, workspace shell, headers, health, D1 CRUD, currency guard, concurrent idempotency, stale writes, tenant isolation, notes, R2 lifecycle, exports, calendar, and webhook fail-closed behavior.');
