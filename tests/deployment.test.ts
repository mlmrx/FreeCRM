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
      vars: { FREE_CRM_AUTH_MODE: 'cloudflare-access' },
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
  });

  it('keeps cloud credentials in a protected manual workflow', () => {
    const workflow = text('.github/workflows/deploy-cloudflare.yml');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('environment: cloudflare-production');
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
});
