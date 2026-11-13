import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { MarkiloError } from '../src/core/errors.js';
import { splitGlyphs, wordMetrics } from '../src/design/glyphs.js';
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

  it('measures a word without a text for other commands', async () => {
    const m = await wordMetrics(word());
    expect(m.capHeight).toBeCloseTo(50, 1);
    expect(m.baseline).toBeCloseTo(60, 1);
    expect(m.glyphs).toBe(6);
  });
});
