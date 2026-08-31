import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const auditOutput = await mkdtemp(resolve(tmpdir(), 'free-crm-drizzle-drift-'));

async function treeHashes(directory, base = directory) {
  const result = new Map();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [name, hash] of await treeHashes(path, base)) result.set(name, hash);
    } else if (entry.isFile()) {
      const name = relative(base, path).replaceAll('\\', '/');
      const hash = createHash('sha256').update(await readFile(path)).digest('hex');
      result.set(name, hash);
    }
  }
  return result;
}

try {
  await cp(resolve(root, 'drizzle'), auditOutput, { recursive: true });
  const before = await treeHashes(auditOutput);
  const relativeOutput = relative(root, auditOutput).replaceAll('\\', '/');
  const result = spawnSync(process.execPath, [
    resolve(root, 'node_modules/drizzle-kit/bin.cjs'),
    'generate',
    '--schema=db/schema.ts',
    '--dialect=sqlite',
    `--out=${relativeOutput}`,
    '--name=drift_probe',
  ], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || 'Drizzle drift probe failed.\n');
    process.exitCode = result.status ?? 1;
  } else {
    const after = await treeHashes(auditOutput);
    const changed = [...new Set([...before.keys(), ...after.keys()])]
      .filter((name) => before.get(name) !== after.get(name))
      .sort();
    if (changed.length) {
      process.stderr.write(`Drizzle metadata is stale; schema generation changed ${changed.join(', ')}. Add a reviewed migration and matching snapshot before continuing.\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write('Drizzle schema and migration metadata are synchronized; future generation is empty.\n');
    }
  }
} finally {
  await rm(auditOutput, { recursive: true, force: true });
}
