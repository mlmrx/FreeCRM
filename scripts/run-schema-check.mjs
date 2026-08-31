import { spawnSync } from 'node:child_process';

const candidates = process.platform === 'win32'
  ? [['py', ['-3', 'scripts/verify-schema.py']], ['python', ['scripts/verify-schema.py']]]
  : [['python3', ['scripts/verify-schema.py']], ['python', ['scripts/verify-schema.py']]];

for (const [command, args] of candidates) {
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true });
  if (result.error?.code === 'ENOENT') continue;
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

console.error('Schema verification requires Python 3 (python3/python, or py -3 on Windows).');
process.exit(1);
