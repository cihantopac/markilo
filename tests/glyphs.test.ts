import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { MarkiloError } from '../src/core/errors.js';
import {
  assembleWord,
  drawnGlyph,
  type GlyphInfo,
  type GlyphSet,
  glyphSet,
  glyphWarnings,
  hasWordMetrics,
  sourceStems,
  splitGlyphs,
  wordMetrics,
  wordOnlyCopy,
} from '../src/design/glyphs.js';
import { composeLockup } from '../src/design/lockup.js';
import { ensurePathKit } from '../src/geom/pathkit.js';
import { fixture } from './helpers.js';

const word = () => readFileSync(fixture('glyphs/nimbra-word.svg'), 'utf8');
const lockup = () => readFileSync(fixture('glyphs/nimbra-lockup.svg'), 'utf8');

beforeAll(async () => {
  await ensurePathKit();
});

describe('family glyphs', () => {
  it('splits a transformed word into its letters', async () => {
    const r = await splitGlyphs(word(), 'NIMBRA');
    expect(r.glyphs.map((g) => g.char)).toEqual(['N', 'I', 'M', 'B', 'R', 'A']);
    // Drawn at cap 100 and scaled by 0.5 inside nested groups: 50 units in the file, baseline at y = 60.
    expect(r.capHeight).toBeCloseTo(50, 1);
    expect(r.baseline).toBeCloseTo(60, 1);
    // B keeps both counters, I keeps its dot.
    const contours = (d: string) => d.match(/M/g)?.length ?? 0;
    expect(contours(r.glyphs[3]!.d)).toBe(3);
    expect(contours(r.glyphs[1]!.d)).toBe(2);
    // Letter positions in cap units: N at 0, I at 100, M at 140, B at 260, R at 355, A at 450.
    expect(r.glyphs.map((g) => Math.round(g.x))).toEqual([0, 100, 140, 260, 355, 450]);
    expect(r.glyphs[0]!.width).toBeCloseTo(80, 0);
    // Each gap is 20: sidebearings are the measured space to the neighbour.
    expect(r.glyphs[2]!.left).toBeCloseTo(20, 0);
    expect(r.glyphs[2]!.right).toBeCloseTo(20, 0);
  });

  it('metrics are in cap units', async () => {
    const r = await splitGlyphs(word(), 'NIMBRA');
    expect(Math.abs(r.stem - 14)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.bar! - 12)).toBeLessThanOrEqual(1);
    const B = r.glyphs.find((g) => g.char === 'B')!;
    expect(Math.abs(B.stem! - 14)).toBeLessThanOrEqual(1);
    expect(Math.abs(B.bar! - 12)).toBeLessThanOrEqual(1);
    expect(r.glyphs.find((g) => g.char === 'I')!.terminals).toBe('flared');
    for (const c of ['N', 'B', 'R']) expect(r.glyphs.find((g) => g.char === c)!.terminals).toBe('flat');
    expect(r.overshoot).toBeLessThan(1);
  });

  it('an ambiguous split returns the groups', async () => {
    let err: unknown;
    try {
      await splitGlyphs(word(), 'NIMBR');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MarkiloError);
    const e = err as MarkiloError;
    expect(e.code).toBe('INVALID_INPUT');
    const groups = (e.details as { groups: { x0: number; x1: number }[] }).groups;
    expect(groups).toHaveLength(6);
    expect(groups[0]!.x0).toBeCloseTo(10, 0);
    expect(groups[0]!.x1).toBeCloseTo(50, 0);
  });

  it("a lockup's symbol is dropped in auto mode", async () => {
    const r = await splitGlyphs(lockup(), 'NIMBRA');
    expect(r.glyphs.map((g) => g.char).join('')).toBe('NIMBRA');
    expect(r.dropped).toHaveLength(1);
    expect(r.baseline).toBeCloseTo(70, 1);
    // Read as a word, the symbol is one group too many.
    await expect(splitGlyphs(lockup(), 'NIMBRA', { part: 'word' })).rejects.toThrow(/7 groups/);
  });

  it("a lockup's measured copy holds only the word", async () => {
    const r = await splitGlyphs(lockup(), 'NIMBRA');
    const copy = await wordOnlyCopy(lockup(), 'NIMBRA', r.fill);
    expect(hasWordMetrics(copy)).toBe(true);
    expect(copy).toContain(`data-baseline="${r.baseline}"`);
    expect(copy).not.toContain('<circle');
    expect(copy).not.toContain('#3b5bdb');
    const again = await splitGlyphs(copy, 'NIMBRA', { part: 'word' });
    expect(again.glyphs).toHaveLength(6);
    expect(again.dropped).toEqual([]);
    // The viewBox starts at the word, not at the symbol (which sits at x < 90).
    const vb = /viewBox="([-\d.]+)/.exec(copy)!;
    expect(Number(vb[1])).toBeGreaterThan(90);
  });

  it('a gradient-painted word falls back to a literal colour', async () => {
    const svg = word().replace(/fill="#1b2140"/g, 'fill="url(#g)"');
    const r = await splitGlyphs(svg, 'NIMBRA');
    expect(r.fill).toBe('#111111');
    expect(r.fillSubstituted).toBe(true);
    expect(word()).toContain('#1b2140');
    expect((await splitGlyphs(word(), 'NIMBRA')).fillSubstituted).toBeUndefined();
  });

  it('measures a word without a text for other commands', async () => {
    const m = await wordMetrics(word());
    expect(m.capHeight).toBeCloseTo(50, 1);
    expect(m.baseline).toBeCloseTo(60, 1);
    expect(m.glyphs).toBe(6);
  });
});

describe('family word', () => {
  const nimbra = async () => glyphSet('nimbra', 'nimbra-word.svg', await splitGlyphs(word(), 'NIMBRA'));
  const drawnL = () => readFileSync(fixture('glyphs/drawn-l.svg'), 'utf8');

  it('takes a block with its own spacing', async () => {
    const set = await nimbra();
    const r = await assembleWord({ text: 'BRA', takes: [{ set, letters: 'BRA' }], drawn: [] });
    expect(r.missing).toEqual([]);
    const src = set.glyphs.slice(3).map((g) => g.x - set.glyphs[3]!.x);
    const out = r.letters.map((l) => l.x - r.letters[0]!.x);
    for (const [i, x] of out.entries()) expect(x).toBeCloseTo(src[i]!, 2);
    expect(r.letters.map((l) => l.from)).toEqual(['nimbra', 'nimbra', 'nimbra']);
  });

  it('mixes taken and drawn letters', async () => {
    const set = await nimbra();
    const L = await drawnGlyph(drawnL(), 'L');
    const r = await assembleWord({ text: 'LBRA', takes: [{ set, letters: 'BRA' }], drawn: [L], tracking: 4 });
    expect(r.missing).toEqual([]);
    expect(r.letters.map((l) => `${l.char}:${l.from}`)).toEqual([
      'L:drawn',
      'B:nimbra',
      'R:nimbra',
      'A:nimbra',
    ]);
    // L carries no sidebearings: it gets the word's median (20); B's left is 20; plus tracking.
    expect(r.letters[1]!.x - (r.letters[0]!.x + 60)).toBeCloseTo(20 + 4, 1);
    expect(r.svg).toContain('data-char="L"');
  });

  it('sidebearings of a drawn letter scale with its cap height', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800" data-cap-height="700" data-baseline="700" data-left="70" data-right="140"><path d="M0 0H100V700H0Z"/></svg>`;
    const g = await drawnGlyph(svg, 'I');
    expect(g.left).toBeCloseTo(10, 1);
    expect(g.right).toBeCloseTo(20, 1);
  });

  it('drawnGlyph keeps an arc C inside its cap', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -100 78 100"><path d="M74 -93.86A50 50 0 1 0 74 -6.14L74 -31.17A33.6 33.6 0 1 1 74 -68.83Z"/></svg>`;
    const g = await drawnGlyph(svg, 'C');
    expect(g.top).toBeGreaterThanOrEqual(-100.5);
    expect(g.bottom).toBeLessThanOrEqual(0.5);
  });

  it('a <use> fan-out is refused', async () => {
    let defs = '<g id="g0"><rect width="10" height="10"/></g>';
    for (let i = 1; i <= 20; i++)
      defs += `<g id="g${i}"><use href="#g${i - 1}"/><use href="#g${i - 1}"/></g>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${defs}<use href="#g20"/></svg>`;
    await expect(splitGlyphs(svg, 'A')).rejects.toThrow(/more than 5000 elements/);
  });

  it('writes the given fill on the word, #111111 by default', async () => {
    const set = await nimbra();
    const dflt = await assembleWord({ text: 'BRA', takes: [{ set, letters: 'BRA' }], drawn: [] });
    expect(dflt.svg).toContain('<g fill="#111111"');
    const r = await assembleWord({
      text: 'BRA',
      takes: [{ set, letters: 'BRA' }],
      drawn: [],
      fill: '#1b2140',
    });
    expect(r.svg).toContain('<g fill="#1b2140"');
  });

  it('missing letters are listed', async () => {
    const set = await nimbra();
    const r = await assembleWord({ text: 'BRAVO', takes: [{ set, letters: 'BRA' }], drawn: [] });
    expect(r.missing).toEqual(['V', 'O']);
    expect(r.svg.match(/data-missing="true"/g)).toHaveLength(2);
    await expect(
      assembleWord({ text: 'BRAVO', takes: [{ set, letters: 'BAR' }], drawn: [] }),
    ).rejects.toThrow(/BAR/);
  });

  it('the word carries baseline and cap height, and composeLockup aligns the symbol to it', async () => {
    const set = await nimbra();
    const r = await assembleWord({ text: 'NIMBRA', takes: [{ set, letters: 'NIMBRA' }], drawn: [] });
    expect(r.svg).toContain('data-markilo-role="wordmark"');
    expect(r.svg).toContain('data-lettering="family"');
    expect(r.svg).toContain('data-baseline="0"');
    expect(r.svg).toContain('data-cap-height="100"');
    const symbol =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50"/></svg>';
    const l = composeLockup(symbol, r.svg, {
      layout: 'horizontal',
      symbolInk: { x: 0, y: 0, w: 100, h: 100 },
    });
    const m = [...l.svg.matchAll(/matrix\(([^)]*)\)/g)].map((x) => x[1]!.split(' ').map(Number));
    const [sym, wm] = m as [number[], number[]];
    // The symbol (100 units tall in its own box) stands on the word's baseline (y = 0 in the word).
    expect(sym[5]! + 100 * sym[3]!).toBeCloseTo(wm[5]!, 1);
  });
});

describe('family glyph checks', () => {
  const g = (char: string, advance: number, left = 10, right = 10, stem: number | null = 14): GlyphInfo => ({
    char,
    d: '',
    x: 0,
    width: advance - 10,
    top: -100,
    bottom: 0,
    left,
    right,
    advance,
    stem,
    bar: 12,
    terminals: 'flat',
    overshoot: { above: 0, below: 0 },
  });

  it('warns about a merged circle and a wide sidebearing', () => {
    const w = glyphWarnings([g('N', 80), g('O', 163), g('V', 80, 51, 10), g('A', 85)], 'auto');
    expect(w).toHaveLength(2);
    expect(w[0]).toMatch(/^O: advance 163/);
    expect(w[0]).toContain('--part word');
    expect(w[1]).toMatch(/^V: left sidebearing 51/);
    expect(glyphWarnings([g('N', 80), g('O', 163), g('A', 85), g('I', 80)], 'word')[0]).not.toContain(
      '--part word',
    );
    expect(glyphWarnings([g('N', 90), g('I', 40), g('A', 95)], 'auto')).toEqual([]);
  });

  it('reports stems per source and warns when they differ by over 15 %', () => {
    const set = (ref: string, stem: number): GlyphSet =>
      ({
        ref,
        text: 'OK',
        stem,
        bar: 12,
        glyphs: [g('O', 90, 10, 10, stem), g('K', 90, 10, 10, stem)],
      }) as GlyphSet;
    const r = sourceStems([
      { set: set('parent', 12.6), letters: 'O' },
      { set: set('sibling', 17), letters: 'K' },
    ]);
    expect(r.sources).toEqual([
      { ref: 'parent', letters: 'O', stem: 12.6, bar: 12 },
      { ref: 'sibling', letters: 'K', stem: 17, bar: 12 },
    ]);
    expect(r.warnings).toEqual(['stems differ between parent (12.6) and sibling (17) — 26 %']);
    const close = sourceStems([
      { set: set('a', 14), letters: 'O' },
      { set: set('b', 15), letters: 'K' },
    ]);
    expect(close.warnings).toEqual([]);
  });
});
