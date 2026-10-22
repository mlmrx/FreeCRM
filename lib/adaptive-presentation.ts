import type { AdaptiveLearning, AdaptiveSignal, AdaptiveTopic } from './adaptive-types';

type Text = (source: string, values?: Record<string, string | number>) => string;

export const adaptiveTopicLabels: Record<AdaptiveTopic, string> = {
  relationships: 'Relationships', sales: 'Sales', service: 'Service', knowledge: 'Knowledge',
};
export const adaptiveStateLabels: Record<AdaptiveSignal['state'], string> = {
  new: 'New', useful: 'Useful', dismissed: 'Dismissed', snoozed: 'Snoozed', actioned: 'Task created',
};
export const adaptiveLearningLabels: Record<AdaptiveLearning['status'], string> = {
  learning: 'Learning', suggested: 'Suggested', applied: 'Applied',
};

// These sentences are emitted by adaptive-engine, never supplied by a customer.
// Exact matching lets older/newer server versions keep unknown wording intact.
const engineSentences = new Set([
  'Learning is off. Explicit feedback is not used to adapt the feed.',
  'Your pinned follow-up interval takes precedence over learned timing.',
  'Using your configured interval; learning is off.',
  'Using your configured interval; adaptation is paused.',
  'Using your configured interval; automatic adaptation is off.',
  'Using your configured interval until three distinct recent follow-ups have timing feedback.',
  'The stored due date has passed and the task is not marked complete.',
  'Relationship radar includes activities scheduled in the next seven days.',
  'Pipeline watch highlights open opportunity records unchanged for at least fourteen days.',
  'Service watch surfaces tickets that have not been marked resolved or closed.',
  'Commitment review found explicit future or promise language in a saved source.',
  'This is a suggestion to review, not evidence of an unfinished obligation.',
  'Knowledge revisit brings older saved sources back into view.',
  'An opted-in official project published this release.',
  'Vendor descriptions are untrusted announcements; a related local pack does not implement the vendor feature.',
  'Matches your chosen focus.',
  'Shares wording with your stated goals.',
  'Includes a bounded adjustment from explicit feedback.',
  'A bounded ranking adjustment is applied.',
  'Adaptation is paused.',
  'This adjustment is a suggestion; automatic adaptation is off.',
  'This passage may describe a commitment. Confirm who owns it, whether it is still relevant, and any due date before creating a follow-up.',
  'This saved source was last updated at least fourteen days ago. Review it if the topic is useful now; its age alone does not mean the content is outdated.',
]);

function engineCopy(source: string, text: Text): string {
  if (engineSentences.has(source)) return text(source);
  const sentences = source.split(/((?<=\.)\s+)/);
  return sentences.map((sentence) => engineSentences.has(sentence) ? text(sentence) : sentence).join('');
}

/** Only fixed engine wording and numeric counts are translated. */
export function localizedAdaptiveExplanation(source: string, text: Text, locale: string): string {
  let match = /^(\d+) distinct recent signals; at least three are needed before a recommendation\.$/.exec(source);
  if (match) return text('{count} distinct recent signals; at least three are needed before a recommendation.', { count: Number(match[1]).toLocaleString(locale) });
  match = /^(\d+) distinct signals in the last 30 days, with older feedback carrying less weight\. (A bounded ranking adjustment is applied\.|Adaptation is paused\.|This adjustment is a suggestion; automatic adaptation is off\.)$/.exec(source);
  if (match) return `${text('{count} distinct signals in the last 30 days, with older feedback carrying less weight.', { count: Number(match[1]).toLocaleString(locale) })} ${engineCopy(match[2], text)}`;
  match = /^Suggested default adapted from (\d+) explicitly accepted follow-up intervals in the last 30 days\. Review each task before creating it\.$/.exec(source);
  if (match) return text('Suggested default adapted from {count} explicitly accepted follow-up intervals in the last 30 days. Review each task before creating it.', { count: Number(match[1]).toLocaleString(locale) });
  return engineCopy(source, text);
}

const titleTemplates: Record<AdaptiveSignal['kind'], { prefix: string; template: string }> = {
  'overdue-task': { prefix: 'Review overdue task: ', template: 'Review overdue task: {name}' },
  'upcoming-activity': { prefix: 'Prepare for ', template: 'Prepare for {name}' },
  'stale-opportunity': { prefix: 'Review opportunity: ', template: 'Review opportunity: {name}' },
  'open-ticket': { prefix: 'Review ticket: ', template: 'Review ticket: {name}' },
  commitment: { prefix: 'Possible commitment in ', template: 'Possible commitment in {name}' },
  'knowledge-revisit': { prefix: 'Revisit ', template: 'Revisit {name}' },
  release: { prefix: 'Vendor announcement: ', template: 'Vendor announcement: {name}' },
};

function timestamp(value: string, locale: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date) : value;
}

/** Display-only translation; the underlying signal, evidence and task draft stay unchanged. */
export function localizedAdaptiveSignal(signal: AdaptiveSignal, text: Text, locale: string): Pick<AdaptiveSignal, 'title' | 'detail' | 'why'> {
  const title = titleTemplates[signal.kind];
  const result = {
    title: title && signal.title.startsWith(title.prefix) ? text(title.template, { name: signal.title.slice(title.prefix.length) }) : signal.title,
    detail: signal.detail,
    why: engineCopy(signal.why, text),
  };
  // Release descriptions are external authored content and remain verbatim.
  if (signal.kind === 'release') return result;
  if (signal.kind === 'commitment' || signal.kind === 'knowledge-revisit') {
    result.detail = engineCopy(signal.detail, text);
    return result;
  }
  if (signal.kind === 'overdue-task') {
    const match = /^The task is recorded as (.{1,40}) with a due date of (.{1,35})\. Check whether the record reflects the current situation\.$/.exec(signal.detail);
    if (match) result.detail = text('The task is recorded as {status} with a due date of {date}. Check whether the record reflects the current situation.', { status: text(match[1]), date: timestamp(match[2], locale) });
  } else if (signal.kind === 'upcoming-activity') {
    const match = /^This activity is scheduled for (.{1,35})\.( Linked source excerpts are available for your preparation\.)?$/.exec(signal.detail);
    if (match) result.detail = `${text('This activity is scheduled for {date}.', { date: timestamp(match[1], locale) })}${match[2] ? ` ${text('Linked source excerpts are available for your preparation.')}` : ''}`;
  } else if (signal.kind === 'stale-opportunity') {
    const match = /^This opportunity remains in (.{1,40}); its record was last updated (\d+) days ago\. That does not establish whether activity occurred elsewhere\.$/.exec(signal.detail);
    if (match) result.detail = text('This opportunity remains in {status}; its record was last updated {count} days ago. That does not establish whether activity occurred elsewhere.', { status: text(match[1]), count: Number(match[2]).toLocaleString(locale) });
  } else if (signal.kind === 'open-ticket') {
    const match = /^The ticket is recorded as (.{1,40}?)\.(?: Its recorded due date is (.{1,35})\.)?$/.exec(signal.detail);
    if (match) result.detail = `${text('The ticket is recorded as {status}.', { status: text(match[1]) })}${match[2] ? ` ${text('Its recorded due date is {date}.', { date: timestamp(match[2], locale) })}` : ''}`;
  }
  return result;
}
