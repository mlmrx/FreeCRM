import type { AdaptivePack, AdaptiveProject } from './adaptive-types';

/** Reviewed, declarative local rules. Enabling a pack never downloads or executes vendor code. */
export type AdaptivePackDefinition = Omit<AdaptivePack, 'enabled' | 'previousVersion' | 'installedAt'>;
const sourceUrl = 'https://github.com/mlmrx/FreeCRM';

export const adaptivePackCatalog: AdaptivePackDefinition[] = [
  { id: 'commitment-review', version: '1.0.0', title: 'Commitment review', description: 'Review possible promises in saved sources, with the original passage beside each suggestion.', topics: ['relationships'], effects: ['Show possible commitments from explicit first-person future or promise language.', 'Offer a local follow-up for your review.'], permissions: ['Read sources already visible in this workspace'], sourceUrl },
  { id: 'relationship-radar', version: '1.0.0', title: 'Relationship radar', description: 'Prepare for activities in the next seven days using linked notes.', topics: ['relationships'], effects: ['Show upcoming activity reminders.', 'Include up to two linked source excerpts in the activity brief.'], permissions: ['Read workspace activities and their visible linked sources'], sourceUrl },
  { id: 'pipeline-watch', version: '1.0.0', title: 'Pipeline watch', description: 'Review open opportunities whose records have not changed for fourteen days.', topics: ['sales'], effects: ['Show opportunities with an open stage and no recorded update for fourteen days.'], permissions: ['Read workspace opportunity records'], sourceUrl },
  { id: 'service-watch', version: '1.0.0', title: 'Service watch', description: 'Keep open service tickets visible, with their recorded status and due date.', topics: ['service'], effects: ['Show new, open and waiting tickets, prioritizing recorded overdue dates.'], permissions: ['Read workspace ticket records'], sourceUrl },
  { id: 'knowledge-revisit', version: '1.0.0', title: 'Knowledge revisit', description: 'Bring back saved knowledge last updated at least fourteen days ago.', topics: ['knowledge'], effects: ['Show older sources for review, ranked against your chosen focus and goals.'], permissions: ['Read sources already visible in this workspace'], sourceUrl },
];

export const adaptiveDefaultPackIds = adaptivePackCatalog.map((pack) => pack.id);

/** Public, official project repositories verified against their GitHub pages. */
export const adaptiveProjects: AdaptiveProject[] = [
  { id: 'twenty', name: 'Twenty', repository: 'twentyhq/twenty', url: 'https://github.com/twentyhq/twenty' },
  { id: 'frappe-crm', name: 'Frappe CRM', repository: 'frappe/crm', url: 'https://github.com/frappe/crm' },
  { id: 'espocrm', name: 'EspoCRM', repository: 'espocrm/espocrm', url: 'https://github.com/espocrm/espocrm' },
];

/** Topic matches describe vendor wording, never compatibility or implemented feature parity. */
export function classifyAdaptiveRelease(text: string): { topics: AdaptivePack['topics']; suggestedPackIds: string[] } {
  const bounded = text.slice(0, 12_200).toLowerCase();
  const matches = [
    { topic: 'relationships' as const, pack: 'relationship-radar', pattern: /\b(contact|contacts|relationship|relationships|meeting|meetings|calendar)\b/ },
    { topic: 'sales' as const, pack: 'pipeline-watch', pattern: /\b(pipeline|opportunity|opportunities|deal|deals|sales)\b/ },
    { topic: 'service' as const, pack: 'service-watch', pattern: /\b(ticket|tickets|helpdesk|customer support|service case)\b/ },
    { topic: 'knowledge' as const, pack: 'knowledge-revisit', pattern: /\b(knowledge|notes|note taking|document|documents)\b/ },
  ].filter((match) => match.pattern.test(bounded));
  return { topics: matches.map((match) => match.topic), suggestedPackIds: matches.map((match) => match.pack) };
}

export function isAdaptiveReleaseUrl(value: string, projectId: string): boolean {
  const project = adaptiveProjects.find((item) => item.id === projectId);
  if (!project || typeof value !== 'string' || value.length > 1_000) return false;
  // Exact prefix rejects alternate hosts, credentials, ports, repo names and URL normalization tricks.
  const prefix = `${project.url}/releases/tag/`;
  if (!value.startsWith(prefix)) return false;
  const tag = value.slice(prefix.length);
  if (!tag || /[\s\\?#]/.test(tag) || /%(?:2f|5c|2e|00)/i.test(tag)) return false;
  try {
    const parsed = new URL(value);
    return parsed.href === value && parsed.origin === 'https://github.com' && !parsed.username && !parsed.password;
  } catch { return false; }
}
