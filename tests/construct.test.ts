import { describe, expect, it } from 'vitest';
import { type ConstructionSpec, compileSpec, constructionSvg } from '../src/construct/compile.js';
import { evaluate } from '../src/construct/expr.js';
import { runVariants, variantParams } from '../src/construct/vary.js';
import { lintSvg } from '../src/svg/lint.js';

const ring: ConstructionSpec = {
  params: { r: 360, w: 120, gap: 32 },
  vary: { w: [100, 140], gap: [24, 48] },
  layers: [
    {
      name: 'loop',
      fill: 'primary',
      shape: {
        gap: {
          shape: { arc: { c: [512, 512], r: 'r', from: 30, to: 330, width: 'w', cap: 'round' } },
          cut: { rect: { c: [760, 512], w: 300, h: 'w', r: 'w/2' } },
          width: 'gap',
        },
      },
    },
    { name: 'bar', fill: 'accent', shape: { rect: { c: [760, 512], w: 300, h: 'w', r: 'w/2' } } },
  ],
};

describe('expressions', () => {
  it('evaluates arithmetic, params and degree trig', () => {
    expect(evaluate('r*0.5 + gap/2', { r: 100, gap: 10 })).toBe(55);
    expect(evaluate('2^3^2', {})).toBe(512);
    expect(evaluate('-w/2', { w: 8 })).toBe(-4);
    expect(evaluate('sin(30)*2', {})).toBeCloseTo(1, 9);
    expect(evaluate('max(1, min(5, 3))', {})).toBe(3);
  });
  it('refuses anything that is not arithmetic', () => {
    expect(() => evaluate('process.exit(1)', {})).toThrow();
    expect(() => evaluate('constructor', {})).toThrow(/unknown name/);
    expect(() => evaluate('1/0', {})).toThrow(/finite/);
  });
});

describe('construction specs', () => {
  it('compiles to a clean, filled master', async () => {
    const c = await compileSpec(ring, { palette: { primary: '#123abc' }, title: 'Test — symbol' });
    const lint = lintSvg(c.svg, { master: true });
    expect(lint.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(c.svg).toContain('fill="#123abc"');
    expect(c.svg).not.toMatch(/stroke|<text|<image/);
    expect(c.layers).toHaveLength(2);
    expect(c.warnings).toEqual([]); // the gap keeps the layers apart
    expect(c.stats.commands).toBeLessThan(60);
  });
  it('warns when differently colored layers overlap without a gap', async () => {
    const spec: ConstructionSpec = {
      layers: [
        { fill: 'primary', shape: { circle: { c: [400, 512], r: 300 } } },
        { fill: 'secondary', shape: { circle: { c: [620, 512], r: 300 } } },
      ],
    };
    const c = await compileSpec(spec);
    expect(c.warnings.join(' ')).toMatch(/overlap/);
  });
  it('applies transforms, refs, repeats and fit', async () => {
    const c = await compileSpec({
      defs: { petal: { ellipse: { c: [512, 300], rx: 40, ry: 120 } } },
      layers: [
        { fill: '#000000', shape: { repeat: { shape: { ref: 'petal' }, c: [512, 512], n: 6 }, rotate: 15 } },
      ],
      fit: 0.05,
    });
    expect(c.stats.ink).toBeGreaterThan(0.88);
    expect(c.stats.ink).toBeLessThanOrEqual(0.91);
    expect(constructionSvg(c, 64)).toContain('stroke="#e5484d"');
  });
  it('outlines glyphs from bundled fonts', async () => {
    const c = await compileSpec({
      layers: [
        {
          fill: 'ink',
          shape: { glyph: { text: 'M', font: 'inter', weight: 700, height: 600, c: [512, 512] } },
        },
      ],
    });
    expect(c.layers[0]!.d.length).toBeGreaterThan(40);
    expect(c.stats.ink).toBeGreaterThan(0.55);
  });
  it('builds wordmarks that carry type metrics for lockups', async () => {
    const c = await compileSpec({
      role: 'wordmark',
      layers: [
        {
          fill: 'ink',
          shape: {
            subtract: [
              { glyph: { text: 'Nova', font: 'inter', weight: 600, size: 200, at: [0, 200] } },
              { rect: { x: 0, y: 120, w: 40, h: 12 } },
            ],
          },
        },
      ],
    });
    expect(c.svg).toMatch(/data-markilo-role="wordmark"/);
    expect(c.svg).toMatch(/data-baseline="200"/);
    expect(Number(/data-cap-height="([\d.]+)"/.exec(c.svg)![1])).toBeGreaterThan(130);
  });
  it('evaluates params in order and takes explicit wordmark metrics', async () => {
    const c = await compileSpec({
      role: 'wordmark',
      params: { stem: 20, arm: 'stem*3', base: 100 },
      metrics: { baseline: 'base', capHeight: 'arm' },
      layers: [{ fill: 'ink', shape: { rect: { x: 0, y: 'base-arm', w: 'arm', h: 'arm' } } }],
    });
    expect(c.params.arm).toBe(60);
    expect(c.svg).toMatch(/data-baseline="100" data-cap-height="60"/);
  });
  it('substitutes params inside path data', async () => {
    const c = await compileSpec({
      params: { x: 200 },
      layers: [
        { fill: 'ink', shape: { path: { d: 'M{x} 800L{x} 300L{x*3} 300', width: 100, cap: 'round' } } },
      ],
    });
    expect(c.stats.ink).toBeCloseTo(0.586, 2); // x 200…600 plus round caps, on a 1024 artboard
    await expect(
      compileSpec({ layers: [{ fill: 'ink', shape: { path: { d: 'M{nope} 0L10 10', width: 4 } } }] }),
    ).rejects.toThrow(/unknown name "nope"/);
  });
  it('reports mistakes with the spec path', async () => {
    await expect(
      compileSpec({ layers: [{ fill: 'primary', shape: { cirle: { c: [0, 0], r: 1 } } }] }),
    ).rejects.toThrow(/layers\[0\]\.shape: unknown key/);
    await expect(
      compileSpec({ layers: [{ fill: 'primary', shape: { circle: { c: [0, 0], r: 'radius' } } }] }),
    ).rejects.toThrow(/layers\[0\]\.shape\.circle\.r: .*unknown name "radius"/);
    await expect(
      compileSpec({ layers: [{ fill: 'brand', shape: { circle: { c: [0, 0], r: 1 } } }] }),
    ).rejects.toThrow(/neither a hex color nor a palette role/);
  });
});

describe('variants', () => {
  it('enumerates and thins parameter combinations', () => {
    expect(variantParams(ring)).toHaveLength(4);
    expect(variantParams({ ...ring, vary: { w: [1, 2, 3, 4, 5], gap: [1, 2, 3, 4, 5] } }, 10)).toHaveLength(
      10,
    );
    expect(() => variantParams({ ...ring, vary: { nope: [1] } })).toThrow(/no matching params/);
  });
  it('builds, measures and ranks variants', async () => {
    const v = await runVariants(ring, {});
    expect(v).toHaveLength(4);
    expect(v[0]!.score).toBeGreaterThanOrEqual(v[3]!.score);
    expect(v[0]!.quality.legibility16).toBeGreaterThan(0.7);
    expect(v.every((x) => x.svg.startsWith('<svg'))).toBe(true);
  });
});
