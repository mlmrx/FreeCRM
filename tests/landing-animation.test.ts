import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const component = readFileSync(join(root, 'app', 'landing-page.tsx'), 'utf8');
const css = readFileSync(join(root, 'app', 'globals.css'), 'utf8');

describe('natural landing eagle', () => {
  it('uses the detailed transparent eagle as independently moving anatomy layers', () => {
    const asset = statSync(join(root, 'public', 'eagle-natural-v2.webp'));

    expect(asset.size).toBeGreaterThan(50_000);
    expect(asset.size).toBeLessThan(400_000);
    expect(component).toContain('eagle-wing-left');
    expect(component).toContain('eagle-wing-right');
    expect(component).toContain('eagle-head');
    expect(component).toContain('eagle-gaze');
    expect(component).toContain('eagle-route');
    expect(component).not.toContain('eagle-frame');
    expect(css).toContain("background: url('/eagle-natural-v2.webp')");
    expect(css).toContain('@keyframes eagle-wing-left');
    expect(css).toContain('@keyframes eagle-wing-right');
    expect(css).toContain('@keyframes eagle-pupil-track');
    expect(css).toContain('@keyframes eagle-glide-x');
    expect(css).toContain('@keyframes eagle-glide-y');
    expect(css).toContain('@keyframes eagle-bank');
  });

  it('keeps the FREE banner hidden until the eagle has finished landing', () => {
    expect(css).toMatch(/\.eagle-banner \{[^}]*visibility: hidden;[^}]*opacity: 0;/);
    expect(css).toContain('animation: eagle-banner-arrival .62s 11.58s');
    expect(css).toContain('@keyframes eagle-banner-arrival');
  });

  it('celebrates the completed landing with accessible motion-aware fireworks', () => {
    expect(component).toContain('LandingFireworks');
    expect(component).toContain("delay: '11.86s'");
    expect(css).toContain('@keyframes landing-firework-bloom');
    expect(css).toContain('.animation-complete .landing-fireworks { display: none; }');
    expect(css).toContain('.landing-fireworks { display: none!important; }');
  });
});

describe('landing navigation hierarchy', () => {
  it('keeps core journeys visible and groups secondary destinations in one disclosure', () => {
    expect(component).toContain('<div className="landing-intro-controls" aria-label="Intro controls">');
    expect(component).toContain('<details className="landing-nav-menu">');
    expect(component).toContain('<summary>Explore <span aria-hidden="true">+</span></summary>');
    expect(component).toContain('aria-label="Owner sign in to FREE CRM">Sign in</a>');
    expect(component).toContain('<a href="/platform"><span>Platform</span>');
    expect(component).toContain('<a href="/tour"><span>Product tour</span>');
    expect(component).toContain('<a href="/contribute"><span>Contribute</span>');
    expect(component).toContain('<span>GitHub ↗</span><i aria-hidden="true">04</i>');
  });

  it('provides keyboard-sized menu targets and a compact responsive layout', () => {
    expect(css).toContain('.landing-nav-menu > summary');
    expect(css).toContain('.landing-nav-menu[open] > summary');
    expect(css).toMatch(/\.landing-nav-menu-panel a \{[^}]*min-height: 46px;/);
    expect(css).toContain('justify-content:center');
  });
});
