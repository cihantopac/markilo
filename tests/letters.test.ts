import { describe, expect, it } from 'vitest';
import { checkLetters, letterAdvice } from '../src/analyze/letters.js';
import { type ConstructionSpec, compileSpec } from '../src/construct/compile.js';

const word = { glyph: { text: 'neon', font: 'inter', weight: 700, size: 400, at: [80, 600] } };

async function check(shape: unknown) {
  const spec = {
    role: 'wordmark',
    size: 1600,
    layers: [{ fill: 'primary', shape }],
  } as unknown as ConstructionSpec;
  const c = await compileSpec(spec, {});
  expect(c.letters?.map((l) => l.char).join('')).toBe('neon');
  return checkLetters(
    c.layers.map((l) => l.d),
    c.letters!,
  );
}

describe('letter legibility of built wordmarks', () => {
  it('finds nothing to say about an untouched word', async () => {
    const r = await check(word);
    expect(r!.letters.every((l) => l.verdict === 'unchanged')).toBe(true);
    expect(r!.problems).toEqual([]);
  });

  it('notes an e whose eye was filled in, without blocking the sketch', async () => {
    const c = await compileSpec(
      {
        role: 'wordmark',
        size: 1600,
        layers: [{ fill: 'primary', shape: word }],
      } as unknown as ConstructionSpec,
      {},
    );
    const e = c.glyphs[1]!;
    const r = await check({
      union: [word, { rect: { x: e.x + e.w * 0.2, y: e.y + e.h * 0.2, w: e.w * 0.6, h: e.h * 0.3 } }],
    });
    const reading = r!.letters[1]!;
    expect(reading.counters).toEqual({ before: 1, after: 0 });
    expect(reading.verdict === 'lost-counter' || reading.verdict === 'reads-as-other').toBe(true);
    expect(letterAdvice(r).notes.length + letterAdvice(r).fix.length).toBeGreaterThan(0);
  });

  it('says which letter an o cut open on the right now reads as', async () => {
    const c = await compileSpec(
      {
        role: 'wordmark',
        size: 1600,
        layers: [{ fill: 'primary', shape: word }],
      } as unknown as ConstructionSpec,
      {},
    );
    const o = c.glyphs[2]!;
    const r = await check({
      subtract: [word, { rect: { x: o.x + o.w * 0.62, y: o.y + o.h * 0.3, w: o.w * 0.5, h: o.h * 0.4 } }],
    });
    const reading = r!.letters[2]!;
    expect(reading.readsAs?.char).toBe('c');
    expect(letterAdvice(r).fix[0]).toMatch(/"o"\) now looks more like "c".*"necn"/);
  });

  it('says where a separate added element will be read as punctuation or an accent', async () => {
    // Spaced out, as a word with an inserted element is: the element needs room between the letters.
    const spaced = { glyph: { ...word.glyph, tracking: 150 } };
    const c = await compileSpec(
      {
        role: 'wordmark',
        size: 1600,
        layers: [{ fill: 'primary', shape: spaced }],
      } as unknown as ConstructionSpec,
      {},
    );
    const [, e, o, n2] = c.glyphs as [
      (typeof c.glyphs)[0],
      (typeof c.glyphs)[0],
      (typeof c.glyphs)[0],
      (typeof c.glyphs)[0],
    ];
    const dot = (x: number, y: number) => ({ circle: { c: [x, y], r: 22 } });
    const between = await check({ union: [spaced, dot((e.x + e.w + o.x) / 2, e.y + e.h / 2)] });
    expect(between!.added).toEqual([{ position: 'between', letters: [1, 2] }]);
    expect(between!.problems.join(' ')).toMatch(/"ne-on"/);
    const above = await check({ union: [spaced, dot(o.x + o.w / 2, o.y - 90)] });
    expect(above!.added).toEqual([{ position: 'above', letters: [2] }]);
    expect(above!.problems.join(' ')).toMatch(/"neón"/);
    const after = await check({ union: [spaced, dot(n2.x + n2.w + 70, n2.y + n2.h - 22)] });
    expect(after!.added[0]?.position).toBe('after');
    // Inside a counter it is the idea (a seed held by a letter), not punctuation.
    const inside = await check({ union: [spaced, dot(o.x + o.w / 2, o.y + o.h / 2)] });
    expect(inside!.added).toEqual([]);
  });
});
