import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type ConstructionSpec, compileSpec, constructionSvg } from '../src/construct/compile.js';
import { evaluate } from '../src/construct/expr.js';
import { runVariants, variantParams } from '../src/construct/vary.js';
import { lintSvg } from '../src/svg/lint.js';
import { synthBrand, tmp } from './helpers.js';

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
  it('merges same-colour layers that touch, so no hairline seam shows where they meet', async () => {
    const touching: ConstructionSpec = {
      layers: [
        { name: 'top', fill: 'primary', shape: { rect: { x: 200, y: 200, w: 600, h: 300 } } },
        { name: 'bottom', fill: 'primary', shape: { rect: { x: 200, y: 500.2, w: 600, h: 300 } } },
      ],
    };
    const c = await compileSpec(touching);
    expect(c.svg.match(/<path/g)).toHaveLength(1);
    expect(c.warnings.join(' ')).toMatch(/top and bottom.*touch.*merged/);
    const apart: ConstructionSpec = {
      layers: [
        { name: 'top', fill: 'primary', shape: { rect: { x: 200, y: 200, w: 600, h: 300 } } },
        { name: 'bottom', fill: 'primary', shape: { rect: { x: 200, y: 600, w: 600, h: 300 } } },
      ],
    };
    const d = await compileSpec(apart);
    expect(d.svg.match(/<path/g)).toHaveLength(2);
    expect(d.warnings.join(' ')).not.toMatch(/merged/);
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
  it('exposes the copy index inside repeat', async () => {
    const c = await compileSpec({
      layers: [
        {
          fill: 'ink',
          shape: {
            repeat: { shape: { rect: { x: 100, y: 100, w: '200+i*200', h: 100 } }, n: 3, step: [0, 200] },
          },
        },
      ],
    });
    // Widest copy (i = 2) is 600 wide; with one shared size it would be 200.
    expect(c.stats.ink).toBeCloseTo(600 / 1024, 2);
  });
  it('applies an optical nudge after fit', async () => {
    const spec: ConstructionSpec = {
      layers: [{ fill: 'ink', shape: { circle: { c: [300, 300], r: 100 } } }],
      fit: 0.1,
    };
    const a = await compileSpec(spec);
    const b = await compileSpec({ ...spec, nudge: [0, -20] });
    const top = (d: string) =>
      Math.min(...[...d.matchAll(/[ML ]?([\d.]+) ([\d.]+)/g)].map((m) => Number(m[2])));
    expect(top(a.layers[0]!.d) - top(b.layers[0]!.d)).toBeCloseTo(20, 0);
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

  it('draws an organic silhouette from a few points, keeping the sharp ones as corners', async () => {
    const pts = [
      [512, 140],
      [640, 470],
      [680, 640],
      [620, 790],
      [512, 850],
      [404, 790],
      [344, 640],
      [384, 470],
    ];
    const drop = await compileSpec({
      layers: [{ fill: 'primary', shape: { polygon: { points: pts, smooth: true, sharp: [0] } } }],
    } as unknown as ConstructionSpec);
    const d = drop.layers[0]!.d;
    expect(d).toMatch(/C/);
    expect(drop.stats.contours).toBe(1);
    // The tip stays exactly where it was put; the rest is curved.
    expect(d).toContain('512 140');
    const plain = await compileSpec({
      layers: [{ fill: 'primary', shape: { polygon: { points: pts } } }],
    } as unknown as ConstructionSpec);
    expect(plain.layers[0]!.d).not.toMatch(/C/);
  });
});

const dot: ConstructionSpec = {
  layers: [{ fill: 'primary', shape: { circle: { c: [512, 512], r: 300 } } }],
};

describe('construct colours', () => {
  it('records the roles that fell back to a placeholder', async () => {
    expect((await compileSpec(dot)).defaultColors).toEqual(['primary']);
    expect((await compileSpec(dot, { palette: { primary: '#123abc' } })).defaultColors).toEqual([]);
    expect((await compileSpec(ring, { palette: { primary: '#123abc' } })).defaultColors).toEqual(['accent']);
  });
});

describe('construct --set colours (CLI)', () => {
  const bin = join(__dirname, '..', 'plugin', 'dist', 'markilo.mjs');
  const run = (args: string[], cwd: string) =>
    spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });

  it('fills a role with --set role=#hex and rejects names', () => {
    const dir = tmp();
    writeFileSync(join(dir, 's.json'), JSON.stringify(dot));
    const ok = run(['construct', 's.json', '-o', 'a.svg', '--set', 'primary=#ff9d3a'], dir);
    expect(ok.status, ok.stderr).toBe(0);
    expect(readFileSync(join(dir, 'a.svg'), 'utf8')).toContain('#ff9d3a');
    const out = JSON.parse(ok.stdout);
    expect(out.defaultColors).toEqual([]);
    expect(out.hint).toBeUndefined();
    const bad = run(['construct', 's.json', '-o', 'b.svg', '--set', 'primary=orange'], dir);
    expect(bad.status).toBe(64);
    expect(JSON.parse(bad.stderr).error.code).toBe('USAGE');
  });

  it('says when it used the placeholder colours, and not with a concept palette', () => {
    const dir = tmp();
    writeFileSync(join(dir, 's.json'), JSON.stringify(dot));
    const r = run(['construct', 's.json', '-o', 'a.svg'], dir);
    const out = JSON.parse(r.stdout);
    expect(out.defaultColors).toEqual(['primary']);
    expect(out.hint).toBe(
      'Placeholder colours used for: primary. Pass --brand and --concept to use the concept palette, or --set primary=#rrggbb.',
    );
    const { dir: cwd } = synthBrand();
    writeFileSync(join(cwd, 's.json'), JSON.stringify(dot));
    const c = run(['construct', 's.json', '--brand', 'nimbra', '--concept', 'fold', '--force'], cwd);
    expect(c.status, c.stderr).toBe(0);
    expect(JSON.parse(c.stdout).defaultColors).toEqual([]);
  });
});

// ---- Lettering operations on outlines -------------------------------------------------------------------------

type Pt2 = [number, number];
/** Path data (absolute M/L/Q/C/Z, as the kit writes it) as closed polylines, curves flattened finely. */
function polylines(d: string): Pt2[][] {
  const toks = d.match(/[MLQCZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const out: Pt2[][] = [];
  let cur: Pt2[] = [];
  let i = 0;
  let cmd = '';
  const num = () => Number(toks[i++]);
  const last = (): Pt2 => cur[cur.length - 1]!;
  while (i < toks.length) {
    if (/[MLQCZ]/i.test(toks[i]!)) cmd = toks[i++]!.toUpperCase();
    if (cmd === 'M') {
      if (cur.length) out.push(cur);
      cur = [[num(), num()]];
      cmd = 'L';
    } else if (cmd === 'L') cur.push([num(), num()]);
    else if (cmd === 'Q' || cmd === 'C') {
      const p0 = last();
      const ps: Pt2[] = [p0];
      for (let k = 0; k < (cmd === 'Q' ? 2 : 3); k++) ps.push([num(), num()]);
      for (let s = 1; s <= 64; s++) {
        const t = s / 64;
        let pts = ps;
        while (pts.length > 1)
          pts = pts
            .slice(1)
            .map((p, j) => [
              pts[j]![0] + (p[0] - pts[j]![0]) * t,
              pts[j]![1] + (p[1] - pts[j]![1]) * t,
            ]) as Pt2[];
        cur.push(pts[0]!);
      }
    } else if (cmd === 'Z') {
      const [f, l] = [cur[0], cur[cur.length - 1]];
      if (cur.length > 1 && f && l && f[0] === l[0] && f[1] === l[1]) cur.pop();
      out.push(cur);
      cur = [];
      cmd = '';
    } else i++;
  }
  if (cur.length) out.push(cur);
  return out;
}
const signedArea = (p: Pt2[]) =>
  p.reduce((s, a, i) => {
    const b = p[(i + 1) % p.length]!;
    return s + a[0] * b[1] - b[0] * a[1];
  }, 0) / 2;
const inside = (pt: Pt2, poly: Pt2[]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
/** Even-odd filled area of path data. */
const inkArea = (d: string) => {
  const ps = polylines(d);
  return ps.reduce((s, p, i) => {
    const depth = ps.filter((q, j) => j !== i && inside(p[0]!, q)).length;
    return s + (depth % 2 ? -1 : 1) * Math.abs(signedArea(p));
  }, 0);
};
const segDist = (p: Pt2, a: Pt2, b: Pt2) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
/** Smallest distance between two closed polylines. */
const polyDist = (a: Pt2[], b: Pt2[]) => {
  let m = Infinity;
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const)
    for (const p of x)
      for (let i = 0; i < y.length; i++) m = Math.min(m, segDist(p, y[i]!, y[(i + 1) % y.length]!));
  return m;
};
/** Straight segments of path data as [from, to] pairs (curves left out). */
const lines = (d: string): [Pt2, Pt2][] => {
  const toks = d.match(/[MLQCZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const res: [Pt2, Pt2][] = [];
  let i = 0;
  let cmd = '';
  let pen: Pt2 = [0, 0];
  let start: Pt2 = [0, 0];
  const pt = (): Pt2 => [Number(toks[i++]), Number(toks[i++])];
  while (i < toks.length) {
    if (/[MLQCZ]/i.test(toks[i]!)) cmd = toks[i++]!.toUpperCase();
    if (cmd === 'M') {
      pen = start = pt();
      cmd = 'L';
    } else if (cmd === 'L') {
      const p = pt();
      res.push([pen, p]);
      pen = p;
    } else if (cmd === 'Q' || cmd === 'C') {
      for (let k = 0; k < (cmd === 'Q' ? 2 : 3); k++) pen = pt();
    } else if (cmd === 'Z') {
      if (pen[0] !== start[0] || pen[1] !== start[1]) res.push([pen, start]);
      pen = start;
      cmd = '';
    } else i++;
  }
  return res;
};
const deg = (a: Pt2, b: Pt2) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
/** Undirected angle from horizontal, 0…180. */
const lineAngle = (a: Pt2, b: Pt2) => ((deg(a, b) % 180) + 180) % 180;

const glyphSpec = (text: string, shape: Record<string, unknown>, font = 'sora'): ConstructionSpec => ({
  defs: { g: { glyph: { text, font, weight: 700, height: 600, at: [100, 800] } } },
  layers: [{ name: text, fill: 'ink', shape }],
});
const plain = async (text: string, font = 'sora') =>
  (await compileSpec(glyphSpec(text, { ref: 'g' }, font))).layers[0]!.d;

describe('lettering operations', () => {
  it('cuts the four free ends of an H at one shared angle, keeping its area', async () => {
    const before = await plain('H');
    const c = await compileSpec(
      glyphSpec('H', { op: 'cut-terminals', of: 'g', angle: 32, where: 'both', minLength: 4 }),
    );
    const d = c.layers[0]!.d;
    const cuts = lines(d).filter(([a, b]) => Math.abs(lineAngle(a, b) - (180 - 32)) < 0.5);
    expect(cuts).toHaveLength(4);
    // Each cut spans the stem: its horizontal reach is the stem width.
    for (const [a, b] of cuts) expect(Math.abs(a[0] - b[0])).toBeCloseTo(134.8, 0);
    // No flat end is left on the cap line or the baseline.
    const flat = lines(d).filter(
      ([a, b]) => Math.abs(a[1] - b[1]) < 0.01 && (Math.abs(a[1] - 200) < 12 || Math.abs(a[1] - 800) < 12),
    );
    expect(flat).toEqual([]);
    expect(Math.abs(inkArea(d) / inkArea(before) - 1)).toBeLessThan(0.03);
    expect(c.skipped).toBeUndefined();
  });

  it('never cuts a bowl: the P keeps its curved top and only its foot is cut', async () => {
    const c = await compileSpec(glyphSpec('P', { op: 'cut-terminals', of: 'g', angle: 32, where: 'both' }));
    const cuts = lines(c.layers[0]!.d).filter(([a, b]) => Math.abs(lineAngle(a, b) - 148) < 0.5);
    expect(cuts).toHaveLength(1);
    expect(Math.min(...cuts[0]!.map((p) => p[1]))).toBeGreaterThan(700);
  });

  it('a slit across the joins of a P bowl leaves two contours', async () => {
    const c = await compileSpec(
      glyphSpec('P', { op: 'slit', of: 'g', from: [312, 150], to: [312, 660], width: 10 }),
    );
    expect(polylines(c.layers[0]!.d)).toHaveLength(2);
  });

  for (const ch of ['P', 'R', 'b'])
    it(`detach-bowl separates the bowl of "${ch}" from its stem by the gap`, async () => {
      const c = await compileSpec(glyphSpec(ch, { op: 'detach-bowl', of: 'g', gap: 3 }));
      const parts = polylines(c.layers[0]!.d);
      expect(parts).toHaveLength(2);
      // One part holds the stem, the other the bowl.
      const stem = parts.findIndex((p) => inside([230, 300], p));
      expect(stem).toBeGreaterThanOrEqual(0);
      expect(polyDist(parts[0]!, parts[1]!)).toBeGreaterThan(3 - 0.2);
      expect(polyDist(parts[0]!, parts[1]!)).toBeLessThan(3 + 0.2);
      expect(c.skipped).toBeUndefined();
    });

  // Sora's A and V end in wide flat joins: pointing them would overshoot by 54 % and 62 % of the cap height, past
  // the 25 % limit, so the sharpening itself is checked on the bundled Inter, whose joins are narrow.
  for (const [ch, where] of [
    ['A', 'top'],
    ['V', 'bottom'],
  ] as const)
    it(`point-apex sharpens the ${where} of "${ch}" to one vertex, keeping the stroke angles`, async () => {
      const spec = (shape: Record<string, unknown>): ConstructionSpec => ({
        defs: { g: { glyph: { text: ch, font: 'inter', weight: 400, height: 600, at: [100, 800] } } },
        layers: [{ fill: 'ink', shape }],
      });
      const before = lines((await compileSpec(spec({ ref: 'g' }))).layers[0]!.d).filter(
        ([a, b]) => Math.abs(lineAngle(a, b) - 90) < 60,
      );
      expect(before.length).toBeGreaterThanOrEqual(2);
      const c = await compileSpec(spec({ op: 'point-apex', of: 'g', where }));
      expect(c.skipped).toBeUndefined();
      const d = c.layers[0]!.d;
      const outer = polylines(d).sort((p, q) => Math.abs(signedArea(q)) - Math.abs(signedArea(p)))[0]!;
      const ys = outer.map((p) => p[1]);
      const extreme = where === 'top' ? Math.min(...ys) : Math.max(...ys);
      expect(outer.filter((p) => Math.abs(p[1] - extreme) < 0.5)).toHaveLength(1);
      // The point goes past the old join, within 25 % of the cap height.
      expect(Math.abs(extreme - (where === 'top' ? 200 : 800))).toBeGreaterThan(1);
      expect(Math.abs(extreme - (where === 'top' ? 200 : 800))).toBeLessThanOrEqual(150);
      // Every diagonal edge keeps its angle within 0.5°.
      const after = lines(d).filter(([a, b]) => Math.abs(lineAngle(a, b) - 90) < 60);
      for (const [a, b] of before) {
        const t = lineAngle(a, b);
        expect(after.some(([p, q]) => Math.abs(lineAngle(p, q) - t) < 0.5)).toBe(true);
      }
    });

  it("leaves Sora's flat A and V apexes alone and says how far the point would reach", async () => {
    for (const [ch, where, pct] of [
      ['A', 'top', 54],
      ['V', 'bottom', 62],
    ] as const) {
      const before = await plain(ch);
      const c = await compileSpec(glyphSpec(ch, { op: 'point-apex', of: 'g', where }));
      expect(c.layers[0]!.d).toBe(before);
      expect(c.skipped).toHaveLength(1);
      expect(c.skipped![0]!.reason).toContain(`${pct} % of the cap height; the limit is 25 %`);
    }
  });

  it('reports a B it cannot free cleanly instead of slashing its bar', async () => {
    const before = await plain('B');
    const c = await compileSpec(glyphSpec('B', { op: 'detach-bowl', of: 'g', gap: 3 }));
    expect(c.layers[0]!.d).toBe(before);
    expect(c.skipped!.length).toBeGreaterThan(0);
  });

  for (const ch of ['o', 'I'])
    it(`reports "${ch}" as skipped and leaves it unchanged`, async () => {
      const before = await plain(ch);
      for (const shape of [
        { op: 'detach-bowl', of: 'g', gap: 3 },
        { op: 'point-apex', of: 'g', where: 'top' },
      ]) {
        const c = await compileSpec(glyphSpec(ch, shape));
        expect(c.layers[0]!.d).toBe(before);
        expect(c.skipped).toEqual([expect.objectContaining({ op: shape.op, of: 'g' })]);
      }
    });

  it('drops slivers under 0.05 % of the area', async () => {
    const c = await compileSpec({
      defs: { sq: { rect: { x: 100, y: 100, w: 400, h: 400 } } },
      layers: [{ fill: 'ink', shape: { op: 'slit', of: 'sq', from: [90, 108], to: [108, 90], width: 4 } }],
    });
    expect(polylines(c.layers[0]!.d)).toHaveLength(1);
  });

  it('rejects an unknown operation or a missing source', async () => {
    await expect(compileSpec(glyphSpec('H', { op: 'melt', of: 'g' }))).rejects.toThrow(/op.*cut-terminals/);
    await expect(
      compileSpec(glyphSpec('H', { op: 'slit', of: 'nope', from: [0, 0], to: [1, 1] })),
    ).rejects.toThrow(/no def named "nope"/);
  });
});
