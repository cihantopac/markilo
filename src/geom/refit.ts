/**
 * Turns PathKit output into clean path data. Skia approximates round joins, caps and arcs with dozens of tiny
 * quadratic segments; a designer would draw them as one or two cubics. Runs of smooth curve segments are refitted
 * with Schneider's algorithm (Graphics Gems, 1990) within a small tolerance, collinear lines are merged and numbers
 * are rounded to two decimals.
 */

type Pt = [number, number];
type Seg =
  | { k: 'L'; p: Pt[] } // [p0, p1]
  | { k: 'Q'; p: Pt[] } // [p0, c, p1]
  | { k: 'C'; p: Pt[] }; // [p0, c1, c2, p1]

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, s: number): Pt => [a[0] * s, a[1] * s];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const len = (a: Pt) => Math.hypot(a[0], a[1]);
const dist = (a: Pt, b: Pt) => len(sub(a, b));
const unit = (a: Pt): Pt => {
  const l = len(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l] : [0, 0];
};

function at(s: Seg, t: number): Pt {
  const u = 1 - t;
  const p = s.p;
  if (s.k === 'L') return add(mul(p[0]!, u), mul(p[1]!, t));
  if (s.k === 'Q') return add(add(mul(p[0]!, u * u), mul(p[1]!, 2 * u * t)), mul(p[2]!, t * t));
  return add(
    add(mul(p[0]!, u * u * u), mul(p[1]!, 3 * u * u * t)),
    add(mul(p[2]!, 3 * u * t * t), mul(p[3]!, t * t * t)),
  );
}

/** Direction leaving the segment's start, and direction pointing back into it from its end. */
function startTangent(s: Seg): Pt {
  for (let i = 1; i < s.p.length; i++) {
    const d = sub(s.p[i]!, s.p[0]!);
    if (len(d) > 1e-6) return unit(d);
  }
  return [0, 0];
}
function endTangent(s: Seg): Pt {
  const last = s.p[s.p.length - 1]!;
  for (let i = s.p.length - 2; i >= 0; i--) {
    const d = sub(s.p[i]!, last);
    if (len(d) > 1e-6) return unit(d);
  }
  return [0, 0];
}

// ---- Schneider curve fitting -------------------------------------------------------------------------------

type Bez = [Pt, Pt, Pt, Pt];

function bezAt(b: Bez, t: number): Pt {
  return at({ k: 'C', p: b }, t);
}

function chordParams(pts: Pt[]): number[] {
  const u = [0];
  for (let i = 1; i < pts.length; i++) u.push(u[i - 1]! + dist(pts[i]!, pts[i - 1]!));
  const total = u[u.length - 1]! || 1;
  return u.map((x) => x / total);
}

function generateBezier(pts: Pt[], u: number[], t1: Pt, t2: Pt): Bez {
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const C = [
    [0, 0],
    [0, 0],
  ];
  const X = [0, 0];
  for (let i = 0; i < pts.length; i++) {
    const t = u[i]!;
    const b0 = (1 - t) ** 3;
    const b1 = 3 * t * (1 - t) ** 2;
    const b2 = 3 * t * t * (1 - t);
    const b3 = t ** 3;
    const a1 = mul(t1, b1);
    const a2 = mul(t2, b2);
    C[0]![0]! += dot(a1, a1);
    C[0]![1]! += dot(a1, a2);
    C[1]![0]! += dot(a1, a2);
    C[1]![1]! += dot(a2, a2);
    const tmp = sub(pts[i]!, add(add(mul(first, b0), mul(first, b1)), add(mul(last, b2), mul(last, b3))));
    X[0]! += dot(a1, tmp);
    X[1]! += dot(a2, tmp);
  }
  const det = C[0]![0]! * C[1]![1]! - C[1]![0]! * C[0]![1]!;
  let alpha1 = det ? (X[0]! * C[1]![1]! - X[1]! * C[0]![1]!) / det : 0;
  let alpha2 = det ? (C[0]![0]! * X[1]! - C[1]![0]! * X[0]!) / det : 0;
  const seg = dist(first, last);
  const eps = 1e-6 * seg;
  if (alpha1 < eps || alpha2 < eps) alpha1 = alpha2 = seg / 3;
  return [first, add(first, mul(t1, alpha1)), add(last, mul(t2, alpha2)), last];
}

function maxError(pts: Pt[], b: Bez, u: number[]): { err: number; split: number } {
  let err = 0;
  let split = Math.floor(pts.length / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const d = dist(bezAt(b, u[i]!), pts[i]!);
    if (d > err) {
      err = d;
      split = i;
    }
  }
  return { err, split };
}

function reparameterize(b: Bez, pts: Pt[], u: number[]): number[] {
  return u.map((t, i) => {
    // One Newton-Raphson step towards the closest point on the curve.
    const p = pts[i]!;
    const q = bezAt(b, t);
    const d1: Pt = add(
      add(mul(sub(b[1], b[0]), 3 * (1 - t) ** 2), mul(sub(b[2], b[1]), 6 * (1 - t) * t)),
      mul(sub(b[3], b[2]), 3 * t * t),
    );
    const d2: Pt = add(
      mul(add(sub(b[2], mul(b[1], 2)), b[0]), 6 * (1 - t)),
      mul(add(sub(b[3], mul(b[2], 2)), b[1]), 6 * t),
    );
    const num = dot(sub(q, p), d1);
    const den = dot(d1, d1) + dot(sub(q, p), d2);
    const n = den ? t - num / den : t;
    return Math.min(1, Math.max(0, n));
  });
}

function fitCubic(pts: Pt[], t1: Pt, t2: Pt, tol: number, out: Bez[], depth = 0): void {
  if (pts.length === 2) {
    const d = dist(pts[0]!, pts[1]!) / 3;
    out.push([pts[0]!, add(pts[0]!, mul(t1, d)), add(pts[1]!, mul(t2, d)), pts[1]!]);
    return;
  }
  let u = chordParams(pts);
  let b = generateBezier(pts, u, t1, t2);
  let { err, split } = maxError(pts, b, u);
  if (err <= tol) {
    out.push(b);
    return;
  }
  if (err <= tol * 4) {
    for (let i = 0; i < 6; i++) {
      u = reparameterize(b, pts, u);
      b = generateBezier(pts, u, t1, t2);
      ({ err, split } = maxError(pts, b, u));
      if (err <= tol) {
        out.push(b);
        return;
      }
    }
  }
  if (depth > 12) {
    out.push(b);
    return;
  }
  split = Math.min(pts.length - 2, Math.max(1, split));
  const center = unit(sub(pts[split - 1]!, pts[split + 1]!));
  fitCubic(pts.slice(0, split + 1), t1, center, tol, out, depth + 1);
  fitCubic(pts.slice(split), mul(center, -1), t2, tol, out, depth + 1);
}

// ---- Path assembly ------------------------------------------------------------------------------------------

const num = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};
const pt = (p: Pt) => `${num(p[0])} ${num(p[1])}`;

/** Angle in degrees between the end direction of `a` and the start direction of `b`. */
function kink(a: Seg, b: Seg): number {
  const ta = mul(endTangent(a), -1);
  const tb = startTangent(b);
  return (Math.acos(Math.max(-1, Math.min(1, dot(ta, tb)))) * 180) / Math.PI;
}

function emitContour(segs: Seg[], tol: number): string {
  let out = '';
  let i = 0;
  while (i < segs.length) {
    const s = segs[i]!;
    if (s.k === 'L') {
      // Merge collinear runs of lines.
      let end = s.p[1]!;
      let j = i + 1;
      const dir = unit(sub(end, s.p[0]!));
      while (j < segs.length && segs[j]!.k === 'L') {
        const nd = unit(sub(segs[j]!.p[1]!, segs[j]!.p[0]!));
        if (Math.abs(dir[0] * nd[1] - dir[1] * nd[0]) > 1e-3 || dot(dir, nd) < 0) break;
        end = segs[j]!.p[1]!;
        j++;
      }
      out += `L${pt(end)}`;
      i = j;
      continue;
    }
    // A run of smooth curve segments.
    let j = i + 1;
    while (j < segs.length && segs[j]!.k !== 'L' && kink(segs[j - 1]!, segs[j]!) < 10) j++;
    const run = segs.slice(i, j);
    if (run.every((r) => r.k === 'C')) {
      for (const r of run) out += `C${pt(r.p[1]!)} ${pt(r.p[2]!)} ${pt(r.p[3]!)}`;
    } else if (run.length === 1 && run[0]!.k === 'Q') {
      const q = run[0]!.p;
      out += `Q${pt(q[1]!)} ${pt(q[2]!)}`;
    } else {
      const pts: Pt[] = [run[0]!.p[0]!];
      for (const r of run) for (let k = 1; k <= 6; k++) pts.push(at(r, k / 6));
      const fitted: Bez[] = [];
      fitCubic(pts, startTangent(run[0]!), endTangent(run[run.length - 1]!), tol, fitted);
      for (const b of fitted) out += `C${pt(b[1])} ${pt(b[2])} ${pt(b[3])}`;
    }
    i = j;
  }
  return out;
}

export function refitPath(
  cmds: number[][],
  v: { move: number; line: number; quad: number; conic: number; cubic: number; close: number },
): string {
  // Tolerance scales with the drawing: ~0.05 % of its diagonal (half a pixel on a 1024 artboard).
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const c of cmds)
    for (let i = 1; i + 1 < c.length; i += 2) {
      minX = Math.min(minX, c[i]!);
      maxX = Math.max(maxX, c[i]!);
      minY = Math.min(minY, c[i + 1]!);
      maxY = Math.max(maxY, c[i + 1]!);
    }
  const tol = Number.isFinite(minX) ? Math.max(0.05, Math.hypot(maxX - minX, maxY - minY) * 0.0005) : 0.1;

  let out = '';
  let segs: Seg[] = [];
  let start: Pt = [0, 0];
  let cur: Pt = [0, 0];
  const flush = (close: boolean) => {
    if (segs.length) {
      out += `M${pt(start)}${emitContour(segs, tol)}${close ? 'Z' : ''}`;
    }
    segs = [];
  };
  for (const c of cmds) {
    const verb = c[0];
    if (verb === v.move) {
      flush(false);
      start = cur = [c[1]!, c[2]!];
    } else if (verb === v.line) {
      const p: Pt = [c[1]!, c[2]!];
      if (dist(p, cur) > 1e-6) segs.push({ k: 'L', p: [cur, p] });
      cur = p;
    } else if (verb === v.quad || verb === v.conic) {
      // Conics only appear for arcs; at the sizes Skia emits them a quadratic is within tolerance.
      const p: Pt = [c[3]!, c[4]!];
      segs.push({ k: 'Q', p: [cur, [c[1]!, c[2]!], p] });
      cur = p;
    } else if (verb === v.cubic) {
      const p: Pt = [c[5]!, c[6]!];
      segs.push({ k: 'C', p: [cur, [c[1]!, c[2]!], [c[3]!, c[4]!], p] });
      cur = p;
    } else if (verb === v.close) {
      if (dist(cur, start) > 1e-6) segs.push({ k: 'L', p: [cur, start] });
      flush(true);
      cur = start;
    }
  }
  flush(false);
  return out;
}
