import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const MAX_TEXT_BYTES = 10_000_000;
const SAFE_EXAMPLE_FILES = new Set(['.env.example']);

const tokenRules = [
  { id: 'private-key', pattern: new RegExp(`-{5}BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-{5}`, 'g') },
  { id: 'openai-api-key', pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/g },
  { id: 'github-token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g },
  { id: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { id: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: 'slack-token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { id: 'stripe-key', pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { id: 'npm-token', pattern: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { id: 'sendgrid-key', pattern: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{20,}\b/g },
  { id: 'digitalocean-token', pattern: /\bdop_v1_[A-Fa-f0-9]{40,}\b/g },
  { id: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{10,}\b/g },
  { id: 'credential-in-url', pattern: /https?:\/\/[^\s/:@]+:[^\s/@]+@[^\s/]+/g },
];

const assignmentRules = [
  {
    id: 'cloud-provider-credential',
    pattern: /\b(?:CLOUDFLARE_API_TOKEN|OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY|GOOGLE_API_KEY|GITHUB_TOKEN|NPM_TOKEN|SLACK_TOKEN|STRIPE_SECRET_KEY|_authToken)\s*[:=]\s*["']?([^\s"',}]{8,})/gi,
  },
  {
    id: 'literal-secret-assignment',
    pattern: /["']?(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|password|webhook[_-]?key)["']?\s*[:=]\s*["']([^"'\r\n]{8,})["']/gi,
  },
  {
    id: 'literal-authorization-header',
    pattern: /\b(?:authorization|x-api-key)\s*[:=]\s*["'](?:Bearer |Basic )?([^"'\r\n]{12,})["']/gi,
  },
];

const sensitivePath = /(^|\/)(?:\.env(?:\..+)?|\.dev\.vars(?:\..+)?|\.npmrc|\.netrc|\.pypirc|id_(?:rsa|ed25519)(?:\..+)?|wrangler\.user\.(?:jsonc|state\.json)|(?:credentials|service-account)[^/]*\.json|[^/]+\.(?:pem|key|p12|pfx|jks|keystore))$/i;

function git(args, { encoding = 'utf8' } = {}) {
  const result = spawnSync('git', args, {
    encoding,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed while scanning repository metadata.`);
  return result.stdout;
}

function lineNumber(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) if (text.charCodeAt(cursor) === 10) line += 1;
  return line;
}

function looksLikePlaceholder(value) {
  const normalized = value.trim();
  if (!normalized) return true;
  if (/^(?:a-short-lived-account-token|placeholder|replace[-_ ]?me|change[-_ ]?me|dummy|sample|fake|redacted|x{4,}|<[^>]+>)$/i.test(normalized)) return true;
  if (/^your(?:[-_ ].*)?$/i.test(normalized)) return true;
  if (/^(?:\$\{\{[\s\S]+\}\}|\$[A-Za-z_][A-Za-z0-9_]*|process\.env(?:\.[A-Za-z_][A-Za-z0-9_]*)?)$/.test(normalized)) return true;
  if (/^0+$/.test(normalized.replaceAll('-', ''))) return true;
  if (/^(?:true|false|null|undefined|token|secret|password|ownerEmail|accountId)$/i.test(normalized)) return true;
  return false;
}

function scanText(text, source) {
  const findings = [];
  if (!text || Buffer.byteLength(text) > MAX_TEXT_BYTES || text.includes('\0')) return findings;

  for (const rule of tokenRules) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      findings.push({ source, line: lineNumber(text, match.index ?? 0), rule: rule.id });
    }
  }

  for (const rule of assignmentRules) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      if (looksLikePlaceholder(match[1] ?? '')) continue;
      findings.push({ source, line: lineNumber(text, match.index ?? 0), rule: rule.id });
    }
  }
  return findings;
}

function repositoryFiles() {
  return git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'buffer' }).toString('utf8').split('\0').filter(Boolean);
}

function scanCurrentTree() {
  const findings = [];
  for (const path of repositoryFiles()) {
    const normalized = path.replaceAll('\\', '/');
    if (sensitivePath.test(normalized) && !SAFE_EXAMPLE_FILES.has(normalized)) {
      findings.push({ source: normalized, line: 1, rule: 'sensitive-file-tracked' });
    }
    try {
      const content = readFileSync(path);
      findings.push(...scanText(content.toString('utf8'), normalized));
    } catch (error) {
      if (!error || typeof error !== 'object' || error.code !== 'ENOENT') throw error;
    }
  }
  return findings;
}

function historyBlobs() {
  const commits = git(['rev-list', '--all']).trim().split(/\r?\n/).filter(Boolean);
  const blobs = new Map();
  for (const commit of commits) {
    const tree = git(['ls-tree', '-r', '-z', '--full-tree', commit], { encoding: 'buffer' }).toString('utf8');
    for (const entry of tree.split('\0').filter(Boolean)) {
      const match = /^\d+ blob ([0-9a-f]+)\t([\s\S]+)$/.exec(entry);
      if (!match) continue;
      const blob = blobs.get(match[1]) ?? { locations: new Map() };
      if (!blob.locations.has(match[2])) blob.locations.set(match[2], commit);
      blobs.set(match[1], blob);
    }
  }
  return blobs;
}

function readBlobBatch(oids) {
  if (!oids.length) return new Map();
  const result = spawnSync('git', ['cat-file', '--batch'], {
    input: Buffer.from(`${oids.join('\n')}\n`),
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error('git cat-file failed while scanning repository history.');
  const output = result.stdout;
  const blobs = new Map();
  let cursor = 0;
  for (const requestedOid of oids) {
    const headerEnd = output.indexOf(10, cursor);
    if (headerEnd < 0) throw new Error('git cat-file returned an incomplete history batch.');
    const header = output.subarray(cursor, headerEnd).toString('utf8');
    const match = /^([0-9a-f]+) blob (\d+)$/.exec(header);
    if (!match) throw new Error(`git cat-file could not read history object ${requestedOid.slice(0, 12)}.`);
    const size = Number(match[2]);
    cursor = headerEnd + 1;
    blobs.set(requestedOid, output.subarray(cursor, cursor + size));
    cursor += size;
    if (output[cursor] === 10) cursor += 1;
  }
  return blobs;
}

function scanHistory() {
  const findings = [];
  const history = historyBlobs();
  const contents = readBlobBatch([...history.keys()]);
  for (const [oid, metadata] of history) {
    const locations = [...metadata.locations.entries()];
    for (const [path, commit] of locations) {
      const normalized = path.replaceAll('\\', '/');
      if (sensitivePath.test(normalized) && !SAFE_EXAMPLE_FILES.has(normalized)) {
        findings.push({ source: `${normalized}@${commit.slice(0, 12)}`, line: 1, rule: 'sensitive-file-in-history' });
      }
    }
    const content = contents.get(oid) ?? Buffer.alloc(0);
    const [firstPath, firstCommit] = locations[0] ?? [`blob-${oid.slice(0, 12)}`, 'history'];
    findings.push(...scanText(content.toString('utf8'), `${firstPath.replaceAll('\\', '/')}@${firstCommit.slice(0, 12)}`));
  }
  return findings;
}

function verifyScannerRules() {
  const fixtures = [
    `${['OPENAI', 'API', 'KEY'].join('_')}=${['sk', 'proj', 'A'.repeat(28)].join('-')}`,
    `${['GITHUB', 'TOKEN'].join('_')}=${`ghp_${'B'.repeat(32)}`}`,
    ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' '),
    `api_key="${'C'.repeat(32)}"`,
  ];
  if (fixtures.some((fixture) => scanText(fixture, 'scanner-self-check').length === 0)) {
    throw new Error('Secret scanner self-check failed to recognize a synthetic credential pattern.');
  }
  const placeholder = `${['CLOUDFLARE', 'API', 'TOKEN'].join('_')}=a-short-lived-account-token`;
  if (scanText(placeholder, 'scanner-self-check').length !== 0) {
    throw new Error('Secret scanner self-check treated a documented placeholder as a credential.');
  }
}

function main() {
  verifyScannerRules();
  const includeHistory = process.argv.includes('--history');
  const findings = includeHistory ? scanHistory() : scanCurrentTree();
  const unique = [...new Map(findings.map((finding) => [`${finding.source}:${finding.line}:${finding.rule}`, finding])).values()];
  if (unique.length) {
    process.stderr.write(`Secret scan found ${unique.length} potential credential issue(s). Values are intentionally redacted.\n`);
    for (const finding of unique) process.stderr.write(`${finding.source}:${finding.line} [${finding.rule}]\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Secret scan passed for ${includeHistory ? 'all reachable Git history' : 'the tracked working tree'}; no credential values were printed.\n`);
}

main();
