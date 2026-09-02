import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import TourPage from '@/app/tour/page';
import ProductTour from '@/app/tour/product-tour';
import { syntheticTour } from '@/lib/public-demo';

describe('public synthetic product tour', () => {
  it('renders a useful read-only first view from conspicuously synthetic records', () => {
    const page = renderToStaticMarkup(createElement(TourPage));
    const product = renderToStaticMarkup(createElement(ProductTour));

    expect(Object.isFrozen(syntheticTour)).toBe(true);
    expect(syntheticTour.notice).toContain('Fictional');
    expect(syntheticTour.workspace).toContain('synthetic');
    expect(syntheticTour.contacts.every((contact) => contact.context.includes('fictional'))).toBe(true);
    expect(page).toContain('NO SIGN-IN · NO WRITES · NO TRACKING');
    expect(page).toContain('id="tour-content"');
    expect(product).toContain('READ-ONLY PRODUCT TOUR');
    expect(product).toContain('role="tablist"');
    expect(product).toContain('aria-selected="true"');
    expect(product).toContain('Close the loop with Mosaic Coffee.');
  });

  it('has no data-plane, API, connector, or browser-storage access', () => {
    const component = readFileSync(join(process.cwd(), 'app', 'tour', 'product-tour.tsx'), 'utf8');
    const fixture = readFileSync(join(process.cwd(), 'lib', 'public-demo.ts'), 'utf8');

    for (const source of [component, fixture]) {
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toContain('/api/');
      expect(source).not.toContain('cloud-client');
      expect(source).not.toContain('server/');
      expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    }
    expect(component).toContain("useState<View>('focus')");
    expect(component).toContain('It cannot call a provider, mutate a CRM record, or send a message.');
  });
});
