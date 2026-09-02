import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import HowItWorksPage from '@/app/how-it-works/page';
import LandingPage from '@/app/landing-page';
import PlatformPage from '@/app/platform/page';
import sitemap from '@/app/sitemap';
import { publicPersonas } from '@/lib/public-personas';

describe('one-platform public persona showcase', () => {
  it('describes every requested audience from one truthful data model', () => {
    expect(publicPersonas.map((persona) => persona.id)).toEqual(['solo', 'business', 'enterprise', 'agentic', 'agents']);
    expect(publicPersonas.map((persona) => persona.delivery)).toEqual([
      'Available now',
      'Foundation available',
      'Architecture preview',
      'Guarded preview',
      'Research path',
    ]);
    expect(publicPersonas.every((persona) => persona.capabilities.length === 3)).toBe(true);
    expect(publicPersonas.every((persona) => persona.boundary.length > 70)).toBe(true);
    expect(publicPersonas.find((persona) => persona.id === 'business')?.boundary).toContain('single verified owner');
    expect(publicPersonas.find((persona) => persona.id === 'enterprise')?.boundary).toContain('not an enterprise-ready release');
    expect(publicPersonas.find((persona) => persona.id === 'agentic')?.boundary).toContain('external tool execution');
  });

  it('renders data-driven USA-theme visuals and routes discovery from public entry points', () => {
    const platform = renderToStaticMarkup(createElement(PlatformPage));
    const landing = renderToStaticMarkup(createElement(LandingPage));
    const how = renderToStaticMarkup(createElement(HowItWorksPage));
    const css = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8');

    expect(platform.match(/class="platform-persona persona-/g)).toHaveLength(publicPersonas.length);
    expect(platform).toContain('One platform · many ways to work');
    expect(platform).toContain('ONE REPOSITORY');
    expect(platform).toContain('ONE AGENTIC LAYER');
    expect(platform).toContain('Touch no customer data.');
    expect(platform).toContain('href="/tour"');
    expect(landing).toContain('href="/platform"');
    expect(landing).toContain('href="/tour"');
    expect(how).toContain('id="how-profiles-title"');
    expect(how).toContain('href="/platform"');
    expect(how).toContain('href="/tour"');
    expect(css).toContain('.persona-agentic .persona-visual');
    expect(css).toContain('.persona-enterprise .persona-visual');
    expect(css).toContain('#bf0a30');
    expect(css).toContain('#002868');
    expect(sitemap()).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: 'https://freecrm.dev/platform' }),
      expect.objectContaining({ url: 'https://freecrm.dev/tour' }),
      expect.objectContaining({ url: 'https://freecrm.dev/deploy/readiness' }),
    ]));
  });
});
