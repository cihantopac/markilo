import { booleanOp, simplifyPath } from '../geom/pathkit.js';

/**
 * Lettering operations on outlines: the edits a lettering artist makes to a real glyph — cut the free ends of stems at
 * one shared angle, open a slit, detach a bowl from its stem, point an apex — done on the outline itself so the
 * stroke angles and weights the font drew are kept. Each detector reports what it leaves alone instead of guessing:
 * a glyph without the feature (an "o" has no stem to detach a bowl from) comes back unchanged with a reason.
 */

type P = [number, number];
type Seg = { k: 'L' | 'Q' | 'C'; p: P[] }; // p[0] is the start point, the last point is the end
type Contour = Seg[];

/** Where the type sits: the cap line, the baseline and the cap height, in the outline's coordinates. */
export interface TypeLines {
  capLine: number;
  baseline: number;
  capHeight: number;
}

export interface OpResult {
  d: string;
  /** Why the operation left (part of) the outline alone. Empty when it did all it was asked. */
  skipped: string[];
}

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P, s: number): P => [a[0] * s, a[1] * s];
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
const len = (a: P) => Math.hypot(a[0], a[1]);
const unit = (a: P): P => {
  const l = len(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l] : [0, 0];
};
const first = (s: Seg): P => s.p[0]!;
const last = (s: Seg): P => s.p[s.p.length - 1]!;
const r2 = (n: number) => {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
};
const fmt = (p: P) => `${r2(p[0])} ${r2(p[1])}`;

/** Reads the kit's own path data (absolute M, L, Q, C, Z) as closed contours. */
export function parseContours(d: string): Contour[] {
  const toks = d.match(/[MLQCZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const out: Contour[] = [];
  let cur: Contour = [];
  let start: P | undefined;
  let pen: P = [0, 0];
  let cmd = '';
  let i = 0;
  const num = () => Number(toks[i++]);
  const close = () => {
    if (start && (pen[0] !== start[0] || pen[1] !== start[1])) cur.push({ k: 'L', p: [pen, start] });
    if (cur.length) out.push(cur);
    cur = [];
    start = undefined;
  };
  while (i < toks.length) {
    if (/^[MLQCZ]$/i.test(toks[i]!)) cmd = toks[i++]!.toUpperCase();
    if (cmd === 'M') {
      close();
      pen = [num(), num()];
      start = pen;
      cmd = 'L';
    } else if (cmd === 'L') {
      const p: P = [num(), num()];
      cur.push({ k: 'L', p: [pen, p] });
      pen = p;
    } else if (cmd === 'Q' || cmd === 'C') {
      const ps: P[] = [pen];
      for (let k = 0; k < (cmd === 'Q' ? 2 : 3); k++) ps.push([num(), num()]);
      cur.push({ k: cmd, p: ps });
      pen = ps[ps.length - 1]!;
    } else if (cmd === 'Z') {
      close();
      cmd = '';
    } else i++;
  }
  close();
  return out;
}

export function writeContours(cs: Contour[]): string {
  return cs
    .filter((c) => c.length)
    .map((c) => `M${fmt(first(c[0]!))}${c.map((s) => `${s.k}${s.p.slice(1).map(fmt).join(' ')}`).join('')}Z`)
    .join('');
}

function pointAt(s: Seg, t: number): P {
  let pts = s.p;
  while (pts.length > 1) pts = pts.slice(1).map((p, j) => add(pts[j]!, mul(sub(p, pts[j]!), t)));
  return pts[0]!;
}

/** A contour as a closed polyline: curves are flattened into short chords. */
function flatten(c: Contour, step = 2): P[] {
  const out: P[] = [];
  for (const s of c) {
    out.push(first(s));
    if (s.k === 'L') continue;
    let est = 0;
    for (let i = 1; i < s.p.length; i++) est += len(sub(s.p[i]!, s.p[i - 1]!));
    const n = Math.max(8, Math.ceil(est / step));
    for (let i = 1; i < n; i++) out.push(pointAt(s, i / n));
  }
  return out;
}

const polyArea = (p: P[]) => p.reduce((s, a, i) => s + cross(a, p[(i + 1) % p.length]!), 0) / 2;

function inPoly(pt: P, poly: P[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Even-odd fill test over every contour. */
const filled = (pt: P, polys: P[][]) => polys.reduce((c, p) => (inPoly(pt, p) ? !c : c), false);

/** How many other contours enclose each contour: even = an outline, odd = a counter. */
function depths(polys: P[][]): number[] {
  return polys.map((p, i) => polys.filter((q, j) => j !== i && inPoly(p[0]!, q)).length);
}

/** Even-odd filled area of a set of contours. */
function inkArea(polys: P[][]): number {
  const dep = depths(polys);
  return polys.reduce((s, p, i) => s + (dep[i]! % 2 ? -1 : 1) * Math.abs(polyArea(p)), 0);
}

export const areaOf = (d: string): number => inkArea(parseContours(d).map((c) => flatten(c)));

/** Contours under `fraction` of `refArea` are slivers left by a cut: they are dropped. */
export function dropSlivers(d: string, refArea: number, fraction = 0.0005): string {
  const cs = parseContours(d);
  const keep = cs.filter((c) => Math.abs(polyArea(flatten(c))) >= refArea * fraction);
  return keep.length === cs.length ? d : writeContours(keep);
}

/** Where lines a + s·u and b + t·v cross, as [point, s, t]; undefined when they are parallel. */
function meet(a: P, u: P, b: P, v: P): [P, number, number] | undefined {
  const den = cross(u, v);
  if (Math.abs(den) < 1e-9) return undefined;
  const w = sub(b, a);
  const s = cross(w, v) / den;
  const t = cross(w, u) / den;
  return [add(a, mul(u, s)), s, t];
}

const isLine = (s: Seg) => s.k === 'L' && len(sub(last(s), first(s))) > 1e-6;

/** The filled band of `width` along from → to (a slit, or a cut across a wall). */
export function bandD(from: P, to: P, width: number): string {
  const u = unit(sub(to, from));
  const n: P = [-u[1] * (width / 2), u[0] * (width / 2)];
  const pts = [add(from, n), add(to, n), sub(to, n), sub(from, n)];
  return `M${pts.map(fmt).join('L')}Z`;
}

// ---- cut-terminals --------------------------------------------------------------------------------------------

/**
 * Finds the flat free ends of stems on the cap line and the baseline (within 2 % of the cap height) and turns each
 * about its midpoint to `angle` degrees (rising to the right, the same for every end, like one pen). Turning about the
 * midpoint removes as much as it adds, so the stem keeps its area. An end qualifies only when both its sides are
 * straight, parallel and run into the glyph: a bowl's curved shoulder never does.
 */
export function cutTerminals(
  d: string,
  o: { angle: number; where: 'top' | 'bottom' | 'both'; minLength: number },
  t: TypeLines,
): OpResult {
  const cs = parseContours(d);
  const skipped: string[] = [];
  const near = t.capHeight * 0.02;
  const a = (o.angle * Math.PI) / 180;
  const dir: P = [Math.cos(a), -Math.sin(a)];
  let cuts = 0;
  for (const c of cs) {
    for (let i = 0; i < c.length; i++) {
      const s = c[i]!;
      if (!isLine(s)) continue;
      const A = first(s);
      const B = last(s);
      const w = len(sub(B, A));
      if (Math.abs(A[1] - B[1]) > 0.5 || w < o.minLength || w > t.capHeight * 0.35) continue;
      const y = (A[1] + B[1]) / 2;
      const top = Math.abs(y - t.capLine) <= near;
      const bottom = Math.abs(y - t.baseline) <= near;
      if (!((top && o.where !== 'bottom') || (bottom && o.where !== 'top'))) continue;
      const prev = c[(i - 1 + c.length) % c.length]!;
      const next = c[(i + 1) % c.length]!;
      if (!isLine(prev) || !isLine(next) || prev === next) continue;
      // Both sides run from the end into the glyph: down from the cap line, up from the baseline.
      const v1 = unit(sub(first(prev), last(prev)));
      const v2 = unit(sub(last(next), first(next)));
      const inward = top ? 1 : -1;
      if (v1[1] * inward < Math.sin(Math.PI / 4) || v2[1] * inward < Math.sin(Math.PI / 4)) continue;
      if (dot(v1, v2) < Math.cos((10 * Math.PI) / 180)) continue;
      const M = mul(add(A, B), 0.5);
      const pa = meet(A, v1, M, dir);
      const pb = meet(B, v2, M, dir);
      const where = `the ${top ? 'top' : 'bottom'} end at x ${r2(M[0])}`;
      if (!pa || !pb) {
        skipped.push(`${where}: the cut runs along the stem`);
        continue;
      }
      if (pa[1] > len(sub(first(prev), last(prev))) - 1 || pb[1] > len(sub(last(next), first(next))) - 1) {
        skipped.push(`${where}: the cut would run past the stem's sides`);
        continue;
      }
      // The two triangles swapped at the end; with tapered sides they differ. Keep the stem within ±3 %.
      const removed = Math.abs(polyArea([A, pa[0], M])) - Math.abs(polyArea([B, pb[0], M]));
      const stem = w * Math.min(len(sub(first(prev), last(prev))), len(sub(last(next), first(next))));
      if (Math.abs(removed) > stem * 0.03) {
        skipped.push(`${where}: the stem is tapered; the cut would change its area by more than 3 %`);
        continue;
      }
      prev.p[prev.p.length - 1] = pa[0];
      s.p = [pa[0], pb[0]];
      next.p[0] = pb[0];
      cuts++;
    }
  }
  if (!cuts) {
    skipped.unshift(
      `no flat stem end on the ${o.where === 'both' ? 'cap line or baseline' : o.where === 'top' ? 'cap line' : 'baseline'} to cut`,
    );
    return { d, skipped };
  }
  return { d: simplifyPath(writeContours(cs)), skipped };
}

// ---- detach-bowl ----------------------------------------------------------------------------------------------

interface VLine {
  x: number;
  y0: number;
  y1: number;
}

function verticals(c: Contour, minLen: number): VLine[] {
  return c
    .filter((s) => isLine(s) && Math.abs(first(s)[0] - last(s)[0]) < 0.5)
    .map((s) => ({
      x: (first(s)[0] + last(s)[0]) / 2,
      y0: Math.min(first(s)[1], last(s)[1]),
      y1: Math.max(first(s)[1], last(s)[1]),
    }))
    .filter((v) => v.y1 - v.y0 >= minLen);
}

/** Nearest point to p on segment a–b, kept on the side s·(x − xs) ≥ 0. */
function nearestOn(p: P, a: P, b: P, xs: number, sgn: number): P | undefined {
  const fa = sgn * (a[0] - xs);
  const fb = sgn * (b[0] - xs);
  if (fa < 0 && fb < 0) return undefined;
  let A = a;
  let B = b;
  if (fa < 0 || fb < 0) {
    const t = fa / (fa - fb);
    const x = add(a, mul(sub(b, a), t));
    if (fa < 0) A = x;
    else B = x;
  }
  const ab = sub(B, A);
  const l = dot(ab, ab);
  const t = l ? Math.max(0, Math.min(1, dot(sub(p, A), ab) / l)) : 0;
  return add(A, mul(ab, t));
}

/** Points along a closed polyline, every `step` units, plus where it crosses the vertical x = at. */
function samples(poly: P[], step: number, at: number): P[] {
  const out: P[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const n = Math.max(1, Math.ceil(len(sub(b, a)) / step));
    for (let k = 0; k < n; k++) out.push(add(a, mul(sub(b, a), k / n)));
    if ((a[0] - at) * (b[0] - at) < 0) out.push(add(a, mul(sub(b, a), (at - a[0]) / (b[0] - a[0]))));
  }
  return out;
}

/**
 * Finds each bowl — a counter whose outline meets a vertical stem — and cuts its two joins to the stem (above and
 * below the counter) with a gap of `gap` units, across the joining wall at its narrowest neck beside the stem, so the
 * bowl comes free as a ribbon. The cut runs along the shortest chord across the wall, which is the wall's normal.
 */
export function detachBowl(d: string, gap: number, t: TypeLines): OpResult {
  const cs = parseContours(d);
  const polys = cs.map((c) => flatten(c, 1));
  const dep = depths(polys);
  const skipped: string[] = [];
  const plans: BowlPlan[] = [];
  const minStem = t.capHeight * 0.25;
  for (let h = 0; h < cs.length; h++) {
    if (dep[h]! % 2 !== 1) continue;
    const hole = polys[h]!;
    const xs0 = Math.min(...hole.map((p) => p[0]));
    const xs1 = Math.max(...hole.map((p) => p[0]));
    const hy0 = Math.min(...hole.map((p) => p[1]));
    const hy1 = Math.max(...hole.map((p) => p[1]));
    const hw = xs1 - xs0;
    const label = `the counter at x ${r2(xs0)}–${r2(xs1)}`;
    // The contour directly around the counter.
    const parent = polys
      .map((p, i) => ({ p, i }))
      .filter(({ p, i }) => dep[i] === dep[h]! - 1 && inPoly(hole[0]!, p))
      .sort((a, b) => Math.abs(polyArea(a.p)) - Math.abs(polyArea(b.p)))[0];
    if (!parent) continue;
    const vs = [...verticals(cs[h]!, minStem), ...verticals(cs[parent.i]!, minStem)];
    const outerVs = verticals(cs[parent.i]!, minStem);
    // A stem: a straight vertical edge beside the counter with ink behind it, whose far edge is straight too and runs
    // past the counter (a stem is taller than its bowl; the sides of an "O" are not a stem).
    let stem: { xs: number; sgn: number; mid: P } | undefined;
    for (const sgn of [1, -1]) {
      const side = sgn > 0 ? xs0 : xs1;
      for (const e of vs.filter((v) => Math.abs(v.x - side) <= Math.max(0.15 * hw, 2))) {
        const ym = (e.y0 + e.y1) / 2;
        if (!filled([e.x - sgn * 2, ym], polys) || filled([e.x + sgn * 2, ym], polys)) continue;
        const far = outerVs.find(
          (f) =>
            sgn * (e.x - f.x) > 2 &&
            sgn * (e.x - f.x) <= t.capHeight * 0.4 &&
            f.y0 <= Math.max(e.y0, hy0) + 1 &&
            f.y1 >= Math.min(e.y1, hy1) - 1 &&
            (hy0 - f.y0 >= t.capHeight * 0.1 || f.y1 - hy1 >= t.capHeight * 0.1) &&
            filled([(e.x + f.x) / 2, ym], polys),
        );
        if (far && (!stem || sgn * (e.x - stem.xs) > 0))
          stem = {
            xs: e.x,
            sgn,
            mid: [(e.x + far.x) / 2, (Math.max(e.y0, far.y0) + Math.min(e.y1, far.y1)) / 2],
          };
      }
      if (stem) break;
    }
    if (!stem) {
      skipped.push(`${label} has no vertical stem beside it`);
      continue;
    }
    const { xs, sgn } = stem;
    // Split the counter's points above and below the part nearest the stem: one join each.
    const edge = sgn > 0 ? xs0 : xs1;
    const closest = hole.filter((p) => Math.abs(p[0] - edge) <= 1);
    const ymid = closest.reduce((s, p) => s + p[1], 0) / closest.length;
    const farPt = hole.reduce((b, p) => (sgn * (p[0] - b[0]) > 0 ? p : b), hole[0]!);
    plans.push({
      label,
      xs,
      sgn,
      ymid,
      hole,
      others: polys.filter((_, i) => i !== h),
      window: Math.max(0.2 * hw, 4 * gap),
      stemPt: stem.mid,
      bowlPt: [farPt[0] + sgn * 2, farPt[1]],
    });
  }
  let out = d;
  let done = 0;
  for (const plan of plans) {
    // Start with the cut against the stem's edge; where the bowl meets the stem at an acute corner, a cut there
    // leaves the bowl's tip closer than the gap to the stem, so that join's cut steps away from the stem until the
    // gap holds everywhere.
    const offsets = [gap / 2, gap / 2];
    let result: string | undefined;
    let reason = 'no wall joins it to the stem above and below';
    for (let tries = 0; tries < 40 && !result; tries++) {
      const chords = [true, false].map((upper, k) => neck(plan, polys, upper, offsets[k]!));
      if (chords.some((c) => !c)) break;
      const m = gap + 2;
      const bands = chords.map((c) => {
        const u = unit(sub(c!.o, c!.c));
        return bandD(sub(c!.c, mul(u, m)), add(c!.o, mul(u, m)), gap);
      });
      const trial = booleanOp('subtract', [out, ...bands]);
      const res = parseContours(trial).map((c) => flatten(c, 1));
      const resDep = depths(res);
      const owner = (p: P) => res.findIndex((r, i) => resDep[i] === 0 && inPoly(p, r));
      const si = owner(plan.stemPt);
      const bi = owner(plan.bowlPt);
      if (si < 0 || bi < 0 || si === bi) {
        reason = 'the cuts did not free the bowl from the stem';
        break;
      }
      const clear = [true, false].map((upper) => clearance(res[bi]!, res[si]!, plan.ymid, upper));
      if (clear.every((c) => c >= gap - 0.05)) {
        result = trial;
        break;
      }
      reason = 'no cut beside the stem keeps the gap';
      clear.forEach((c, k) => {
        if (c < gap - 0.05) offsets[k]! += gap / 4;
      });
      if (offsets.some((o) => o > plan.window)) break;
    }
    if (!result) {
      skipped.push(`${plan.label}: ${reason}; left unchanged`);
      continue;
    }
    out = result;
    done++;
  }
  if (!done) {
    if (!skipped.length) skipped.push('no counter: there is no bowl to detach');
    return { d, skipped };
  }
  return { d: out, skipped };
}

interface BowlPlan {
  label: string;
  /** The stem's inner edge, and which way the bowl lies from it (+1: right). */
  xs: number;
  sgn: number;
  /** Counter points above ymid belong to the upper join, below to the lower. */
  ymid: number;
  hole: P[];
  /** Every other boundary of the glyph: the outline, and other counters (the bar between a B's two bowls). */
  others: P[][];
  window: number;
  stemPt: P;
  bowlPt: P;
}

/**
 * The narrowest chord across the wall that joins the bowl to the stem (above or below the counter), starting at least
 * `offset` from the stem's edge: from a counter point to its nearest outline point on the bowl's side. The shortest
 * chord across a wall meets both its sides at right angles, so a cut along it follows the wall's normal.
 */
function neck(plan: BowlPlan, polys: P[][], upper: boolean, offset: number): { c: P; o: P } | undefined {
  const { xs, sgn, ymid } = plan;
  const from = xs + sgn * offset;
  const cands = samples(plan.hole, 0.5, from).filter((p) => {
    const off = sgn * (p[0] - from);
    return off >= -1e-6 && off <= plan.window && (upper ? p[1] < ymid : p[1] > ymid);
  });
  let best: { c: P; o: P; dist: number; off: number } | undefined;
  for (const c of cands) {
    let o: P | undefined;
    let dist = Infinity;
    for (const outer of plan.others)
      for (let i = 0; i < outer.length; i++) {
        const q = nearestOn(c, outer[i]!, outer[(i + 1) % outer.length]!, from, sgn);
        if (!q || (upper ? q[1] > ymid : q[1] < ymid)) continue;
        const dd = len(sub(q, c));
        if (dd < dist) {
          dist = dd;
          o = q;
        }
      }
    if (!o) continue;
    // The chord must cross ink only: a wall, not the counter or the outside.
    let solid = true;
    for (let k = 1; k < 10 && solid; k++) solid = filled(add(c, mul(sub(o, c), k / 10)), polys);
    if (!solid) continue;
    const off = sgn * (c[0] - from);
    if (!best || dist < best.dist - 0.5 || (Math.abs(dist - best.dist) <= 0.5 && off < best.off))
      best = { c, o, dist, off };
  }
  return best && { c: best.c, o: best.o };
}

/** Smallest distance from the bowl's points on one side of ymid to the stem's outline. */
function clearance(bowl: P[], stem: P[], ymid: number, upper: boolean): number {
  let m = Infinity;
  for (const p of bowl) {
    if (upper ? p[1] >= ymid : p[1] <= ymid) continue;
    for (let i = 0; i < stem.length; i++) {
      const a = stem[i]!;
      const ab = sub(stem[(i + 1) % stem.length]!, a);
      const l = dot(ab, ab);
      const t = l ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l)) : 0;
      m = Math.min(m, len(sub(p, add(a, mul(ab, t)))));
    }
  }
  return m;
}

// ---- point-apex -----------------------------------------------------------------------------------------------

interface Join {
  c: number;
  /** Index of the line arriving at the join and of the line leaving it. */
  a: number;
  b: number;
  /** Segments between them (the flat or rounded join). */
  run: number[];
  x: P;
  /** The join's extreme point (the flat's or the curve's, or the vertex when it is already sharp). */
  tip: P;
  ext: number;
  convex: boolean;
  angles: [number, number];
}

const undirected = (s: Seg) => {
  const v = sub(last(s), first(s));
  return ((((Math.atan2(v[1], v[0]) * 180) / Math.PI) % 180) + 180) % 180;
};
const angleGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 180;
  return Math.min(d, 180 - d);
};

/**
 * Finds the flat or rounded join where two strokes meet at the top (A, M, N) or bottom (V, W) and extends both
 * strokes' outer edges to their intersection and the inner edges to theirs, so the join becomes a sharp point. The
 * edges keep their angles exactly. A point that would rise more than 25 % of the cap height past the join is too far
 * from the letter the font drew: that join is left alone and reported.
 */
export function pointApex(d: string, where: 'top' | 'bottom', t: TypeLines): OpResult {
  const cs = parseContours(d);
  const polys = cs.map((c) => flatten(c));
  const skipped: string[] = [];
  const up = where === 'top' ? -1 : 1; // the direction the point grows in (y-down)
  const cap = t.capHeight * 0.25;
  const steep = (s: Seg) =>
    isLine(s) &&
    len(sub(last(s), first(s))) >= t.capHeight * 0.1 &&
    Math.abs(unit(sub(last(s), first(s)))[1]) >= Math.sin(Math.PI / 6);
  const joins: Join[] = [];
  cs.forEach((c, ci) => {
    const idx = c.map((s, i) => (steep(s) ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 2) return;
    for (let k = 0; k < idx.length; k++) {
      const a = idx[k]!;
      const b = idx[(k + 1) % idx.length]!;
      const run: number[] = [];
      for (let i = (a + 1) % c.length; i !== b; i = (i + 1) % c.length) run.push(i);
      if (run.length > 8) continue;
      const sa = c[a]!;
      const sb = c[b]!;
      // The first line runs toward the join (in the point's direction), the second away from it.
      if (up * (last(sa)[1] - first(sa)[1]) <= 0 || up * (last(sb)[1] - first(sb)[1]) >= 0) continue;
      if (angleGap(undirected(sa), undirected(sb)) < 8) continue;
      const runPts = run.flatMap((i) => flatten([c[i]!], 1)).concat([first(sb)]);
      const tip = runPts.reduce((b, p) => (up * (p[1] - b[1]) > 0 ? p : b), runPts[0]!);
      const extreme = tip[1];
      const ends = [last(sa)[1], first(sb)[1]];
      if (up * (extreme - (up < 0 ? Math.min(...ends) : Math.max(...ends))) < -1) continue;
      const m = meet(last(sa), unit(sub(last(sa), first(sa))), first(sb), unit(sub(first(sb), last(sb))));
      if (!m || m[1] < -1 || m[2] < -1) continue; // the edges do not converge beyond the join
      const mid = mul(add(last(sa), first(sb)), 0.5);
      joins.push({
        c: ci,
        a,
        b,
        run,
        x: run.length ? m[0] : first(sb),
        tip,
        ext: up * (m[0][1] - extreme),
        convex: filled([mid[0], mid[1] - up * 2], polys),
        angles: [undirected(sa), undirected(sb)],
      });
    }
  });
  const convex = joins.filter((j) => j.convex);
  const apexes = convex.filter((j) => j.run.length);
  if (!apexes.length) {
    skipped.push(
      convex.length ? `the ${where} join is already a point` : `no ${where} join where two strokes meet`,
    );
    return { d, skipped };
  }
  const apply: Join[] = [];
  for (const o of apexes) {
    const at = `the ${where} join at x ${r2(o.x[0])}`;
    if (o.ext > cap) {
      skipped.push(
        `${at}: the point would reach ${r2(o.ext)} units past the join (${Math.round((o.ext / t.capHeight) * 100)} % of the cap height; the limit is 25 %)`,
      );
      continue;
    }
    // Its inner join: edges parallel to the outer ones, on the inner side of the point, the nearest one (an A's
    // counter, not the notch under its bar, which lies on the same lines). It may already be sharp.
    const inner = joins
      .filter(
        (j) =>
          !j.convex &&
          up * (o.x[1] - j.x[1]) > 0 &&
          ((angleGap(j.angles[0], o.angles[0]) <= 3 && angleGap(j.angles[1], o.angles[1]) <= 3) ||
            (angleGap(j.angles[0], o.angles[1]) <= 3 && angleGap(j.angles[1], o.angles[0]) <= 3)),
      )
      .sort((p, q) => len(sub(p.tip, o.tip)) - len(sub(q.tip, o.tip)))[0];
    if (inner && inner.ext > cap) {
      skipped.push(
        `${at}: the inner point would reach ${r2(inner.ext)} units past its join (limit 25 % of the cap height)`,
      );
      continue;
    }
    apply.push(o);
    if (inner?.run.length) apply.push(inner);
  }
  if (!apply.length) return { d, skipped };
  const drop = new Set<string>();
  for (const j of apply) {
    const c = cs[j.c]!;
    c[j.a]!.p[c[j.a]!.p.length - 1] = j.x;
    c[j.b]!.p[0] = j.x;
    for (const i of j.run) drop.add(`${j.c}:${i}`);
  }
  const out = cs.map((c, ci) => c.filter((_, i) => !drop.has(`${ci}:${i}`)));
  return { d: simplifyPath(writeContours(out)), skipped };
}
