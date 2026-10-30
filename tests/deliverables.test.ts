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
});
