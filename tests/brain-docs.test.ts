import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BrainHelpPage from '@/app/brain/help/page';

function file(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('second brain public setup contract', () => {
  it('offers local capture before optional AI without requiring credentials', () => {
    const html = renderToStaticMarkup(BrainHelpPage());
    expect(html).toContain('href="/brain"');
    expect(html).toContain('href="#local-setup"');
    expect(html).toContain('npm run device');
    expect(html).toContain('OLLAMA_NO_CLOUD=1');
    expect(html).toContain('ollama pull gemma3:1b');
    expect(html).toContain('ollama pull embeddinggemma');
    expect(html).toContain('never pulls a model automatically');
    expect(html).not.toContain('OPENAI_API_KEY');
    expect(html).toContain('href="https://docs.ollama.com/quickstart"');
    expect(html).toContain('href="https://docs.ollama.com/docker"');
  });

  it('makes privacy boundaries, deletion consequences, and unfinished capabilities visible', () => {
    const html = renderToStaticMarkup(BrainHelpPage());
    for (const disclosure of [
      'URLs are not fetched automatically',
      'Models can make mistakes',
      'emergency stop',
      'permanently removes conversations citing it',
      'Editing its content removes those conversations too',
      'not a full recovery backup',
      'cannot reach a model on your laptop',
      'not included yet',
      '200 sources',
    ]) expect(html).toContain(disclosure);
    expect(html).toContain('SECOND-BRAIN.md');
    expect(html).not.toMatch(/<iframe|<form|<input|<script/);
  });

  it('keeps the Docker model service private and leaves model downloads deliberate', () => {
    const compose = file('compose.brain.yaml');
    expect(compose).toContain('OLLAMA_NO_CLOUD: "1"');
    expect(compose).toContain('free-crm-models:/root/.ollama');
    expect(compose).toContain('--var FREE_CRM_LOCAL_MODE:true');
    expect(compose).toContain('--var FREE_CRM_OLLAMA_URL:http://ollama:11434');
    expect(compose).toContain('--var FREE_CRM_OLLAMA_CHAT_MODEL:gemma3:1b');
    expect(compose).toContain('--var FREE_CRM_OLLAMA_EMBED_MODEL:embeddinggemma');
    expect(compose).not.toMatch(/^\s+ports:/m);
    expect(compose).not.toContain('ollama pull');
    expect(compose).not.toContain('OPENAI_API_KEY');
    expect(file('compose.yaml')).toContain('127.0.0.1:3477:3000');
    expect(file('compose.yaml')).toContain('free-crm-data:/app/.wrangler/state');
  });

  it('documents recovery independently of exports and never suggests exposing a local model', () => {
    const docs = file('docs/SECOND-BRAIN.md');
    expect(docs).toContain('stopped `.wrangler/state` copy');
    expect(docs).toContain('stopped volume snapshot');
    expect(docs).toContain('not a full-system');
    expect(docs).toContain('does not provide a JSON restore/import workflow');
    expect(docs).toContain('Saving a source revision also removes conversations citing it or using it');
    expect(docs).toContain('as retrieved context');
    expect(docs).toContain('Do not add a public tunnel');
    expect(docs).toContain('never in a public paste');
  });
});
