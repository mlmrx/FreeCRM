import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SAFE_REPOSITORY = process.cwd().replaceAll('\\', '/');

function git(args, options = {}) {
  return execFileSync('git', ['-c', `safe.directory=${SAFE_REPOSITORY}`, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
}

export function parseNameStatus(output) {
  return output.split(/\r?\n/).filter(Boolean).map((line) => {
    const [status, ...paths] = line.split('\t');
    return { status, paths };
  });
}

export function modifiedMergedMigrations(entries) {
  return entries.filter(({ status, paths }) => {
    const code = status[0];
    return code !== 'A' && paths.some((path) => /^drizzle\/\d+.*\.sql$/.test(path));
  });
}

export function schemaChangeNeedsMigration(changedPaths, migrationEntries) {
  return changedPaths.includes('db/schema.ts') && !migrationEntries.some(({ status, paths }) => status[0] === 'A' && paths.some((path) => /^drizzle\/\d+.*\.sql$/.test(path)));
}

export function main() {
  const base = process.argv[2] || process.env.FREE_CRM_PR_BASE || 'origin/main';
  try {
    git(['rev-parse', '--verify', `${base}^{commit}`]);
  } catch {
    console.error(`PR base guard: ${base} is unavailable. Run \`git fetch origin main\` and retry.`);
    process.exit(2);
  }

  try {
    git(['merge-base', '--is-ancestor', base, 'HEAD']);
  } catch {
    const mergeBase = git(['merge-base', base, 'HEAD']);
    console.error(`PR base guard: HEAD is stale. Its common ancestor with ${base} is ${mergeBase.slice(0, 12)}.`);
    console.error(`Create a clean branch from ${base} and apply only the new incremental changes; do not resubmit already-merged work.`);
    process.exit(1);
  }

  const entries = parseNameStatus(git(['diff', '--name-status', '--find-renames', `${base}...HEAD`, '--', 'drizzle/*.sql']));
  const forbidden = modifiedMergedMigrations(entries);
  if (forbidden.length) {
    console.error('PR base guard: an existing migration was modified or removed:');
    for (const entry of forbidden) console.error(`  ${entry.status}\t${entry.paths.join('\t')}`);
    console.error('Merged migrations are immutable. Add the next numbered forward-only migration instead.');
    process.exit(1);
  }

  const changedPaths = git(['diff', '--name-only', `${base}...HEAD`]).split(/\r?\n/).filter(Boolean);
  if (schemaChangeNeedsMigration(changedPaths, entries)) {
    console.error('PR base guard: db/schema.ts changed without a new forward-only Drizzle migration.');
    process.exit(1);
  }

  const ahead = Number(git(['rev-list', '--count', `${base}..HEAD`]) || 0);
  console.log(`PR base guard passed: ${base} is an ancestor, ${ahead} incremental commit(s), and merged migrations are unchanged.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
