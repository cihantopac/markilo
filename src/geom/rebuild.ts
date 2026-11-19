/**
 * Rebuilds path data as clean geometry: the form a designer would draw — straight lines, circular arcs, a few cubics —
 * instead of the many small curves a trace or a converter leaves behind. Optionally snaps line directions that are
 * meant to be one angle (the shared cut of a mark) to that angle exactly.
 *
 * Each contour is split at its corners (turns above CORNER_TURN); every stretch between corners is covered with as
 * few pieces as possible, each piece the simplest that stays within the tolerance: a line, then a circular arc, then
 * one cubic. Pieces end where the input's own segments end, so a piece never invents a joint the drawing did not have.
 *
 * Needs PathKit: await ensurePathKit() first.
 */
import { MarkiloError } from '../core/errors.js';
import { fromD, pk } from './pathkit.js';
import { type Seg as FitSeg, fitCubic, fitOneCubic, type Pt } from './trace.js';

export interface RebuildOptions {
  /** Largest distance, in path units, a rebuilt piece may stray from the input outline. */
  tolerance: number;
  /**
   * Line directions to snap to, in degrees counter-clockwise from horizontal as seen (90 is vertical, 32 rises to the
   * right). 'auto' snaps every group of three or more lines within AUTO_SPREAD of each other to the group's mean;
   * a list snaps every line within EXPLICIT_REACH of one of its angles to that angle. Omitted: no snapping.
   */
  angles?: number[] | 'auto';
  /** Fit circular arcs (default true); false keeps lines and cubics only. */
  arcs?: boolean;
}

export interface RebuildResult {
  d: string;
  segments: { lines: number; arcs: number; cubics: number };
  /** One entry per angle that moved lines: the angle (degrees, as in `angles`) and the lines now on it. */
  snapped: { angle: number; count: number }[];
}

/** A joint turning more than this is a corner: no piece spans it. */
const CORNER_TURN = 35;
/** 'auto' angle groups: every member within this many degrees of the group's first. */
const AUTO_SPREAD = 3;
const AUTO_MIN_GROUP = 3;
/** Explicit angles: lines this close (degrees) snap. */
const EXPLICIT_REACH = 4;
/** Below this angle (degrees) between two neighbouring lines their corner is not re-solved by intersection. */
const PARALLEL = 10;
/** The most input segments one piece may cover (bounds the work on dense input). */
const MAX_REACH = 64;
/** Samples per curve when a contour is measured as a polygon. */
const POLY_STEPS = 8;

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, s: number): Pt => [a[0] * s, a[1] * s];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];
const len = (a: Pt) => Math.hypot(a[0], a[1]);
const dist = (a: Pt, b: Pt) => len(sub(a, b));
const unit = (a: Pt): Pt => {
  const l = len(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l] : [0, 0];
};
const DEG = Math.PI / 180;

// ---- Input ----------------------------------------------------------------------------------------------------

/** An input segment: line, quadratic, conic (rational quadratic, weight w) or cubic; p[0] is its start. */
interface InSeg {
  k: 'L' | 'Q' | 'K' | 'C';
  p: Pt[];
  w: number;
}
interface InContour {
  segs: InSeg[];
  closed: boolean;
}

function evalSeg(s: InSeg, t: number): Pt {
  const p = s.p;
  const u = 1 - t;
  if (s.k === 'L') return add(mul(p[0]!, u), mul(p[1]!, t));
  if (s.k === 'Q') return add(add(mul(p[0]!, u * u), mul(p[1]!, 2 * u * t)), mul(p[2]!, t * t));
  if (s.k === 'K') {
    const den = u * u + 2 * s.w * u * t + t * t;
    const q = add(add(mul(p[0]!, u * u), mul(p[1]!, 2 * s.w * u * t)), mul(p[2]!, t * t));
    return mul(q, 1 / den);
  }
  return add(
    add(mul(p[0]!, u * u * u), mul(p[1]!, 3 * u * u * t)),
    add(mul(p[2]!, 3 * u * t * t), mul(p[3]!, t * t * t)),
  );
}

const endOf = (s: InSeg): Pt => s.p[s.p.length - 1]!;

/** Direction leaving the segment's start. */
function startDir(s: InSeg): Pt {
  for (let i = 1; i < s.p.length; i++) {
    const d = sub(s.p[i]!, s.p[0]!);
    if (len(d) > 1e-9) return unit(d);
  }
  return [0, 0];
}
/** Direction of travel arriving at the segment's end. */
function endDir(s: InSeg): Pt {
  const last = endOf(s);
  for (let i = s.p.length - 2; i >= 0; i--) {
    const d = sub(last, s.p[i]!);
    if (len(d) > 1e-9) return unit(d);
  }
  return [0, 0];
}

function readContours(d: string): InContour[] {
  const K = pk();
  const path = fromD(d);
  let cmds: number[][];
  try {
    cmds = path.toCmds();
  } finally {
    path.delete();
  }
  const out: InContour[] = [];
  let segs: InSeg[] = [];
  let start: Pt = [0, 0];
  let cur: Pt = [0, 0];
  const flush = (closed: boolean) => {
    if (segs.length) out.push({ segs, closed });
    segs = [];
  };
  for (const c of cmds) {
    const v = c[0];
    if (v === K.MOVE_VERB) {
      flush(false);
      start = cur = [c[1]!, c[2]!];
    } else if (v === K.LINE_VERB) {
      const p: Pt = [c[1]!, c[2]!];
      if (dist(p, cur) > 1e-9) segs.push({ k: 'L', p: [cur, p], w: 1 });
      cur = p;
    } else if (v === K.QUAD_VERB || v === K.CONIC_VERB) {
      const p: Pt = [c[3]!, c[4]!];
      const ctrl: Pt = [c[1]!, c[2]!];
      if (dist(p, cur) > 1e-9 || dist(ctrl, cur) > 1e-9)
        segs.push({ k: v === K.QUAD_VERB ? 'Q' : 'K', p: [cur, ctrl, p], w: c[5] ?? 1 });
      cur = p;
    } else if (v === K.CUBIC_VERB) {
      const p: Pt = [c[5]!, c[6]!];
      const c1: Pt = [c[1]!, c[2]!];
      const c2: Pt = [c[3]!, c[4]!];
      if (dist(p, cur) > 1e-9 || dist(c1, cur) > 1e-9 || dist(c2, cur) > 1e-9)
        segs.push({ k: 'C', p: [cur, c1, c2, p], w: 1 });
      cur = p;
    } else if (v === K.CLOSE_VERB) {
      if (dist(cur, start) > 1e-9) segs.push({ k: 'L', p: [cur, start], w: 1 });
      flush(true);
      cur = start;
    }
  }
  flush(false);
  return out;
}

/** Segments drawn by path data (a closing Z that returns to the start adds none). */
export function countSegments(d: string): number {
  return readContours(d).reduce((n, c) => n + c.segs.length, 0);
}

/** Points along a segment after its start, ending exactly on its end point. */
function samplesOf(s: InSeg, tol: number): Pt[] {
  let n: number;
  if (s.k === 'L') n = Math.max(1, Math.min(8, Math.ceil(dist(s.p[0]!, s.p[1]!) / (4 * tol))));
  else {
    let poly = 0;
    for (let i = 1; i < s.p.length; i++) poly += dist(s.p[i]!, s.p[i - 1]!);
    n = Math.max(4, Math.min(16, Math.ceil(poly / (2 * tol))));
  }
  const out: Pt[] = [];
  for (let i = 1; i < n; i++) out.push(evalSeg(s, i / n));
  out.push(endOf(s));
  return out;
}

// ---- Pieces ---------------------------------------------------------------------------------------------------

type Prim =
  | { k: 'L'; a: Pt; b: Pt }
  | { k: 'A'; a: Pt; b: Pt; c: Pt; sweep: boolean }
  | { k: 'C'; a: Pt; c1: Pt; c2: Pt; b: Pt };

function lineFits(p: Pt[], tol: number): boolean {
  const a = p[0]!;
  const ab = sub(p[p.length - 1]!, a);
  const l2 = dot(ab, ab);
  if (l2 < 1e-12) return false;
  for (const q of p) {
    const t = Math.max(0, Math.min(1, dot(sub(q, a), ab) / l2));
    if (dist(q, add(a, mul(ab, t))) > tol) return false;
  }
  return true;
}

/**
 * A circular arc through the first and the last point that stays within tol of all of them, its centre on their
 * perpendicular bisector (least squares), turning one way only and less than a full turn.
 */
function arcFit(p: Pt[], tol: number): { c: Pt; sweep: boolean } | undefined {
  const a = p[0]!;
  const b = p[p.length - 1]!;
  const chord = dist(a, b);
  if (chord < 1e-9 || p.length < 3) return undefined;
  const m = mul(add(a, b), 0.5);
  const u = unit(sub(b, a));
  const n: Pt = [-u[1], u[0]];
  // |q - C|² = |a - C|² is linear in s for C = m + s·n.
  let saa = 0;
  let sab = 0;
  for (const q of p) {
    const l = sub(q, m);
    const ak = -2 * dot(l, n);
    const bk = (chord * chord) / 4 - dot(l, l);
    saa += ak * ak;
    sab += ak * bk;
  }
  if (saa < 1e-12) return undefined;
  const s = sab / saa;
  const c = add(m, mul(n, s));
  const r = Math.hypot(chord / 2, s);
  let total = 0;
  let prev = Math.atan2(a[1] - c[1], a[0] - c[0]);
  let pos = 0;
  let neg = 0;
  const slack = Math.min(0.05, tol / r);
  for (const q of p) {
    if (Math.abs(dist(q, c) - r) > tol) return undefined;
    const ang = Math.atan2(q[1] - c[1], q[0] - c[0]);
    let dlt = ang - prev;
    if (dlt > Math.PI) dlt -= 2 * Math.PI;
    if (dlt < -Math.PI) dlt += 2 * Math.PI;
    if (dlt > slack) pos++;
    if (dlt < -slack) neg++;
    total += dlt;
    prev = ang;
  }
  if (pos && neg) return undefined;
  if (Math.abs(total) < 1e-3 || Math.abs(total) > 2 * Math.PI - 1e-3) return undefined;
  return { c, sweep: total > 0 };
}

/**
 * What a piece costs when a stretch is covered: lines before arcs before cubics, and a cubic only where it replaces
 * three or more simpler pieces (a designer draws a rounded corner as an arc and a line, not one cubic through both).
 */
const lineCost = 1;
const arcCost = 1.001;
const cubicCost = 2.5;

/** Covers segs[0..n) (one stretch between corners) with the fewest, simplest pieces. */
function fitStretch(segs: InSeg[], tol: number, arcs: boolean): Prim[] {
  const n = segs.length;
  const samples = segs.map((s) => samplesOf(s, tol));
  const pointsOf = (i: number, j: number): Pt[] => {
    const pts: Pt[] = [segs[i]!.p[0]!];
    for (let k = i; k < j; k++) pts.push(...samples[k]!);
    return pts;
  };
  const tryPiece = (i: number, j: number): { prims: Prim[]; cost: number } | undefined => {
    const pts = pointsOf(i, j);
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    if (lineFits(pts, tol)) return { prims: [{ k: 'L', a, b }], cost: lineCost };
    if (arcs) {
      const arc = arcFit(pts, tol);
      if (arc) return { prims: [{ k: 'A', a, b, c: arc.c, sweep: arc.sweep }], cost: arcCost };
    }
    if (dist(a, b) > 1e-9) {
      const bz = fitOneCubic(pts, startDir(segs[i]!), mul(endDir(segs[j - 1]!), -1), tol);
      if (bz) return { prims: [{ k: 'C', a, c1: bz[1]!, c2: bz[2]!, b }], cost: cubicCost };
    }
    return undefined;
  };
  const asIs = (i: number): { prims: Prim[]; cost: number } => {
    const s = segs[i]!;
    const a = s.p[0]!;
    if (s.k === 'L') return { prims: [{ k: 'L', a, b: s.p[1]! }], cost: lineCost };
    if (s.k === 'C') return { prims: [{ k: 'C', a, c1: s.p[1]!, c2: s.p[2]!, b: s.p[3]! }], cost: cubicCost };
    if (s.k === 'Q') {
      const [p0, q, p2] = s.p as [Pt, Pt, Pt];
      const c1 = add(p0, mul(sub(q, p0), 2 / 3));
      const c2 = add(p2, mul(sub(q, p2), 2 / 3));
      return { prims: [{ k: 'C', a, c1, c2, b: p2 }], cost: cubicCost };
    }
    const fitted: FitSeg[] = [];
    fitCubic([a, ...samples[i]!], startDir(s), mul(endDir(s), -1), tol, fitted);
    const prims: Prim[] = [];
    let from = a;
    for (const f of fitted) {
      prims.push(
        f.kind === 'L' ? { k: 'L', a: from, b: f.to } : { k: 'C', a: from, c1: f.c1, c2: f.c2, b: f.to },
      );
      from = f.to;
    }
    return { prims, cost: prims.length * cubicCost };
  };

  const best = new Array<number>(n + 1).fill(Number.POSITIVE_INFINITY);
  const choice = new Array<{ from: number; prims: Prim[] } | undefined>(n + 1);
  best[0] = 0;
  for (let j = 1; j <= n; j++) {
    for (let i = j - 1; i >= Math.max(0, j - MAX_REACH); i--) {
      const piece = tryPiece(i, j) ?? (j - i === 1 ? asIs(i) : undefined);
      if (!piece) break;
      if (best[i]! + piece.cost < best[j]!) {
        best[j] = best[i]! + piece.cost;
        choice[j] = { from: i, prims: piece.prims };
      }
    }
  }
  const out: Prim[][] = [];
  for (let j = n; j > 0; ) {
    const ch = choice[j]!;
    out.unshift(ch.prims);
    j = ch.from;
  }
  return out.flat();
}

function turnDeg(a: InSeg, b: InSeg): number {
  return Math.acos(Math.max(-1, Math.min(1, dot(endDir(a), startDir(b))))) / DEG;
}

interface Contour {
  prims: Prim[];
  closed: boolean;
}

function rebuildContour(c: InContour, tol: number, arcs: boolean): Contour {
  const segs = c.segs;
  const n = segs.length;
  const corner = (j: number) => turnDeg(segs[(j - 1 + n) % n]!, segs[j]!) > CORNER_TURN;
  const stretches: InSeg[][] = [];
  if (c.closed) {
    const first = [...Array(n).keys()].find(corner);
    // A smooth loop (no corner) is one stretch from its own start; a piece cannot close it alone.
    const rot = first ?? 0;
    let cur: InSeg[] = [];
    for (let k = 0; k < n; k++) {
      const j = (rot + k) % n;
      if (k > 0 && corner(j)) {
        stretches.push(cur);
        cur = [];
      }
      cur.push(segs[j]!);
    }
    stretches.push(cur);
  } else {
    let cur: InSeg[] = [];
    for (let j = 0; j < n; j++) {
      if (j > 0 && corner(j)) {
        stretches.push(cur);
        cur = [];
      }
      cur.push(segs[j]!);
    }
    stretches.push(cur);
  }
  return { prims: stretches.flatMap((s) => fitStretch(s, tol, arcs)), closed: c.closed };
}

// ---- Measuring ------------------------------------------------------------------------------------------------

/** Signed angle (radians) an arc turns from a to b around c in its sweep direction. */
function arcTurn(p: { a: Pt; b: Pt; c: Pt; sweep: boolean }): number {
  const a0 = Math.atan2(p.a[1] - p.c[1], p.a[0] - p.c[0]);
  const a1 = Math.atan2(p.b[1] - p.c[1], p.b[0] - p.c[0]);
  let t = a1 - a0;
  if (p.sweep) while (t <= 0) t += 2 * Math.PI;
  else while (t >= 0) t -= 2 * Math.PI;
  return t;
}

function primPoint(p: Prim, t: number): Pt {
  if (p.k === 'L') return add(mul(p.a, 1 - t), mul(p.b, t));
  if (p.k === 'C') return evalSeg({ k: 'C', p: [p.a, p.c1, p.c2, p.b], w: 1 }, t);
  const r = dist(p.a, p.c);
  const ang = Math.atan2(p.a[1] - p.c[1], p.a[0] - p.c[0]) + arcTurn(p) * t;
  return [p.c[0] + r * Math.cos(ang), p.c[1] + r * Math.sin(ang)];
}

function polygonOf(c: Contour): Pt[] {
  const out: Pt[] = [];
  for (const p of c.prims) {
    out.push(p.a);
    if (p.k !== 'L') for (let i = 1; i < POLY_STEPS; i++) out.push(primPoint(p, i / POLY_STEPS));
  }
  if (!c.closed && c.prims.length) out.push(c.prims[c.prims.length - 1]!.b);
  return out;
}

function shoelace(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += cross(p[i]!, p[(i + 1) % p.length]!);
  return s / 2;
}

/** Signed area of every contour of path data (positive: clockwise on screen), in drawing order. */
export function contourAreas(d: string): number[] {
  return readContours(d).map((c) => {
    const pts: Pt[] = [];
    for (const s of c.segs) {
      pts.push(s.p[0]!);
      if (s.k !== 'L') for (let i = 1; i < POLY_STEPS * 2; i++) pts.push(evalSeg(s, i / (POLY_STEPS * 2)));
    }
    return shoelace(pts);
  });
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(sub(b, a), sub(c, a));
  const d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c));
  const d4 = cross(sub(d, c), sub(b, c));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function edgesOf(p: Pt[], closed: boolean): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  for (let i = 0; i + 1 < p.length; i++) out.push([p[i]!, p[i + 1]!]);
  if (closed && p.length > 2) out.push([p[p.length - 1]!, p[0]!]);
  return out;
}

function selfCrossings(p: Pt[], closed: boolean): number {
  const e = edgesOf(p, closed);
  let n = 0;
  for (let i = 0; i < e.length; i++)
    for (let j = i + 2; j < e.length; j++) {
      if (closed && i === 0 && j === e.length - 1) continue;
      if (segmentsCross(e[i]![0], e[i]![1], e[j]![0], e[j]![1])) n++;
    }
  return n;
}

function crossings(p: Pt[], pc: boolean, q: Pt[], qc: boolean): number {
  const box = (pts: Pt[]) => {
    let x0 = Number.POSITIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    return [x0, y0, x1, y1] as const;
  };
  const A = box(p);
  const B = box(q);
  if (A[2] < B[0] || B[2] < A[0] || A[3] < B[1] || B[3] < A[1]) return 0;
  let n = 0;
  for (const [a, b] of edgesOf(p, pc))
    for (const [c, d] of edgesOf(q, qc)) if (segmentsCross(a, b, c, d)) n++;
  return n;
}

// ---- Angle snapping -------------------------------------------------------------------------------------------

/** Undirected direction of a line in degrees, counter-clockwise from horizontal as seen (y up), in [0, 180). */
function lineAngle(a: Pt, b: Pt): number {
  const deg = Math.atan2(-(b[1] - a[1]), b[0] - a[0]) / DEG;
  const m = ((deg % 180) + 180) % 180;
  return m >= 180 - 1e-12 ? 0 : m;
}
const angleGap = (x: number, y: number) => {
  const g = Math.abs(x - y) % 180;
  return Math.min(g, 180 - g);
};
const norm180 = (x: number) => {
  const m = ((x % 180) + 180) % 180;
  return m >= 180 - 1e-9 ? 0 : m;
};

interface LineRef {
  contour: number;
  prim: number;
  angle: number;
  length: number;
}

/** Target angle for each line, grouped: 'auto' clusters, or the nearest explicit angle within reach. */
function targetsFor(lines: LineRef[], angles: number[] | 'auto'): { angle: number; members: LineRef[] }[] {
  if (angles !== 'auto') {
    const targets = [...new Set(angles.map(norm180))];
    const groups = new Map<number, LineRef[]>();
    for (const l of lines) {
      let best: number | undefined;
      for (const t of targets)
        if (
          angleGap(l.angle, t) <= EXPLICIT_REACH &&
          (best === undefined || angleGap(l.angle, t) < angleGap(l.angle, best))
        )
          best = t;
      if (best !== undefined) groups.set(best, [...(groups.get(best) ?? []), l]);
    }
    return [...groups].map(([angle, members]) => ({ angle, members }));
  }
  const sorted = [...lines].sort((x, y) => x.angle - y.angle);
  const clusters: { vals: number[]; members: LineRef[] }[] = [];
  for (const l of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && l.angle - last.vals[0]! <= AUTO_SPREAD) {
      last.vals.push(l.angle);
      last.members.push(l);
    } else clusters.push({ vals: [l.angle], members: [l] });
  }
  // Directions wrap at 180°: 179.5° and 0.5° are one direction.
  if (clusters.length > 1) {
    const first = clusters[0]!;
    const last = clusters[clusters.length - 1]!;
    const shifted = first.vals.map((v) => v + 180);
    if (Math.max(...shifted) - Math.min(...last.vals) <= AUTO_SPREAD) {
      last.vals.push(...shifted);
      last.members.push(...first.members);
      clusters.shift();
    }
  }
  return clusters
    .filter((c) => c.members.length >= AUTO_MIN_GROUP)
    .map((c) => {
      // The mean weighs each line by its length: a long edge states its direction more precisely than a short one.
      const w = c.members.reduce((s, m) => s + m.length, 0);
      const mean = c.vals.reduce((s, v, i) => s + v * c.members[i]!.length, 0) / w;
      return { angle: norm180(mean), members: c.members };
    });
}

interface InfLine {
  p: Pt;
  d: Pt;
}

function intersect(l: InfLine, m: InfLine): Pt | undefined {
  const den = cross(l.d, m.d);
  if (Math.abs(den) < Math.sin(PARALLEL * DEG)) return undefined;
  const t = cross(sub(m.p, l.p), m.d) / den;
  return add(l.p, mul(l.d, t));
}
const project = (q: Pt, l: InfLine): Pt => add(l.p, mul(l.d, dot(sub(q, l.p), l.d)));

/** Moves a piece's ends to new points: a cubic keeps its handles, an arc keeps its centre's side and turn. */
function moveEnds(p: Prim, a: Pt, b: Pt): Prim {
  if (p.k === 'L') return { k: 'L', a, b };
  if (p.k === 'C') return { k: 'C', a, c1: add(p.c1, sub(a, p.a)), c2: add(p.c2, sub(b, p.b)), b };
  const m = mul(add(a, b), 0.5);
  const u = unit(sub(b, a));
  const n: Pt = [-u[1], u[0]];
  return { k: 'A', a, b, c: add(m, mul(n, dot(sub(p.c, m), n))), sweep: p.sweep };
}

/** The contour with the given lines turned to their target angles and every shared end point re-solved. */
function snapContour(c: Contour, target: Map<number, number>): Contour {
  const { prims, closed } = c;
  const n = prims.length;
  const lineOf = (k: number): InfLine | undefined => {
    const p = prims[k]!;
    if (p.k !== 'L') return undefined;
    const own = unit(sub(p.b, p.a));
    const t = target.get(k);
    if (t === undefined) return { p: p.a, d: own };
    let d: Pt = [Math.cos(t * DEG), -Math.sin(t * DEG)];
    if (dot(d, own) < 0) d = mul(d, -1);
    return { p: mul(add(p.a, p.b), 0.5), d };
  };
  const vertex = (prev: number | undefined, next: number | undefined, at: Pt): Pt => {
    const sp = prev !== undefined && target.has(prev);
    const sn = next !== undefined && target.has(next);
    if (!sp && !sn) return at;
    const lp = prev !== undefined ? lineOf(prev) : undefined;
    const ln = next !== undefined ? lineOf(next) : undefined;
    const x = lp && ln ? intersect(lp, ln) : undefined;
    // Two snapped lines meet where both directions hold.
    if (x && sp && sn) return x;
    const onto = sp && sn ? mul(add(project(at, lp!), project(at, ln!)), 0.5) : project(at, (sp ? lp : ln)!);
    // A snapped line next to an unsnapped one: keep the neighbour's direction too, unless that slides the corner
    // far along a shallow joint (a short neighbour would fold over); then the corner moves straight onto the line.
    if (x && dist(x, at) <= 2 * dist(onto, at) + 1e-9) return x;
    return onto;
  };
  const v: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const prev = k > 0 ? k - 1 : closed ? n - 1 : undefined;
    v.push(vertex(prev, k, prims[k]!.a));
  }
  const endV = closed ? v[0]! : vertex(n - 1, undefined, prims[n - 1]!.b);
  return {
    closed,
    prims: prims.map((p, k) => moveEnds(p, v[k]!, k + 1 < n ? v[k + 1]! : endV)),
  };
}

/** Whether a snapped contour still is the same shape: same winding, about the same area, no new crossings. */
function snapKeepsShape(before: Contour, after: Contour, target: Map<number, number>): boolean {
  const pb = polygonOf(before);
  const pa = polygonOf(after);
  if (before.closed) {
    const ab = shoelace(pb);
    const aa = shoelace(pa);
    if (Math.sign(ab) !== Math.sign(aa)) return false;
    const ratio = aa / ab;
    if (!(ratio > 0.8 && ratio < 1.25)) return false;
  }
  for (const k of target.keys()) {
    const o = before.prims[k]!;
    const s = after.prims[k]!;
    const od = sub(o.b, o.a);
    const sd = sub(s.b, s.a);
    if (dot(od, sd) <= 0 || len(sd) < 0.5 * len(od)) return false;
  }
  return selfCrossings(pa, after.closed) <= selfCrossings(pb, before.closed);
}

function snapAll(
  contours: Contour[],
  angles: number[] | 'auto',
): { contours: Contour[]; snapped: { angle: number; count: number }[] } {
  const excluded = new Set<number>();
  for (let round = 0; round <= contours.length; round++) {
    const lines: LineRef[] = [];
    contours.forEach((c, ci) => {
      if (excluded.has(ci)) return;
      c.prims.forEach((p, pi) => {
        if (p.k === 'L')
          lines.push({ contour: ci, prim: pi, angle: lineAngle(p.a, p.b), length: dist(p.a, p.b) });
      });
    });
    const groups = targetsFor(lines, angles).filter((g) =>
      g.members.some((m) => angleGap(m.angle, g.angle) > 1e-3),
    );
    const perContour = new Map<number, Map<number, number>>();
    for (const g of groups)
      for (const m of g.members) {
        const t = perContour.get(m.contour) ?? new Map<number, number>();
        t.set(m.prim, g.angle);
        perContour.set(m.contour, t);
      }
    const next = contours.map((c, ci) => {
      const t = perContour.get(ci);
      return t ? snapContour(c, t) : c;
    });
    const bad = new Set<number>();
    for (const [ci, t] of perContour) if (!snapKeepsShape(contours[ci]!, next[ci]!, t)) bad.add(ci);
    // Contours that did not cross before (a hole inside its outline) must not cross after.
    const polysB = contours.map(polygonOf);
    const polysA = next.map(polygonOf);
    for (const ci of perContour.keys())
      for (let cj = 0; cj < contours.length; cj++) {
        if (cj === ci || (perContour.has(cj) && cj < ci)) continue;
        const b = crossings(polysB[ci]!, contours[ci]!.closed, polysB[cj]!, contours[cj]!.closed);
        const a = crossings(polysA[ci]!, next[ci]!.closed, polysA[cj]!, next[cj]!.closed);
        if (a > b) {
          bad.add(ci);
          if (perContour.has(cj)) bad.add(cj);
        }
      }
    if (!bad.size) {
      const snapped = groups
        .map((g) => ({ angle: Math.round(g.angle * 100) / 100, count: g.members.length }))
        .sort((x, y) => y.count - x.count || x.angle - y.angle);
      return { contours: next, snapped };
    }
    for (const ci of bad) excluded.add(ci);
  }
  return { contours, snapped: [] };
}

// ---- Output ---------------------------------------------------------------------------------------------------

const round2 = (v: number) => Math.round(v * 100) / 100;
const fmt = (v: number, places = 2) => {
  const s = v.toFixed(places).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
};
const P = (q: Pt) => `${fmt(q[0])} ${fmt(q[1])}`;
const rnd = (q: Pt): Pt => [round2(q[0]), round2(q[1])];

function emit(contours: Contour[]): string {
  let d = '';
  for (const c of contours) {
    if (!c.prims.length) continue;
    d += `M${P(c.prims[0]!.a)}`;
    for (const p of c.prims) {
      if (p.k === 'L') d += `L${P(p.b)}`;
      else if (p.k === 'C') d += `C${P(p.c1)} ${P(p.c2)} ${P(p.b)}`;
      else {
        // Radius and flags from the rounded end points, so the drawn arc keeps the fitted centre.
        const q = moveEnds(p, rnd(p.a), rnd(p.b)) as Extract<Prim, { k: 'A' }>;
        const r = dist(q.a, q.c);
        const large = Math.abs(arcTurn(q)) > Math.PI ? 1 : 0;
        d += `A${fmt(r, 4)} ${fmt(r, 4)} 0 ${large} ${q.sweep ? 1 : 0} ${P(p.b)}`;
      }
    }
    if (c.closed) d += 'Z';
  }
  return d;
}

export function rebuildPath(d: string, opts: RebuildOptions): RebuildResult {
  if (!(opts.tolerance > 0))
    throw new MarkiloError('USAGE', 'The rebuild tolerance must be a positive number.');
  if (Array.isArray(opts.angles) && opts.angles.some((a) => !Number.isFinite(a)))
    throw new MarkiloError('USAGE', 'Snap angles must be numbers of degrees.');
  let contours = readContours(d).map((c) => rebuildContour(c, opts.tolerance, opts.arcs ?? true));
  let snapped: RebuildResult['snapped'] = [];
  if (opts.angles && (opts.angles === 'auto' || opts.angles.length)) {
    ({ contours, snapped } = snapAll(contours, opts.angles));
  }
  const segments = { lines: 0, arcs: 0, cubics: 0 };
  for (const c of contours)
    for (const p of c.prims) {
      if (p.k === 'L') segments.lines++;
      else if (p.k === 'A') segments.arcs++;
      else segments.cubics++;
    }
  return { d: emit(contours), segments, snapped };
}
