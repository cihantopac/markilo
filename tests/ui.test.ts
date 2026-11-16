import { createHash } from 'node:crypto';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Workspace } from '../src/core/workspace.js';
import { exportBrand } from '../src/export/exporter.js';
import { finalizeConcept } from '../src/export/kit.js';
import { oneLine } from '../src/gallery/cards.js';
import { buildGallery } from '../src/gallery/gallery.js';
import { verifyConcept } from '../src/report/quality.js';
import { decodeEntities } from '../src/svg/xml.js';
import { INTERFACE_COLOURS } from '../src/ui/chrome.js';
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
  r.ws.saveConcept({
    ...r.ws.concept('nimbra', 'fold'),
    round: 1,
    pitch: {
      idea: 'A folded page that turns into an N. Every crease holds a note, and the page keeps its corner.',
      strengths: ['Reads at 16 px'],
      weaknesses: ['Close to a generic page icon'],
    },
  });
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

/** Hex and rgba colours written in a page's own stylesheets (brand artwork lives in style="…" and SVG, not here). */
function interfaceColours(html: string): { hex: string[]; rgba: string[] } {
  const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]!).join('\n');
  return {
    hex: [...new Set([...css.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase()))],
    rgba: [...new Set([...css.matchAll(/rgba?\(([^)]*)\)/g)].map((m) => m[1]!.replace(/\s/g, '')))],
  };
}

describe('interface colours: paper, ink and oxblood only', () => {
  const pages = () => ({ review, approved, kit, guidelines });
  it('uses only Markilo’s three colours in interface CSS', () => {
    const allowed = new Set(INTERFACE_COLOURS.map((c) => c.toLowerCase()));
    for (const [name, html] of Object.entries(pages())) {
      const { hex, rgba } = interfaceColours(html);
      expect(
        hex.filter((c) => !allowed.has(c)),
        name,
      ).toEqual([]);
      expect(
        rgba.filter((c) => !/^(22,18,15|242,236,225|126,29,42|0,0,0),/.test(c)),
        name,
      ).toEqual([]);
    }
  });
  it('has no status hues (good / warn / bad) left', () => {
    for (const [name, html] of Object.entries(pages()))
      expect(html, name).not.toMatch(/var\(--(good|warn|bad)\)/);
  });
});

/** The part of a proposal shown before "Details" is opened. */
const proposals = (html: string) =>
  [...html.matchAll(/<article class="proposal[^"]*" id="([^"]+)"[\s\S]*?<\/article>/g)].map((m) => ({
    id: m[1]!,
    html: m[0],
    visible: m[0].split('<details class="more"')[0]!,
    details: m[0].split('<details class="more"')[1] ?? '',
  }));

/** A round of n proposals (copies of "fold"), built into a gallery. */
async function roundOf(n: number): Promise<string> {
  const { ws: w } = synthBrand();
  const fold = w.concept('nimbra', 'fold');
  w.saveConcept({ ...fold, round: 1 });
  for (let i = 2; i <= n; i++) {
    const id = `fold${i}`;
    cpSync(w.conceptDir('nimbra', 'fold'), w.conceptDir('nimbra', id), { recursive: true });
    w.saveConcept({ ...fold, id, title: `Fold ${i}`, round: 1 });
  }
  return readFileSync((await buildGallery(w)).path, 'utf8');
}

describe('gallery: calm presentation', () => {
  it('opens with a board of the round, one tile per proposal, each pointing at its proposal', () => {
    expect(review).toContain('<nav class="board"');
    const tiles = [...review.matchAll(/<a class="tile[^"]*" href="#([^"]+)"/g)].map((m) => m[1]);
    expect(tiles).toEqual(proposals(review).map((p) => p.id));
    expect(tiles).toEqual(['nimbra-fold']);
  });
  it('shows the marks, one idea line and the decision; the rest is folded into Details', () => {
    const [p] = proposals(review);
    for (const hidden of [
      'class="pitch"',
      'class="checks"',
      'class="swatches"',
      'Close to a generic page icon',
    ])
      expect(p!.visible, hidden).not.toContain(hidden);
    expect(p!.details).toContain('Close to a generic page icon');
    expect(p!.details).toContain('Every crease holds a note');
    expect(p!.visible).toContain('class="decide"');
  });
  it('says the idea in one short sentence', () => {
    const idea = /<p class="idea">([^<]*)<\/p>/.exec(proposals(review)[0]!.visible)?.[1] ?? '';
    expect(idea).toBe('A folded page that turns into an N.');
    expect(idea.length).toBeLessThanOrEqual(140);
  });
  it('keeps every proposal in the page without script (switching only hides with JS)', () => {
    for (const p of proposals(review)) expect(p.html).not.toMatch(/<article[^>]*\shidden/);
  });
  it('copies decisions instead of the old request text', () => {
    expect(review).toMatch(/id="copy"[^>]*><span data-i18n>Copy decisions<\/span>/);
    expect(review).not.toContain('Copy request');
  });
  it('shows a failing check on the proposal without opening Details', async () => {
    const { ws: w } = synthBrand();
    w.saveConcept({ ...w.concept('nimbra', 'fold'), round: 1 });
    await verifyConcept(w, 'nimbra', 'fold');
    const file = join(w.reportsDir('nimbra'), 'quality-fold.json');
    const q = JSON.parse(readFileSync(file, 'utf8'));
    q.summary.fail = 1;
    q.checks.push({ id: 'contrast', label: 'Contrast', status: 'fail', value: 1.2, message: 'too low' });
    writeFileSync(file, JSON.stringify(q));
    const [p] = proposals(readFileSync((await buildGallery(w)).path, 'utf8'));
    expect(p!.visible).toMatch(/class="flags"[\s\S]*1 check failing/);
  });
  it.each([1, 2, 4])(
    'builds a round of %i proposals with that many tiles',
    async (n) => {
      const html = await roundOf(n);
      expect([...html.matchAll(/<a class="tile/g)]).toHaveLength(n);
      expect(proposals(html)).toHaveLength(n);
    },
    60_000,
  );
});

describe('gallery: the idea line', () => {
  it('ends a long first sentence at its clause, not in the middle of a word', () => {
    expect(
      oneLine(
        "A heavy lowercase word cut like a type designer's proof: every join of m, a, r and k carries the same deep ink trap, and the stems rise.",
        120,
      ),
    ).toBe("A heavy lowercase word cut like a type designer's proof.");
  });
  it('falls back to a word cut with an ellipsis when there is no clause to end at', () => {
    expect(oneLine('one two three four five six seven eight nine ten eleven', 30)).toBe(
      'one two three four five six…',
    );
  });
});

describe('gallery: logos stand out from the page', () => {
  it('sets the page on a stage tone that is neither paper nor ink, in both themes', () => {
    expect(review).toMatch(/body\{[^}]*background:var\(--stage\)/);
    const stages = [...new Set([...review.matchAll(/--stage:(#[0-9a-f]{6})/g)].map((m) => m[1]))];
    expect(stages).toHaveLength(2);
    for (const s of stages) expect(['#f2ece1', '#16120f', '#ffffff', '#111318']).not.toContain(s);
  });
});
