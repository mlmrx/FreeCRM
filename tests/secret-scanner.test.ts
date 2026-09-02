import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const scanner = fileURLToPath(new URL('../scripts/scan-secrets.mjs', import.meta.url));
const temporaryRepositories: string[] = [];

function repository() {
  const root = mkdtempSync(join(tmpdir(), 'free-crm-secret-scan-'));
  temporaryRepositories.push(root);
  const initialized = spawnSync('git', ['init', '--quiet'], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (initialized.status !== 0) throw new Error(initialized.stderr || 'Unable to initialize secret-scanner fixture repository.');
  return root;
}

function runScanner(root: string) {
  return spawnSync(process.execPath, [scanner], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
}

afterEach(() => {
  for (const root of temporaryRepositories.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('secret scanner application credential coverage', () => {
  it('redacts and rejects every supported FREE CRM runtime credential outside env files', () => {
    const root = repository();
    const names = [
      ['AUTH', 'SECRET'],
      ['NEXTAUTH', 'SECRET'],
      ['AUTH', 'GITHUB', 'SECRET'],
      ['BLOB', 'READ', 'WRITE', 'TOKEN'],
      ['VERCEL', 'TOKEN'],
      ['FREE', 'CRM', 'D1', 'RPC', 'SECRET'],
      ['FREE', 'CRM', 'D1', 'ACCESS', 'CLIENT', 'ID'],
      ['FREE', 'CRM', 'D1', 'ACCESS', 'CLIENT', 'SECRET'],
      ['FREE', 'CRM', 'WEBHOOK', 'KEY'],
    ].map((parts) => parts.join('_'));
    const values = names.map((_, index) => ['production', 'credential', String(index), 'A'.repeat(32)].join('-'));
    writeFileSync(join(root, 'runtime-config.txt'), names.map((name, index) => `${name}=${values[index]}`).join('\n'), 'utf8');

    const result = runScanner(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Secret scan found ${names.length} potential credential issue(s).`);
    for (let index = 0; index < names.length; index += 1) {
      expect(result.stderr).toContain(`runtime-config.txt:${index + 1} [free-crm-runtime-credential]`);
      expect(result.stderr).not.toContain(values[index]);
    }
  });

  it('continues to permit documented placeholders', () => {
    const root = repository();
    const authName = ['AUTH', 'SECRET'].join('_');
    const blobName = ['BLOB', 'READ', 'WRITE', 'TOKEN'].join('_');
    writeFileSync(join(root, 'runtime-config.txt'), `${authName}=replace-me\n${blobName}=$${blobName}\n`, 'utf8');

    const result = runScanner(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Secret scan passed');
  });
});
