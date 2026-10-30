import { describe, expect, it } from 'vitest';
import {
  emptyUnderstanding,
  finishUnderstanding,
  fromDependencies,
  fromReadme,
  fromSite,
  laravelRoutes,
  localeOf,
  mergeUnderstanding,
  surfaceOf,
} from '../src/research/product.js';
import { scanRepo } from '../src/research/repo.js';

describe('product understanding', () => {
  it('reads value proposition, features, audience and pricing from a README', () => {
    const u = emptyUnderstanding();
    fromReadme(
      `# Acme\n\nShared inbox for support teams.\n\nAcme routes email and chat to the right person.\n\n## Features\n\n- Assignment rules\n- SLA timers\n\n## Who it is for\n\nSupport teams of 3–50 people.\n\n## Pricing\n\n- $12 per user per month\n\n\`\`\`sh\nnpm i acme\n\`\`\`\n`,
      'README.md',
      u,
    );
    finishUnderstanding(u);
    expect(u.valueProposition?.text).toBe(
      'Shared inbox for support teams. Acme routes email and chat to the right person.',
    );
    expect(u.features.map((f) => f.text)).toEqual(['Assignment rules', 'SLA timers']);
    expect(u.audience[0]?.text).toBe('Support teams of 3–50 people.');
    expect(u.pricing?.text).toBe('$12 per user per month');
    expect(u.unknown).toEqual([
      'platforms: where the product runs is not evident',
      'languages and markets: no locale files or stated markets',
    ]);
  });

  it('marks dependency-based capabilities as inferred', () => {
    const u = emptyUnderstanding();
    fromDependencies(['stripe', 'next-auth', 'left-pad'], 'package.json', u);
    expect(u.capabilities).toEqual([
      { text: 'takes payments (dependency stripe)', source: 'package.json', basis: 'inferred' },
      {
        text: 'has user accounts and sign-in (dependency next-auth)',
        source: 'package.json',
        basis: 'inferred',
      },
    ]);
  });

  it('finds routes, screens and locales from file paths', () => {
    expect(surfaceOf('app/invoices/page.tsx')).toBe('/invoices');
    expect(surfaceOf('src/app/(marketing)/pricing/page.tsx')).toBe('/pricing');
    expect(surfaceOf('app/[id]/page.tsx')).toBeUndefined();
    expect(surfaceOf('pages/about.tsx')).toBe('/about');
    expect(surfaceOf('lib/screens/wind_down_screen.dart')).toBe('wind down screen');
    expect(surfaceOf('ios/App/Views/SettingsView.swift')).toBe('Settings screen');
    expect(laravelRoutes("Route::get('/dashboard', fn() => 1); Route::view('/about', 'about');")).toEqual([
      '/dashboard',
      '/about',
    ]);
    expect(localeOf('src/locales/tr/common.json')).toBe('tr');
    expect(localeOf('lib/l10n/app_de.arb')).toBe('de');
    expect(localeOf('android/app/src/main/res/values-es/strings.xml')).toBe('es');
  });

  it('reads a website: hero, feature headings, pricing, audience, platforms', () => {
    const u = fromSite([
      {
        url: 'https://acme.test/',
        description: 'Ship support faster',
        headings: ['Shared inbox for support teams', 'Rules', 'Reports'],
        textSample: 'Download on the App Store',
        language: 'en',
      },
      { url: 'https://acme.test/pricing', headings: ['Simple pricing'], textSample: 'Team €9 per month' },
    ]);
    expect(u.valueProposition?.text).toBe('Shared inbox for support teams — Ship support faster');
    expect(u.features.map((f) => f.text)).toEqual(['Rules', 'Reports']);
    expect(u.pricing?.text).toMatch(/€9 per month/);
    expect(u.audience[0]?.text).toBe('for support teams');
    expect(u.platforms.map((p) => p.text)).toEqual(['iOS', 'web']);
  });

  it('merges repository and website understanding and closes gaps', () => {
    const repo = emptyUnderstanding();
    fromReadme('# A\n\nInvoices for freelancers who bill by the hour.\n', 'README.md', repo);
    finishUnderstanding(repo);
    expect(repo.unknown.some((x) => x.startsWith('pricing'))).toBe(true);
    const site = fromSite([{ url: 'https://a.test/pricing', headings: ['Plans'], textSample: '$5/mo' }]);
    const m = mergeUnderstanding(repo, site);
    expect(m.valueProposition?.source).toBe('README.md');
    expect(m.unknown.some((x) => x.startsWith('pricing'))).toBe(false);
  });

  it('understands the benchmark fixture projects', () => {
    const saas = scanRepo('bench/scenarios/saas-invoicing/project').product;
    expect(saas.surfaces.map((s) => s.text)).toEqual(
      expect.arrayContaining(['/invoices', '/forecast', '/pricing']),
    );
    expect(saas.capabilities.map((c) => c.text.split(' (')[0])).toEqual(
      expect.arrayContaining(['takes payments', 'has user accounts and sign-in']),
    );
    const mobile = scanRepo('bench/scenarios/mobile-sleep/project').product;
    expect(mobile.platforms.map((p) => p.text)).toEqual(expect.arrayContaining(['iOS', 'Android']));
    expect(mobile.languages.map((l) => l.text)).toEqual(['English', 'Turkish']);
    const family = scanRepo('bench/scenarios/family-workspace/project').product;
    expect(family.features).toHaveLength(3);
    expect(family.audience[0]?.text).toBe('for small European companies');
  });
});
