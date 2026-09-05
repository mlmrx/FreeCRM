import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { guideQuestions, recommendPath } from '@/lib/start-guide';
import DeployPage from '@/app/deploy/page';

describe('guided path recommendations', () => {
  it('sends every completed conversation to a supported journey', () => {
    for (const audience of guideQuestions[0].options) {
      for (const goal of guideQuestions[1].options) {
        for (const hosting of guideQuestions[2].options) {
          const result = recommendPath([audience.id, goal.id, hosting.id]);
          expect(result).not.toBeNull();
          expect(result?.href).toMatch(/^\/(tour|platform#persona-(enterprise|agents)|deploy\?path=(docker|cloudflare|vercel))$/);
          expect(result?.persona.boundary).toBeTruthy();
          if (['enterprise', 'agents'].includes(audience.id)) expect(result?.href).toContain('/platform#');
          if (goal.id === 'agentic') expect(result?.agentic?.boundary).toContain('blocked');
        }
      }
    }
  });

  it('does not guess a recommendation from partial or invalid input', () => {
    expect(recommendPath([])).toBeNull();
    expect(recommendPath(['solo', 'sales'])).toBeNull();
    expect(recommendPath(['solo', 'sales', 'https://untrusted.example'])).toBeNull();
    expect(recommendPath(['solo', 'sales', 'local', 'extra'])).toBeNull();
  });

  it('honors the decision to browse and keeps business limitations visible', () => {
    expect(recommendPath(['business', 'sales', 'tour'])?.href).toBe('/tour');
    expect(recommendPath(['solo', 'explore', 'local'])?.href).toBe('/tour');
    expect(recommendPath(['business', 'sales', 'local'])?.persona.boundary).toContain('not shipped');
  });

  it.each(['docker', 'cloudflare', 'vercel'] as const)('opens the recommended %s deployment panel', async (path) => {
    const element = await DeployPage({ searchParams: Promise.resolve({ path }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain(`id="deploy-panel-${path}"`);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(1);
  });

  it('uses the default panel for unrecognized or repeated query values', async () => {
    for (const path of ['invalid', ['docker', 'cloudflare'], undefined]) {
      const html = renderToStaticMarkup(await DeployPage({ searchParams: Promise.resolve({ path }) }));
      expect(html).toContain('id="deploy-panel-vercel"');
    }
  });
});
