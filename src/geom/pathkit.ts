import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MarkiloError } from '../core/errors.js';
import { refitPath } from './refit.js';

/** The subset of Skia's PathKit (pathkit-wasm) that Markilo uses. */
export interface SkPath {
  op(other: SkPath, op: number): SkPath | null;
  stroke(opts: { width: number; join?: number; cap?: number; miter_limit?: number }): SkPath | null;
  simplify(): SkPath | null;
  transform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
  ): SkPath;
  copy(): SkPath;
  toCmds(): number[][];
  toSVGString(): string;
  getFillTypeString(): string;
  setFillType(t: number): void;
  getBounds(): { fLeft: number; fTop: number; fRight: number; fBottom: number };
  computeTightBounds(): { fLeft: number; fTop: number; fRight: number; fBottom: number };
  delete(): void;
}

interface PathKit {
  FromSVGString(d: string): SkPath | null;
  NewPath(): SkPath;
  FillType: { WINDING: number; EVENODD: number };
  PathOp: { UNION: number; DIFFERENCE: number; INTERSECT: number; XOR: number; REVERSE_DIFFERENCE: number };
  StrokeJoin: { MITER: number; ROUND: number; BEVEL: number };
  StrokeCap: { BUTT: number; ROUND: number; SQUARE: number };
  MOVE_VERB: number;
  LINE_VERB: number;
  QUAD_VERB: number;
  CONIC_VERB: number;
  CUBIC_VERB: number;
  CLOSE_VERB: number;
}

let kit: PathKit | undefined;
let loading: Promise<PathKit> | undefined;

function wasmPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, 'pathkit.wasm')];
  try {
    candidates.push(createRequire(import.meta.url).resolve('pathkit-wasm/bin/pathkit.wasm'));
  } catch {
    // Not running from a checkout with node_modules; the bundled copy must exist.
  }
  const found = candidates.find((p) => existsSync(p));
  if (!found)
    throw new MarkiloError('INTERNAL', `pathkit.wasm not found (looked in ${candidates.join(', ')}).`);
  return found;
}

/** Loads Skia PathKit once. Emscripten installs process-wide error handlers; they are removed again. */
export function ensurePathKit(): Promise<PathKit> {
  loading ??= (async () => {
    const before = {
      ue: process.listeners('uncaughtException'),
      ur: process.listeners('unhandledRejection'),
    };
    const init = createRequire(import.meta.url)('pathkit-wasm/bin/pathkit.js') as (o: {
      wasmBinary: Uint8Array;
    }) => Promise<PathKit>;
    kit = await init({ wasmBinary: readFileSync(wasmPath()) });
    for (const l of process.listeners('uncaughtException'))
      if (!before.ue.includes(l)) process.removeListener('uncaughtException', l);
    for (const l of process.listeners('unhandledRejection'))
      if (!before.ur.includes(l)) process.removeListener('unhandledRejection', l);
    return kit;
  })();
  return loading;
}

export function pk(): PathKit {
  if (!kit) throw new MarkiloError('INTERNAL', 'PathKit is not loaded; await ensurePathKit() first.');
  return kit;
}

export type BoolOp = 'union' | 'subtract' | 'intersect' | 'xor';

/**
 * A filled outline in SVG path syntax. All geometry in the construction kit is exchanged as path data
 * so every step stays inspectable; PathKit objects never escape a single function.
 *
 * Internal path data is always read with the even-odd rule: that is what Skia's simplify and booleans emit (a hole
 * may run in the same direction as its outline). Outside input with nonzero semantics — font glyphs, user path
 * data — goes through `normalizeD` first.
 */
export function fromD(d: string, rule: 'evenodd' | 'nonzero' = 'evenodd'): SkPath {
  const K = pk();
  const p = K.FromSVGString(d || 'M0 0');
  if (!p) throw new MarkiloError('INVALID_INPUT', `Invalid path data: ${d.slice(0, 80)}`);
  p.setFillType(rule === 'evenodd' ? K.FillType.EVENODD : K.FillType.WINDING);
  return p;
}

function withPath<T>(d: string, fn: (p: SkPath) => T): T {
  const p = fromD(d);
  try {
    return fn(p);
  } finally {
    p.delete();
  }
}

/** Serializes a PathKit path: curve runs are refitted to few cubics and numbers are rounded. */
function toD(p: SkPath): string {
  const K = pk();
  const verbs = {
    move: K.MOVE_VERB,
    line: K.LINE_VERB,
    quad: K.QUAD_VERB,
    conic: K.CONIC_VERB,
    cubic: K.CUBIC_VERB,
    close: K.CLOSE_VERB,
  };
  return refitPath(p.toCmds(), verbs);
}

export function booleanOp(op: BoolOp, paths: string[]): string {
  if (!paths.length) return '';
  const K = pk();
  const code =
    op === 'union'
      ? K.PathOp.UNION
      : op === 'subtract'
        ? K.PathOp.DIFFERENCE
        : op === 'intersect'
          ? K.PathOp.INTERSECT
          : K.PathOp.XOR;
  const acc = fromD(paths[0]!);
  try {
    for (const d of paths.slice(1)) withPath(d, (other) => acc.op(other, code));
    return toD(acc);
  } finally {
    acc.delete();
  }
}

export const simplifyPath = (d: string): string =>
  withPath(d, (p) => {
    p.simplify();
    return toD(p);
  });

/** Reads outside path data with the nonzero rule (SVG's default) and returns it as clean even-odd data. */
export function normalizeD(d: string): string {
  const p = fromD(d, 'nonzero');
  try {
    p.simplify();
    return toD(p);
  } finally {
    p.delete();
  }
}

export type Join = 'miter' | 'round' | 'bevel';
export type Cap = 'butt' | 'round' | 'square';

/** Outline of a stroke along `d` (open or closed), as a filled shape. */
export function strokeOutline(d: string, width: number, join: Join = 'round', cap: Cap = 'butt'): string {
  const K = pk();
  return withPath(d, (p) => {
    p.stroke({
      width,
      join:
        join === 'miter' ? K.StrokeJoin.MITER : join === 'bevel' ? K.StrokeJoin.BEVEL : K.StrokeJoin.ROUND,
      cap: cap === 'round' ? K.StrokeCap.ROUND : cap === 'square' ? K.StrokeCap.SQUARE : K.StrokeCap.BUTT,
      miter_limit: 8,
    });
    p.simplify();
    return toD(p);
  });
}

/** Grows (by > 0) or shrinks (by < 0) a filled shape by a distance, with round corners. */
export function offsetPath(d: string, by: number, join: Join = 'round'): string {
  if (!by) return d;
  const ring = strokeOutline(d, Math.abs(by) * 2, join, 'butt');
  return booleanOp(by > 0 ? 'union' : 'subtract', [d, ring]);
}

/**
 * Rounds corners: convex corners by radius `r` (shrink, then grow) and concave corners too when `concave` is set
 * (grow, then shrink). Thin parts narrower than 2r disappear, which is also how a designer would judge them.
 */
export function roundCorners(d: string, r: number, concave = true): string {
  if (r <= 0) return d;
  let out = offsetPath(offsetPath(d, -r), r);
  if (concave) out = offsetPath(offsetPath(out, r), -r);
  return out;
}

export function transformPath(d: string, m: [number, number, number, number, number, number]): string {
  const [a, b, c, dd, e, f] = m;
  return withPath(d, (p) => {
    p.transform(a, c, e, b, dd, f, 0, 0, 1);
    return toD(p);
  });
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function boundsOf(d: string): Box {
  return withPath(d, (p) => {
    const b = p.computeTightBounds();
    return { x: b.fLeft, y: b.fTop, w: b.fRight - b.fLeft, h: b.fBottom - b.fTop };
  });
}

/** Every path the kit produces is meant to be filled with the even-odd rule (see `fromD`). */
export const FILL_RULE = 'evenodd';
