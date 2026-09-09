import { describe, expect, it } from 'vitest';
import { chunkText, cosineSimilarity, hybridSearch, keywordSearch, type BrainPassage } from '@/lib/brain-retrieval';

function passage(id: string, text: string, title = 'Working note', extra: Partial<BrainPassage> = {}): BrainPassage {
  return { id, sourceId: id, title, text, ordinal: 0, ...extra };
}

describe('second-brain text windows', () => {
  it('keeps short notes intact, normalizes line endings, and ignores empty whitespace', () => {
    expect(chunkText('  First line\r\nSecond line\rThird line  ')).toEqual(['First line\nSecond line\nThird line']);
    expect(chunkText(' \n\t ')).toEqual([]);
  });

  it('retains every word across bounded overlapping windows, including final text', () => {
    const words = Array.from({ length: 4500 }, (_, index) => `word${index}`);
    const text = words.join(' ');
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThanOrEqual(30);
    expect(chunks.every((chunk) => chunk.length <= 1600)).toBe(true);
    for (const word of words) expect(chunks.some((chunk) => chunk.includes(word))).toBe(true);
    expect(chunks.at(-1)).toContain(words.at(-1));
  });

  it('does not split surrogate pairs or lose the last character', () => {
    const text = '🦅'.repeat(20_000);
    const chunks = chunkText(text);
    expect(chunks.length).toBeLessThanOrEqual(30);
    expect(chunks.every((chunk) => chunk.length <= 1600 && /^\u{1f985}+$/u.test(chunk))).toBe(true);
  });

  it('supports no overlap and never silently truncates oversize sources', () => {
    const text = 'x'.repeat(4000);
    expect(chunkText(text, 1000, 0).join('')).toBe(text);
    expect(() => chunkText('x'.repeat(40_001))).toThrow('40,000');
  });

  it.each([[0, 0], [5000, 100], [1600, -1], [1600, 1600], [900.5, 100], [1600, 2.5]])('rejects invalid window %s / overlap %s', (size, overlap) => {
    expect(() => chunkText('hello', size, overlap)).toThrow('Invalid');
  });
});

describe('no-key lexical retrieval', () => {
  const notes = [
    passage('garden', 'Planted carrots in the garden.'),
    passage('launch', 'Review the launch checklist with Mila on Friday.', 'Launch plan'),
    passage('launch-details', 'A note about the launch and a list of supplies to remember. '.repeat(40)),
  ];

  it('ranks concise matching titles and returns only matching source passages', () => {
    expect(keywordSearch('What is the launch plan?', notes).map((item) => item.id)).toEqual(['launch', 'launch-details']);
    expect(keywordSearch('carrots', notes).map((item) => item.id)).toEqual(['garden']);
    expect(keywordSearch('unrelated astronomy', notes)).toEqual([]);
  });

  it('matches case, Unicode text and diacritics without interpolating a search query into SQL', () => {
    const data = [passage('cafe', 'Renée will meet at the café.'), passage('ja', '東京 会議 金曜日')];
    expect(keywordSearch('RENEE cafe', data)[0].id).toBe('cafe');
    expect(keywordSearch('東京', data)[0].id).toBe('ja');
    expect(keywordSearch("'; DROP TABLE knowledge; --", data)).toEqual([]);
  });

  it('supports contextual follow-up queries provided by the caller without fabricating missing matches', () => {
    expect(keywordSearch('What about it?', notes)).toEqual([]);
    expect(keywordSearch('launch plan What about Friday?', notes)[0].id).toBe('launch');
  });

  it('has deterministic tie ordering, respects limits, and does not mutate stored passages', () => {
    const data = [passage('b', 'shared term'), passage('a', 'shared term')];
    expect(keywordSearch('term', data, 1).map((item) => item.id)).toEqual(['a']);
    expect(data[0].score).toBeUndefined();
    expect(keywordSearch('', data)).toEqual([]);
    expect(keywordSearch('the and of', data)).toEqual([]);
    expect(keywordSearch('term', [])).toEqual([]);
  });

  it('bounds query length, candidate count and result limits', () => {
    expect(() => keywordSearch('x'.repeat(2001), notes)).toThrow('limit');
    expect(() => keywordSearch('term', Array.from({ length: 10001 }, () => notes[0]))).toThrow('limit');
    for (const limit of [0, -1, 51, 1.5, Number.NaN]) expect(() => keywordSearch('term', notes, limit)).toThrow('limit');
  });
});

describe('local semantic retrieval', () => {
  it('computes stable similarities, including very large and small finite vectors', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBe(-1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1e300, 1e300], [1e-300, 1e-300])).toBeCloseTo(1);
  });

  it.each([
    [[], []], [[0, 0], [1, 2]], [[1], [1, 2]], [[Number.NaN], [1]], [[Infinity], [1]],
    [Array.from({ length: 8193 }, () => 1), Array.from({ length: 8193 }, () => 1)],
  ])('treats malformed or incompatible vectors as no match', (a, b) => {
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('fuses matching vector spaces and lexical rankings, retaining both sources of evidence', () => {
    const data = [
      passage('both', 'renewal meeting', 'Work', { embedding: [1, 0], embeddingModel: 'embed:1' }),
      passage('semantic', 'Annual account discussion', 'Work', { embedding: [0.9, 0.1], embeddingModel: 'embed:1' }),
      passage('lexical', 'renewal meeting', 'Work'),
      passage('wrong-model', 'Unrelated text', 'Work', { embedding: [1, 0], embeddingModel: 'embed:2' }),
      passage('opposite', 'Different subject', 'Work', { embedding: [-1, 0], embeddingModel: 'embed:1' }),
    ];
    const result = hybridSearch('renewal', data, [1, 0], 'embed:1');
    expect(result[0].id).toBe('both');
    expect(result.map((item) => item.id).sort()).toEqual(['both', 'lexical', 'semantic']);
    expect(data[0].score).toBeUndefined();
    expect(hybridSearch('renewal', data, [1, 0], 'embed:1', 1)).toHaveLength(1);
  });

  it('falls back to keyword results for absent, invalid or stale embedding spaces', () => {
    const data = [passage('match', 'renewal', 'Work', { embedding: [1, 0], embeddingModel: 'old' })];
    const expected = keywordSearch('renewal', data);
    expect(hybridSearch('renewal', data)).toEqual(expected);
    expect(hybridSearch('renewal', data, [1, 0])).toEqual(expected);
    expect(hybridSearch('renewal', data, [1, 0], 'new')).toEqual(expected);
    expect(hybridSearch('renewal', data, [Number.NaN, 0], 'old')).toEqual(expected);
  });
});
