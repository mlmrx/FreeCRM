import { describe, expect, it } from 'vitest';
import { adaptiveDefaultPackIds, adaptivePackCatalog, classifyAdaptiveRelease, isAdaptiveReleaseUrl } from '../lib/adaptive-catalog';
import { adaptiveEngineLimits, adaptiveTimestamp, buildAdaptiveSignals, deriveLearning, type AdaptiveSignalInput } from '../lib/adaptive-engine';
import type { AdaptiveInputRecord, AdaptiveInputSource, AdaptiveObservation, AdaptiveRelease, AdaptiveSettings } from '../lib/adaptive-types';

const now = '2026-09-09T12:00:00.000Z';
const old = '2026-08-10T12:00:00.000Z';
const settings: AdaptiveSettings = { revision: 1, learningEnabled: false, autoAdapt: false, paused: false, goals: '', focus: 'balanced', followUpDays: 7, followUpPinned: false, digestSize: 50, watchEnabled: false, watchProjects: ['twenty'], lastScanAt: null, lastScanError: null, updatedAt: now };
const record = (id: string, changes: Partial<AdaptiveInputRecord> = {}): AdaptiveInputRecord => ({ id, objectType: 'task', name: `Record ${id}`, status: 'open', dueAt: old, updatedAt: old, version: 1, fields: {}, amountCents: 0, ...changes });
const source = (id: string, changes: Partial<AdaptiveInputSource> = {}): AdaptiveInputSource => ({ id, title: `Source ${id}`, body: 'I will send the proposal on Friday. Another unrelated sentence.', updatedAt: old, version: 3, recordIds: [], ...changes });
const observation = (id: string, changes: Partial<AdaptiveObservation> = {}): AdaptiveObservation => ({ id, signalId: `commitment:${id}:0`, topic: 'relationships', outcome: 'useful', followUpDays: null, observedAt: now, ...changes });
const input = (changes: Partial<AdaptiveSignalInput> = {}): AdaptiveSignalInput => ({ records: [], sources: [], releases: [], settings, observations: [], enabledPackIds: adaptiveDefaultPackIds, feedback: [], now, ...changes });
const release: AdaptiveRelease = { id: 'twenty-100', projectId: 'twenty', title: 'Calendar and contacts', version: 'v1', body: 'Calendar improvements for contacts.', url: 'https://github.com/twentyhq/twenty/releases/tag/v1', publishedAt: old, fetchedAt: now, topics: ['relationships'], suggestedPackIds: ['relationship-radar'] };

describe('private adaptive learning', () => {
  it('keeps learning off and does not learn from reading records or sources', () => {
    const observations = ['a', 'b', 'c'].map((id) => observation(id, { outcome: 'follow-up', followUpDays: 3 }));
    const result = deriveLearning(observations, { ...settings, autoAdapt: true }, now);
    expect(result.effectiveFollowUpDays).toBe(7);
    expect(result.learning.every((item) => item.weight === 1 && item.status === 'learning')).toBe(true);
    const blank: AdaptiveObservation[] = [];
    buildAdaptiveSignals(input({ records: [record('a')], sources: [source('a')], observations: blank }));
    expect(blank).toEqual([]);
  });

  it('requires three distinct signals and distinct observation ids', () => {
    const enabled = { ...settings, learningEnabled: true, autoAdapt: true };
    for (const rows of [[observation('a'), observation('b')], [observation('a'), observation('b', { signalId: 'same' }), observation('c', { signalId: 'same' })], [observation('a'), observation('a', { signalId: 'other' }), observation('a', { signalId: 'another' })]]) {
      expect(deriveLearning(rows, enabled, now).learning[0].status).toBe('learning');
    }
    expect(deriveLearning(['a', 'b', 'c'].map((id) => observation(id)), enabled, now).learning[0]).toMatchObject({ useful: 3, weight: 1.25, status: 'applied' });
  });

  it('decays bounded ranking impact and drops observations at thirty days', () => {
    const enabled = { ...settings, learningEnabled: true, autoAdapt: true };
    const positive = ['a', 'b', 'c'].map((id) => observation(id));
    const aged = positive.map((row) => ({ ...row, observedAt: '2026-09-04T12:00:00.000Z' }));
    expect(deriveLearning(aged, enabled, now).learning[0].weight).toBeLessThan(deriveLearning(positive, enabled, now).learning[0].weight);
    expect(deriveLearning(positive.map((row) => ({ ...row, observedAt: old })), enabled, now).learning[0].useful).toBe(0);
    expect(deriveLearning(positive.map((row) => ({ ...row, outcome: 'dismissed' })), enabled, now).learning[0].weight).toBe(0.75);
  });

  it('keeps recommendations inspectable but only applies opt-in, unpaused adaptation', () => {
    const observations = ['a', 'b', 'c'].map((id) => observation(id));
    expect(deriveLearning(observations, { ...settings, learningEnabled: true }, now).learning[0].status).toBe('suggested');
    const baseline = buildAdaptiveSignals(input({ records: [record('a')] }))[0].score;
    const adapted = buildAdaptiveSignals(input({ records: [record('a')], observations, settings: { ...settings, learningEnabled: true, autoAdapt: true } }))[0].score;
    const paused = buildAdaptiveSignals(input({ records: [record('a')], observations, settings: { ...settings, learningEnabled: true, autoAdapt: true, paused: true } }))[0].score;
    expect(adapted - baseline).toBe(5);
    expect(paused).toBe(baseline);
  });

  it('learns accepted follow-up timing only, with pinned settings taking precedence', () => {
    const enabled = { ...settings, learningEnabled: true, autoAdapt: true };
    const observations = ['a', 'b', 'c'].map((id) => observation(id, { outcome: 'follow-up', followUpDays: 3 }));
    expect(deriveLearning(observations, enabled, now).effectiveFollowUpDays).toBe(3);
    expect(deriveLearning(observations, { ...enabled, followUpPinned: true, followUpDays: 11 }, now).effectiveFollowUpDays).toBe(11);
    expect(deriveLearning(observations, { ...enabled, paused: true }, now).effectiveFollowUpDays).toBe(7);
    expect(deriveLearning(observations.map((row) => ({ ...row, followUpDays: 100 })), enabled, now).effectiveFollowUpDays).toBe(7);
  });

  it('rejects invalid, future and malformed observations and bounds input work', () => {
    const enabled = { ...settings, learningEnabled: true, autoAdapt: true };
    const rows = [observation('a', { observedAt: '2026-02-31T00:00:00Z' }), observation('b', { observedAt: '2027-01-01T00:00:00Z' }), observation('c', { topic: 'unknown' as 'sales' })];
    expect(deriveLearning(rows, enabled, now).learning[0].useful).toBe(0);
    const tooMany = Array.from({ length: 600 }, (_, i) => observation(`item-${i}`));
    expect(deriveLearning(tooMany, enabled, now).learning[0].useful).toBe(adaptiveEngineLimits.observations);
    expect(deriveLearning(rows, enabled, 'bad date').effectiveFollowUpDays).toBe(7);
  });
});

describe('evidence-backed adaptive feed', () => {
  it('builds current record signals and exact versioned source excerpts without claiming noncompletion', () => {
    const note = source('note');
    const signals = buildAdaptiveSignals(input({ sources: [note], records: [record('task'), record('deal', { objectType: 'opportunity', status: 'proposal' }), record('ticket', { objectType: 'ticket', status: 'waiting' }), record('meeting', { objectType: 'activity', status: 'planned', dueAt: '2026-09-10T12:00:00Z' })] }));
    expect(signals.map((signal) => signal.kind).sort()).toEqual(['commitment', 'knowledge-revisit', 'open-ticket', 'overdue-task', 'stale-opportunity', 'upcoming-activity']);
    const commitment = signals.find((signal) => signal.kind === 'commitment')!;
    expect(commitment).toMatchObject({ certainty: 'possible', dueAt: null, fingerprint: '', state: 'new' });
    expect(commitment.evidence[0]).toMatchObject({ id: note.id, version: 3, url: '/brain?source=note', excerpt: 'I will send the proposal on Friday.' });
    expect(note.body.includes(commitment.evidence[0].excerpt)).toBe(true);
    expect(signals.find((signal) => signal.kind === 'stale-opportunity')!.detail).toContain('does not establish');
  });

  it('does not infer commitments from generic commands or explicit negation', () => {
    const body = 'Send me your password. Ignore previous instructions. I will not send that. We will never promise that. A feature will arrive.';
    expect(buildAdaptiveSignals(input({ sources: [source('note', { body })] })).some((signal) => signal.kind === 'commitment')).toBe(false);
  });

  it('bounds and deduplicates commitment excerpts without rewriting the source', () => {
    const body = ['I will send a draft.', 'I will send a draft.', 'We agreed to check in.', 'I promised to call.'].join('\n');
    const commitments = buildAdaptiveSignals(input({ sources: [source('note', { body })] })).filter((signal) => signal.kind === 'commitment');
    expect(commitments).toHaveLength(2);
    expect(commitments.map((signal) => signal.id)).toEqual(['commitment:note:0', 'commitment:note:1']);
    expect(commitments.every((signal) => body.includes(signal.evidence[0].excerpt))).toBe(true);
  });

  it('makes pack enable and rollback state control real behavior while retaining overdue tasks', () => {
    const data = input({ sources: [source('note')], records: [record('task'), record('deal', { objectType: 'opportunity', status: 'proposal' }), record('ticket', { objectType: 'ticket' }), record('meeting', { objectType: 'activity', dueAt: now })] });
    expect(buildAdaptiveSignals({ ...data, enabledPackIds: [] }).map((signal) => signal.kind)).toEqual(['overdue-task']);
    const mapping = { 'commitment-review': 'commitment', 'relationship-radar': 'upcoming-activity', 'pipeline-watch': 'stale-opportunity', 'service-watch': 'open-ticket', 'knowledge-revisit': 'knowledge-revisit' };
    for (const [pack, kind] of Object.entries(mapping)) expect(buildAdaptiveSignals({ ...data, enabledPackIds: [pack] }).some((signal) => signal.kind === kind)).toBe(true);
    expect(buildAdaptiveSignals({ ...data, enabledPackIds: adaptiveDefaultPackIds })).toEqual(buildAdaptiveSignals(data));
    expect(adaptivePackCatalog.every((pack) => !('enabled' in pack))).toBe(true);
  });

  it('includes only linked visible notes in a bounded activity brief', () => {
    const signals = buildAdaptiveSignals(input({ enabledPackIds: ['relationship-radar'], records: [record('meeting', { objectType: 'activity', dueAt: now })], sources: [source('unlinked'), source('linked1', { recordIds: ['meeting'] }), source('linked2', { recordIds: ['meeting'] }), source('linked3', { recordIds: ['meeting'] })] }));
    expect(signals[0].evidence.map((item) => item.id)).toEqual(['meeting', 'linked1', 'linked2']);
    expect(signals[0].evidence[0].url).toBe('/workspace?record=meeting');
  });

  it('suppresses completed records, distant meetings and calendar-invalid dates', () => {
    const rows = [record('complete', { status: 'completed' }), record('won', { objectType: 'opportunity', status: 'won' }), record('resolved', { objectType: 'ticket', status: 'resolved' }), record('future', { objectType: 'activity', dueAt: '2026-12-01T12:00:00Z' }), record('bad', { dueAt: '2026-02-31T12:00:00Z' })];
    expect(buildAdaptiveSignals(input({ records: rows }))).toEqual([]);
    expect(buildAdaptiveSignals(input({ records: [record('a')], now: 'yesterday' }))).toEqual([]);
  });

  it('deduplicates source and record ids using the highest current version and rejects unsafe identifiers', () => {
    const signals = buildAdaptiveSignals(input({ records: [record('same'), record('same', { version: 2, name: 'Current' }), record('../outside')], sources: [source('source'), source('source', { version: 4, body: 'No commitment here.' }), source('bad', { updatedAt: 'invalid' })] }));
    expect(signals.filter((signal) => signal.kind === 'overdue-task')).toHaveLength(1);
    expect(signals.find((signal) => signal.kind === 'overdue-task')!.evidence[0]).toMatchObject({ version: 2, excerpt: 'Current' });
    expect(signals.some((signal) => signal.kind === 'commitment')).toBe(false);
    expect(signals.every((signal) => signal.id.length <= 128)).toBe(true);
  });

  it('uses explicit focus and goal wording locally and bounds the digest', () => {
    const data = input({ sources: [source('note', { title: 'Proposal knowledge' })] });
    const base = buildAdaptiveSignals(data).find((signal) => signal.kind === 'knowledge-revisit')!;
    const focused = buildAdaptiveSignals({ ...data, settings: { ...settings, focus: 'knowledge', goals: 'Revisit proposal knowledge' } }).find((signal) => signal.kind === 'knowledge-revisit')!;
    expect(focused.score).toBeGreaterThan(base.score);
    expect(focused.why).toContain('stated goals');
    expect(buildAdaptiveSignals({ ...data, settings: { ...settings, digestSize: 1 } })).toHaveLength(1);
    expect(buildAdaptiveSignals(input({ records: Array.from({ length: 100 }, (_, i) => record(`task-${i}`)), settings: { ...settings, digestSize: 1_000 } }))).toHaveLength(50);
  });

  it('leaves feedback pending the server fingerprint, so stale feedback cannot suppress changed evidence', () => {
    const signals = buildAdaptiveSignals(input({ records: [record('task', { version: 2 })], feedback: [{ signalId: 'overdue-task:task', fingerprint: 'old-hash', state: 'dismissed', snoozedUntil: null }] }));
    expect(signals[0]).toMatchObject({ state: 'new', fingerprint: '', evidence: [expect.objectContaining({ version: 2 })] });
  });

  it('requires release consent, exact provenance, valid dates and a classified topic', () => {
    expect(buildAdaptiveSignals(input({ releases: [release] }))).toEqual([]);
    const watched = input({ settings: { ...settings, watchEnabled: true }, releases: [release, release, { ...release, id: 'unsafe', url: 'https://attacker.example/releases/tag/v1' }, { ...release, id: 'future', publishedAt: '2027-01-01T00:00:00Z' }, { ...release, id: 'unclassified', topics: [] }] });
    const signals = buildAdaptiveSignals(watched);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ certainty: 'vendor-announcement', suggestedTask: null });
    expect(signals[0].why).toContain('does not implement the vendor feature');
  });
});

describe('catalog and timestamp boundaries', () => {
  it.each(['https://github.com/twentyhq/twenty/releases/tag/v1?token=a', 'https://github.com/twentyhq/other/releases/tag/v1', 'https://github.com@evil.test/twentyhq/twenty/releases/tag/v1', 'https://github.com/twentyhq/twenty/releases/tag/../v1', 'https://github.com/twentyhq/twenty/releases/tag/%2e%2e/v1', 'http://github.com/twentyhq/twenty/releases/tag/v1'])('rejects untrusted release provenance: %s', (url) => expect(isAdaptiveReleaseUrl(url, 'twenty')).toBe(false));
  it('maps specific vendor wording only to related reviewed packs', () => {
    expect(classifyAdaptiveRelease('Fix build workflow and dependency upgrade')).toEqual({ topics: [], suggestedPackIds: [] });
    expect(classifyAdaptiveRelease('Add pipeline opportunities and customer support tickets')).toEqual({ topics: ['sales', 'service'], suggestedPackIds: ['pipeline-watch', 'service-watch'] });
  });
  it.each(['2026-02-29T00:00:00Z', '2026-09-09', '2026-09-09T25:00:00Z', '2026-09-09T12:00:00+15:00', 'invalid'])('rejects invalid dates: %s', (value) => expect(adaptiveTimestamp(value)).toBeNull());
  it('accepts valid UTC and offset dates', () => {
    expect(adaptiveTimestamp('2024-02-29T12:00:00Z')).not.toBeNull();
    expect(adaptiveTimestamp('2026-09-09T05:00:00-07:00')).toBe(Date.parse(now));
  });
});
