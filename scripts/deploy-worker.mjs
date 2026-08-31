import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  assertR2Private,
  deploymentUrl,
  redactSensitiveText,
  scrubChildEnvironment,
  verifyUnauthenticatedDenied,
  workerExists,
} from './deploy-cloudflare.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const configPath = resolve(root, 'wrangler.jsonc');
const placeholder = '00000000-0000-4000-8000-000000000000';

function npmCommand(args, env, capture = false) {
  const npmCli = process.env.npm_execpath;
  const command = npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const commandArgs = npmCli ? [npmCli, ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    env,
    shell: false,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? 'pipe' : 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? redactSensitiveText(String(result.stderr || result.stdout || '')) : '';
    throw new Error(`${args.join(' ')} failed with exit code ${result.status ?? 1}.${detail ? ` ${detail.trim()}` : ''}`);
  }
  return { stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? '') };
}

const config = JSON.parse(await readFile(configPath, 'utf8'));
const databases = config.d1_databases ?? [];
const buckets = config.r2_buckets ?? [];
if (databases.length !== 1 || databases[0]?.binding !== 'DB' || buckets.length !== 1 || buckets[0]?.binding !== 'FILES') {
  throw new Error('Raw first install requires exactly one DB binding and one private FILES bucket binding.');
}
const database = databases[0];
const bucket = buckets[0];
if (!database.database_id || database.database_id === placeholder) {
  throw new Error('Refusing raw deployment with the provisioning placeholder D1 ID. Use npm run deploy:cloudflare, or let the Cloudflare Deploy button rewrite wrangler.jsonc with resources in your account.');
}
if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(database.database_id)) throw new Error('The DB binding does not contain a valid Cloudflare D1 database ID.');
if (config.vars?.FREE_CRM_AUTH_MODE !== 'locked'
  || Object.hasOwn(config.vars ?? {}, 'FREE_CRM_LOCAL_MODE')
  || Object.hasOwn(config.vars ?? {}, 'FREE_CRM_ACCESS_TEAM_DOMAIN')
  || Object.hasOwn(config.vars ?? {}, 'FREE_CRM_ACCESS_AUD')
  || Object.hasOwn(config.vars ?? {}, 'FREE_CRM_OWNER_EMAIL')) {
  throw new Error('The raw first-install config must be explicitly locked and must not contain local or Access identity values.');
}

const preflightEnv = scrubChildEnvironment(process.env, {
  deny: ['CLOUDFLARE_ACCOUNT_ID', 'FREE_CRM_OWNER_EMAIL'],
});
npmCommand(['run', 'security:secrets:history'], preflightEnv);
npmCommand(['run', 'check'], preflightEnv);
npmCommand(['audit', '--audit-level=moderate'], preflightEnv);

const deployEnv = scrubChildEnvironment(process.env, {
  allowSensitive: ['CLOUDFLARE_API_TOKEN'],
  deny: ['FREE_CRM_OWNER_EMAIL'],
});
if (await workerExists(config.name, deployEnv)) {
  throw new Error(`Worker ${config.name} already exists. Raw deployment is a protected first-install path and never upgrades an existing Worker.`);
}
await assertR2Private(bucket.bucket_name, deployEnv);

const inventory = npmCommand(['exec', 'wrangler', '--', 'd1', 'execute', 'DB', '--remote', '-c', 'wrangler.jsonc', '--json', '--command', "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"], deployEnv, true);
const inventoryPayload = JSON.parse(inventory.stdout);
const rows = (Array.isArray(inventoryPayload) ? inventoryPayload : [inventoryPayload]).flatMap((item) => item?.results ?? item?.result?.results ?? []);
const userTables = rows.map((row) => row.name).filter((name) => name !== 'd1_migrations');
if (userTables.length) throw new Error(`The provisioned D1 database is not empty (${userTables.join(', ')}). Use the guided adoption review; raw deployment made no migration or Worker change.`);
if (await workerExists(config.name, deployEnv)) throw new Error(`Worker ${config.name} appeared during preflight. No migration or deployment was attempted.`);

const deployed = npmCommand(['exec', 'wrangler', '--', 'deploy', '-c', 'wrangler.jsonc', '--keep-vars', '--strict'], deployEnv, true);
process.stdout.write(redactSensitiveText(deployed.stdout));
process.stderr.write(redactSensitiveText(deployed.stderr));
await verifyUnauthenticatedDenied(deploymentUrl(deployed.stdout), { phase: 'locked', required: true, teamDomain: null });

// The public Worker is proven sealed before the new empty database is migrated.
npmCommand(['run', 'db:cloud:migrate'], deployEnv);
process.stdout.write('FREE CRM protected first install completed in sealed mode. Configure exact-owner Cloudflare Access before adding CRM data.\n');
