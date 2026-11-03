import { describe, expect, it } from 'vitest';
import type { Brief } from '../src/core/types.js';
import { resolveDeliverables, suggestDeliverables } from '../src/export/deliverables.js';

const brief = (product: Brief['product'], deliverables?: string[]): Brief => ({
  schema: 'markilo/brief@1',
  brand: 'nimbra',
  name: 'Nimbra',
  mode: 'new',
  product,
  ...(deliverables ? { deliverables } : {}),
});

describe('deliverables', () => {
  it('gives a web app web assets but no native icon sets', () => {
    const s = suggestDeliverables(brief({ type: 'web app', platforms: ['web'] }));
    expect(s.groups).toEqual(['logos', 'web', 'social', 'tokens', 'guidelines']);
    expect(s.optional.map((o) => o.group)).toEqual(['ios', 'macos', 'android', 'windows', 'marketing']);
  });
  it('adds mobile and desktop sets only when the product ships there', () => {
    expect(suggestDeliverables(brief({ platforms: ['iOS', 'Android'] })).groups).toEqual([
      'logos',
      'ios',
      'android',
      'social',
      'tokens',
      'guidelines',
    ]);
    expect(
      suggestDeliverables(brief({ type: 'SaaS', platforms: ['web', 'desktop (Electron)'] })).groups,
    ).toContain('windows');
  });
  it("uses the brief's saved choice and ignores unknown names", () => {
    expect(resolveDeliverables(brief({ platforms: ['web'] }, ['web', 'ios', 'business cards']))).toEqual({
      groups: ['web', 'ios'],
      source: 'brief',
    });
    expect(resolveDeliverables(brief({ platforms: ['web'] }, ['business cards'])).source).toBe('suggested');
  });
  it('reads "web (mobile first)" as a website', () => {
    const s = suggestDeliverables(brief({ platforms: ['web (mobile first)'] }));
    expect(s.groups).toContain('web');
    expect(s.groups).not.toContain('ios');
    expect(s.groups).not.toContain('android');
  });
  it('mobile without web still suggests native icon sets', () => {
    const s = suggestDeliverables(brief({ platforms: ['mobile'] }));
    expect(s.groups).toEqual(expect.arrayContaining(['ios', 'android']));
  });
  it('an explicit platform still counts next to web', () => {
    const s = suggestDeliverables(brief({ platforms: ['web', 'iOS'] }));
    expect(s.groups).toEqual(expect.arrayContaining(['web', 'ios']));
    expect(s.groups).not.toContain('android');
  });
  it('a web word outside the platforms entry does not cancel mobile', () => {
    const banking = suggestDeliverables(
      brief({ type: 'mobile app', category: 'online banking', platforms: ['mobile'] }),
    );
    expect(banking.groups).toEqual(expect.arrayContaining(['ios', 'android']));
    const market = suggestDeliverables({
      ...brief({ platforms: ['mobile'] }),
      oneLiner: 'An online marketplace for handmade goods',
    });
    expect(market.groups).toEqual(expect.arrayContaining(['ios', 'android']));
  });
  it('web and mobile as separate platforms give native sets and web', () => {
    const s = suggestDeliverables(brief({ platforms: ['web', 'mobile'] }));
    expect(s.groups).toEqual(expect.arrayContaining(['ios', 'android', 'web']));
  });
  it('a web word next to mobile in the one-liner still means native apps', () => {
    const s = suggestDeliverables({
      ...brief({ platforms: ['mobile'] }),
      oneLiner: 'An online store for mobile users',
    });
    expect(s.groups).toEqual(expect.arrayContaining(['ios', 'android']));
  });
});
