import { adaptivePackCatalog, isAdaptiveReleaseUrl } from './adaptive-catalog';
import { adaptiveTopics, type AdaptiveEvidence, type AdaptiveFeedback, type AdaptiveInputRecord, type AdaptiveInputSource, type AdaptiveLearning, type AdaptiveObservation, type AdaptiveRelease, type AdaptiveSettings, type AdaptiveSignal, type AdaptiveTopic } from './adaptive-types';

const DAY = 86_400_000;
const WINDOW = 30 * DAY;
export const adaptiveEngineLimits = { records: 2_000, sources: 200, sourceCharacters: 40_000, observations: 500, releases: 20, feedback: 500, signals: 50 } as const;
const topics = new Set<string>(adaptiveTopics);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const boundedText = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : '';
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,90}$/.test(value);

/** Reject date-only, ambiguous and calendar-invalid timestamps instead of silently rolling them over. */
export function adaptiveTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || value.length > 35) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return null;
  const [, year, month, day, hour, minute, second, zone] = parts;
  if (+month < 1 || +month > 12 || +day < 1 || +day > new Date(Date.UTC(+year, +month, 0)).getUTCDate() || +hour > 23 || +minute > 59 || +second > 59) return null;
  if (zone !== 'Z' && (+zone.slice(1, 3) > 14 || +zone.slice(4) > 59 || (+zone.slice(1, 3) === 14 && +zone.slice(4) !== 0))) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function recentObservations(observations: AdaptiveObservation[], now: number): AdaptiveObservation[] {
  const distinct = new Map<string, AdaptiveObservation>();
  const seenIds = new Set<string>();
  for (const observation of observations.slice(0, adaptiveEngineLimits.observations)) {
    const observed = adaptiveTimestamp(observation.observedAt);
    if (observed === null || observed > now || now - observed >= WINDOW || !topics.has(observation.topic) || !validId(observation.id)
      || typeof observation.signalId !== 'string' || observation.signalId.length > 128 || !observation.signalId
      || !['useful', 'dismissed', 'follow-up'].includes(observation.outcome) || seenIds.has(observation.id)) continue;
    seenIds.add(observation.id);
    const previous = distinct.get(observation.signalId);
    if (!previous || observed > (adaptiveTimestamp(previous.observedAt) ?? 0)) distinct.set(observation.signalId, observation);
  }
  return [...distinct.values()];
}

export function deriveLearning(observations: AdaptiveObservation[], settings: AdaptiveSettings, nowISO: string): { learning: AdaptiveLearning[]; effectiveFollowUpDays: number; followUpExplanation: string } {
  const now = adaptiveTimestamp(nowISO);
  const recent = now === null ? [] : recentObservations(observations, now);
  const applies = settings.learningEnabled && settings.autoAdapt && !settings.paused;
  const decay = (item: AdaptiveObservation) => Math.max(0, 1 - ((now ?? 0) - (adaptiveTimestamp(item.observedAt) ?? 0)) / WINDOW);
  const learning: AdaptiveLearning[] = adaptiveTopics.map((topic) => {
    const items = recent.filter((item) => item.topic === topic);
    const enough = items.length >= 3;
    const balance = items.reduce((sum, item) => sum + decay(item) * (item.outcome === 'dismissed' ? -1 : 1), 0);
    const weight = enough && settings.learningEnabled ? Math.round(clamp(1 + (balance / items.length) * 0.25, 0.75, 1.25) * 100) / 100 : 1;
    const status = enough && settings.learningEnabled ? (applies ? 'applied' : 'suggested') : 'learning';
    const explanation = !settings.learningEnabled ? 'Learning is off. Explicit feedback is not used to adapt the feed.'
      : !enough ? `${items.length} distinct recent signals; at least three are needed before a recommendation.`
        : `${items.length} distinct signals in the last 30 days, with older feedback carrying less weight. ${applies ? 'A bounded ranking adjustment is applied.' : settings.paused ? 'Adaptation is paused.' : 'This adjustment is a suggestion; automatic adaptation is off.'}`;
    return { topic, useful: items.filter((item) => item.outcome === 'useful').length, dismissed: items.filter((item) => item.outcome === 'dismissed').length, weight, status, explanation };
  });
  const configuredDays = Math.round(clamp(settings.followUpDays, 1, 30));
  const timing = recent.filter((item) => item.outcome === 'follow-up' && Number.isInteger(item.followUpDays) && item.followUpDays! >= 1 && item.followUpDays! <= 30);
  if (settings.followUpPinned) return { learning, effectiveFollowUpDays: configuredDays, followUpExplanation: 'Your pinned follow-up interval takes precedence over learned timing.' };
  if (!applies || timing.length < 3) return { learning, effectiveFollowUpDays: configuredDays, followUpExplanation: !settings.learningEnabled ? 'Using your configured interval; learning is off.' : settings.paused ? 'Using your configured interval; adaptation is paused.' : !settings.autoAdapt ? 'Using your configured interval; automatic adaptation is off.' : 'Using your configured interval until three distinct recent follow-ups have timing feedback.' };
  const total = timing.reduce((sum, item) => sum + decay(item), 0);
  const learned = Math.round(clamp(timing.reduce((sum, item) => sum + item.followUpDays! * decay(item), 0) / total, 1, 30));
  return { learning, effectiveFollowUpDays: learned, followUpExplanation: `Suggested default adapted from ${timing.length} explicitly accepted follow-up intervals in the last 30 days. Review each task before creating it.` };
}

function sourceEvidence(source: AdaptiveInputSource, excerpt: string): AdaptiveEvidence {
  return { kind: 'source', id: source.id, title: boundedText(source.title, 200), excerpt, url: `/brain?source=${encodeURIComponent(source.id)}`, version: source.version, observedAt: source.updatedAt };
}

function recordEvidence(record: AdaptiveInputRecord): AdaptiveEvidence {
  return { kind: 'record', id: record.id, title: boundedText(record.name, 200), excerpt: boundedText(record.name, 320), url: `/workspace?record=${encodeURIComponent(record.id)}`, version: record.version, observedAt: record.updatedAt };
}

function commitmentExcerpts(body: string): string[] {
  const result: string[] = [];
  const pattern = /\b(?:I(?:\s+will|'ll|’ll)|we(?:\s+will|'ll|’ll)|I\s+promised\s+to|we\s+(?:promised|agreed)\s+to)\s+(?!(?:not|never|have\s+already)\b)[a-z]/i;
  // Bound scanning work and keep the excerpt an exact substring, without model paraphrases.
  for (const part of body.slice(0, adaptiveEngineLimits.sourceCharacters).split(/\r?\n|(?<=[.!?])\s+/).slice(0, 1_000)) {
    const match = pattern.exec(part);
    if (!match) continue;
    const start = Math.max(0, match.index - 60);
    const excerpt = part.slice(start, start + 320);
    if (!result.includes(excerpt)) result.push(excerpt);
    if (result.length === 2) break;
  }
  return result;
}

function goalWords(goals: string): string[] {
  const ignored = new Set(['about', 'after', 'again', 'also', 'because', 'before', 'could', 'from', 'have', 'help', 'into', 'more', 'myself', 'need', 'should', 'that', 'their', 'them', 'these', 'this', 'want', 'with', 'would', 'your']);
  return [...new Set(boundedText(goals, 2_000).toLowerCase().match(/[a-z][a-z0-9-]{3,30}/g) ?? [])].filter((word) => !ignored.has(word)).slice(0, 20);
}

export type AdaptiveSignalInput = { records: AdaptiveInputRecord[]; sources: AdaptiveInputSource[]; releases: AdaptiveRelease[]; settings: AdaptiveSettings; observations: AdaptiveObservation[]; enabledPackIds: string[]; feedback: AdaptiveFeedback[]; now: string; candidateLimit?: number };

export function buildAdaptiveSignals(input: AdaptiveSignalInput): AdaptiveSignal[] {
  const now = adaptiveTimestamp(input.now);
  if (now === null) return [];
  const packs = new Set(input.enabledPackIds.slice(0, 20).filter((id) => adaptivePackCatalog.some((pack) => pack.id === id)));
  const records = new Map<string, AdaptiveInputRecord>();
  const sources = new Map<string, AdaptiveInputSource>();
  for (const record of input.records.slice(0, adaptiveEngineLimits.records)) {
    const updated = adaptiveTimestamp(record.updatedAt);
    if (!validId(record.id) || updated === null || updated > now || !Number.isSafeInteger(record.version) || record.version < 1) continue;
    if (!records.has(record.id) || record.version > records.get(record.id)!.version) records.set(record.id, record);
  }
  for (const source of input.sources.slice(0, adaptiveEngineLimits.sources)) {
    const updated = adaptiveTimestamp(source.updatedAt);
    if (!validId(source.id) || updated === null || updated > now || !Number.isSafeInteger(source.version) || source.version < 1) continue;
    if (!sources.has(source.id) || source.version > sources.get(source.id)!.version) sources.set(source.id, source);
  }
  const result: AdaptiveSignal[] = [];
  const append = (signal: Omit<AdaptiveSignal, 'fingerprint' | 'state' | 'snoozedUntil'>) => result.push({ ...signal, fingerprint: '', state: 'new', snoozedUntil: null });
  const closed = new Set(['completed', 'cancelled', 'canceled', 'closed', 'resolved', 'won', 'lost', 'archived']);
  for (const record of records.values()) {
    if (closed.has(record.status.toLowerCase())) continue;
    const name = boundedText(record.name, 160);
    const due = adaptiveTimestamp(record.dueAt);
    const age = Math.floor((now - adaptiveTimestamp(record.updatedAt)!) / DAY);
    const evidence = [recordEvidence(record)];
    if (record.objectType === 'task' && due !== null && due < now) append({ id: `overdue-task:${record.id}`, kind: 'overdue-task', topic: 'relationships', title: `Review overdue task: ${name}`, detail: `The task is recorded as ${boundedText(record.status, 40)} with a due date of ${record.dueAt}. Check whether the record reflects the current situation.`, why: 'The stored due date has passed and the task is not marked complete.', certainty: 'recorded', score: 90 + Math.min(10, Math.floor((now - due) / DAY)), evidence, dueAt: record.dueAt, suggestedTask: null });
    if (record.objectType === 'activity' && packs.has('relationship-radar') && due !== null && due >= now && due <= now + 7 * DAY) {
      for (const source of sources.values()) {
        if (source.recordIds.slice(0, 100).includes(record.id)) evidence.push(sourceEvidence(source, boundedText(source.body, 320)));
        if (evidence.length === 3) break;
      }
      append({ id: `upcoming-activity:${record.id}`, kind: 'upcoming-activity', topic: 'relationships', title: `Prepare for ${name}`, detail: `This activity is scheduled for ${record.dueAt}.${evidence.length > 1 ? ' Linked source excerpts are available for your preparation.' : ''}`, why: 'Relationship radar includes activities scheduled in the next seven days.', certainty: 'recorded', score: 78 - Math.floor((due - now) / DAY), evidence, dueAt: record.dueAt, suggestedTask: { title: `Prepare for ${name}`, dueAt: record.dueAt } });
    }
    if (record.objectType === 'opportunity' && packs.has('pipeline-watch') && ['exploring', 'qualified', 'proposal', 'negotiation', 'open'].includes(record.status) && age >= 14) append({ id: `stale-opportunity:${record.id}`, kind: 'stale-opportunity', topic: 'sales', title: `Review opportunity: ${name}`, detail: `This opportunity remains in ${boundedText(record.status, 40)}; its record was last updated ${age} days ago. That does not establish whether activity occurred elsewhere.`, why: 'Pipeline watch highlights open opportunity records unchanged for at least fourteen days.', certainty: 'recorded', score: 60 + Math.min(10, Math.floor(age / 7)), evidence, dueAt: null, suggestedTask: { title: `Review next step for ${name}`, dueAt: null } });
    if (record.objectType === 'ticket' && packs.has('service-watch') && ['new', 'open', 'waiting'].includes(record.status)) append({ id: `open-ticket:${record.id}`, kind: 'open-ticket', topic: 'service', title: `Review ticket: ${name}`, detail: `The ticket is recorded as ${record.status}.${due !== null ? ` Its recorded due date is ${record.dueAt}.` : ''}`, why: 'Service watch surfaces tickets that have not been marked resolved or closed.', certainty: 'recorded', score: due !== null && due < now ? 88 : 62 + Math.min(age, 10), evidence, dueAt: due !== null ? record.dueAt : null, suggestedTask: { title: `Review ticket ${name}`, dueAt: null } });
  }
  for (const source of sources.values()) {
    const title = boundedText(source.title, 150);
    if (packs.has('commitment-review')) commitmentExcerpts(boundedText(source.body, adaptiveEngineLimits.sourceCharacters)).forEach((excerpt, ordinal) => append({ id: `commitment:${source.id}:${ordinal}`, kind: 'commitment', topic: 'relationships', title: `Possible commitment in ${title}`, detail: 'This passage may describe a commitment. Confirm who owns it, whether it is still relevant, and any due date before creating a follow-up.', why: 'Commitment review found explicit future or promise language in a saved source. This is a suggestion to review, not evidence of an unfinished obligation.', certainty: 'possible', score: 66, evidence: [sourceEvidence(source, excerpt)], dueAt: null, suggestedTask: { title: `Review commitment: ${title}`, dueAt: null } }));
    if (packs.has('knowledge-revisit') && now - adaptiveTimestamp(source.updatedAt)! >= 14 * DAY && boundedText(source.body, 320).trim()) append({ id: `knowledge-revisit:${source.id}`, kind: 'knowledge-revisit', topic: 'knowledge', title: `Revisit ${title}`, detail: 'This saved source was last updated at least fourteen days ago. Review it if the topic is useful now; its age alone does not mean the content is outdated.', why: 'Knowledge revisit brings older saved sources back into view.', certainty: 'recorded', score: 38, evidence: [sourceEvidence(source, boundedText(source.body, 320))], dueAt: null, suggestedTask: null });
  }
  const seenReleases = new Set<string>();
  if (input.settings.watchEnabled) for (const release of input.releases.slice(0, adaptiveEngineLimits.releases)) {
    const published = adaptiveTimestamp(release.publishedAt);
    const fetched = adaptiveTimestamp(release.fetchedAt);
    if (!validId(release.id) || seenReleases.has(release.id) || !input.settings.watchProjects.slice(0, 4).includes(release.projectId) || !isAdaptiveReleaseUrl(release.url, release.projectId) || published === null || published > now || fetched === null || fetched > now) continue;
    seenReleases.add(release.id);
    const releaseTopics = release.topics.filter((topic) => topics.has(topic)).slice(0, 4);
    if (!releaseTopics.length) continue;
    const topic = releaseTopics.includes(input.settings.focus as AdaptiveTopic) ? input.settings.focus as AdaptiveTopic : releaseTopics[0];
    append({ id: `release:${release.id}`, kind: 'release', topic, title: `Vendor announcement: ${boundedText(release.title, 160)}`, detail: boundedText(release.body, 500), why: 'An opted-in official project published this release. Vendor descriptions are untrusted announcements; a related local pack does not implement the vendor feature.', certainty: 'vendor-announcement', score: 35, evidence: [{ kind: 'release', id: release.id, title: boundedText(release.title, 200), excerpt: boundedText(release.body, 320), url: release.url, version: 1, observedAt: release.publishedAt }], dueAt: null, suggestedTask: null });
  }
  const learning = deriveLearning(input.observations, input.settings, input.now).learning;
  const words = goalWords(input.settings.goals);
  for (const signal of result) {
    const reasons: string[] = [];
    if (signal.topic === input.settings.focus) { signal.score += 12; reasons.push('Matches your chosen focus.'); }
    const searchable = `${signal.topic} ${signal.title} ${signal.detail}`.toLowerCase();
    const matches = words.filter((word) => searchable.includes(word)).length;
    if (matches) { signal.score += Math.min(12, matches * 4); reasons.push('Shares wording with your stated goals.'); }
    const learned = learning.find((item) => item.topic === signal.topic);
    if (learned?.status === 'applied') { signal.score += (learned.weight - 1) * 20; reasons.push('Includes a bounded adjustment from explicit feedback.'); }
    signal.score = Math.round(clamp(signal.score, 0, 150) * 100) / 100;
    if (reasons.length) signal.why += ` ${reasons.join(' ')}`;
  }
  // Fingerprints bind exact current evidence in the server. Only that server may apply saved
  // feedback after hashing; an id match alone must never hide or approve changed evidence.
  return result.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, Math.round(input.candidateLimit === undefined ? clamp(input.settings.digestSize, 1, adaptiveEngineLimits.signals) : clamp(input.candidateLimit, 1, 3000)));
}
