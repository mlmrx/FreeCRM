/** Shared contract for the tenant-owned second brain; no provider credentials reach the client. */
export type BrainSourceKind = 'note' | 'clip' | 'import';
export type BrainSourceSummary = {
  id: string; title: string; kind: BrainSourceKind; sourceUrl: string | null;
  tags: string[]; pinned: boolean; version: number; createdAt: string; updatedAt: string;
  excerpt: string; chunkCount: number; indexedChunks: number;
};
export type BrainSource = BrainSourceSummary & { body: string; recordIds: string[]; relatedSourceIds: string[] };
export type BrainPassage = {
  id: string; sourceId: string; title: string; text: string; ordinal: number;
  score?: number; embedding?: number[]; embeddingModel?: string;
};
export type BrainCitation = { id: string; sourceId: string; title: string; text: string; ordinal: number; version: number };
export type BrainMessage = {
  id: string; role: 'user' | 'assistant'; content: string; citations: BrainCitation[];
  mode: 'question' | 'ollama' | 'search'; createdAt: string;
};
export type BrainConversation = { id: string; title: string; createdAt: string; updatedAt: string };
export type BrainSnapshot = {
  workspaceName: string; canWrite: boolean; canManage: boolean; canExport: boolean;
  sources: BrainSourceSummary[];
  links: { sourceId: string; targetId: string; kind: 'source' | 'record' }[];
  records: { id: string; title: string; objectType: string }[];
  conversations: BrainConversation[];
  ai: { enabled: boolean; device: boolean; chatModel: string; embeddingModel: string; detail: string };
  limits: { sources: number; bodyCharacters: number; conversations: number; messagesPerConversation: number; sourceBytes: number; messageBytes: number };
};
export type BrainSaveInput = {
  id: string; expectedVersion?: number; title: string; body: string; kind: BrainSourceKind;
  sourceUrl?: string | null; tags: string[]; pinned: boolean; recordIds: string[]; relatedSourceIds: string[];
};
