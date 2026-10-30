import { normalizeColor } from '../analyze/color.js';
import { MarkiloError } from '../core/errors.js';
import { loadBundledFace } from '../design/fonts.js';
import { outlineText } from '../design/wordmark.js';
import {
  type BoolOp,
  booleanOp,
  boundsOf,
  type Cap,
  ensurePathKit,
  FILL_RULE,
  type Join,
  normalizeD,
  offsetPath,
  roundCorners,
  strokeOutline,
  transformPath,
} from '../geom/pathkit.js';
import {
  arcD,
  circleD,
  ellipseD,
  type P,
  polygonD,
  polylineD,
  rectD,
  regularD,
  ringD,
  sectorD,
  smoothD,
  starD,
  superellipseD,
} from '../geom/shapes.js';
import { escapeAttr, escapeText } from '../svg/xml.js';
import { evaluate } from './expr.js';

/**
 * Construction specs: a logo described the way a designer builds it — primitives, booleans, gaps, offsets,
 * repeats and real glyphs — compiled to clean, filled SVG paths. Numbers may be expressions over `params`, so one
 * spec yields many measured variants (see vary.ts). Format reference: skills/design/references/construction.md.
 */
export type Num = number | string;
export type Pt = [Num, Num];
export type Shape = Record<string, unknown>;

export interface Layer {
  name?: string;
  /** Hex color or a palette role: primary, secondary, accent, ink, paper. */
  fill: string;
  shape: Shape;
}

export interface ConstructionSpec {
  title?: string;
  /** For sketches: the idea in one sentence, shown on the sketch board. */
  idea?: string;
  role?: 'symbol' | 'wordmark' | 'lockup';
  /**
   * Type metrics for a wordmark drawn without `glyph` (numbers or expressions): baseline y, cap height and x-height,
   * so lockups align it like a typeset one. With a glyph they are measured from the font.
   */
  metrics?: { baseline: Num; capHeight: Num; xHeight?: Num };
  /** Artboard: one number (square) or [width, height]. Default 1024. */
  size?: number | [number, number];
  /** Grid step drawn in construction views. */
  grid?: number;
  params?: Record<string, Num>;
  /** Parameter values to explore with `markilo construct --vary`. */
  vary?: Record<string, number[]>;
  defs?: Record<string, Shape>;
  layers: Layer[];
  /** Scale and centre the drawing into the artboard leaving this margin (fraction of the short side). */
  fit?: number;
  /** Optical correction applied after `fit`: [dx, dy] in artboard units (e.g. [0, -16] lifts the mark). */
  nudge?: Pt;
}

export interface CompiledLayer {
  name: string;
  fill: string;
  d: string;
}

export interface GlyphBox {
  char: string;
  x: number;
  y: number;
  w: number;
  h: number;
  baseline: number;
  capHeight: number;
  xHeight: number;
}

export interface Compiled {
  svg: string;
  width: number;
  height: number;
  layers: CompiledLayer[];
  /** Primitive outlines before booleans, for construction drawings. */
  guides: string[];
  glyphs: GlyphBox[];
  params: Record<string, number>;
  warnings: string[];
  stats: { paths: number; commands: number; contours: number; ink: number };
}

export interface CompileOptions {
  palette?: Record<string, string>;
  /** Overrides for spec params (variants, --set). */
  params?: Record<string, number>;
  title?: string;
}

const SHAPE_KINDS = [
  'circle',
  'ellipse',
  'rect',
  'squircle',
  'ring',
  'arc',
  'sector',
  'polygon',
  'regular',
  'star',
  'line',
  'path',
  'glyph',
  'union',
  'subtract',
  'intersect',
  'xor',
  'gap',
  'outline',
  'offset',
  'repeat',
  'mirror',
  'ref',
] as const;
const TRANSFORM_KEYS = ['move', 'rotate', 'scale', 'flip', 'origin', 'round', 'grow'];

type M = [number, number, number, number, number, number];
const mmul = (a: M, b: M): M => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const about = (m: M, cx: number, cy: number): M =>
  mmul([1, 0, 0, 1, cx, cy], mmul(m, [1, 0, 0, 1, -cx, -cy]));

class Ctx {
  guides: string[] = [];
  warnings: string[] = [];
  /** Metrics of the first glyph, so constructed wordmarks align in lockups like typeset ones. */
  type?: { baseline: number; capHeight: number; xHeight: number; font: string };
  /** Where each letter landed (before the shape's own transforms), so specs can aim cuts at stems and bars. */
  glyphs: GlyphBox[] = [];
  depth = 0;
  constructor(
    readonly vars: Record<string, number>,
    readonly defs: Record<string, Shape>,
  ) {}

  fail(at: string, msg: string): never {
    throw new MarkiloError('INVALID_INPUT', `${at}: ${msg}`);
  }
  num(v: unknown, at: string, fallback?: number): number {
    if (v === undefined || v === null) {
      if (fallback !== undefined) return fallback;
      this.fail(at, 'missing number');
    }
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) this.fail(at, 'not a finite number');
      return v;
    }
    if (typeof v === 'string') {
      try {
        return evaluate(v.replace(/^=/, ''), this.vars);
      } catch (err) {
        this.fail(at, (err as Error).message);
      }
    }
    this.fail(at, `expected a number or expression, got ${JSON.stringify(v)}`);
  }
  pt(v: unknown, at: string, fallback?: P): P {
    if (v === undefined && fallback) return fallback;
    if (!Array.isArray(v) || v.length !== 2) this.fail(at, 'expected a point [x, y]');
    return [this.num(v[0], `${at}[0]`), this.num(v[1], `${at}[1]`)];
  }
  pts(v: unknown, at: string, min: number): P[] {
    if (!Array.isArray(v) || v.length < min) this.fail(at, `expected at least ${min} points`);
    return v.map((p, i) => this.pt(p, `${at}[${i}]`));
  }
}

function kindOf(s: Shape, at: string, ctx: Ctx): string {
  if (!s || typeof s !== 'object' || Array.isArray(s)) ctx.fail(at, 'expected a shape object');
  const kinds = Object.keys(s).filter((k) => (SHAPE_KINDS as readonly string[]).includes(k));
  const unknown = Object.keys(s).filter(
    (k) => !(SHAPE_KINDS as readonly string[]).includes(k) && !TRANSFORM_KEYS.includes(k),
  );
  if (unknown.length)
    ctx.fail(at, `unknown key(s) ${unknown.join(', ')}. Shapes: ${SHAPE_KINDS.join(', ')}.`);
  if (kinds.length !== 1) ctx.fail(at, `a shape needs exactly one of: ${SHAPE_KINDS.join(', ')}`);
  return kinds[0]!;
}

const obj = (v: unknown, at: string, ctx: Ctx): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) ctx.fail(at, 'expected an object');
  return v as Record<string, unknown>;
};
const list = (v: unknown, at: string, ctx: Ctx, min = 1): Shape[] => {
  if (!Array.isArray(v) || v.length < min) ctx.fail(at, `expected a list of at least ${min} shape(s)`);
  return v as Shape[];
};
const join = (v: unknown): Join => (v === 'miter' || v === 'bevel' ? v : 'round');
const cap = (v: unknown, dflt: Cap = 'butt'): Cap =>
  v === 'round' || v === 'square' || v === 'butt' ? v : dflt;

function glyphShape(o: Record<string, unknown>, at: string, ctx: Ctx): string {
  const text = String(o.text ?? '');
  if (!text) ctx.fail(`${at}.text`, 'missing text');
  const font = String(o.font ?? 'inter');
  const weight = ctx.num(o.weight, `${at}.weight`, 700);
  const face = loadBundledFace(font, weight);
  const probe = outlineText(face, text, { size: 1000 });
  const height = o.height !== undefined ? ctx.num(o.height, `${at}.height`) : undefined;
  const size = height ? (height / probe.metrics.capHeight) * 1000 : ctx.num(o.size, `${at}.size`, 600);
  const t = outlineText(face, text, {
    size,
    tracking: ctx.num(o.tracking, `${at}.tracking`, 0),
    ...(typeof o.locale === 'string' ? { locale: o.locale } : {}),
    ligatures: o.ligatures !== false,
  });
  let picked = t.glyphs;
  if (o.letters !== undefined) {
    if (!Array.isArray(o.letters))
      ctx.fail(`${at}.letters`, 'expected a list of letter positions (0 = first)');
    const keep = new Set(o.letters.map((v, i) => ctx.num(v, `${at}.letters[${i}]`)));
    picked = t.glyphs.filter((_, i) => keep.has(i));
    if (!picked.length)
      ctx.fail(`${at}.letters`, `no letters at those positions (text has ${t.glyphs.length})`);
  }
  const parts = picked.map((g) => ({ char: g.char, d: normalizeD(g.d) }));
  let d = booleanOp(
    'union',
    parts.map((g) => g.d),
  );
  let dy: number;
  if (o.c !== undefined) {
    const [cx, cy] = ctx.pt(o.c, `${at}.c`);
    const b = boundsOf(d);
    dy = cy - (b.y + b.h / 2);
    d = transformPath(d, [1, 0, 0, 1, cx - (b.x + b.w / 2), dy]);
  } else {
    const [x, y] = ctx.pt(o.at, `${at}.at`, [0, 0]);
    dy = y;
    d = transformPath(d, [1, 0, 0, 1, x, y]);
  }
  const dx =
    o.c !== undefined
      ? boundsOf(d).x -
        boundsOf(
          booleanOp(
            'union',
            parts.map((g) => g.d),
          ),
        ).x
      : ctx.pt(o.at, `${at}.at`, [0, 0])[0];
  for (const g of parts) {
    const b = boundsOf(g.d);
    const r = (n: number) => Math.round(n * 10) / 10;
    ctx.glyphs.push({
      char: g.char,
      x: r(b.x + dx),
      y: r(b.y + dy),
      w: r(b.w),
      h: r(b.h),
      baseline: r(dy),
      capHeight: r(t.metrics.capHeight),
      xHeight: r(t.metrics.xHeight),
    });
  }
  ctx.type ??= {
    baseline: dy,
    capHeight: t.metrics.capHeight,
    xHeight: t.metrics.xHeight,
    font: t.fontLabel,
  };
  return d;
}

function primitive(kind: string, raw: unknown, at: string, ctx: Ctx): string {
  const a = `${at}.${kind}`;
  if (kind === 'ref') {
    const name = String(raw);
    const def = Object.hasOwn(ctx.defs, name) ? ctx.defs[name] : undefined;
    if (!def) ctx.fail(a, `no def named "${name}"`);
    if (ctx.depth > 32) ctx.fail(a, 'defs are nested too deeply (recursive ref?)');
    ctx.depth++;
    try {
      return shape(def, `defs.${name}`, ctx);
    } finally {
      ctx.depth--;
    }
  }
  if (['union', 'subtract', 'intersect', 'xor'].includes(kind)) {
    const parts = list(raw, a, ctx, kind === 'union' ? 1 : 2).map((s, i) => shape(s, `${a}[${i}]`, ctx));
    return booleanOp(kind as BoolOp, parts);
  }
  const o = obj(raw, a, ctx);
  const n = (k: string, d?: number) => ctx.num(o[k], `${a}.${k}`, d);
  switch (kind) {
    case 'circle': {
      const [cx, cy] = ctx.pt(o.c, `${a}.c`);
      return circleD(cx, cy, n('r'));
    }
    case 'ellipse': {
      const [cx, cy] = ctx.pt(o.c, `${a}.c`);
      return ellipseD(cx, cy, n('rx'), n('ry'));
    }
    case 'rect': {
      const w = n('w');
      const h = n('h');
      const [x, y] =
        o.c !== undefined ? ((c) => [c[0] - w / 2, c[1] - h / 2])(ctx.pt(o.c, `${a}.c`)) : [n('x'), n('y')];
      const r = Array.isArray(o.r) ? o.r.map((v, i) => ctx.num(v, `${a}.r[${i}]`)) : n('r', 0);
      if ((Array.isArray(r) ? Math.max(...r) : r) > Math.min(w, h) / 2 + 1e-6)
        ctx.warnings.push(
          `${a}.r is larger than half the shorter side (${Math.min(w, h) / 2}); it was capped.`,
        );
      return rectD(x!, y!, w, h, r);
    }
    case 'squircle': {
      const [cx, cy] = ctx.pt(o.c, `${a}.c`);
      return superellipseD(cx, cy, n('w'), n('h', n('w')), n('n', 4));
    }
    case 'ring': {
      const [cx, cy] = ctx.pt(o.c, `${a}.c`);
      return ringD(cx, cy, n('r'), n('width'));
    }
    case 'arc': {
      const [cx, cy] = ctx.pt(o.c, `${a}.c`);
      const r = n('r');
      const centre = arcD(cx, cy, r, n('from'), n('to'));
      return strokeOutline(centre, n('width'), 'round', cap(o.cap));
    }
    case 'sector': {
      const [cx, cy] = ctx.pt(o.c, `${a}.c`);
      return sectorD(cx, cy, n('r'), n('from'), n('to'), n('inner', 0));
    }
    case 'polygon':
      return polygonD(ctx.pts(o.points, `${a}.points`, 3));
    case 'regular': {
      const [cx, cy] = ctx.pt(o.c, `${a}.c`);
      return regularD(cx, cy, n('r'), Math.round(n('sides')), n('rotate', 0));
    }
    case 'star': {
      const [cx, cy] = ctx.pt(o.c, `${a}.c`);
      return starD(cx, cy, n('r'), n('inner'), Math.round(n('points', 5)), n('rotate', 0));
    }
    case 'line': {
      const pts = ctx.pts(o.points, `${a}.points`, 2);
      const closed = o.closed === true;
      const centre = o.smooth ? smoothD(pts, closed, n('tension', 1)) : polylineD(pts, closed);
      return strokeOutline(centre, n('width'), join(o.join), cap(o.cap, 'round'));
    }
    case 'path': {
      // "{expr}" inside path data is replaced by its value, so path geometry can use params and vary.
      const d = String(o.d ?? '').replace(/\{([^{}]+)\}/g, (_, e: string) => {
        const v = ctx.num(e, `${a}.d {${e}}`);
        return String(Math.round(v * 1000) / 1000);
      });
      if (!/^[\sMmLlHhVvCcSsQqTtAaZz0-9.,eE+-]+$/.test(d)) ctx.fail(`${a}.d`, 'not valid path data');
      return o.width !== undefined ? strokeOutline(d, n('width'), join(o.join), cap(o.cap)) : normalizeD(d);
    }
    case 'glyph':
      return glyphShape(o, a, ctx);
    case 'gap': {
      const base = shape(o.shape as Shape, `${a}.shape`, ctx);
      const cutter = shape(o.cut as Shape, `${a}.cut`, ctx);
      const cut = booleanOp('subtract', [base, offsetPath(cutter, n('width'))]);
      return o.keep === true ? booleanOp('union', [cut, cutter]) : cut;
    }
    case 'outline':
      return strokeOutline(shape(o.shape as Shape, `${a}.shape`, ctx), n('width'), join(o.join), 'butt');
    case 'offset':
      return offsetPath(shape(o.shape as Shape, `${a}.shape`, ctx), n('by'), join(o.join));
    case 'repeat': {
      const count = Math.max(1, Math.min(64, Math.round(n('n'))));
      // Inside the repeated shape, `i` is the copy index (0-based), so sizes can change per copy ("w": "400-i*64").
      const prev = Object.hasOwn(ctx.vars, 'i') ? ctx.vars.i : undefined;
      const copyOf = (i: number) => {
        ctx.vars.i = i;
        return shape(o.shape as Shape, `${a}.shape[i=${i}]`, ctx);
      };
      const copies: string[] = [];
      try {
        if (o.c !== undefined || o.angle !== undefined) {
          const [cx, cy] = ctx.pt(o.c, `${a}.c`);
          const step = n('angle', 360 / count);
          for (let i = 0; i < count; i++) {
            const t = (step * i * Math.PI) / 180;
            copies.push(
              transformPath(
                copyOf(i),
                about([Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0], cx, cy),
              ),
            );
          }
        } else {
          const [dx, dy] = ctx.pt(o.step, `${a}.step`);
          for (let i = 0; i < count; i++) copies.push(transformPath(copyOf(i), [1, 0, 0, 1, dx * i, dy * i]));
        }
      } finally {
        if (prev === undefined) delete ctx.vars.i;
        else ctx.vars.i = prev;
      }
      return booleanOp('union', copies);
    }
    case 'mirror': {
      const base = shape(o.shape as Shape, `${a}.shape`, ctx);
      const axis = o.axis === 'y' ? 'y' : 'x';
      const b = boundsOf(base);
      const at2 = n('at', axis === 'x' ? b.x + b.w : b.y + b.h);
      const m: M = axis === 'x' ? [-1, 0, 0, 1, 2 * at2, 0] : [1, 0, 0, -1, 0, 2 * at2];
      return booleanOp('union', [base, transformPath(base, m)]);
    }
  }
  return ctx.fail(a, 'unsupported shape');
}

function shape(s: Shape, at: string, ctx: Ctx): string {
  const kind = kindOf(s, at, ctx);
  const firstGuide = ctx.guides.length;
  let d = primitive(kind, s[kind], at, ctx);
  if (!['union', 'subtract', 'intersect', 'xor', 'ref', 'repeat', 'mirror', 'gap'].includes(kind))
    ctx.guides.push(d);
  if (s.grow !== undefined) d = offsetPath(d, ctx.num(s.grow, `${at}.grow`));
  if (s.round !== undefined) d = roundCorners(d, ctx.num(s.round, `${at}.round`));
  if (s.scale !== undefined || s.rotate !== undefined || s.flip !== undefined || s.move !== undefined) {
    const b = boundsOf(d);
    const [ox, oy] = ctx.pt(s.origin, `${at}.origin`, [b.x + b.w / 2, b.y + b.h / 2]);
    let m: M = [1, 0, 0, 1, 0, 0];
    if (s.scale !== undefined) {
      const [sx, sy] = Array.isArray(s.scale)
        ? [ctx.num(s.scale[0], `${at}.scale[0]`), ctx.num(s.scale[1], `${at}.scale[1]`)]
        : [ctx.num(s.scale, `${at}.scale`), ctx.num(s.scale, `${at}.scale`)];
      m = mmul(about([sx, 0, 0, sy, 0, 0], ox, oy), m);
    }
    if (s.flip !== undefined) {
      m = mmul(about(s.flip === 'y' ? [1, 0, 0, -1, 0, 0] : [-1, 0, 0, 1, 0, 0], ox, oy), m);
    }
    if (s.rotate !== undefined) {
      const t = (ctx.num(s.rotate, `${at}.rotate`) * Math.PI) / 180;
      m = mmul(about([Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0], ox, oy), m);
    }
    if (s.move !== undefined) {
      const [dx, dy] = ctx.pt(s.move, `${at}.move`);
      m = mmul([1, 0, 0, 1, dx, dy], m);
    }
    d = transformPath(d, m);
    for (let i = firstGuide; i < ctx.guides.length; i++) ctx.guides[i] = transformPath(ctx.guides[i]!, m);
  }
  return d;
}

const ROLE_DEFAULTS: Record<string, string> = {
  primary: '#2f4bd8',
  secondary: '#f2994a',
  accent: '#f2994a',
  ink: '#14161c',
  paper: '#ffffff',
};

function resolveFill(fill: string, palette: Record<string, string>, at: string): string {
  const v =
    (Object.hasOwn(palette, fill) ? palette[fill] : undefined) ??
    (Object.hasOwn(ROLE_DEFAULTS, fill) ? ROLE_DEFAULTS[fill] : undefined) ??
    fill;
  const hex = normalizeColor(v);
  if (!hex)
    throw new MarkiloError('INVALID_INPUT', `${at}: "${fill}" is neither a hex color nor a palette role.`);
  return hex;
}

const countCmds = (d: string) => (d.match(/[MLCQZ]/g) ?? []).length;

export async function compileSpec(spec: ConstructionSpec, opts: CompileOptions = {}): Promise<Compiled> {
  await ensurePathKit();
  if (!spec || !Array.isArray(spec.layers) || !spec.layers.length)
    throw new MarkiloError(
      'INVALID_INPUT',
      'A construction spec needs "layers": [{ "fill": …, "shape": … }].',
    );
  const [W, H] = Array.isArray(spec.size) ? spec.size : [spec.size ?? 1024, spec.size ?? 1024];
  if (!(W > 0 && H > 0 && W <= 8192 && H <= 8192))
    throw new MarkiloError('INVALID_INPUT', '"size" must be between 1 and 8192.');
  const vars: Record<string, number> = Object.assign(Object.create(null), { W, H, cx: W / 2, cy: H / 2 });
  const ctx = new Ctx(vars, spec.defs ?? {});
  // Params are numbers or expressions over the params above them ("arm": "stem*2.5"), in order.
  for (const [k, v] of Object.entries({ ...spec.params, ...opts.params })) {
    if (typeof v !== 'number' && typeof v !== 'string')
      throw new MarkiloError('INVALID_INPUT', `params.${k} must be a number or an expression.`);
    vars[k] = ctx.num(v, `params.${k}`);
  }
  const palette = { ...opts.palette };
  let layers: CompiledLayer[] = spec.layers.map((l, i) => {
    const at = `layers[${i}]`;
    if (!l || typeof l !== 'object') ctx.fail(at, 'expected { fill, shape }');
    return {
      name: l.name ?? `layer-${i + 1}`,
      fill: resolveFill(String(l.fill ?? 'primary'), palette, `${at}.fill`),
      d: shape(l.shape, `${at}.shape`, ctx),
    };
  });
  layers = layers.filter((l) => {
    const empty = !l.d || boundsOf(l.d).w < 1e-3;
    if (empty) ctx.warnings.push(`${l.name} is empty after its booleans; it was dropped.`);
    return !empty;
  });
  if (!layers.length) throw new MarkiloError('INVALID_INPUT', 'Every layer is empty; nothing to draw.');
  if (spec.metrics) {
    const capHeight = ctx.num(spec.metrics.capHeight, 'metrics.capHeight');
    ctx.type = {
      baseline: ctx.num(spec.metrics.baseline, 'metrics.baseline'),
      capHeight,
      xHeight: ctx.num(spec.metrics.xHeight, 'metrics.xHeight', capHeight * 0.72),
      font: 'constructed',
    };
  } else if (spec.role === 'wordmark' && !ctx.type)
    ctx.warnings.push(
      'This wordmark has no type metrics; add "metrics": { "baseline", "capHeight", "xHeight" } so lockups align it.',
    );

  if (spec.fit !== undefined) {
    const margin = Math.max(0, Math.min(0.4, Number(spec.fit)));
    const all = boundsOf(
      booleanOp(
        'union',
        layers.map((l) => l.d),
      ),
    );
    const s = Math.min((W * (1 - 2 * margin)) / all.w, (H * (1 - 2 * margin)) / all.h);
    const m: M = [s, 0, 0, s, W / 2 - s * (all.x + all.w / 2), H / 2 - s * (all.y + all.h / 2)];
    layers = layers.map((l) => ({ ...l, d: transformPath(l.d, m) }));
    ctx.guides = ctx.guides.map((g) => transformPath(g, m));
    if (ctx.type)
      ctx.type = { ...ctx.type, baseline: s * ctx.type.baseline + m[5], capHeight: s * ctx.type.capHeight };
  }

  if (spec.nudge !== undefined) {
    const [dx, dy] = ctx.pt(spec.nudge, 'nudge');
    const m: M = [1, 0, 0, 1, dx, dy];
    layers = layers.map((l) => ({ ...l, d: transformPath(l.d, m) }));
    ctx.guides = ctx.guides.map((g) => transformPath(g, m));
    if (ctx.type) ctx.type = { ...ctx.type, baseline: ctx.type.baseline + dy };
  }

  // Facts a designer checks on every build.
  const union = booleanOp(
    'union',
    layers.map((l) => l.d),
  );
  const box = boundsOf(union);
  const ink = Math.max(box.w / W, box.h / H);
  if (box.x < -0.5 || box.y < -0.5 || box.x + box.w > W + 0.5 || box.y + box.h > H + 0.5)
    ctx.warnings.push('The drawing extends beyond the artboard; it will be cropped.');
  else if (spec.role !== 'wordmark' && ink < 0.8)
    ctx.warnings.push(
      `The drawing spans ${Math.round(ink * 100)}% of the artboard (aim for 80–98%; try "fit": 0.04).`,
    );
  for (let i = 0; i < layers.length; i++)
    for (let j = i + 1; j < layers.length; j++) {
      if (layers[i]!.fill === layers[j]!.fill) continue;
      const overlap = booleanOp('intersect', [layers[i]!.d, layers[j]!.d]);
      if (overlap && boundsOf(overlap).w > W * 0.004)
        ctx.warnings.push(
          `${layers[i]!.name} and ${layers[j]!.name} overlap; in one-color versions they merge. Use "gap" to separate them.`,
        );
    }

  const title = opts.title ?? spec.title;
  const body = layers
    .map((l) => {
      return `<path data-layer="${escapeAttr(l.name)}" fill="${l.fill}" fill-rule="${FILL_RULE}" d="${l.d}"/>`;
    })
    .join('');
  // Wordmarks use the tight ink box and carry type metrics (as `markilo wordmark` does); symbols keep the artboard.
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const root =
    spec.role === 'wordmark'
      ? `viewBox="${r2(box.x)} ${r2(box.y)} ${r2(box.w)} ${r2(box.h)}" data-markilo-role="wordmark"${
          ctx.type
            ? ` data-font="${escapeAttr(ctx.type.font)}" data-baseline="${r2(ctx.type.baseline)}" data-cap-height="${r2(ctx.type.capHeight)}" data-x-height="${r2(ctx.type.xHeight)}"`
            : ''
        }`
      : `viewBox="0 0 ${W} ${H}" data-markilo-role="${spec.role ?? 'symbol'}"`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" ${root}>${title ? `<title>${escapeText(title)}</title>` : ''}${body}</svg>`;
  return {
    svg,
    width: W,
    height: H,
    layers,
    guides: ctx.guides,
    glyphs: ctx.glyphs,
    params: Object.fromEntries(Object.entries(vars).filter(([k]) => !['W', 'H', 'cx', 'cy'].includes(k))),
    warnings: ctx.warnings,
    stats: {
      paths: layers.length,
      commands: layers.reduce((n, l) => n + countCmds(l.d), 0),
      contours: layers.reduce((n, l) => n + (l.d.match(/M/g) ?? []).length, 0),
      ink: Math.round(ink * 1000) / 1000,
    },
  };
}

/** Construction drawing: the mark in light tint, primitive outlines and the grid in thin lines. */
export function constructionSvg(c: Compiled, grid?: number, paper = '#ffffff'): string {
  const { width: W, height: H } = c;
  const sw = Math.max(W, H) / 512;
  let lines = '';
  if (grid && grid > 0 && W / grid <= 128) {
    for (let x = grid; x < W; x += grid) lines += `M${x} 0V${H}`;
    for (let y = grid; y < H; y += grid) lines += `M0 ${y}H${W}`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${paper}"/>${lines ? `<path d="${lines}" fill="none" stroke="#9aa3b5" stroke-opacity="0.35" stroke-width="${sw}"/>` : ''}${c.layers.map((l) => `<path d="${l.d}" fill="${l.fill}" fill-rule="${FILL_RULE}" fill-opacity="0.22"/>`).join('')}${c.guides.map((g) => `<path d="${g}" fill="none" stroke="#e5484d" stroke-width="${sw * 1.5}"/>`).join('')}${c.layers.map((l) => `<path d="${l.d}" fill="none" stroke="#14161c" stroke-width="${sw * 2}"/>`).join('')}</svg>`;
}
