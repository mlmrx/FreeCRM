import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '..');
const readRepositoryFile = (path: string) => readFileSync(resolve(repositoryRoot, path), 'utf8');

describe('community contribution backlog', () => {
  it('publishes a milestone roadmap with live contribution entry points', () => {
    const roadmap = readRepositoryFile('ROADMAP.md');

    expect(roadmap).toContain('# FREE CRM community roadmap');
    expect(roadmap).toContain('0.2 — Private production');
    expect(roadmap).toContain('0.3 — Team CRM');
    expect(roadmap).toContain('0.4 — Agentic CRM');
    expect(roadmap).toContain('Future — Portable enterprise');
    expect(roadmap).toContain('Good first issues');
    expect(roadmap).toContain('Ideas open for community design');
    for (let issue = 11; issue <= 26; issue += 1) expect(roadmap).toContain(`https://github.com/mlmrx/FreeCRM/issues/${issue}`);
    for (let milestone = 1; milestone <= 4; milestone += 1) expect(roadmap).toContain(`https://github.com/mlmrx/FreeCRM/milestone/${milestone}`);
  });

  it('links the roadmap, starter work, and RFC ideas from repository guidance', () => {
    const readme = readRepositoryFile('README.md');
    const contributing = readRepositoryFile('CONTRIBUTING.md');

    expect(readme).toContain('[Community roadmap](ROADMAP.md)');
    expect(readme).toContain('label%3A%22good+first+issue%22');
    expect(readme).toContain('label%3Aidea');
    expect(contributing).toContain('[`ROADMAP.md`](ROADMAP.md)');
    expect(contributing).toContain('structured issue forms');
    expect(contributing).toContain('An idea issue is not implementation approval');
  });

  it('provides structured forms for bugs, features, ideas, and documentation', () => {
    const templateDirectory = resolve(repositoryRoot, '.github', 'ISSUE_TEMPLATE');
    const templates = readdirSync(templateDirectory).filter((name) => name.endsWith('.yml')).sort();

    expect(templates).toEqual(['bug.yml', 'config.yml', 'documentation.yml', 'feature.yml', 'idea.yml']);
    expect(readRepositoryFile('.github/ISSUE_TEMPLATE/bug.yml')).toContain('This is not a suspected security vulnerability.');
    expect(readRepositoryFile('.github/ISSUE_TEMPLATE/feature.yml')).toContain('Primary architecture boundary');
    expect(readRepositoryFile('.github/ISSUE_TEMPLATE/idea.yml')).toContain('Smallest safe experiment');
    expect(readRepositoryFile('.github/ISSUE_TEMPLATE/documentation.yml')).toContain('Examples contain no credentials');
    const config = readRepositoryFile('.github/ISSUE_TEMPLATE/config.yml');
    expect(config).toContain('blank_issues_enabled: false');
    expect(config).toContain('/security/advisories/new');
  });
});
