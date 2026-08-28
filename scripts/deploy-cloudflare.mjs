import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const userConfigPath = fileURLToPath(new URL('../wrangler.user.jsonc', import.meta.url));
const installationStatePath = fileURLToPath(new URL('../wrangler.user.state.json', import.meta.url));
const placeholderDatabaseId = '00000000-0000-4000-8000-000000000000';
const installationProduct = 'free-crm';
const installationStateVersion = 1;

function log(message = '') {
  process.stdout.write(`${message}\n`);
}

function validateResourceName(value, label) {
  const normalized = value.trim();
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(normalized) || normalized.endsWith('-')) {
    throw new Error(`${label} must start with a lowercase letter and contain only lowercase letters, numbers, and interior hyphens (maximum 63 characters).`);
  }
  return normalized;
}

function validateAccountId(value) {
  const normalized = value.trim();
  if (!/^[a-f0-9]{32}$/i.test(normalized)) throw new Error('CLOUDFLARE_ACCOUNT_ID must be a 32-character account ID.');
  return normalized;
}

function validateOwnerEmail(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('FREE_CRM_OWNER_EMAIL must be one complete email address.');
  return normalized;
}

function runProcess(command, args, { capture = false, env = process.env, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      shell: false,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
    }
    child.on('error', reject);
    child.on('close', (code) => {
      const result = { code: code ?? 1, stdout, stderr };
      if (result.code === 0 || allowFailure) resolve(result);
      else reject(new Error((stderr || stdout || `${command} exited with ${result.code}`).trim()));
    });
  });
}

function runWrangler(args, options = {}) {
  return runProcess(process.execPath, [wrangler, ...args], options);
}

function runNpm(args, { env = process.env } = {}) {
  const npmCli = process.env.npm_execpath;
  if (npmCli) return runProcess(process.execPath, [npmCli, ...args], { env });
  return runProcess(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { env });
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} did not return valid JSON.`);
  }
}

function enabledFlag(name) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return false;
  if (value !== 'true') throw new Error(`${name} must be exactly true when enabled.`);
  return true;
}

function resourceId(database) {
  return database?.uuid ?? database?.id ?? database?.database_id ?? null;
}

function assertInstallationMatches(installation, expected, label = 'installation provenance') {
  const fields = ['accountId', 'workerName', 'databaseName', 'bucketName'];
  if (installation?.product !== installationProduct || fields.some((field) => installation[field] !== expected[field])) {
    throw new Error(`${label} belongs to a different installation. Choose new resource names; no existing resource was changed.`);
  }
}

async function loadInstallationState() {
  try {
    const state = parseJson(await readFile(installationStatePath, 'utf8'), 'wrangler.user.state.json');
    if (state.version !== installationStateVersion || state.product !== installationProduct || typeof state.owns !== 'object') {
      throw new Error('wrangler.user.state.json has an unsupported format. Move it aside and rerun with explicit resource names.');
    }
    return state;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function saveInstallationState(state) {
  await writeFile(installationStatePath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function d1Rows(payload) {
  const envelopes = Array.isArray(payload) ? payload : [payload];
  return envelopes.flatMap((entry) => {
    if (Array.isArray(entry?.results)) return entry.results;
    if (Array.isArray(entry?.result)) return entry.result.flatMap((result) => Array.isArray(result?.results) ? result.results : []);
    return [];
  });
}

async function queryD1(databaseName, sql, cloudflareEnv) {
  const result = await runWrangler(['d1', 'execute', databaseName, '--remote', '--command', sql, '--json'], { capture: true, env: cloudflareEnv });
  return d1Rows(parseJson(result.stdout, `wrangler d1 execute ${databaseName}`));
}

function markerFor(settings) {
  return {
    product: installationProduct,
    accountId: settings.accountId,
    workerName: settings.workerName,
    databaseName: settings.databaseName,
    bucketName: settings.bucketName,
  };
}

async function readRemoteInstallation(databaseName, cloudflareEnv) {
  const tables = await queryD1(databaseName, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_free_crm_installation'", cloudflareEnv);
  if (!tables.length) return null;
  const rows = await queryD1(databaseName, "SELECT product, account_id, worker_name, database_name, bucket_name FROM _free_crm_installation WHERE id = 'primary' LIMIT 1", cloudflareEnv);
  if (!rows.length) return null;
  const row = rows[0];
  return {
    product: row.product,
    accountId: row.account_id,
    workerName: row.worker_name,
    databaseName: row.database_name,
    bucketName: row.bucket_name,
  };
}

async function assertD1Adoptable(databaseName, cloudflareEnv) {
  const rows = await queryD1(databaseName, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT IN ('d1_migrations', '_free_crm_installation') ORDER BY name", cloudflareEnv);
  const tables = new Set(rows.map((row) => row.name).filter((name) => typeof name === 'string'));
  if (tables.size === 0) return;
  const required = ['audit_events', 'memberships', 'records', 'workspaces'];
  if (!required.every((name) => tables.has(name))) {
    throw new Error(`D1 database ${databaseName} contains a schema that is not recognizably FREE CRM. Choose another name; no migration was applied.`);
  }
}

async function writeRemoteInstallation(settings, cloudflareEnv) {
  const existing = await readRemoteInstallation(settings.databaseName, cloudflareEnv);
  if (existing) {
    assertInstallationMatches(existing, markerFor(settings), 'remote D1 installation marker');
    return;
  }
  const createdAt = new Date().toISOString().replaceAll("'", "''");
  const sql = `CREATE TABLE IF NOT EXISTS _free_crm_installation (
    id TEXT PRIMARY KEY CHECK (id = 'primary'),
    product TEXT NOT NULL,
    account_id TEXT NOT NULL,
    worker_name TEXT NOT NULL,
    database_name TEXT NOT NULL,
    bucket_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  ); INSERT INTO _free_crm_installation (id, product, account_id, worker_name, database_name, bucket_name, created_at)
  VALUES ('primary', '${installationProduct}', '${settings.accountId}', '${settings.workerName}', '${settings.databaseName}', '${settings.bucketName}', '${createdAt}');`;
  await queryD1(settings.databaseName, sql, cloudflareEnv);
  const written = await readRemoteInstallation(settings.databaseName, cloudflareEnv);
  assertInstallationMatches(written, markerFor(settings), 'remote D1 installation marker');
}

function accountsFromWhoami(payload) {
  const candidates = [payload.accounts, payload.account, payload.memberships, payload.result?.accounts];
  const source = candidates.find(Array.isArray) ?? [];
  return source.map((item) => ({ id: item.id ?? item.account_id, name: item.name ?? item.account_name })).filter((item) => item.id);
}

async function resolveAccountId() {
  const explicit = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const whoami = await runWrangler(['whoami', '--json'], { capture: true });
  const payload = parseJson(whoami.stdout, 'wrangler whoami');
  if (explicit) return validateAccountId(explicit);
  const accounts = accountsFromWhoami(payload);
  if (accounts.length === 1) return validateAccountId(accounts[0].id);
  throw new Error('Set CLOUDFLARE_ACCOUNT_ID because this login has access to more than one Cloudflare account.');
}

async function findD1(databaseName, cloudflareEnv) {
  const response = await runWrangler(['d1', 'list', '--json'], { capture: true, env: cloudflareEnv });
  const payload = parseJson(response.stdout, 'wrangler d1 list');
  return (Array.isArray(payload) ? payload : payload.result ?? []).find((database) => database.name === databaseName || database.database_name === databaseName) ?? null;
}

async function r2Info(bucketName, cloudflareEnv) {
  const result = await runWrangler(['r2', 'bucket', 'info', bucketName, '--json'], { capture: true, allowFailure: true, env: cloudflareEnv });
  if (result.code === 0) return { exists: true, result };
  const message = `${result.stderr}\n${result.stdout}`;
  if (/not found|does not exist|10006|No such/i.test(message)) return { exists: false, result };
  throw new Error(message.trim());
}

async function workerExists(workerName, cloudflareEnv) {
  const result = await runWrangler(['deployments', 'list', '--name', workerName, '--json'], { capture: true, allowFailure: true, env: cloudflareEnv });
  if (result.code === 0) {
    const payload = parseJson(result.stdout, `wrangler deployments list ${workerName}`);
    return (Array.isArray(payload) ? payload : payload.result ?? []).length > 0;
  }
  const message = `${result.stderr}\n${result.stdout}`;
  if (/not found|does not exist|10090|could not find/i.test(message)) return false;
  throw new Error(message.trim());
}

async function assertR2Private(bucketName, cloudflareEnv) {
  const [devUrl, domains] = await Promise.all([
    runWrangler(['r2', 'bucket', 'dev-url', 'get', bucketName], { capture: true, env: cloudflareEnv }),
    runWrangler(['r2', 'bucket', 'domain', 'list', bucketName], { capture: true, env: cloudflareEnv }),
  ]);
  if (!/Public access via the r2\.dev URL is disabled\./i.test(`${devUrl.stdout}\n${devUrl.stderr}`)) {
    throw new Error(`R2 bucket ${bucketName} has a public r2.dev URL. Disable it before deployment.`);
  }
  if (!/There are no custom domains connected to this bucket\./i.test(`${domains.stdout}\n${domains.stderr}`)) {
    throw new Error(`R2 bucket ${bucketName} has a public custom domain. Remove it before deployment.`);
  }
}

async function ensureD1(databaseName, cloudflareEnv, state, allowAdoption) {
  let database = await findD1(databaseName, cloudflareEnv);
  if (database) {
    const id = resourceId(database);
    if (state.databaseId && state.databaseId !== id) throw new Error(`D1 database ${databaseName} no longer matches the recorded installation ID.`);
    if (!state.owns.d1) {
      if (!allowAdoption) throw new Error(`D1 database ${databaseName} appeared after the provenance check. Rerun with FREE_CRM_ADOPT_EXISTING=true only if you own it.`);
      await assertD1Adoptable(databaseName, cloudflareEnv);
    }
    state.databaseId = id;
    state.owns.d1 = true;
    await saveInstallationState(state);
    log(`Reusing provenance-verified D1 database ${databaseName}.`);
  } else {
    if (state.owns.d1) throw new Error(`Recorded D1 database ${databaseName} is missing. Restore it or choose a new installation; no replacement was created.`);
    log(`Creating D1 database ${databaseName}…`);
    const created = await runWrangler(['d1', 'create', databaseName], { capture: true, allowFailure: true, env: cloudflareEnv });
    database = await findD1(databaseName, cloudflareEnv);
    if (created.code !== 0) {
      if (database && allowAdoption) await assertD1Adoptable(databaseName, cloudflareEnv);
      else throw new Error((created.stderr || created.stdout || `Could not exclusively create D1 database ${databaseName}.`).trim());
    }
    if (!database) throw new Error(`Could not verify D1 database ${databaseName} after creation.`);
    state.databaseId = resourceId(database);
    state.owns.d1 = true;
    await saveInstallationState(state);
  }
  if (!state.databaseId || state.databaseId === placeholderDatabaseId) throw new Error(`D1 database ${databaseName} has no usable database ID.`);
  return state.databaseId;
}

async function ensureR2(bucketName, cloudflareEnv, state, allowAdoption) {
  let info = await r2Info(bucketName, cloudflareEnv);
  if (info.exists) {
    if (!state.owns.r2 && !allowAdoption) throw new Error(`R2 bucket ${bucketName} appeared after the provenance check. Rerun with FREE_CRM_ADOPT_EXISTING=true only if you own it.`);
    state.owns.r2 = true;
    await saveInstallationState(state);
    log(`Reusing provenance-verified R2 bucket ${bucketName}.`);
  } else {
    if (state.owns.r2) throw new Error(`Recorded R2 bucket ${bucketName} is missing. Restore it or choose a new installation; no replacement was created.`);
    log(`Creating private R2 bucket ${bucketName}…`);
    const created = await runWrangler(['r2', 'bucket', 'create', bucketName], { capture: true, allowFailure: true, env: cloudflareEnv });
    info = await r2Info(bucketName, cloudflareEnv);
    if (created.code !== 0 && !(info.exists && allowAdoption)) {
      throw new Error((created.stderr || created.stdout || `Could not exclusively create R2 bucket ${bucketName}.`).trim());
    }
    if (!info.exists) throw new Error(`Could not verify R2 bucket ${bucketName} after creation.`);
    state.owns.r2 = true;
    await saveInstallationState(state);
  }
  await assertR2Private(bucketName, cloudflareEnv);
}

async function prepareInstallationState(settings, cloudflareEnv, allowAdoption) {
  const expected = markerFor(settings);
  let state = await loadInstallationState();
  const [database, bucket, deployedWorker] = await Promise.all([
    findD1(settings.databaseName, cloudflareEnv),
    r2Info(settings.bucketName, cloudflareEnv),
    workerExists(settings.workerName, cloudflareEnv),
  ]);
  const databaseId = resourceId(database);
  const remote = database ? await readRemoteInstallation(settings.databaseName, cloudflareEnv) : null;
  if (remote) assertInstallationMatches(remote, expected, 'remote D1 installation marker');

  if (state) {
    assertInstallationMatches(state, expected, 'local installation state');
    if (state.databaseId && databaseId && state.databaseId !== databaseId) {
      throw new Error(`D1 database ${settings.databaseName} has a different ID than the recorded installation.`);
    }
  } else {
    const hasConflict = Boolean(database || bucket.exists || deployedWorker);
    if (hasConflict && !remote && !allowAdoption) {
      const names = [database && `D1 ${settings.databaseName}`, bucket.exists && `R2 ${settings.bucketName}`, deployedWorker && `Worker ${settings.workerName}`].filter(Boolean).join(', ');
      throw new Error(`Existing unowned resources were found (${names}). Choose different names or set FREE_CRM_ADOPT_EXISTING=true after verifying ownership.`);
    }
    if (database && !remote) await assertD1Adoptable(settings.databaseName, cloudflareEnv);
    if (bucket.exists) await assertR2Private(settings.bucketName, cloudflareEnv);
    state = {
      version: installationStateVersion,
      ...expected,
      databaseId,
      owns: {
        d1: Boolean(database && (remote || allowAdoption)),
        r2: Boolean(bucket.exists && (remote || allowAdoption)),
        worker: Boolean(deployedWorker && (remote || allowAdoption)),
      },
      createdAt: new Date().toISOString(),
    };
    await saveInstallationState(state);
  }

  if (database && !state.owns.d1) {
    if (remote) state.owns.d1 = true;
    else if (allowAdoption) {
      await assertD1Adoptable(settings.databaseName, cloudflareEnv);
      state.owns.d1 = true;
    }
  }
  if (bucket.exists && !state.owns.r2) {
    if (remote || allowAdoption) state.owns.r2 = true;
    else throw new Error(`R2 bucket ${settings.bucketName} is not part of the recorded installation.`);
  }
  if (deployedWorker && !state.owns.worker) {
    if (remote || allowAdoption) state.owns.worker = true;
    else throw new Error(`Worker ${settings.workerName} is not part of the recorded installation.`);
  }
  state.databaseId = state.databaseId ?? databaseId;
  await saveInstallationState(state);
  return state;
}

/**
 * @param {{
 *   workerName: string;
 *   databaseName: string;
 *   databaseId: string;
 *   bucketName: string;
 *   access?: { teamDomain: string; audience: string; ownerEmail: string } | null;
 * }} settings
 */
function configFor({ workerName, databaseName, databaseId, bucketName, access = null }) {
  const vars = { FREE_CRM_AUTH_MODE: access ? 'cloudflare-access' : 'locked' };
  if (access) {
    vars.FREE_CRM_ACCESS_TEAM_DOMAIN = access.teamDomain;
    vars.FREE_CRM_ACCESS_AUD = access.audience;
    vars.FREE_CRM_OWNER_EMAIL = access.ownerEmail;
  }
  return {
    $schema: 'node_modules/wrangler/config-schema.json',
    name: workerName,
    main: './dist/server/index.js',
    compatibility_date: '2026-05-22',
    compatibility_flags: ['nodejs_compat'],
    no_bundle: true,
    rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
    assets: { directory: './dist/client', binding: 'ASSETS' },
    d1_databases: [{ binding: 'DB', database_name: databaseName, database_id: databaseId, migrations_dir: 'drizzle' }],
    r2_buckets: [{ binding: 'FILES', bucket_name: bucketName }],
    vars,
    observability: { enabled: true },
  };
}

async function writeConfig(settings) {
  await writeFile(userConfigPath, `${JSON.stringify(configFor(settings), null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

async function cloudflareApiEnvelope(accountId, token, path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    const messages = body?.errors?.map((error) => error.message).filter(Boolean).join('; ');
    throw new Error(`Cloudflare API ${path} failed (${response.status})${messages ? `: ${messages}` : '.'}`);
  }
  return body;
}

async function cloudflareApi(accountId, token, path, init = {}) {
  return (await cloudflareApiEnvelope(accountId, token, path, init)).result;
}

async function cloudflareList(accountId, token, path) {
  const items = [];
  for (let page = 1; page <= 100; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const body = await cloudflareApiEnvelope(accountId, token, `${path}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(body.result)) throw new Error(`Cloudflare API ${path} returned an unexpected list shape.`);
    items.push(...body.result);
    const totalPages = Number(body.result_info?.total_pages ?? 0);
    if ((totalPages && page >= totalPages) || (!totalPages && body.result.length < 100)) return items;
  }
  throw new Error(`Cloudflare API ${path} exceeded the safe pagination limit.`);
}

function accessAudience(application) {
  const values = Array.isArray(application?.aud) ? application.aud : [application?.aud];
  return values.length === 1 && typeof values[0] === 'string' && values[0].trim() ? values[0].trim() : null;
}

function isExactEmailRule(rule) {
  return Boolean(rule
    && typeof rule === 'object'
    && Object.keys(rule).length === 1
    && rule.email
    && typeof rule.email === 'object'
    && Object.keys(rule.email).length === 1
    && typeof rule.email.email === 'string');
}

function assertOwnerOnlyAccess(application, policies, workerTag, ownerEmail) {
  const destinations = application?.destinations;
  if (application?.type !== 'self_hosted'
    || !Array.isArray(destinations)
    || destinations.length !== 1
    || destinations[0]?.type !== 'worker'
    || destinations[0]?.worker_id !== workerTag) {
    throw new Error('Cloudflare Access application destinations are ambiguous; the Worker remains locked.');
  }
  if (!Array.isArray(policies) || policies.length !== 1) {
    throw new Error('Cloudflare Access must have exactly one owner policy; the Worker remains locked.');
  }
  const policy = policies[0];
  const include = policy?.include;
  const exclude = policy?.exclude ?? [];
  const requireRules = policy?.require ?? [];
  const exactOwner = policy?.id
    && policy.decision === 'allow'
    && Array.isArray(include)
    && include.length === 1
    && isExactEmailRule(include[0])
    && include[0].email.email.trim().toLowerCase() === ownerEmail
    && Array.isArray(exclude)
    && exclude.length === 0
    && Array.isArray(requireRules)
    && requireRules.length === 0;
  if (!exactOwner) throw new Error(`Cloudflare Access is not restricted to exactly ${ownerEmail}; the Worker remains locked.`);
  const audience = accessAudience(application);
  if (!audience) throw new Error('Cloudflare Access did not return one application audience; the Worker remains locked.');
  return audience;
}

async function readAndVerifyAccess({ accountId, token, applicationId, workerTag, ownerEmail }) {
  const [application, policies] = await Promise.all([
    cloudflareApi(accountId, token, `/access/apps/${applicationId}`),
    cloudflareList(accountId, token, `/access/apps/${applicationId}/policies`),
  ]);
  return { application, audience: assertOwnerOnlyAccess(application, policies, workerTag, ownerEmail) };
}

async function ensureAccess({ accountId, token, ownerEmail, workerName }) {
  const workers = await cloudflareApi(accountId, token, '/workers/scripts');
  if (!Array.isArray(workers)) throw new Error('Cloudflare did not return the Worker inventory expected by the installer.');
  const worker = workers.find((item) => item.id === workerName);
  if (!worker?.tag) throw new Error(`Cloudflare did not return the immutable tag for Worker ${workerName}.`);

  const organization = await cloudflareApi(accountId, token, '/access/organizations');
  const teamDomain = organization.auth_domain ?? organization.team_domain;
  if (!teamDomain) throw new Error('Cloudflare Zero Trust has no team domain. Complete Zero Trust onboarding, then rerun the installer.');

  const applications = await cloudflareList(accountId, token, '/access/apps');
  const matches = applications.filter((item) => item.destinations?.some((destination) => destination.type === 'worker' && destination.worker_id === worker.tag));
  if (matches.length > 1) throw new Error(`Multiple Cloudflare Access applications target Worker ${workerName}; the Worker remains locked.`);
  let application = matches[0];
  if (!application) {
    application = await cloudflareApi(accountId, token, '/access/apps', {
      method: 'POST',
      body: JSON.stringify({
        name: `FREE CRM managed access · ${worker.tag}`,
        type: 'self_hosted',
        destinations: [{ type: 'worker', worker_id: worker.tag }],
        session_duration: '24h',
        policies: [{
          name: `FREE CRM owner · ${worker.tag}`,
          decision: 'allow',
          include: [{ email: { email: ownerEmail } }],
          exclude: [],
          require: [],
          precedence: 1,
          session_duration: '24h',
        }],
      }),
    });
    log(`Created an exact-owner Cloudflare Access policy for ${ownerEmail}.`);
  } else {
    log(`Auditing the existing Cloudflare Access application protecting ${workerName}.`);
  }
  if (!application?.id) throw new Error('Cloudflare Access did not return an application ID; the Worker remains locked.');
  const verified = await readAndVerifyAccess({ accountId, token, applicationId: application.id, workerTag: worker.tag, ownerEmail });
  return { teamDomain, audience: verified.audience, ownerEmail };
}

function deployedUrl(output) {
  return output.match(/https:\/\/[^\s)]+\.workers\.dev\/?/i)?.[0] ?? null;
}

function isSafeAccessRedirect(location, teamDomain) {
  if (!location) return false;
  try {
    const url = new URL(location);
    const expectedHost = teamDomain ? new URL(teamDomain.includes('://') ? teamDomain : `https://${teamDomain}`).hostname.toLowerCase() : null;
    return url.protocol === 'https:'
      && url.hostname.toLowerCase().endsWith('.cloudflareaccess.com')
      && (!expectedHost || url.hostname.toLowerCase() === expectedHost);
  } catch {
    return false;
  }
}

async function verifyUnauthenticatedDenied(url, { phase, teamDomain, required }) {
  if (!url) {
    if (required) throw new Error('Wrangler did not print a workers.dev URL, so CI could not verify unauthenticated denial.');
    log('Wrangler did not print a workers.dev URL; verify the custom domain before adding data.');
    return;
  }
  let response;
  try {
    response = await fetch(new URL('/api/v1/health', url), { redirect: 'manual' });
  } catch (error) {
    if (required) throw new Error(`The deployment URL could not be reached for its security check: ${error instanceof Error ? error.message : String(error)}`);
    log('The deployment URL was not reachable. Verify unauthenticated denial before adding data.');
    return;
  }
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await response.json().catch(() => null) : null;
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (!isSafeAccessRedirect(response.headers.get('location'), teamDomain)) {
      throw new Error('Security check received an untrusted redirect instead of a Cloudflare Access denial.');
    }
    log(`Unauthenticated API verification passed (Cloudflare Access redirect, ${response.status}).`);
    return;
  }
  if (phase === 'locked' && response.status === 503 && body?.error?.code === 'deployment_locked') {
    log('Locked-mode verification passed (503 deployment_locked).');
    return;
  }
  if (phase === 'active' && response.status === 401 && body?.error?.code === 'authentication_required') {
    log('Unauthenticated API verification passed (401 authentication_required).');
    return;
  }
  if (phase === 'active' && response.status === 403) {
    log('Unauthenticated API verification passed (403 denied).');
    return;
  }
  throw new Error(`Security check failed: unauthenticated health returned ${response.status}${body?.error?.code ? ` ${body.error.code}` : ''}.`);
}

function printManualActivation(workerName) {
  log('');
  log('Your infrastructure is deployed in SEALED mode. Finish private activation:');
  log(`1. Cloudflare → Workers & Pages → ${workerName} → Settings → Domains & Routes → Access.`);
  log('2. Protect all traffic and allow only your exact owner email.');
  log('3. Add FREE_CRM_ACCESS_TEAM_DOMAIN, FREE_CRM_ACCESS_AUD, FREE_CRM_OWNER_EMAIL, and set FREE_CRM_AUTH_MODE=cloudflare-access.');
  log('4. Rerun npm run deploy:cloudflare.');
  log('Full guide: docs/CLOUD_DEPLOYMENT.md');
}

async function main() {
  if (process.argv.includes('--help')) {
    log('npm run deploy:cloudflare');
    log('Optional variables: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, FREE_CRM_OWNER_EMAIL, FREE_CRM_WORKER_NAME, FREE_CRM_D1_NAME, FREE_CRM_R2_NAME, FREE_CRM_ADOPT_EXISTING=true.');
    return;
  }
  const requireAccess = enabledFlag('FREE_CRM_REQUIRE_ACCESS');
  const allowAdoption = enabledFlag('FREE_CRM_ADOPT_EXISTING');
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const ownerValue = process.env.FREE_CRM_OWNER_EMAIL?.trim();
  const explicitAccount = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (Boolean(token) !== Boolean(ownerValue) || (token && !explicitAccount)) {
    throw new Error('Automated Access activation requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and FREE_CRM_OWNER_EMAIL together.');
  }
  if (requireAccess && (!token || !ownerValue || !explicitAccount)) {
    throw new Error('FREE_CRM_REQUIRE_ACCESS=true requires all three protected Cloudflare owner credentials before provisioning.');
  }
  const ownerEmail = ownerValue ? validateOwnerEmail(ownerValue) : null;
  const workerName = validateResourceName(process.env.FREE_CRM_WORKER_NAME || 'free-crm', 'Worker name');
  const databaseName = validateResourceName(process.env.FREE_CRM_D1_NAME || `${workerName}-db`, 'D1 database name');
  const bucketName = validateResourceName(process.env.FREE_CRM_R2_NAME || `${workerName}-files`, 'R2 bucket name');
  const accountId = await resolveAccountId();
  const cloudflareEnv = { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId };
  const settings = { accountId, workerName, databaseName, bucketName };

  log(`Preparing ${workerName} in Cloudflare account ${accountId.slice(0, 6)}…${accountId.slice(-4)}.`);
  const state = await prepareInstallationState(settings, cloudflareEnv, allowAdoption);
  const databaseId = await ensureD1(databaseName, cloudflareEnv, state, allowAdoption);
  await ensureR2(bucketName, cloudflareEnv, state, allowAdoption);
  await writeConfig({ workerName, databaseName, databaseId, bucketName });

  log('Building FREE CRM…');
  const buildEnv = { ...process.env };
  for (const key of ['CLOUDFLARE_API_TOKEN', 'FREE_CRM_OWNER_EMAIL', 'FREE_CRM_WEBHOOK_KEY']) delete buildEnv[key];
  await runNpm(['run', 'build'], { env: buildEnv });
  log('Applying forward-only D1 migrations…');
  await runWrangler(['d1', 'migrations', 'apply', 'DB', '--remote', '-c', 'wrangler.user.jsonc'], { env: cloudflareEnv });
  await writeRemoteInstallation(settings, cloudflareEnv);
  const workerBeforeDeploy = await workerExists(workerName, cloudflareEnv);
  if (workerBeforeDeploy && !state.owns.worker) {
    if (!allowAdoption) throw new Error(`Worker ${workerName} appeared after the provenance check. Rerun with FREE_CRM_ADOPT_EXISTING=true only if you own it.`);
    state.owns.worker = true;
    await saveInstallationState(state);
  }
  log('Deploying the sealed Worker…');
  const firstDeploy = await runWrangler(['deploy', '-c', 'wrangler.user.jsonc', '--keep-vars'], { capture: true, env: cloudflareEnv });
  process.stdout.write(firstDeploy.stdout);
  process.stderr.write(firstDeploy.stderr);
  state.owns.worker = true;
  await saveInstallationState(state);
  const firstUrl = deployedUrl(firstDeploy.stdout);
  await verifyUnauthenticatedDenied(firstUrl, { phase: 'locked', required: requireAccess || Boolean(token), teamDomain: null });

  if (token && ownerEmail) {
    log('Creating or strictly verifying the exact-owner Cloudflare Access application…');
    const access = await ensureAccess({ accountId, token, ownerEmail, workerName });
    await writeConfig({ workerName, databaseName, databaseId, bucketName, access });
    const activatedDeploy = await runWrangler(['deploy', '-c', 'wrangler.user.jsonc', '--keep-vars'], { capture: true, env: cloudflareEnv });
    process.stdout.write(activatedDeploy.stdout);
    process.stderr.write(activatedDeploy.stderr);
    log('Private activation complete. Cloudflare Access and the app both verify identity.');
    await verifyUnauthenticatedDenied(deployedUrl(activatedDeploy.stdout) ?? firstUrl, {
      phase: 'active',
      required: true,
      teamDomain: access.teamDomain,
    });
  } else {
    printManualActivation(workerName);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`FREE CRM deployment stopped: ${error instanceof Error ? error.message : String(error)} No Cloudflare resource was intentionally deleted. Migrations or an earlier deployment step may already have completed; inspect the current Worker and Access policy before retrying.\n`);
    process.exitCode = 1;
  });
}

export { assertOwnerOnlyAccess, configFor, isExactEmailRule, markerFor };
