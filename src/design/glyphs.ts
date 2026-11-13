import { MarkiloError } from '../core/errors.js';
import {
  type Box,
  booleanOp,
  boundsOf,
  ensurePathKit,
  normalizeD,
  simplifyPath,
  transformPath,
} from '../geom/pathkit.js';
import { renderSvg } from '../render/resvg.js';
import { fmt } from '../svg/compose.js';
import { sanitizeTree } from '../svg/sanitize.js';
import {
  escapeAttr,
  escapeText,
  intrinsicBox,
  localName,
  parseXml,
  serializeXml,
  walk,
  type XmlElement,
} from '../svg/xml.js';

/**
 * Glyphs of a custom-drawn word: a family member's word is split into its letters, measured, and stored in units
 * where the cap height is 100 and the baseline is y = 0 (y grows downwards, as in SVG). A new word is assembled from
 * those glyphs (see `assembleWord`). Nothing here edits the source file.
 */

// ----- geometry of the source file -----

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function mul(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** An SVG `transform` list (matrix, translate, scale, rotate, skewX, skewY) as one matrix. */
export function parseTransform(s: string | undefined): Matrix {
  let m = IDENTITY;
  if (!s) return m;
  for (const [, fn, raw] of s.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const a = raw!
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (a.some((n) => !Number.isFinite(n))) continue;
    let t: Matrix = IDENTITY;
    const rad = ((a[0] ?? 0) * Math.PI) / 180;
    switch (fn) {
      case 'matrix':
        if (a.length === 6) t = a as Matrix;
        break;
      case 'translate':
        t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
        break;
      case 'scale':
        t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const [cx, cy] = [a[1] ?? 0, a[2] ?? 0];
        const r: Matrix = [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0];
        t = mul(mul([1, 0, 0, 1, cx, cy], r), [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case 'skewX':
        t = [1, 0, Math.tan(rad), 1, 0, 0];
        break;
      case 'skewY':
        t = [1, Math.tan(rad), 0, 1, 0, 0];
        break;
    }
    m = mul(m, t);
  }
  return m;
}

/** A presentation property from inline style or attribute (style wins, as in CSS). */
function prop(el: XmlElement, name: string): string | undefined {
  for (const part of (el.attrs.style ?? '').split(';')) {
    const i = part.indexOf(':');
    if (i > 0 && part.slice(0, i).trim().toLowerCase() === name) return part.slice(i + 1).trim();
  }
  return el.attrs[name];
}

const num = (v: string | undefined, def = 0): number => {
  const n = Number.parseFloat(v ?? '');
  return Number.isFinite(n) ? n : def;
};

/** Path data for a basic shape (path, rect, circle, ellipse, polygon, polyline). */
function shapeD(el: XmlElement): string | undefined {
  const a = el.attrs;
  switch (localName(el.name).toLowerCase()) {
    case 'path':
      return a.d?.trim() || undefined;
    case 'rect': {
      const [x, y, w, h] = [num(a.x), num(a.y), num(a.width), num(a.height)];
      if (!(w > 0 && h > 0)) return undefined;
      const rx = Math.min(num(a.rx, num(a.ry)), w / 2);
      const ry = Math.min(num(a.ry, rx), h / 2);
      if (!(rx > 0 && ry > 0)) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      const arc = (ex: number, ey: number) => `A${rx} ${ry} 0 0 1 ${ex} ${ey}`;
      return `M${x + rx} ${y}H${x + w - rx}${arc(x + w, y + ry)}V${y + h - ry}${arc(x + w - rx, y + h)}H${x + rx}${arc(x, y + h - ry)}V${y + ry}${arc(x + rx, y)}Z`;
    }
    case 'circle':
    case 'ellipse': {
      const [cx, cy] = [num(a.cx), num(a.cy)];
      const rx = localName(el.name) === 'circle' ? num(a.r) : num(a.rx, num(a.ry));
      const ry = localName(el.name) === 'circle' ? rx : num(a.ry, rx);
      if (!(rx > 0 && ry > 0)) return undefined;
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case 'polygon':
    case 'polyline': {
      const n = (a.points ?? '')
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number);
      if (n.length < 6 || n.some((v) => !Number.isFinite(v))) return undefined;
      let d = `M${n[0]} ${n[1]}`;
      for (let i = 2; i + 1 < n.length; i += 2) d += `L${n[i]} ${n[i + 1]}`;
      return `${d}Z`;
    }
    default:
      return undefined;
  }
}

/** Elements whose content is never drawn as part of the word (or cannot be split: live text, images). */
const NOT_DRAWN = new Set([
  'defs',
  'clippath',
  'mask',
  'symbol',
  'pattern',
  'marker',
  'title',
  'desc',
  'metadata',
  'style',
  'text',
  'image',
  'lineargradient',
  'radialgradient',
  'filter',
]);

interface Shape {
  /** Outline in the root's user units, even-odd. */
  d: string;
  box: Box;
  fill: string;
}

/** The nested `<svg>` viewport as a matrix (uniform scale, centred like the default preserveAspectRatio). */
function viewportMatrix(el: XmlElement): Matrix {
  const vb = intrinsicBox(el);
  const [x, y] = [num(el.attrs.x), num(el.attrs.y)];
  const w = num(el.attrs.width, vb?.width ?? 0);
  const h = num(el.attrs.height, vb?.height ?? 0);
  if (!vb || !el.attrs.viewBox || !(w > 0 && h > 0)) return [1, 0, 0, 1, x, y];
  const s = Math.min(w / vb.width, h / vb.height);
  return [s, 0, 0, s, x + (w - vb.width * s) / 2 - vb.x * s, y + (h - vb.height * s) / 2 - vb.y * s];
}

/**
 * Every filled shape of a (sanitized) SVG with its nested transforms applied, in the root's user units. Shapes that
 * cover most of the artboard (a background) are left out.
 */
function flatten(root: XmlElement): Shape[] {
  const ids = new Map<string, XmlElement>();
  walk(root, (el) => {
    if (el.attrs.id) ids.set(el.attrs.id, el);
  });
  const raw: { d: string; rule: 'evenodd' | 'nonzero'; fill: string; m: Matrix }[] = [];
  const visit = (
    el: XmlElement,
    m: Matrix,
    inh: { fill: string; rule: string },
    depth: number,
    isRoot: boolean,
    viaUse = false,
  ) => {
    if (depth > 64) return;
    const name = localName(el.name).toLowerCase();
    // A <symbol> reached through <use> is drawn; met while walking the tree it is a definition only.
    if (!isRoot && NOT_DRAWN.has(name) && !(viaUse && name === 'symbol')) return;
    if (prop(el, 'display') === 'none' || prop(el, 'visibility') === 'hidden') return;
    if (num(prop(el, 'opacity'), 1) === 0 || num(prop(el, 'fill-opacity'), 1) === 0) return;
    const fill = prop(el, 'fill') ?? inh.fill;
    const rule = prop(el, 'fill-rule') ?? inh.rule;
    let mm = isRoot ? m : mul(m, parseTransform(el.attrs.transform));
    if (name === 'svg' && !isRoot) mm = mul(mm, viewportMatrix(el));
    if (name === 'use') {
      const href = el.attrs.href ?? el.attrs['xlink:href'] ?? '';
      const target = href.startsWith('#') ? ids.get(href.slice(1)) : undefined;
      if (target && target !== el)
        visit(
          target,
          mul(mm, [1, 0, 0, 1, num(el.attrs.x), num(el.attrs.y)]),
          { fill, rule },
          depth + 1,
          false,
          true,
        );
      return;
    }
    const d = shapeD(el);
    if (d && fill !== 'none' && fill !== 'transparent')
      raw.push({ d, rule: rule === 'evenodd' ? 'evenodd' : 'nonzero', fill, m: mm });
    for (const c of el.children) if (c.type === 'element') visit(c, mm, { fill, rule }, depth + 1, false);
  };
  visit(root, IDENTITY, { fill: '#000000', rule: 'nonzero' }, 0, true);
  const vb = intrinsicBox(root);
  const area = vb ? vb.width * vb.height : Number.POSITIVE_INFINITY;
  const out: Shape[] = [];
  for (const s of raw) {
    const moved = transformPath(s.d, s.m);
    const d = s.rule === 'evenodd' ? simplifyPath(moved) : normalizeD(moved);
    if (!d) continue;
    const box = boundsOf(d);
    if (!(box.w > 0 && box.h > 0)) continue;
    if (box.w * box.h >= 0.9 * area) continue;
    out.push({ d, box, fill: s.fill });
  }
  return out;
}

// ----- splitting -----

interface Part {
  d: string;
  box: Box;
}
interface Group {
  parts: Part[];
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const contours = (d: string): string[] =>
  d
    .split(/(?=M)/)
    .map((s) => s.trim())
    .filter(Boolean);

function groupOf(parts: Part[]): Group {
  return {
    parts,
    x0: Math.min(...parts.map((p) => p.box.x)),
    x1: Math.max(...parts.map((p) => p.box.x + p.box.w)),
    y0: Math.min(...parts.map((p) => p.box.y)),
    y1: Math.max(...parts.map((p) => p.box.y + p.box.h)),
  };
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Subpaths that belong together: a counter inside its letter, a dot or accent over it (x-ranges overlap > 50 %). */
function letterGroups(parts: Part[]): Group[] {
  const parent = parts.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i]!;
    return i;
  };
  const eps = 1e-6;
  for (let i = 0; i < parts.length; i++)
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i]!.box;
      const b = parts[j]!.box;
      const inside = (p: Box, q: Box) =>
        p.x >= q.x - eps && p.y >= q.y - eps && p.x + p.w <= q.x + q.w + eps && p.y + p.h <= q.y + q.h + eps;
      const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      if (inside(a, b) || inside(b, a) || overlap > 0.5 * Math.min(a.w, b.w)) parent[find(i)] = find(j);
    }
  const byRoot = new Map<number, Part[]>();
  parts.forEach((p, i) => {
    const r = find(i);
    byRoot.set(r, [...(byRoot.get(r) ?? []), p]);
  });
  return [...byRoot.values()].map(groupOf).sort((a, b) => a.x0 - b.x0);
}

/** How many groups of a set stand on one baseline (the word row of a lockup). */
function aligned(groups: Group[]): number {
  const base = median(groups.map((g) => g.y1));
  const h = median(groups.map((g) => g.y1 - g.y0)) || 1;
  return groups.filter((g) => Math.abs(g.y1 - base) <= 0.04 * h).length;
}

function pickWordSide<T extends { length: number }>(
  a: T,
  b: T,
  alignedA: number,
  alignedB: number,
): 'a' | 'b' {
  if (alignedA !== alignedB) return alignedA > alignedB ? 'a' : 'b';
  return a.length >= b.length ? 'a' : 'b';
}

/**
 * Lockups: the word is the part that stands on one baseline. A stacked lockup is split by its vertical gap first; a
 * horizontal one by the largest horizontal gap when it is clearly larger than the gaps between letters.
 */
function dropSymbol(parts: Part[], groups: Group[], want?: number): { groups: Group[]; dropped: Group[] } {
  // Stacked: rows of subpaths separated by a clear vertical gap.
  const byY = [...parts].sort((a, b) => a.box.y - b.box.y);
  const rows: Part[][] = [];
  let bottom = Number.NEGATIVE_INFINITY;
  for (const p of byY) {
    if (rows.length && p.box.y <= bottom) rows[rows.length - 1]!.push(p);
    else rows.push([p]);
    bottom = Math.max(bottom, p.box.y + p.box.h);
  }
  if (rows.length === 2) {
    const [top, low] = rows.map(groupOf) as [Group, Group];
    const gap = low.y0 - top.y1;
    if (gap >= 0.3 * Math.min(top.y1 - top.y0, low.y1 - low.y0)) {
      const [ga, gb] = [letterGroups(rows[0]!), letterGroups(rows[1]!)];
      const keep = pickWordSide(ga, gb, aligned(ga), aligned(gb)) === 'a' ? ga : gb;
      if (want === undefined || keep.length !== groups.length)
        return { groups: keep, dropped: [keep === ga ? low : top] };
    }
  }
  if (groups.length < 3 || (want !== undefined && groups.length === want)) return { groups, dropped: [] };
  const gaps = groups.slice(1).map((g, i) => g.x0 - groups[i]!.x1);
  const k = gaps.indexOf(Math.max(...gaps));
  const rest = gaps.filter((_, i) => i !== k);
  const largest = gaps[k]!;
  if (!(largest > 0) || largest < 2 * Math.max(median(rest), 0)) return { groups, dropped: [] };
  const left = groups.slice(0, k + 1);
  const right = groups.slice(k + 1);
  const keepLeft = pickWordSide(left, right, aligned(left), aligned(right)) === 'a';
  return keepLeft
    ? { groups: left, dropped: [groupOf(right.flatMap((g) => g.parts))] }
    : { groups: right, dropped: [groupOf(left.flatMap((g) => g.parts))] };
}

/** Merges neighbours whose gap is clearly smaller than the spacing of the word, smallest first, down to `want`. */
function mergeTo(groups: Group[], want: number): Group[] {
  let gs = groups;
  while (gs.length > want) {
    const gaps = gs.slice(1).map((g, i) => g.x0 - gs[i]!.x1);
    const k = gaps.indexOf(Math.min(...gaps));
    if (!(gaps[k]! <= 0 || gaps[k]! < 0.5 * median(gaps))) break;
    gs = [...gs.slice(0, k), groupOf([...gs[k]!.parts, ...gs[k + 1]!.parts]), ...gs.slice(k + 2)];
  }
  return gs;
}

// ----- measuring -----

export type Terminals = 'flat' | 'flared';

export interface GlyphInfo {
  char: string;
  /** Outline in cap units: ink starts at x = 0, baseline at y = 0, cap line at y = −100. Even-odd. */
  d: string;
  /** Ink left edge in the word, from the first glyph's ink left edge (cap units). */
  x: number;
  width: number;
  /** Ink top and bottom (cap units, y down: the cap line is −100). */
  top: number;
  bottom: number;
  /** Space to the previous / next glyph as measured in the word (the first and last glyph repeat their one gap). */
  left: number;
  right: number;
  /** width + the mean of the two sidebearings. */
  advance: number;
  /** Thinnest vertical stroke (a horizontal run at about mid cap height). */
  stem: number | null;
  /** Thinnest horizontal stroke (a vertical run); null when the glyph has none. */
  bar: number | null;
  terminals: Terminals;
  overshoot: { above: number; below: number };
}

export interface GlyphSplit {
  text: string;
  /** Cap height and baseline in the source file's units (its viewBox). */
  capHeight: number;
  baseline: number;
  /** In cap units (cap height = 100). */
  overshoot: number;
  stem: number;
  bar: number | null;
  terminals: Terminals;
  fill: string;
  glyphs: GlyphInfo[];
  /** Parts of a lockup that are not the word (source units). */
  dropped: { x0: number; x1: number; y0: number; y1: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

interface Run {
  a: number;
  b: number;
  len: number;
}

/** Runs of ink along a row or column of a glyph rendered at 10 pixels per cap unit. */
async function rasterOf(d: string, width: number, top: number, bottom: number) {
  const pad = 2;
  const vb = {
    x: -pad,
    y: Math.min(top, -100) - pad,
    w: width + 2 * pad,
    h: Math.max(bottom, 0) - Math.min(top, -100) + 2 * pad,
  };
  const px = Math.min(10, 8000 / Math.max(vb.w, vb.h));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(vb.x)} ${fmt(vb.y)} ${fmt(vb.w)} ${fmt(vb.h)}"><path fill="#000" fill-rule="evenodd" d="${d}"/></svg>`;
  const img = await renderSvg(svg, { width: Math.round(vb.w * px), height: Math.round(vb.h * px) });
  const sx = img.width / vb.w;
  const sy = img.height / vb.h;
  const alpha = (x: number, y: number) => img.data[(y * img.width + x) * 4 + 3]! / 255;
  const runs = (n: number, at: (i: number) => number, scale: number, origin: number): Run[] => {
    const out: Run[] = [];
    let cur: { a: number; sum: number } | undefined;
    for (let i = 0; i <= n; i++) {
      const v = i < n ? at(i) : 0;
      if (v > 0.02) {
        cur ??= { a: i, sum: 0 };
        cur.sum += v;
      } else if (cur) {
        out.push({ a: origin + cur.a / scale, b: origin + i / scale, len: cur.sum / scale });
        cur = undefined;
      }
    }
    return out.filter((r) => r.len >= 1);
  };
  return {
    row(y: number): Run[] {
      const py = Math.max(0, Math.min(img.height - 1, Math.floor((y - vb.y) * sy)));
      return runs(img.width, (x) => alpha(x, py), sx, vb.x);
    },
    col(x: number): Run[] {
      const pxx = Math.max(0, Math.min(img.width - 1, Math.floor((x - vb.x) * sx)));
      return runs(img.height, (y) => alpha(pxx, y), sy, vb.y);
    },
    /** How far ink continues up and down from (x, y) along a column. */
    extent(x: number, y: number): { top: number; bottom: number } {
      const pxx = Math.max(0, Math.min(img.width - 1, Math.floor((x - vb.x) * sx)));
      const py = Math.floor((y - vb.y) * sy);
      let t = py;
      while (t > 0 && alpha(pxx, t - 1) >= 0.5) t--;
      let b = py;
      while (b < img.height - 1 && alpha(pxx, b + 1) >= 0.5) b++;
      return { top: vb.y + t / sy, bottom: vb.y + (b + 1) / sy };
    },
  };
}

const runAt = (runs: Run[], x: number) => runs.find((r) => r.a <= x && x <= r.b);

/** Stem, bar and terminals of one glyph (cap units). */
async function measureGlyph(
  d: string,
  width: number,
  top: number,
  bottom: number,
): Promise<{ stem: number | null; bar: number | null; terminals: Terminals }> {
  const r = await rasterOf(d, width, top, bottom);
  const stems = [-65, -50, -35].flatMap((y) => r.row(y)).map((x) => x.len);
  const stem = stems.length ? Math.min(...stems) : null;
  const bars = [0.25, 0.5, 0.75]
    .flatMap((f) => r.col(width * f))
    .map((x) => x.len)
    .filter((l) => l < 60);
  const bar = bars.length ? Math.min(...bars) : null;
  let terminals: Terminals = 'flat';
  if (stem !== null) {
    const mid = r.row(-50);
    for (const run of mid.filter((x) => x.len <= 1.5 * stem)) {
      const cx = (run.a + run.b) / 2;
      // A vertical stem keeps its centre above and below mid height; a diagonal moves sideways.
      const vertical = [-60, -40].every((y) => {
        const o = runAt(r.row(y), cx);
        return o && Math.abs((o.a + o.b) / 2 - cx) <= 0.1 * run.len;
      });
      if (!vertical) continue;
      const ext = r.extent(cx, -50);
      for (const y of [ext.top + 4, ext.bottom - 4]) {
        const end = runAt(r.row(y), cx);
        if (!end) continue;
        const ratio = end.len / run.len;
        const bothSides = end.a < run.a - 0.02 * run.len && end.b > run.b + 0.02 * run.len;
        if (bothSides && ratio >= 1.1 && ratio <= 2.5) terminals = 'flared';
      }
    }
  }
  return { stem: stem === null ? null : r2(stem), bar: bar === null ? null : r2(bar), terminals };
}

interface Located {
  root: XmlElement;
  groups: Group[];
  dropped: Group[];
  shapes: Shape[];
}

async function locate(svg: string, part: 'word' | 'auto', want?: number): Promise<Located> {
  await ensurePathKit();
  // Inline SVG from websites may carry anything: sanitize before reading geometry.
  const root = sanitizeTree(parseXml(svg));
  const shapes = flatten(root);
  if (!shapes.length) throw new MarkiloError('INVALID_INPUT', 'The SVG has no filled shapes to split.');
  const union =
    shapes.length === 1
      ? shapes[0]!.d
      : booleanOp(
          'union',
          shapes.map((s) => s.d),
        );
  const parts = contours(union)
    .map((d) => ({ d, box: boundsOf(d) }))
    .filter((p) => p.box.w > 0 && p.box.h > 0);
  let groups = letterGroups(parts);
  let dropped: Group[] = [];
  if (part === 'auto') ({ groups, dropped } = dropSymbol(parts, groups, want));
  return { root, groups, dropped, shapes };
}

function capAndBaseline(groups: Group[]): { capTop: number; baseline: number } {
  const capTop = median(groups.map((g) => g.y0));
  const baseline = median(groups.map((g) => g.y1));
  if (!(baseline > capTop))
    throw new MarkiloError('INVALID_INPUT', 'Could not find a cap height in the word.');
  return { capTop, baseline };
}

/**
 * Cap height and baseline of a word drawn as outlines (source units), for words that carry no `data-cap-height`.
 * In auto mode a lockup's symbol is left out first.
 */
export async function wordMetrics(
  svg: string,
  opts: { part?: 'word' | 'auto' } = {},
): Promise<{ capHeight: number; baseline: number; capTop: number; glyphs: number }> {
  const { groups } = await locate(svg, opts.part ?? 'auto');
  const { capTop, baseline } = capAndBaseline(groups);
  return {
    capHeight: r2(baseline - capTop),
    baseline: r2(baseline),
    capTop: r2(capTop),
    glyphs: groups.length,
  };
}

/**
 * Splits a word (or the word of a lockup, in auto mode) into one glyph per letter of `text` and measures them.
 * A word that does not split into exactly that many glyphs is an INVALID_INPUT carrying the groups found.
 */
export async function splitGlyphs(
  svg: string,
  textIn: string,
  opts: { part?: 'word' | 'auto' } = {},
): Promise<GlyphSplit> {
  const chars = [...textIn.replace(/\s+/g, '')];
  if (!chars.length) throw new MarkiloError('USAGE', '--text is empty.');
  const loc = await locate(svg, opts.part ?? 'auto', chars.length);
  const groups = mergeTo(loc.groups, chars.length);
  if (groups.length !== chars.length) {
    throw new MarkiloError(
      'INVALID_INPUT',
      `The word splits into ${groups.length} groups, not the ${chars.length} letters of "${chars.join('')}".`,
      'See "groups" (left and right edge of each, in the file\'s units): pass --text with one letter per group, or --part word|auto.',
      { groups: groups.map((g) => ({ x0: r2(g.x0), x1: r2(g.x1) })) },
    );
  }
  const { capTop, baseline } = capAndBaseline(groups);
  const s = 100 / (baseline - capTop);
  const origin = groups[0]!.x0;
  const gaps = groups.slice(1).map((g, i) => (g.x0 - groups[i]!.x1) * s);
  const glyphs: GlyphInfo[] = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]!;
    const d = transformPath(g.parts.map((p) => p.d).join(''), [s, 0, 0, s, -g.x0 * s, -baseline * s]);
    const width = (g.x1 - g.x0) * s;
    const top = (g.y0 - baseline) * s;
    const bottom = (g.y1 - baseline) * s;
    const left = gaps[i - 1] ?? gaps[i] ?? 0;
    const right = gaps[i] ?? gaps[i - 1] ?? 0;
    const m = await measureGlyph(d, width, top, bottom);
    glyphs.push({
      char: chars[i]!,
      d,
      x: r2((g.x0 - origin) * s),
      width: r2(width),
      top: r2(top),
      bottom: r2(bottom),
      left: r2(left),
      right: r2(right),
      advance: r2(width + (left + right) / 2),
      ...m,
      overshoot: { above: r2(Math.max(0, -100 - top)), below: r2(Math.max(0, bottom)) },
    });
  }
  const over = glyphs.flatMap((g) => [g.overshoot.above, g.overshoot.below]).filter((v) => v > 0.3 && v < 15);
  const bars = glyphs.map((g) => g.bar).filter((b): b is number => b !== null);
  const flared = glyphs.filter((g) => g.terminals === 'flared').length;
  // The word's colour: the most common fill among the shapes inside it.
  const x0 = Math.min(...groups.map((g) => g.x0));
  const x1 = Math.max(...groups.map((g) => g.x1));
  const fills = new Map<string, number>();
  for (const sh of loc.shapes) {
    const cx = sh.box.x + sh.box.w / 2;
    if (cx >= x0 && cx <= x1) fills.set(sh.fill, (fills.get(sh.fill) ?? 0) + 1);
  }
  const fill = [...fills.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '#111111';
  return {
    text: chars.join(''),
    capHeight: r2(baseline - capTop),
    baseline: r2(baseline),
    overshoot: r2(median(over)),
    stem: r2(median(glyphs.map((g) => g.stem).filter((v): v is number => v !== null))),
    bar: bars.length ? r2(median(bars)) : null,
    terminals: flared * 2 > glyphs.length ? 'flared' : 'flat',
    fill,
    glyphs,
    dropped: loc.dropped.map((g) => ({ x0: r2(g.x0), x1: r2(g.x1), y0: r2(g.y0), y1: r2(g.y1) })),
  };
}

// ----- files -----

/** A file name for a glyph that is unique on case-insensitive file systems (A.svg, a-lc.svg, u00e7.svg). */
export function glyphFileName(char: string, taken: Set<string>): string {
  const base = /^[A-Z0-9]$/.test(char)
    ? char
    : /^[a-z]$/.test(char)
      ? `${char}-lc`
      : `u${char.codePointAt(0)!.toString(16).padStart(4, '0')}`;
  let name = `${base}.svg`;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base}-${n}.svg`;
  taken.add(name.toLowerCase());
  return name;
}

/** One glyph as an SVG: cap 100, baseline 0, the advance as the artboard's width. */
export function glyphSvg(g: GlyphInfo, fill: string): string {
  const y0 = Math.min(g.top, -100);
  const y1 = Math.max(g.bottom, 0);
  const x0 = -g.left / 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(r2(x0))} ${fmt(r2(y0))} ${fmt(r2(g.advance))} ${fmt(r2(y1 - y0))}"`,
    `  data-markilo-role="glyph" data-char="${escapeAttr(g.char)}" data-baseline="0" data-cap-height="100"`,
    `  data-left="${fmt(g.left)}" data-right="${fmt(g.right)}">`,
    `  <title>${escapeText(g.char)}</title>`,
    `  <path fill="${escapeAttr(fill)}" fill-rule="evenodd" d="${g.d}"/>`,
    '</svg>',
    '',
  ].join('\n');
}

export const GLYPHS_SCHEMA = 'markilo/glyphs@1';

export interface GlyphSet extends Omit<GlyphSplit, 'glyphs'> {
  schema: typeof GLYPHS_SCHEMA;
  ref: string;
  source: string;
  glyphs: (GlyphInfo & { file: string })[];
}

export function glyphSet(ref: string, source: string, split: GlyphSplit): GlyphSet {
  const taken = new Set<string>();
  return {
    schema: GLYPHS_SCHEMA,
    ref,
    source,
    ...split,
    glyphs: split.glyphs.map((g) => ({ ...g, file: glyphFileName(g.char, taken) })),
  };
}

/** The source SVG (sanitized) with the measured baseline and cap height recorded on its root, for lockups. */
export function withWordMetrics(svg: string, capHeight: number, baseline: number): string {
  const root = sanitizeTree(parseXml(svg));
  root.attrs['data-baseline'] = fmt(baseline);
  root.attrs['data-cap-height'] = fmt(capHeight);
  return `${serializeXml(root)}\n`;
}

export const hasWordMetrics = (svg: string): boolean => {
  try {
    const root = parseXml(svg);
    return (
      Number.parseFloat(root.attrs['data-cap-height'] ?? '') > 0 &&
      Number.isFinite(Number.parseFloat(root.attrs['data-baseline'] ?? ''))
    );
  } catch {
    return false;
  }
};
