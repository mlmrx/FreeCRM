import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function text(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('bring-your-own-cloud release contract', () => {
  it('declares deploy-button resources and starts cloud deployments sealed', () => {
    const config = JSON.parse(text('wrangler.jsonc'));
    expect(config).toMatchObject({
      name: 'free-crm',
      main: './dist/server/index.js',
      no_bundle: true,
      assets: { directory: './dist/client' },
      vars: { FREE_CRM_AUTH_MODE: 'locked' },
    });
    expect(config.d1_databases).toEqual([expect.objectContaining({ binding: 'DB', migrations_dir: 'drizzle' })]);
    expect(config.r2_buckets).toEqual([expect.objectContaining({ binding: 'FILES' })]);
    expect(config.vars).not.toHaveProperty('FREE_CRM_LOCAL_MODE');
    expect(config.vars).not.toHaveProperty('FREE_CRM_WEBHOOK_KEY');
    expect(config.vars).not.toHaveProperty('FREE_CRM_ACCESS_TEAM_DOMAIN');
    expect(config.vars).not.toHaveProperty('FREE_CRM_ACCESS_AUD');
    expect(config.vars).not.toHaveProperty('FREE_CRM_OWNER_EMAIL');
  });

  it('keeps local-owner Docker mode on loopback', () => {
    const compose = text('compose.yaml');
    expect(compose).toContain('127.0.0.1:3477:3000');
    expect(compose).not.toMatch(/- ["']?3477:3000/);
    expect(compose).not.toMatch(/^\s+environment:/m);
    const dockerfile = text('Dockerfile');
    expect(dockerfile).not.toContain('--var FREE_CRM_WEBHOOK_KEY');
    expect(dockerfile).not.toContain('FREE_CRM_WEBHOOK_KEY');
  });

  it('keeps raw deployment new-only, private, empty-database, and sealed-before-migration', () => {
    expect(JSON.parse(text('package.json')).scripts.deploy).toBe('node scripts/deploy-worker.mjs');
    const deployWorker = text('scripts/deploy-worker.mjs');
    expect(deployWorker).toContain('Refusing raw deployment with the provisioning placeholder D1 ID');
    expect(deployWorker).toContain("['run', 'security:secrets:history']");
    expect(deployWorker).toContain("['run', 'check']");
    expect(deployWorker).toContain("['audit', '--audit-level=moderate']");
    expect(deployWorker).toContain('await workerExists(config.name, deployEnv)');
    expect(deployWorker).toContain("name NOT LIKE '_cf_%'");
    expect(deployWorker).toContain('await assertR2Private(bucket.bucket_name, deployEnv)');
    expect(deployWorker).toContain('SELECT name FROM sqlite_schema');
    expect(deployWorker).toContain('The provisioned D1 database is not empty');
    expect(deployWorker.indexOf("'deploy', '-c', 'wrangler.jsonc'")).toBeLessThan(deployWorker.indexOf("['run', 'db:cloud:migrate']"));
    expect(deployWorker).toContain("phase: 'locked', required: true");
  });

  it('uses dashboard Save/Deploy for manual Cloudflare activation instead of rerunning Workers Build', () => {
    const activationGuidance = [
      text('README.md'),
      text('docs/CLOUD_DEPLOYMENT.md'),
      text('app/deploy/deployment-center.tsx'),
    ];

    for (const guidance of activationGuidance) {
      expect(guidance).toContain('Save/Deploy');
      expect(guidance).not.toMatch(/(?:must\s+)?rerun the (?:Cloudflare )?Workers Build/i);
    }
  });

  it('keeps the health canary sealed until an identity runtime is activated', () => {
    expect(text('app/api/v1/health/route.ts')).toContain('requireActivatedRuntime();');
  });

  it('keeps cloud credentials in a protected manual workflow', () => {
    const workflow = text('.github/workflows/deploy-cloudflare.yml');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('environment: cloudflare-production');
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(workflow).toContain('git rev-parse origin/main');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('secrets.CLOUDFLARE_API_TOKEN');
    expect(workflow).toContain('FREE_CRM_REQUIRE_ACCESS');
    expect(workflow).toContain('if: success()');
    expect(workflow).not.toContain('pull_request_target');
  });

  it('does not copy webhook credentials into build-time Worker variables', () => {
    const vite = text('vite.config.ts');
    expect(vite).not.toContain('localVars.FREE_CRM_WEBHOOK_KEY');
    expect(vite).not.toContain('process.env.FREE_CRM_WEBHOOK_KEY');
  });

  it('keeps both native launchers on the exact runtime and lockfile', () => {
    const powershell = text('scripts/start-local.ps1');
    const shell = text('scripts/start-local.sh');
    const cmd = text('START-FREE-CRM.cmd');
    for (const launcher of [powershell, shell]) {
      expect(launcher).toContain('22.13.0');
      expect(launcher).toContain('.free-crm-install-stamp');
      expect(launcher).toContain('package-lock.json');
      expect(launcher).toContain('http://127.0.0.1:3477');
    }
    expect(cmd).toContain('exit /b %FREE_CRM_EXIT%');
  });

  it('verifies the complete dependency tree on Linux and Windows', () => {
    const workflow = text('.github/workflows/ci.yml');
    expect(workflow).toContain('runs-on: windows-latest');
    expect(workflow).toContain('node-version: 22.13.0');
    expect(workflow.match(/npm audit --audit-level=moderate/g)?.length).toBeGreaterThanOrEqual(2);
    expect(workflow).not.toContain('npm audit --omit=dev');
  });
});
