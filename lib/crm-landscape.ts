export type CrmLandscapeCategory = {
  id: 'lists' | 'records' | 'cloud' | 'enterprise' | 'ai';
  number: string;
  category: string;
  familiar: string;
  difference: string;
};

/**
 * Category-level positioning helps people map FREE CRM to the tools they know
 * without turning the product story into a vendor-by-vendor scorecard.
 */
export const crmLandscape: readonly CrmLandscapeCategory[] = [
  {
    id: 'lists',
    number: '01',
    category: 'Contact lists & spreadsheets',
    familiar: 'Rows, filters, imports, and a quick way to find someone.',
    difference: 'People connect to conversations, promises, work, money, and source notes—not another isolated row.',
  },
  {
    id: 'records',
    number: '02',
    category: 'Record-first CRM',
    familiar: 'Contacts, pipeline, activities, service, and reports.',
    difference: 'The relationship and the work around it share one graph, one timeline, and one portable workspace.',
  },
  {
    id: 'cloud',
    number: '03',
    category: 'Cloud-first CRM',
    familiar: 'Browser access, mobile layouts, connected workflows, and managed infrastructure.',
    difference: 'Run locally or bring your own cloud, identity, database, files, and credentials. Export remains part of the product.',
  },
  {
    id: 'enterprise',
    number: '04',
    category: 'Enterprise CRM suites',
    familiar: 'Profiles, audit history, policy boundaries, and larger operating models.',
    difference: 'Those foundations stay in the same inspectable codebase. The current release is candidly single-owner while enterprise controls remain on the roadmap.',
  },
  {
    id: 'ai',
    number: '05',
    category: 'AI-first CRM tools',
    familiar: 'Suggestions, summaries, automation, and assisted next steps.',
    difference: 'Evidence comes first. Actions face approval, scope, budget, receipts, replay protection, and an emergency stop.',
  },
] as const;
