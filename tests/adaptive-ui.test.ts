import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import TodayPage from '@/app/today/page';
import TodayWorkspace, { BriefingAnswer, CapabilitiesPanel, EvidenceList, LearningPanel, SignalCard } from '@/app/today/today-workspace';
import { AdaptiveClientError, createAdaptiveClient, editableAdaptiveSettings, evidenceHref, followupPayload, localDateTime, proposalMarkdown, safeReleaseUrl, singleFlight } from '@/lib/adaptive-client';
import type { AdaptiveEvidence, AdaptiveProposal, AdaptiveRelease, AdaptiveSignal, AdaptiveSnapshot } from '@/lib/adaptive-types';

const evidence: AdaptiveEvidence = { kind: 'source', id: 'note/a?unsafe', title: '<img src=x onerror=alert(1)>', excerpt: '<script>untrusted source text</script>', url: 'javascript:alert(1)', version: 2, observedAt: '2026-09-09T10:00:00Z' };
const signal: AdaptiveSignal = { id: 'promise-one', kind: 'commitment', topic: 'relationships', title: 'Possible follow-up with a contact', detail: 'A note may contain a promise.', why: 'This source was updated recently.', certainty: 'possible', score: 8, evidence: [evidence], fingerprint: 'fingerprint-v2', dueAt: null, state: 'new', snoozedUntil: null, suggestedTask: { title: 'Review a possible commitment', dueAt: null } };
const release: AdaptiveRelease = { id: 'release-one', projectId: 'crm-one', title: '<script>Vendor feature</script>', version: 'v1.2.3', body: 'A vendor announcement with unverified claims.', url: 'https://github.com/example/crm/releases/tag/v1.2.3', publishedAt: '2026-09-08T12:00:00Z', fetchedAt: '2026-09-09T10:00:00Z', topics: ['sales'], suggestedPackIds: [] };
const proposal: AdaptiveProposal = { id: 'proposal-one', releaseId: release.id, title: 'Review a sourced capability', problem: 'A bounded integration could help.', status: 'proposed', createdAt: evidence.observedAt };
const snapshot: AdaptiveSnapshot = {
  workspaceName: 'Private workspace', timezone: 'America/Los_Angeles', canWrite: true, canManage: true, canExport: true, device: true, localAiEnabled: false,
  settings: { revision: 0, learningEnabled: false, autoAdapt: false, paused: false, goals: '', focus: 'balanced', followUpDays: 3, followUpPinned: false, digestSize: 5, watchEnabled: false, watchProjects: [], lastScanAt: null, lastScanError: null, updatedAt: evidence.observedAt },
  signals: [signal], learning: [], effectiveFollowUpDays: 3, followUpExplanation: 'Explicit default; learning is off.', observationCount: 0,
  packs: [{ id: 'relationships', version: '1.0.0', title: 'Relationship follow-through', description: 'Surface possible commitments with evidence.', topics: ['relationships'], effects: ['Show possible commitment signals'], permissions: [], sourceUrl: 'https://example.org/packs/relationships', enabled: true, previousVersion: '1.0.0', installedAt: evidence.observedAt }],
  projects: [{ id: 'crm-one', name: 'An official CRM', repository: 'example/crm', url: 'https://github.com/example/crm' }], releases: [], proposals: [],
  refresh: { generatedAt: evidence.observedAt, nextScanAt: null, scanStatus: 'off' }, metrics: { useful: 0, dismissed: 0, followUps: 0, activeSignals: 1 },
};
const ok = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } });
const action = async () => true;

describe('adaptive workspace presentation', () => {
  it('starts with a private loading shell and stable workspace navigation', () => {
    const html = renderToStaticMarkup(createElement(TodayPage));
    expect(html).toContain('Finding the threads worth following.');
    expect(html).toContain('role="status"');
    expect(html).toContain('No learning or release discovery is enabled by opening this page.');
    expect(html).toContain('href="/workspace"');
    expect(html).toContain('href="/brain"');
    expect(html).toContain('Skip to daily briefing');
    expect(html).not.toContain('AI is ready');
  });

  it('renders authentic signals and read-only guide status without invented content', () => {
    const html = renderToStaticMarkup(createElement(TodayWorkspace, { initialSnapshot: snapshot }));
    expect(html).toContain('Possible follow-up with a contact');
    expect(html).toContain('Workspace guide · no model used');
    expect(html).toContain('Your habits stay yours.');
    expect(html).toContain('no background runner status assumed');
    expect(html).toContain('Review follow-up');
    expect(html).not.toContain('Confirm &amp; create CRM task');
    expect(html).not.toContain('<script>');
  });

  it('keeps an empty workspace empty and explains concrete next steps', () => {
    const html = renderToStaticMarkup(createElement(TodayWorkspace, { initialSnapshot: { ...snapshot, signals: [] } }));
    expect(html).toContain('Some breathing room.');
    expect(html).toContain('Capture a thought');
    expect(html).not.toContain('Possible follow-up with a contact');
  });

  it('distinguishes possible interpretations from facts, and requires evidence review', () => {
    const html = renderToStaticMarkup(createElement(SignalCard, { signal, disabled: false, onFeedback: () => undefined, onFollowup: () => undefined }));
    expect(html).toContain('Possible · verify first');
    expect(html).toContain('Missing completion in your records does not prove it was missed.');
    expect(html).toContain('Why now');
    for (const label of ['Useful', 'Dismiss', 'Snooze', 'Correct', 'Review follow-up']) expect(html).toContain(label);
    expect(html).toContain('Version 2');
    expect(html).toContain('/brain?source=note%2Fa%3Funsafe');
    expect(html).not.toContain('href="javascript:');
    const recorded = renderToStaticMarkup(createElement(SignalCard, { signal: { ...signal, certainty: 'recorded', suggestedTask: null }, disabled: true, onFeedback: () => undefined, onFollowup: () => undefined }));
    expect(recorded).toContain('Recorded fact');
    expect(recorded).not.toContain('Review follow-up');
    expect(recorded).toContain('disabled=""');
  });

  it('renders safe source and record links and inert vendor content', () => {
    const html = renderToStaticMarkup(createElement(EvidenceList, { evidence: [evidence, { ...evidence, kind: 'record' }, { ...evidence, kind: 'release' }] }));
    expect(html).toContain('&lt;script&gt;untrusted source text&lt;/script&gt;');
    expect(html).toContain('&lt;img');
    expect(html).toContain('/workspace?record=note%2Fa%3Funsafe');
    expect(html).toContain('Source link unavailable');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
  });

  it('labels deterministic guidance and local model answers honestly', () => {
    const answer = { answer: '<script>Do not execute this</script>', citations: [evidence] };
    const guide = renderToStaticMarkup(createElement(BriefingAnswer, { result: { ...answer, mode: 'guide' } }));
    const ai = renderToStaticMarkup(createElement(BriefingAnswer, { result: { ...answer, mode: 'local-ai' } }));
    expect(guide).toContain('WORKSPACE GUIDE · NO MODEL USED');
    expect(ai).toContain('LOCAL AI · CHECK THE EVIDENCE');
    expect(ai).toContain('&lt;script&gt;Do not execute this&lt;/script&gt;');
    expect(ai).not.toContain('<script>');
  });

  it('exposes explicit opt-ins, retention, inspection, pause, pinning, and irreversible forget', () => {
    const html = renderToStaticMarkup(createElement(LearningPanel, { snapshot, disabled: false, onAction: action, onExport: () => undefined }));
    for (const text of ['Learning is off', 'Remember my explicit feedback', 'Apply learned preferences', 'Pause assistance', 'Pin this interval', 'Discover public CRM releases', '500 observations', 'Download private inspection JSON', 'Forget learning', 'browser closed require a separately running local watcher']) expect(html).toContain(text);
    expect(html).not.toContain('checked=""');
    expect(html).toContain('maxLength="500"');
    expect(html).toContain('max="20"');
    const restricted = renderToStaticMarkup(createElement(LearningPanel, { snapshot: { ...snapshot, canManage: false, canExport: false }, disabled: false, onAction: action, onExport: () => undefined }));
    expect(restricted).toContain('Only a workspace owner or administrator');
    expect(restricted).toContain('<fieldset disabled="">');
    expect(restricted).not.toContain('Download private inspection JSON');
  });

  it('discloses pack effects, reversible activation, and local-only proposals', () => {
    const html = renderToStaticMarkup(createElement(CapabilitiesPanel, { snapshot: { ...snapshot, releases: [release], proposals: [proposal] }, disabled: false, onAction: action }));
    for (const text of ['Show possible commitment signals', 'Turn off', 'Undo last change', 'No additional permissions', 'no downloaded code executes', 'Vendor announcement', 'Download proposal', 'Local only, no remote issue or PR']) expect(html).toContain(text);
    expect(html).toContain('&lt;script&gt;Vendor feature&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    const empty = renderToStaticMarkup(createElement(CapabilitiesPanel, { snapshot, disabled: false, onAction: action }));
    expect(empty).toContain('A quiet radar, by choice.');
  });

  it('includes mobile layouts, clear keyboard focus, and bounded conversation scrolling', () => {
    const css = readFileSync(new URL('../app/today/today.module.css', import.meta.url), 'utf8');
    expect(css).toContain('@media (max-width: 580px)');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('max-height: calc(100dvh - 44px)');
    expect(css).toContain('prefers-reduced-motion');
    const source = readFileSync(new URL('../app/today/today-workspace.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|dangerouslySetInnerHTML/);
    expect(source).toContain("document.visibilityState !== 'visible'");
    expect(source).toContain("client.getRaw<Record<string, unknown>>('?export=json'");
    expect(source).toContain('Retry exact task request');
  });
});

describe('private adaptive request identity', () => {
  it('reuses the operation ID after a transport error, and retires it after success', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('Offline')).mockResolvedValueOnce(ok({ recordId: 'task-one', created: true })).mockResolvedValueOnce(ok({ recordId: 'task-two', created: true }));
    const client = createAdaptiveClient(fetcher);
    const payload = { action: 'followup.create', signalId: 'one', fingerprint: 'v2', title: 'Actual reviewed task' };
    await expect(client.post(payload)).rejects.toThrow('Offline');
    await client.post(payload); await client.post(payload);
    const ids = fetcher.mock.calls.map((call) => JSON.parse(call[1]?.body as string).operationId);
    expect(ids[0]).toBe(ids[1]); expect(ids[2]).not.toBe(ids[1]);
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/adaptive');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store', method: 'POST', headers: { 'content-type': 'application/json' } });
  });

  it('retains IDs on 5xx, invalid JSON, incomplete receipts, and cancellation', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Retry later', code: 'busy' } }), { status: 503 })).mockResolvedValueOnce(new Response('not json')).mockResolvedValueOnce(new Response('{}')).mockRejectedValueOnce(new DOMException('Aborted', 'AbortError')).mockResolvedValueOnce(ok({ done: true }));
    const client = createAdaptiveClient(fetcher); const payload = { action: 'pack.set', id: 'one' };
    await expect(client.post(payload)).rejects.toThrow('Retry later');
    await expect(client.post(payload)).rejects.toThrow();
    await expect(client.post(payload)).rejects.toThrow('incomplete receipt');
    await expect(client.post(payload, controller.signal)).rejects.toThrow('Aborted');
    await client.post(payload);
    expect(new Set(fetcher.mock.calls.map((call) => JSON.parse(call[1]?.body as string).operationId)).size).toBe(1);
    expect(fetcher.mock.calls[3][1]?.signal).toBe(controller.signal);
  });

  it('reports definitive conflicts and uses a new identity after a rejected request', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'The evidence changed.', code: 'evidence_changed' } }), { status: 409 })).mockResolvedValueOnce(ok({ done: true }));
    const client = createAdaptiveClient(fetcher); const payload = { action: 'feedback', fingerprint: 'old', value: 'useful' };
    try { await client.post(payload); expect.unreachable(); } catch (error) { expect(error).toBeInstanceOf(AdaptiveClientError); expect(error).toMatchObject({ status: 409, code: 'evidence_changed' }); }
    await client.post(payload);
    expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string).operationId).not.toBe(JSON.parse(fetcher.mock.calls[1][1]?.body as string).operationId);
  });

  it('handles plain and missing error messages and prevents caller-supplied operation IDs', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Access denied.' }), { status: 403 })).mockResolvedValueOnce(new Response('{}', { status: 400 })).mockResolvedValueOnce(ok({ done: true }));
    const client = createAdaptiveClient(fetcher);
    await expect(client.post({ action: 'one' })).rejects.toThrow('Access denied.');
    await expect(client.post({ action: 'two' })).rejects.toThrow('This request could not be completed.');
    await client.post({ action: 'three', operationId: 'not-a-uuid' });
    expect(JSON.parse(fetcher.mock.calls[2][1]?.body as string).operationId).not.toBe('not-a-uuid');
  });

  it('uses private no-store reads, accepts the raw export archive, and clears retry memory on teardown', async () => {
    const archive = { format: 'free-crm-adaptive', version: 1, settings: [] };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(ok(snapshot)).mockResolvedValueOnce(new Response(JSON.stringify(archive), { status: 200, headers: { 'content-type': 'application/json' } })).mockRejectedValueOnce(new TypeError('Offline')).mockResolvedValueOnce(ok({ done: true }));
    const client = createAdaptiveClient(fetcher); const controller = new AbortController();
    expect(await client.get('', controller.signal)).toEqual(snapshot);
    expect(await client.getRaw('?export=json', controller.signal)).toEqual(archive);
    expect(fetcher.mock.calls[1]).toEqual(['/api/v1/adaptive?export=json', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal }]);
    await expect(client.post({ action: 'refresh' })).rejects.toThrow(); client.clear(); await client.post({ action: 'refresh' });
    expect(JSON.parse(fetcher.mock.calls[2][1]?.body as string).operationId).not.toBe(JSON.parse(fetcher.mock.calls[3][1]?.body as string).operationId);
  });

  it('bounds unresolved in-memory requests and permits clearing them', async () => {
    const client = createAdaptiveClient(vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Offline')));
    for (let index = 0; index < 64; index++) await expect(client.post({ action: 'ask', index })).rejects.toThrow('Offline');
    await expect(client.post({ action: 'ask', index: 64 })).rejects.toThrow('Too many unresolved requests');
    client.clear(); await expect(client.post({ action: 'ask', index: 64 })).rejects.toThrow('Offline');
  });

  it('collapses overlapping reads and allows a fresh read after success or failure', async () => {
    let resolve: (value: string) => void = () => undefined;
    const work = vi.fn().mockImplementationOnce(() => new Promise<string>((done) => { resolve = done; })).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce('fresh');
    const read = singleFlight<string>(work);
    const first = read(); const second = read(); expect(first).toBe(second); expect(work).toHaveBeenCalledTimes(1);
    resolve('one'); await expect(first).resolves.toBe('one');
    await expect(read()).rejects.toThrow('Offline');
    await expect(read()).resolves.toBe('fresh'); expect(work).toHaveBeenCalledTimes(3);
  });
});

describe('adaptive review and export helpers', () => {
  it.each(['javascript:alert(1)', 'data:text/html,hello', 'http://example.org/', 'file:///private.txt', 'https://name@example.org', 'invalid'])('rejects unsafe external source %s', (url) => expect(safeReleaseUrl(url)).toBeUndefined());
  it('reconstructs internal source links without trusting source-provided URLs', () => {
    expect(evidenceHref(evidence)).toBe('/brain?source=note%2Fa%3Funsafe');
    expect(evidenceHref({ ...evidence, kind: 'record' })).toBe('/workspace?record=note%2Fa%3Funsafe');
    expect(evidenceHref({ ...evidence, kind: 'release', url: release.url })).toBe(release.url);
  });
  it('sends only editable settings and keeps server-owned fields out of updates', () => {
    const editable = editableAdaptiveSettings(snapshot.settings);
    expect(editable).not.toHaveProperty('revision'); expect(editable).not.toHaveProperty('lastScanAt'); expect(editable).not.toHaveProperty('updatedAt');
    editable.watchProjects.push('other'); expect(snapshot.settings.watchProjects).toEqual([]);
    expect(editable.learningEnabled).toBe(false); expect(editable.autoAdapt).toBe(false); expect(editable.watchEnabled).toBe(false);
  });
  it('converts the reviewed local datetime to an exact timestamp and bounds task inputs', () => {
    const dateTime = localDateTime('2026-09-11T12:30:00.000Z');
    expect(followupPayload('signal', 'fingerprint', '  Reviewed task  ', dateTime, 3)).toEqual({ action: 'followup.create', signalId: 'signal', fingerprint: 'fingerprint', title: 'Reviewed task', dueAt: '2026-09-11T12:30:00.000Z', followUpDays: 3 });
    expect(localDateTime('invalid')).toBe('');
    expect(() => followupPayload('s', 'f', ' ', dateTime, 3)).toThrow('task title');
    expect(() => followupPayload('s', 'f', 'a'.repeat(201), dateTime, 3)).toThrow('task title');
    expect(() => followupPayload('s', 'f', 'Task', '', 3)).toThrow('due date');
    expect(() => followupPayload('s', 'f', 'Task', 'invalid', 3)).toThrow('due date');
    for (const days of [0, 31, 2.5]) expect(() => followupPayload('s', 'f', 'Task', dateTime, days)).toThrow('1–30');
  });
  it('exports a sourced local proposal with concrete review boundaries and acceptance criteria', () => {
    const markdown = proposalMarkdown(proposal, release);
    for (const text of [release.url, 'Local implementation proposal', 'no remote issue or pull request', 'Vendor claims require independent verification', 'Acceptance criteria', 'tenant isolation', 'explicit approval for any production deployment']) expect(markdown).toContain(text);
    expect(proposalMarkdown(proposal)).toContain('release is no longer in the current inventory');
    expect(proposalMarkdown(proposal, { ...release, url: 'javascript:alert(1)' })).toContain('No safe source URL available');
  });
});
