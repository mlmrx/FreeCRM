import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import TourPage from '@/app/tour/page';
import ProductTour from '@/app/tour/product-tour';
import { syntheticTour } from '@/lib/public-demo';
import TourScene from '@/app/tour/tour-scenes';
import { initialTourState, tourSections } from '@/lib/tour-model';

describe('public synthetic product tour', () => {
  it('renders a useful read-only first view from conspicuously synthetic records', () => {
    const page = renderToStaticMarkup(createElement(TourPage));
    const product = renderToStaticMarkup(createElement(ProductTour));

    expect(Object.isFrozen(syntheticTour)).toBe(true);
    expect(syntheticTour.notice).toContain('Fictional');
    expect(syntheticTour.workspace).toContain('synthetic');
    expect(syntheticTour.contacts.every((contact) => contact.context.includes('fictional'))).toBe(true);
    expect(page).toContain('No sign-in or API key');
    expect(page).toContain('id="tour-content"');
    expect(product).toContain('PUBLIC PRODUCT TOUR');
    expect(product).toContain('aria-label="Choose your audience"');
    expect(product).toContain('aria-pressed="true"');
    expect(product).toContain('Close the loop with Mosaic Coffee.');
  });

  it('has no data-plane, API, connector, or browser-storage access', () => {
    const component = readFileSync(join(process.cwd(), 'app', 'tour', 'product-tour.tsx'), 'utf8');
    const fixture = readFileSync(join(process.cwd(), 'lib', 'public-demo.ts'), 'utf8');

    const scene = readFileSync(join(process.cwd(), 'app', 'tour', 'tour-scenes.tsx'), 'utf8');
    const model = readFileSync(join(process.cwd(), 'lib', 'tour-model.ts'), 'utf8');
    for (const source of [component, fixture, scene, model]) {
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toContain('/api/');
      expect(source).not.toContain('cloud-client');
      expect(source).not.toContain('server/');
      expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    }
    expect(model).toContain('It cannot call a provider, mutate a CRM record, or send a message.');
    expect(component).not.toContain('href="/workspace');
    expect(scene).not.toMatch(/href="\/(brain|today|demo|workspace)/);
  });

  it('renders a substantive public scene for every catalog destination', () => {
    for (const section of tourSections) {
      const html = renderToStaticMarkup(createElement(TourScene, { id: section.id, state: initialTourState, act: () => undefined, go: () => undefined }));
      expect(html.length, section.id).toBeGreaterThan(300);
      expect(html, section.id).not.toMatch(/type="file"|type="password"|<form/);
    }
  });
});
