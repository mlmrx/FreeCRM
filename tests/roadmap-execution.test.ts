import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const roadmap = readFileSync(new URL('../ROADMAP.md', import.meta.url), 'utf8');
const ledger = readFileSync(new URL('../docs/ROADMAP-EXECUTION.md', import.meta.url), 'utf8');

describe('complete accepted-roadmap accounting', () => {
  it('tracks every accepted issue exactly once without silently treating RFCs as approved', () => {
    const accepted = [...new Set([...roadmap.split('## Ideas open for community design')[0].matchAll(/https:\/\/github\.com\/mlmrx\/FreeCRM\/issues\/(\d+)/g)].map((match) => Number(match[1])))].sort((a, b) => a - b);
    const tracked = [...ledger.matchAll(/^\| \[#(\d+)\]/gm)].map((match) => Number(match[1]));
    expect(tracked.sort((a, b) => a - b)).toEqual(accepted);
    expect(tracked).not.toContain(25);
    expect(tracked).not.toContain(26);
    expect(ledger).toContain('remain RFC');
  });

  it('retains language, recovery, external-service, and deployment gates', () => {
    expect(roadmap).toContain('docs/ROADMAP-EXECUTION.md');
    for (const boundary of ['Platform-wide languages', '53 non-English catalogs', 'JSON export is not a recovery backup', 'real disposable', 'external execution disabled', 'production migrations', 'merge and deployment verification']) expect(ledger).toContain(boundary);
  });

  it('refuses roadmap mutation tests without disposable-state acknowledgement or on a remote origin', () => {
    const script = fileURLToPath(new URL('../scripts/smoke-roadmap.mjs', import.meta.url));
    const run = (acknowledgement: string, base: string) => spawnSync(process.execPath, [script], {
      env: { ...process.env, FREE_CRM_ROADMAP_QA: acknowledgement, FREE_CRM_BASE_URL: base }, encoding: 'utf8', windowsHide: true,
    });
    const missing = run('', 'http://127.0.0.1:3591');
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain('isolated test Worker');
    const remote = run('synthetic-disposable', 'https://www.freecrm.dev');
    expect(remote.status).not.toBe(0);
    expect(remote.stderr).toContain('literal-loopback origin');
  });
});
