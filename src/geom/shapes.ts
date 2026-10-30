/**
 * Primitive outlines as SVG path data built from lines and cubic Béziers only (no arcs), so every later boolean
 * keeps exact curves. Angles are in degrees, 0° at 12 o'clock, increasing clockwise — the way designers read a dial.
 */

export type P = [number, number];

const f = (n: number): string => String(Math.round(n * 1000) / 1000);
const xy = (p: P) => `${f(p[0])} ${f(p[1])}`;
const rad = (deg: number) => (deg * Math.PI) / 180;

export const polar = (cx: number, cy: number, r: number, deg: number): P => [
  cx + r * Math.sin(rad(deg)),
  cy - r * Math.cos(rad(deg)),
];

/** Cubic segments for an arc from `a0` to `a1` (degrees, either direction), without the initial move. */
function arcCurves(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): string {
  const span = a1 - a0;
  const n = Math.max(1, Math.ceil(Math.abs(span) / 90 - 1e-9));
  const step = span / n;
  const k = (4 / 3) * Math.tan(rad(step) / 4);
  let out = '';
  for (let i = 0; i < n; i++) {
    const s = rad(a0 + i * step);
    const e = rad(a0 + (i + 1) * step);
    const p0: P = [cx + rx * Math.sin(s), cy - ry * Math.cos(s)];
    const p3: P = [cx + rx * Math.sin(e), cy - ry * Math.cos(e)];
    // Tangent of (sin t, -cos t) is (cos t, sin t).
    const c1: P = [p0[0] + k * rx * Math.cos(s), p0[1] + k * ry * Math.sin(s)];
    const c2: P = [p3[0] - k * rx * Math.cos(e), p3[1] - k * ry * Math.sin(e)];
    out += `C${xy(c1)} ${xy(c2)} ${xy(p3)}`;
  }
  return out;
}

export const ellipseD = (cx: number, cy: number, rx: number, ry: number): string =>
  `M${xy([cx, cy - ry])}${arcCurves(cx, cy, rx, ry, 0, 360)}Z`;

export const circleD = (cx: number, cy: number, r: number): string => ellipseD(cx, cy, r, r);

/** Open arc centre-line (for stroking). */
export const arcD = (cx: number, cy: number, r: number, from: number, to: number): string =>
  `M${xy(polar(cx, cy, r, from))}${arcCurves(cx, cy, r, r, from, to)}`;

/** Pie slice, or an annular sector when `inner` > 0. */
export function sectorD(cx: number, cy: number, r: number, from: number, to: number, inner = 0): string {
  if (Math.abs(to - from) >= 360) return inner > 0 ? ringD(cx, cy, r, r - inner) : circleD(cx, cy, r);
  let d = `M${xy(polar(cx, cy, r, from))}${arcCurves(cx, cy, r, r, from, to)}`;
  d +=
    inner > 0
      ? `L${xy(polar(cx, cy, inner, to))}${arcCurves(cx, cy, inner, inner, to, from)}`
      : `L${xy([cx, cy])}`;
  return `${d}Z`;
}

/** A ring: outer circle with a counter-wound inner circle, so it fills correctly under nonzero. */
export const ringD = (cx: number, cy: number, r: number, width: number): string => {
  const ri = Math.max(0, r - width);
  return `${circleD(cx, cy, r)}M${xy([cx, cy - ri])}${arcCurves(cx, cy, ri, ri, 360, 0)}Z`;
};

/** Rectangle with optional corner radii: one number or [top-left, top-right, bottom-right, bottom-left]. */
export function rectD(x: number, y: number, w: number, h: number, r: number | number[] = 0): string {
  const max = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = (Array.isArray(r) ? [r[0], r[1], r[2], r[3]] : [r, r, r, r]).map((v) =>
    Math.max(0, Math.min(max, v ?? 0)),
  ) as [number, number, number, number];
  let d = `M${xy([x + tl, y])}L${xy([x + w - tr, y])}`;
  if (tr) d += arcCurves(x + w - tr, y + tr, tr, tr, 0, 90);
  d += `L${xy([x + w, y + h - br])}`;
  if (br) d += arcCurves(x + w - br, y + h - br, br, br, 90, 180);
  d += `L${xy([x + bl, y + h])}`;
  if (bl) d += arcCurves(x + bl, y + h - bl, bl, bl, 180, 270);
  d += `L${xy([x, y + tl])}`;
  if (tl) d += arcCurves(x + tl, y + tl, tl, tl, 270, 360);
  return `${d}Z`;
}

/**
 * Superellipse ("squircle") of exponent n (2 = ellipse, 4–5 = app-icon squircle), one cubic per quadrant with the
 * handle length that passes through the true curve at 45°.
 */
export function superellipseD(cx: number, cy: number, w: number, h: number, n = 4): string {
  const k = Math.min(1, Math.max(0, (8 * 2 ** (-1 / n) - 4) / 3));
  const rx = w / 2;
  const ry = h / 2;
  const a = k * rx;
  const b = k * ry;
  return (
    `M${xy([cx, cy - ry])}` +
    `C${xy([cx + a, cy - ry])} ${xy([cx + rx, cy - b])} ${xy([cx + rx, cy])}` +
    `C${xy([cx + rx, cy + b])} ${xy([cx + a, cy + ry])} ${xy([cx, cy + ry])}` +
    `C${xy([cx - a, cy + ry])} ${xy([cx - rx, cy + b])} ${xy([cx - rx, cy])}` +
    `C${xy([cx - rx, cy - b])} ${xy([cx - a, cy - ry])} ${xy([cx, cy - ry])}Z`
  );
}

export const polygonD = (points: P[]): string => `M${points.map(xy).join('L')}Z`;

export const polylineD = (points: P[], closed = false): string =>
  `M${points.map(xy).join('L')}${closed ? 'Z' : ''}`;

export const regularD = (cx: number, cy: number, r: number, sides: number, rotate = 0): string =>
  polygonD(Array.from({ length: sides }, (_, i) => polar(cx, cy, r, rotate + (360 / sides) * i)));

export const starD = (cx: number, cy: number, r: number, inner: number, points: number, rotate = 0): string =>
  polygonD(
    Array.from({ length: points * 2 }, (_, i) =>
      polar(cx, cy, i % 2 ? inner : r, rotate + (180 / points) * i),
    ),
  );

/** Smooth curve through the points (centripetal Catmull-Rom converted to cubics). */
export function smoothD(points: P[], closed = false, tension = 1): string {
  if (points.length < 3) return polylineD(points, closed);
  const pts = closed
    ? [points[points.length - 1]!, ...points, points[0]!, points[1]!]
    : [points[0]!, ...points, points[points.length - 1]!];
  let d = `M${xy(pts[1]!)}`;
  const t = tension / 6;
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2]!;
    const c1: P = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2: P = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += `C${xy(c1)} ${xy(c2)} ${xy(p2)}`;
  }
  return closed ? `${d}Z` : d;
}
