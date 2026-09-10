/** Private workspace adaptation contract. Observations never include note or message text. */
export const adaptiveTopics = ['relationships', 'sales', 'service', 'knowledge'] as const;
export type AdaptiveTopic = typeof adaptiveTopics[number];
export type AdaptiveSettings = {
  revision: number; learningEnabled: boolean; autoAdapt: boolean; paused: boolean;
  goals: string; focus: AdaptiveTopic | 'balanced'; followUpDays: number; followUpPinned: boolean;
  digestSize: number; watchEnabled: boolean; watchProjects: string[];
  lastScanAt: string | null; lastScanError: string | null; updatedAt: string;
};
export type AdaptiveEvidence = { kind: 'source' | 'record' | 'release'; id: string; title: string; excerpt: string; url: string; version: number; observedAt: string };
export type AdaptiveSignal = {
  id: string; kind: 'commitment' | 'overdue-task' | 'upcoming-activity' | 'stale-opportunity' | 'open-ticket' | 'knowledge-revisit' | 'release';
  topic: AdaptiveTopic; title: string; detail: string; why: string; certainty: 'recorded' | 'possible' | 'vendor-announcement';
  score: number; evidence: AdaptiveEvidence[]; fingerprint: string; dueAt: string | null;
  state: 'new' | 'useful' | 'dismissed' | 'snoozed' | 'actioned'; snoozedUntil: string | null;
  suggestedTask: { title: string; dueAt: string | null } | null;
};
export type AdaptiveObservation = { id: string; signalId: string; topic: AdaptiveTopic; outcome: 'useful' | 'dismissed' | 'follow-up'; followUpDays: number | null; observedAt: string };
export type AdaptiveLearning = {
  topic: AdaptiveTopic; useful: number; dismissed: number; weight: number; status: 'learning' | 'suggested' | 'applied'; explanation: string;
};
export type AdaptivePack = { id: string; version: string; title: string; description: string; topics: AdaptiveTopic[]; effects: string[]; permissions: string[]; sourceUrl: string; enabled: boolean; previousVersion: string | null; installedAt: string | null };
export type AdaptiveProject = { id: string; name: string; repository: string; url: string };
export type AdaptiveRelease = { id: string; projectId: string; title: string; version: string; body: string; url: string; publishedAt: string; fetchedAt: string; topics: AdaptiveTopic[]; suggestedPackIds: string[] };
export type AdaptiveProposal = { id: string; releaseId: string; title: string; problem: string; status: 'proposed' | 'dismissed'; createdAt: string };
export type AdaptiveSnapshot = {
  workspaceName: string; timezone: string; canWrite: boolean; canManage: boolean; canExport: boolean; device: boolean; localAiEnabled: boolean;
  settings: AdaptiveSettings; signals: AdaptiveSignal[]; learning: AdaptiveLearning[];
  effectiveFollowUpDays: number; followUpExplanation: string; observationCount: number;
  packs: AdaptivePack[]; projects: AdaptiveProject[]; releases: AdaptiveRelease[]; proposals: AdaptiveProposal[];
  refresh: { generatedAt: string; nextScanAt: string | null; scanStatus: 'off' | 'ready' | 'waiting' | 'paused' };
  metrics: { useful: number; dismissed: number; followUps: number; activeSignals: number };
};
export type AdaptiveInputRecord = { id: string; objectType: string; name: string; status: string; dueAt: string | null; updatedAt: string; version: number; fields: Record<string, unknown>; amountCents: number };
export type AdaptiveInputSource = { id: string; title: string; body: string; updatedAt: string; version: number; recordIds: string[] };
export type AdaptiveFeedback = { signalId: string; state: AdaptiveSignal['state']; snoozedUntil: string | null; fingerprint: string };
export type AdaptiveAnswer = { answer: string; citations: AdaptiveEvidence[]; mode: 'local-ai' | 'guide' };
