import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Workspace } from '../src/core/workspace.js';
import { exportBrand } from '../src/export/exporter.js';
import { finalizeConcept } from '../src/export/kit.js';
import { buildGallery } from '../src/gallery/gallery.js';
import { verifyConcept } from '../src/report/quality.js';
import { decodeEntities } from '../src/svg/xml.js';
import { TR } from '../src/ui/tr.js';
import { synthBrand } from './helpers.js';

/** Every piece of interface text a page marks for translation, plus the strings its own script translates. */
function translatable(html: string): string[] {
  const keys = new Set<string>();
  for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) keys.add(decodeEntities(m[1]!));
  for (const m of html.matchAll(/<(\w+) data-i18n>([^<]*)<\/\1>/g)) keys.add(decodeEntities(m[2]!));
  for (const m of html.matchAll(/data-i18n-(?:placeholder|title|aria-label)="([^"]+)"/g))
    keys.add(decodeEntities(m[1]!));
  for (const m of html.matchAll(/\bT\(([^()]*)\)/g))
    for (const s of m[1]!.matchAll(/'([^']+)'/g)) if (/[a-z]/i.test(s[1]!)) keys.add(s[1]!);
  // Labels the gallery script looks up from a table.
  for (const m of html.matchAll(/const PICK=\{([^}]*)\}/g))
    for (const s of m[1]!.matchAll(/:'([^']+)'/g)) keys.add(s[1]!);
  return [...keys];
}

let review: string;
let approved: string;
let kit: string;
let guidelines: string;
let ws: Workspace;

beforeAll(async () => {
  // A round of proposals waiting for the user.
  const r = synthBrand();
  r.ws.saveConcept({ ...r.ws.concept('nimbra', 'fold'), round: 1 });
  await verifyConcept(r.ws, 'nimbra', 'fold');
  review = readFileSync((await buildGallery(r.ws)).path, 'utf8');
  // The same brand approved and exported.
  ({ ws } = synthBrand());
  await verifyConcept(ws, 'nimbra', 'fold');
  await finalizeConcept(ws, 'nimbra', 'fold', { acceptRisk: true, userChoice: 'Chosen in a test.' });
  await exportBrand(ws, 'nimbra', { groups: ['logos', 'web', 'tokens', 'guidelines'] });
  approved = readFileSync((await buildGallery(ws)).path, 'utf8');
  kit = readFileSync(join(ws.exportsDir('nimbra'), 'index.html'), 'utf8');
  guidelines = readFileSync(join(ws.exportsDir('nimbra'), 'guidelines', 'index.html'), 'utf8');
}, 120_000);

describe('page chrome: language and theme', () => {
  it('has a Turkish translation for every piece of interface text', () => {
    for (const [name, html] of Object.entries({ review, approved, kit, guidelines })) {
      const keys = translatable(html);
      expect(keys.length, name).toBeGreaterThan(20);
      expect(
        keys.filter((k) => !(k in TR)),
        name,
      ).toEqual([]);
    }
  });

  it('offers EN/TR and light/dark/system on every page and shows the workflow', () => {
    for (const html of [review, approved, kit, guidelines]) {
      for (const s of [
        'data-mk-lang="en"',
        'data-mk-lang="tr"',
        'data-mk-theme="light"',
        'data-mk-theme="dark"',
      ])
        expect(html).toContain(s);
      expect(html).toContain('data-mk-theme="system"');
      expect(html).toContain('localStorage.getItem(K)');
    }
    expect(review).toContain('<li class="now" aria-current="step"><span data-i18n>Compare</span></li>');
    expect(review).toContain('<span class="letter">A</span>Fold');
  });

  it('keeps brand names and evidence out of the dictionary', () => {
    expect(review).toContain('Fold</h3>');
    expect(TR).not.toHaveProperty('Nimbra');
  });

  it('runs only its own pinned scripts and never reaches the network', () => {
    for (const html of [kit, guidelines]) {
      const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
      expect(scripts).toHaveLength(1);
      const hash = createHash('sha256').update(scripts[0]!, 'utf8').digest('base64');
      expect(html).toContain(`script-src 'sha256-${hash}'`);
      expect(html).not.toMatch(/connect-src|https?:\/\/(?!www\.w3\.org)/);
      expect(html).not.toMatch(/\son[a-z]+="/i);
    }
    const nonce = /script-src 'nonce-([^']+)'/.exec(review)?.[1];
    expect([...review.matchAll(/<script nonce="([^"]+)">/g)].map((m) => m[1])).toEqual([nonce, nonce]);
    expect(review).not.toMatch(/<script>/);
    // Interface text is set with textContent only: no translated string can become markup.
    expect(review).not.toMatch(/innerHTML=(?!'')/);
  });
});
