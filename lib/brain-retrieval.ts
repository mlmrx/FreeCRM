import type { BrainPassage } from '@/lib/brain-types';

export type { BrainPassage } from '@/lib/brain-types';

const STOP_WORDS = new Set('a about an and are as at be been but by can could did do does for from had has have how i in is it its me my of on or our should that the their them there these they this to was we were what when where which who why will with would you your'.split(' '));

function tokens(text: string): string[] {
  return (text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((token) => token.length > 1 && token.length <= 80 && !STOP_WORDS.has(token));
}

/** Bounded, overlapping text windows. The original note is stored separately, never replaced by chunks. */
export function chunkText(text: string, maxChars = 1600, overlap = 200): string[] {
  if (typeof text !== 'string' || text.length > 40_000) throw new Error('A knowledge source can contain at most 40,000 characters.');
  if (!Number.isInteger(maxChars) || maxChars < 256 || maxChars > 4000
    || !Number.isInteger(overlap) || overlap < 0 || overlap > maxChars / 3) {
    throw new Error('Invalid passage window size.');
  }
  const body = text.replace(/\r\n?/g, '\n').trim();
  const result: string[] = [];
  let start = 0;
  while (start < body.length) {
    let end = Math.min(body.length, start + maxChars);
    if (end < body.length) {
      // Prefer a nearby word boundary without creating many tiny chunks or splitting a surrogate pair.
      const boundary = body.slice(Math.max(start, end - 32), end).search(/\s\S*$/u);
      if (boundary >= 0) end = Math.max(start, end - 32) + boundary + 1;
      if (/^[\uDC00-\uDFFF]$/u.test(body[end]) && /^[\uD800-\uDBFF]$/u.test(body[end - 1])) end -= 1;
    }
    const chunk = body.slice(start, end).trim();
    if (chunk) result.push(chunk);
    if (end === body.length) break;
    start = end - overlap;
    if (/^[\uDC00-\uDFFF]$/u.test(body[start]) && /^[\uD800-\uDBFF]$/u.test(body[start - 1])) start += 1;
  }
  return result;
}

function checkedLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Search limit must be between 1 and 50.');
  return limit;
}

/** A deterministic BM25-style ranking that stays useful with no model, API key or vector index. */
export function keywordSearch(query: string, passages: BrainPassage[], limit = 8): BrainPassage[] {
  checkedLimit(limit);
  if (query.length > 2000 || passages.length > 10_000) throw new Error('Search input exceeds the local retrieval limit.');
  const terms = [...new Set(tokens(query))];
  if (!terms.length || !passages.length) return [];
  const documents = passages.map((passage) => {
    const counts = new Map<string, number>();
    const bodyTerms = tokens(passage.text);
    for (const token of bodyTerms) counts.set(token, (counts.get(token) ?? 0) + 1);
    for (const token of tokens(passage.title)) counts.set(token, (counts.get(token) ?? 0) + 3);
    return { passage, counts, length: Math.max(1, bodyTerms.length) };
  });
  const averageLength = documents.reduce((total, doc) => total + doc.length, 0) / documents.length;
  const frequencies = new Map(terms.map((term) => [term, documents.filter((doc) => doc.counts.has(term)).length]));
  return documents.map(({ passage, counts, length }) => {
    let score = 0;
    for (const term of terms) {
      const frequency = counts.get(term) ?? 0;
      if (!frequency) continue;
      const documentsWithTerm = frequencies.get(term) ?? 0;
      const inverseFrequency = Math.log(1 + (documents.length - documentsWithTerm + 0.5) / (documentsWithTerm + 0.5));
      score += inverseFrequency * (frequency * 2.2) / (frequency + 1.2 * (0.25 + 0.75 * length / averageLength));
    }
    return { ...passage, score };
  }).filter((passage) => passage.score > 0)
    .sort((a, b) => b.score - a.score || a.sourceId.localeCompare(b.sourceId) || a.ordinal - b.ordinal || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/** Invalid, zero-length or incompatible vectors cannot become a positive semantic match. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length || a.length > 8192
    || !a.every(Number.isFinite) || !b.every(Number.isFinite)) return 0;
  const scaleA = Math.max(...a.map(Math.abs));
  const scaleB = Math.max(...b.map(Math.abs));
  if (!scaleA || !scaleB) return 0;
  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const valueA = a[index] / scaleA;
    const valueB = b[index] / scaleB;
    dot += valueA * valueB;
    magnitudeA += valueA * valueA;
    magnitudeB += valueB * valueB;
  }
  return Math.max(-1, Math.min(1, dot / Math.sqrt(magnitudeA * magnitudeB)));
}

/** Reciprocal-rank fusion; never mixes vector spaces from different embedding models. */
export function hybridSearch(query: string, passages: BrainPassage[], queryEmbedding?: number[], embeddingModel?: string, limit = 8): BrainPassage[] {
  checkedLimit(limit);
  const lexical = keywordSearch(query, passages, 50);
  if (!queryEmbedding?.length || !embeddingModel) return lexical.slice(0, limit);
  const semantic = passages.filter((passage) => passage.embeddingModel === embeddingModel && passage.embedding)
    .map((passage) => ({ ...passage, score: cosineSimilarity(queryEmbedding, passage.embedding!) }))
    .filter((passage) => passage.score >= 0.3)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 50);
  if (!semantic.length) return lexical.slice(0, limit);
  const fused = new Map<string, BrainPassage & { score: number }>();
  for (const ranking of [lexical, semantic]) {
    ranking.forEach((passage, index) => {
      const existing = fused.get(passage.id);
      fused.set(passage.id, { ...passage, score: (existing?.score ?? 0) + 1 / (60 + index + 1) });
    });
  }
  return [...fused.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
}
