import { hexToRgb, type Lab, normalizeColor, rgbToHex, rgbToLab } from '../analyze/color.js';
import { MarkiloError } from '../core/errors.js';
import type { Raster } from '../render/image.js';

export interface TraceOptions {
  /** More than 1: split the ink into this many colours (k-means in Lab), one face each. */
  colors?: number;
  /** Ink cut-off, 0–255: alpha for a transparent image, distance from the background colour for an opaque one. */
  threshold?: number;
  /** Contours enclosing less than this many source pixels are dropped (default 0.05 % of the image). */
  turdSize?: number;
  /** Largest distance, in source pixels, a fitted curve may stray from the traced contour (default 0.25). */
  tolerance?: number;
  /** The ground colour of an opaque image, when the guess from its border is wrong (ignored on a transparent one). */
  background?: string;
}

export interface TraceFace {
  color: string;
  /** Painted area in source pixels. */
  area: number;
}

export interface TraceResult {
  svg: string;
  faces: TraceFace[];
  /** Curve and line segments in the drawing, all faces together. */
  nodes: number;
  /** Doubts about the result, chiefly that ground and ink may have been read the wrong way round. */
  warnings: string[];
}

export const MAX_TRACE_COLORS = 8;
/** Larger images are averaged down to this side first: finer detail than this is not part of a mark's form. */
const WORK_SIDE = 1600;
/** Contours are traced on a grid this many times finer than the working image. */
const SUPERSAMPLE = 2;
/** The fit never asks for more precision than this, in working pixels (anti-aliasing noise is about this size). */
const MIN_WORK_TOLERANCE = 0.25;
/** Turning angle, over CORNER_SPAN working pixels either side, above which a contour point is a corner. */
const CORNER_ANGLE = (40 * Math.PI) / 180;
const CORNER_SPAN = 3;
/** [1 2 1] smoothing passes over a contour's points between corners (takes out the pixel grid's ripple). */
const SMOOTHING_PASSES = 8;

type Pt = [number, number];

interface InkField {
  w: number;
  h: number;
  /** Ink coverage per working pixel, 0–1; the contour runs where it crosses ISO. */
  f: Float32Array;
  /** The pixel's ink colour with the background mixed out, as RGB triples. */
  rgb: Float32Array;
  /** Pixels well inside the ink (not on an anti-aliased edge): what colours are measured on. */
  core: Uint8Array;
  /** Source pixels per working pixel. */
  scale: number;
  srcW: number;
  srcH: number;
  warnings: string[];
}

const ISO = 0.5;

/** For each output cell along one axis, the source pixels it covers and how much of each (fractional at the ends). */
function coverage(src: number, out: number): { from: number; weights: number[] }[] {
  const step = src / out;
  const cells: { from: number; weights: number[] }[] = [];
  for (let o = 0; o < out; o++) {
    const a = o * step;
    const b = (o + 1) * step;
    const from = Math.floor(a);
    const weights: number[] = [];
    for (let s = from; s < Math.min(src, Math.ceil(b)); s++)
      weights.push(Math.min(b, s + 1) - Math.max(a, s));
    cells.push({ from, weights });
  }
  return cells;
}

/**
 * Averages a straight-alpha raster down to w×h with an exact area-weighted box filter (premultiplied, so transparent
 * pixels do not darken the edges). Whole-pixel boxes at a non-integer ratio would shift edges by up to a pixel in a
 * repeating pattern, and the fit would follow that ripple.
 */
function downsample(img: Raster, w: number, h: number): Raster {
  const out = new Uint8Array(w * h * 4);
  const xs = coverage(img.width, w);
  const ys = coverage(img.height, h);
  for (let y = 0; y < h; y++) {
    const cy = ys[y]!;
    for (let x = 0; x < w; x++) {
      const cx = xs[x]!;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let jy = 0; jy < cy.weights.length; jy++) {
        const row = (cy.from + jy) * img.width;
        for (let jx = 0; jx < cx.weights.length; jx++) {
          const wt = cy.weights[jy]! * cx.weights[jx]!;
          const i = (row + cx.from + jx) * 4;
          const al = img.data[i + 3]! * wt;
          r += img.data[i]! * al;
          g += img.data[i + 1]! * al;
          b += img.data[i + 2]! * al;
          a += al;
          n += wt;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round(a / n);
    }
  }
  return { width: w, height: h, data: out };
}

function otsu(hist: Float64Array): number {
  let total = 0;
  let sum = 0;
  for (let i = 0; i < hist.length; i++) {
    total += hist[i]!;
    sum += i * hist[i]!;
  }
  let wB = 0;
  let sumB = 0;
  let best = 0;
  let at = 128;
  for (let t = 0; t < hist.length; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      at = t + 0.5;
    }
  }
  return at;
}

const rgbDist = (data: Uint8Array, i: number, c: number[]) =>
  Math.sqrt(((data[i]! - c[0]!) ** 2 + (data[i + 1]! - c[1]!) ** 2 + (data[i + 2]! - c[2]!) ** 2) / 3);
/** Border pixels this close (RGB distance, 0–255 scale) to a candidate ground count as that ground. */
const GROUND_NEAR = 32;

/**
 * The ground of an opaque image. The border's commonest colour is one candidate; when another colour also holds a
 * good share of the border (a tight-cropped badge, a mark running off the edges), the corners decide, and on a tie the
 * lighter one is taken as the paper. Both cases, and ink covering most of the image, are reported as possible
 * inversions: the guess can be wrong, and the trace's own IoU cannot tell.
 */
function chooseGround(data: Uint8Array, w: number, h: number): { bg: number[]; doubt?: string } {
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x * 4, ((h - 1) * w + x) * 4);
  for (let y = 1; y < h - 1; y++) border.push(y * w * 4, (y * w + w - 1) * 4);
  const modeOf = (idx: number[]): number[] | undefined => {
    const bins = new Map<number, number[]>();
    for (const i of idx) {
      const key = ((data[i]! >> 4) << 8) | ((data[i + 1]! >> 4) << 4) | (data[i + 2]! >> 4);
      const b = bins.get(key) ?? [0, 0, 0, 0];
      b[0]! += data[i]!;
      b[1]! += data[i + 1]!;
      b[2]! += data[i + 2]!;
      b[3]! += 1;
      bins.set(key, b);
    }
    let best: number[] | undefined;
    for (const b of bins.values()) if (!best || b[3]! > best[3]!) best = b;
    return best && [best[0]! / best[3]!, best[1]! / best[3]!, best[2]! / best[3]!];
  };
  const first = modeOf(border)!;
  const rest = border.filter((i) => rgbDist(data, i, first) > GROUND_NEAR);
  const second = rest.length ? modeOf(rest) : undefined;
  const share = (c: number[]) =>
    border.filter((i) => rgbDist(data, i, c) <= GROUND_NEAR).length / border.length;
  const hex = (c: number[]) => rgbToHex({ r: Math.round(c[0]!), g: Math.round(c[1]!), b: Math.round(c[2]!) });
  if (!second || share(second) < 0.1) return { bg: first };
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, (h * w - 1) * 4];
  const votes = (c: number[], o: number[]) =>
    corners.filter((i) => rgbDist(data, i, c) <= GROUND_NEAR && rgbDist(data, i, c) < rgbDist(data, i, o))
      .length;
  const v1 = votes(first, second);
  const v2 = votes(second, first);
  const lum = (c: number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  const bg = v1 > v2 ? first : v2 > v1 ? second : lum(second) > lum(first) ? second : first;
  const other = bg === first ? second : first;
  return {
    bg,
    doubt: `The ground was read as ${hex(bg)}, but ${hex(other)} also runs along the border (${v1 === v2 ? 'the corners do not settle it' : 'the corners decided'}): if the trace looks inverted, trace again with --background '${hex(other)}'.`,
  };
}

/**
 * Where the ink is. A transparent image is read from its alpha; an opaque one by each pixel's distance from the
 * background colour (read from the border: chooseGround), cut at --threshold or, by default, where Otsu splits the histogram.
 */
function inkField(src: Raster, threshold: number | undefined, background?: string): InkField {
  if (!(src.width > 0 && src.height > 0)) throw new MarkiloError('INVALID_INPUT', 'The image is empty.');
  const scale = Math.max(1, Math.max(src.width, src.height) / WORK_SIDE);
  const img =
    scale > 1
      ? downsample(
          src,
          Math.max(1, Math.round(src.width / scale)),
          Math.max(1, Math.round(src.height / scale)),
        )
      : src;
  const { width: w, height: h, data } = img;
  const n = w * h;
  const f = new Float32Array(n);
  const rgb = new Float32Array(n * 3);
  const core = new Uint8Array(n);
  const warnings: string[] = [];
  let transparent = 0;
  for (let i = 0; i < n; i++) if (data[i * 4 + 3]! < 250) transparent++;
  if (transparent > n * 0.02) {
    const cut = (threshold ?? 128) / 255;
    for (let i = 0; i < n; i++) {
      const a = data[i * 4 + 3]! / 255;
      // Linear in alpha, crossing ISO exactly at the threshold.
      f[i] =
        a <= cut ? (ISO * a) / Math.max(cut, 1e-6) : ISO + ((1 - ISO) * (a - cut)) / Math.max(1 - cut, 1e-6);
      rgb[i * 3] = data[i * 4]!;
      rgb[i * 3 + 1] = data[i * 4 + 1]!;
      rgb[i * 3 + 2] = data[i * 4 + 2]!;
      core[i] = data[i * 4 + 3]! >= 252 ? 1 : 0;
    }
  } else {
    let bg: number[];
    if (background !== undefined) {
      const hex = normalizeColor(background);
      if (!hex)
        throw new MarkiloError('USAGE', `--background must be a colour like #ffffff (got "${background}").`);
      const c = hexToRgb(hex);
      bg = [c.r, c.g, c.b];
    } else {
      const g = chooseGround(data, w, h);
      bg = g.bg;
      if (g.doubt) warnings.push(g.doubt);
    }
    const d = new Float32Array(n);
    const hist = new Float64Array(256);
    for (let i = 0; i < n; i++) {
      const dr = data[i * 4]! - bg[0]!;
      const dg = data[i * 4 + 1]! - bg[1]!;
      const db = data[i * 4 + 2]! - bg[2]!;
      d[i] = Math.sqrt((dr * dr + dg * dg + db * db) / 3);
      const hb = Math.min(255, Math.round(d[i]!));
      hist[hb] = hist[hb]! + 1;
    }
    const cut = Math.max(8, threshold ?? otsu(hist));
    if (background === undefined && !warnings.length) {
      let ink = 0;
      for (let i = 0; i < n; i++) if (d[i]! > cut) ink++;
      if (ink > n * 0.6)
        warnings.push(
          `The ink covers ${Math.round((100 * ink) / n)} % of the image: ground and ink may be inverted — if so, trace again with --background '<the ground colour>'.`,
        );
    }
    // Local ink strength (3×3 max) to mix the background back out of anti-aliased edge pixels.
    // A pixel is core ink when its whole 3×3 neighbourhood is past the cut.
    const local = new Float32Array(n);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let m = 0;
        let lo = Number.POSITIVE_INFINITY;
        for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++)
          for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) {
            m = Math.max(m, d[yy * w + xx]!);
            lo = Math.min(lo, d[yy * w + xx]!);
          }
        local[y * w + x] = m;
        core[y * w + x] = lo > cut ? 1 : 0;
      }
    for (let i = 0; i < n; i++) {
      f[i] = Math.min(1, (ISO * d[i]!) / cut);
      const a = local[i]! > cut ? Math.min(1, d[i]! / local[i]!) : 1;
      for (let k = 0; k < 3; k++) {
        const v = bg[k]! + (data[i * 4 + k]! - bg[k]!) / Math.max(a, 0.05);
        rgb[i * 3 + k] = Math.max(0, Math.min(255, v));
      }
    }
  }
  return { w, h, f, rgb, core, scale, srcW: src.width, srcH: src.height, warnings };
}

const labOf = (r: number, g: number, b: number): Lab => rgbToLab({ r, g, b });
const labDist2 = (a: Lab, b: Lab) => (a.L - b.L) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2;

/**
 * k-means in Lab over the opaque pixels, run on a 5-bit-per-channel histogram so it is fast and deterministic.
 * Returns each pixel's two nearest colours and how far it sits from the first towards the second (anti-aliased
 * pixels between two faces fall in between, which puts the shared edge where the colours actually meet).
 */
function splitColors(
  field: InkField,
  k: number,
): { first: Uint8Array; second: Uint8Array; t: Float32Array; centers: number } {
  const { f, rgb, core } = field;
  const n = f.length;
  const count = new Float64Array(32768);
  const sums = new Float64Array(32768 * 3);
  let total = 0;
  const binOf = (i: number) =>
    ((Math.min(255, rgb[i * 3]!) >> 3) << 10) |
    ((Math.min(255, rgb[i * 3 + 1]!) >> 3) << 5) |
    (Math.min(255, rgb[i * 3 + 2]!) >> 3);
  for (let i = 0; i < n; i++) {
    if (!core[i]) continue;
    const bin = binOf(i);
    count[bin] = count[bin]! + 1;
    sums[bin * 3] = sums[bin * 3]! + rgb[i * 3]!;
    sums[bin * 3 + 1] = sums[bin * 3 + 1]! + rgb[i * 3 + 1]!;
    sums[bin * 3 + 2] = sums[bin * 3 + 2]! + rgb[i * 3 + 2]!;
    total++;
  }
  const bins: { lab: Lab; weight: number }[] = [];
  for (let b = 0; b < 32768; b++) {
    if (count[b]! < Math.max(1, total * 0.001)) continue;
    const c = count[b]!;
    bins.push({ lab: labOf(sums[b * 3]! / c, sums[b * 3 + 1]! / c, sums[b * 3 + 2]! / c), weight: c });
  }
  if (bins.length === 0)
    return { first: new Uint8Array(n), second: new Uint8Array(n), t: new Float32Array(n), centers: 1 };
  k = Math.min(k, bins.length);
  bins.sort((a, b) => b.weight - a.weight);
  const centers: Lab[] = [bins[0]!.lab];
  while (centers.length < k) {
    let best = bins[0]!;
    let bestScore = -1;
    for (const b of bins) {
      const s = Math.min(...centers.map((c) => labDist2(c, b.lab))) * b.weight;
      if (s > bestScore) {
        bestScore = s;
        best = b;
      }
    }
    centers.push({ ...best.lab });
  }
  const nearest = (lab: Lab) => {
    let at = 0;
    for (let j = 1; j < centers.length; j++)
      if (labDist2(lab, centers[j]!) < labDist2(lab, centers[at]!)) at = j;
    return at;
  };
  for (let iter = 0; iter < 30; iter++) {
    const acc = centers.map(() => ({ L: 0, a: 0, b: 0, w: 0 }));
    for (const b of bins) {
      const s = acc[nearest(b.lab)]!;
      s.L += b.lab.L * b.weight;
      s.a += b.lab.a * b.weight;
      s.b += b.lab.b * b.weight;
      s.w += b.weight;
    }
    let moved = 0;
    acc.forEach((s, j) => {
      if (s.w === 0) return;
      const next = { L: s.L / s.w, a: s.a / s.w, b: s.b / s.w };
      moved = Math.max(moved, labDist2(next, centers[j]!));
      centers[j] = next;
    });
    if (moved < 1e-6) break;
  }
  // Each centre's RGB: the mean of the core pixels it owns.
  const binCenter = new Int16Array(32768).fill(-1);
  const centerOfBin = (bin: number) => {
    if (binCenter[bin]! < 0)
      binCenter[bin] = nearest(
        labOf(((bin >> 10) << 3) + 4, (((bin >> 5) & 31) << 3) + 4, ((bin & 31) << 3) + 4),
      );
    return binCenter[bin]!;
  };
  const crgb = new Float64Array(k * 3);
  const cw = new Float64Array(k);
  for (let b = 0; b < 32768; b++) {
    if (!count[b]) continue;
    const j = centerOfBin(b);
    crgb[j * 3] = crgb[j * 3]! + sums[b * 3]!;
    crgb[j * 3 + 1] = crgb[j * 3 + 1]! + sums[b * 3 + 1]!;
    crgb[j * 3 + 2] = crgb[j * 3 + 2]! + sums[b * 3 + 2]!;
    cw[j] = cw[j]! + count[b]!;
  }
  for (let j = 0; j < k; j++)
    for (let c = 0; c < 3; c++) crgb[j * 3 + c] = crgb[j * 3 + c]! / Math.max(cw[j]!, 1);
  const first = new Uint8Array(n);
  const second = new Uint8Array(n);
  const t = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (f[i]! <= 0) continue;
    const a = centerOfBin(binOf(i));
    let b = a;
    let bd = Number.POSITIVE_INFINITY;
    for (let j = 0; j < k; j++) {
      if (j === a) continue;
      const dd =
        (rgb[i * 3]! - crgb[j * 3]!) ** 2 +
        (rgb[i * 3 + 1]! - crgb[j * 3 + 1]!) ** 2 +
        (rgb[i * 3 + 2]! - crgb[j * 3 + 2]!) ** 2;
      if (dd < bd) {
        bd = dd;
        b = j;
      }
    }
    first[i] = a;
    second[i] = b;
    if (b !== a) {
      let dot = 0;
      let len = 0;
      for (let c = 0; c < 3; c++) {
        const ab = crgb[b * 3 + c]! - crgb[a * 3 + c]!;
        dot += (rgb[i * 3 + c]! - crgb[a * 3 + c]!) * ab;
        len += ab * ab;
      }
      t[i] = len > 0 ? Math.max(0, Math.min(1, dot / len)) : 0;
    }
  }
  return { first, second, t, centers: k };
}

/**
 * Closed iso-contours of a coverage field, traced by marching squares on a SUPERSAMPLE× bilinear grid, in working
 * pixel coordinates. Every contour keeps the ink on the same side, so holes wind the other way.
 */
function contours(field: Float32Array, w: number, h: number): Pt[][] {
  const S = SUPERSAMPLE;
  const GW = w * S + 2;
  const GH = h * S + 2;
  const U = new Float32Array(GW * GH);
  for (let j = 1; j < GH - 1; j++) {
    const py = Math.max(0, Math.min(h - 1, (j - 1 + 0.5) / S - 0.5));
    const y0 = Math.floor(py);
    const y1 = Math.min(h - 1, y0 + 1);
    const fy = py - y0;
    for (let i = 1; i < GW - 1; i++) {
      const px = Math.max(0, Math.min(w - 1, (i - 1 + 0.5) / S - 0.5));
      const x0 = Math.floor(px);
      const x1 = Math.min(w - 1, x0 + 1);
      const fx = px - x0;
      const top = field[y0 * w + x0]! * (1 - fx) + field[y0 * w + x1]! * fx;
      const bot = field[y1 * w + x0]! * (1 - fx) + field[y1 * w + x1]! * fx;
      U[j * GW + i] = top * (1 - fy) + bot * fy;
    }
  }
  // Edge keys: horizontal edge from grid point (i, j) to (i+1, j) is 2·(j·GW+i); vertical (i, j)→(i, j+1) is that + 1.
  const H = (i: number, j: number) => (j * GW + i) * 2;
  const V = (i: number, j: number) => (j * GW + i) * 2 + 1;
  const next = new Map<number, number>();
  const crossings: { key: number; into: boolean }[] = [];
  for (let j = 0; j < GH - 1; j++)
    for (let i = 0; i < GW - 1; i++) {
      const a = U[j * GW + i]! >= ISO;
      const b = U[j * GW + i + 1]! >= ISO;
      const c = U[(j + 1) * GW + i + 1]! >= ISO;
      const d = U[(j + 1) * GW + i]! >= ISO;
      if (a === b && b === c && c === d) continue;
      // Clockwise round the cell (y down): top a→b, right b→c, bottom c→d, left d→a.
      crossings.length = 0;
      if (a !== b) crossings.push({ key: H(i, j), into: b });
      if (b !== c) crossings.push({ key: V(i + 1, j), into: c });
      if (c !== d) crossings.push({ key: H(i, j + 1), into: d });
      if (d !== a) crossings.push({ key: V(i, j), into: a });
      if (crossings.length === 2) {
        const [p, q] = crossings[0]!.into ? [crossings[0]!, crossings[1]!] : [crossings[1]!, crossings[0]!];
        next.set(p.key, q.key);
      } else {
        const centre =
          (U[j * GW + i]! + U[j * GW + i + 1]! + U[(j + 1) * GW + i + 1]! + U[(j + 1) * GW + i]!) / 4 >= ISO;
        for (let m = 0; m < 4; m++)
          if (crossings[m]!.into) next.set(crossings[m]!.key, crossings[(m + (centre ? 3 : 1)) % 4]!.key);
      }
    }
  const point = (key: number): Pt => {
    const e = key >> 1;
    const i = e % GW;
    const j = (e - i) / GW;
    const u0 = U[j * GW + i]!;
    const u1 = key & 1 ? U[(j + 1) * GW + i]! : U[j * GW + i + 1]!;
    const t = u1 === u0 ? 0.5 : (ISO - u0) / (u1 - u0);
    const gx = key & 1 ? i : i + t;
    const gy = key & 1 ? j + t : j;
    // Grid point g sits at working-pixel coordinate (g − 1 + 0.5) / S.
    return [(gx - 0.5) / S, (gy - 0.5) / S];
  };
  const out: Pt[][] = [];
  for (const start of next.keys()) {
    if (!next.has(start)) continue;
    const loop: Pt[] = [];
    let k: number | undefined = start;
    while (k !== undefined && next.has(k)) {
      const nk: number = next.get(k)!;
      next.delete(k);
      loop.push(point(k));
      k = nk;
    }
    if (loop.length >= 3) out.push(loop);
  }
  return out;
}

const signedArea = (p: Pt[]) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % p.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
};

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, s: number): Pt => [a[0] * s, a[1] * s];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const len = (a: Pt) => Math.hypot(a[0], a[1]);
const unit = (a: Pt): Pt => {
  const l = len(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l] : [0, 0];
};

/** Points of a closed contour at which it turns sharply (local maxima of turning over ±CORNER_SPAN of arc). */
function findCorners(p: Pt[]): number[] {
  const n = p.length;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i]! + len(sub(p[(i + 1) % n]!, p[i]!));
  const perimeter = cum[n]!;
  if (perimeter < CORNER_SPAN * 6) return [];
  const turn = new Float64Array(n);
  let back = 0;
  let fwd = 0;
  for (let i = 0; i < n; i++) {
    // Walk back and forward along the loop until CORNER_SPAN of arc length.
    while (true) {
      const d = (cum[i]! - cum[back]! + perimeter) % perimeter;
      if (d <= CORNER_SPAN || back === (i + 1) % n) break;
      back = (back + 1) % n;
    }
    while (true) {
      const nb = (back - 1 + n) % n;
      const d = (cum[i]! - cum[nb]! + perimeter) % perimeter;
      if (d > CORNER_SPAN || nb === i) break;
      back = nb;
    }
    if (fwd === i) fwd = (i + 1) % n;
    while (true) {
      const d = (cum[fwd]! - cum[i]! + perimeter) % perimeter;
      if (d >= CORNER_SPAN || (fwd + 1) % n === i) break;
      fwd = (fwd + 1) % n;
    }
    const u = sub(p[i]!, p[back]!);
    const v = sub(p[fwd]!, p[i]!);
    turn[i] = Math.acos(Math.max(-1, Math.min(1, dot(unit(u), unit(v)))));
  }
  const corners: number[] = [];
  for (let i = 0; i < n; i++) {
    if (turn[i]! < CORNER_ANGLE) continue;
    let isMax = true;
    for (let j = i + 1; j < i + n && isMax; j++) {
      const k = j % n;
      if ((cum[k]! - cum[i]! + perimeter) % perimeter > CORNER_SPAN) break;
      if (turn[k]! > turn[i]!) isMax = false;
    }
    for (let j = i - 1; j > i - n && isMax; j--) {
      const k = (j + n) % n;
      if ((cum[i]! - cum[k]! + perimeter) % perimeter > CORNER_SPAN) break;
      if (turn[k]! >= turn[i]!) isMax = false;
    }
    if (isMax) corners.push(i);
  }
  return corners;
}

type Seg = { kind: 'L'; to: Pt } | { kind: 'C'; c1: Pt; c2: Pt; to: Pt };

const bez = (b: Pt[], t: number): Pt => {
  const mt = 1 - t;
  return [
    mt * mt * mt * b[0]![0] + 3 * mt * mt * t * b[1]![0] + 3 * mt * t * t * b[2]![0] + t * t * t * b[3]![0],
    mt * mt * mt * b[0]![1] + 3 * mt * mt * t * b[1]![1] + 3 * mt * t * t * b[2]![1] + t * t * t * b[3]![1],
  ];
};

function chordParams(p: Pt[]): number[] {
  const u = [0];
  for (let i = 1; i < p.length; i++) u.push(u[i - 1]! + len(sub(p[i]!, p[i - 1]!)));
  const total = u[u.length - 1]! || 1;
  return u.map((x) => x / total);
}

function generateBezier(p: Pt[], u: number[], t1: Pt, t2: Pt): Pt[] {
  const first = p[0]!;
  const last = p[p.length - 1]!;
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;
  for (let i = 0; i < p.length; i++) {
    const t = u[i]!;
    const mt = 1 - t;
    const a1 = mul(t1, 3 * mt * mt * t);
    const a2 = mul(t2, 3 * mt * t * t);
    c00 += dot(a1, a1);
    c01 += dot(a1, a2);
    c11 += dot(a2, a2);
    const base = add(mul(first, mt * mt * mt + 3 * mt * mt * t), mul(last, 3 * mt * t * t + t * t * t));
    const tmp = sub(p[i]!, base);
    x0 += dot(a1, tmp);
    x1 += dot(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  let alpha1 = det !== 0 ? (x0 * c11 - x1 * c01) / det : 0;
  let alpha2 = det !== 0 ? (c00 * x1 - c01 * x0) / det : 0;
  const segLen = len(sub(last, first));
  const eps = 1e-6 * segLen;
  if (alpha1 < eps || alpha2 < eps || alpha1 > segLen * 2 || alpha2 > segLen * 2) {
    alpha1 = segLen / 3;
    alpha2 = segLen / 3;
  }
  return [first, add(first, mul(t1, alpha1)), add(last, mul(t2, alpha2)), last];
}

function reparameterize(b: Pt[], p: Pt[], u: number[]): number[] {
  return u.map((t, i) => {
    const q = bez(b, t);
    const mt = 1 - t;
    const d1: Pt = [
      3 *
        (mt * mt * (b[1]![0] - b[0]![0]) +
          2 * mt * t * (b[2]![0] - b[1]![0]) +
          t * t * (b[3]![0] - b[2]![0])),
      3 *
        (mt * mt * (b[1]![1] - b[0]![1]) +
          2 * mt * t * (b[2]![1] - b[1]![1]) +
          t * t * (b[3]![1] - b[2]![1])),
    ];
    const d2: Pt = [
      6 * (mt * (b[2]![0] - 2 * b[1]![0] + b[0]![0]) + t * (b[3]![0] - 2 * b[2]![0] + b[1]![0])),
      6 * (mt * (b[2]![1] - 2 * b[1]![1] + b[0]![1]) + t * (b[3]![1] - 2 * b[2]![1] + b[1]![1])),
    ];
    const diff = sub(q, p[i]!);
    const den = dot(d1, d1) + dot(diff, d2);
    if (Math.abs(den) < 1e-12) return t;
    return Math.max(0, Math.min(1, t - dot(diff, d1) / den));
  });
}

function maxError(b: Pt[], p: Pt[], u: number[]): { err: number; at: number } {
  let err = 0;
  let at = Math.floor(p.length / 2);
  for (let i = 1; i < p.length - 1; i++) {
    const d = len(sub(bez(b, u[i]!), p[i]!));
    if (d > err) {
      err = d;
      at = i;
    }
  }
  return { err, at };
}

/** Largest distance of the points from the chord between the first and the last. */
function lineError(p: Pt[]): number {
  const a = p[0]!;
  const d = unit(sub(p[p.length - 1]!, a));
  let e = 0;
  for (const q of p) {
    const v = sub(q, a);
    e = Math.max(e, Math.abs(v[0] * d[1] - v[1] * d[0]));
  }
  return e;
}

/** Distance from q to the polyline p. */
function polylineDistance(q: Pt, p: Pt[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 1 < p.length; i++) {
    const a = p[i]!;
    const ab = sub(p[i + 1]!, a);
    const l2 = dot(ab, ab);
    const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(q, a), ab) / l2)) : 0;
    best = Math.min(best, len(sub(q, add(a, mul(ab, t)))));
  }
  return best;
}

/**
 * Whether the whole curve stays within tol of the points. The fit's own error is measured only at the points'
 * parameters, which reparameterization can bunch up, leaving a loop or bulge between them unmeasured.
 */
function curveHugs(b: Pt[], p: Pt[], tol: number): boolean {
  for (let k = 1; k < 16; k++) if (polylineDistance(bez(b, k / 16), p) > tol) return false;
  return true;
}

/** Schneider's cubic fit ("An Algorithm for Automatically Fitting Digitized Curves", Graphics Gems 1990). */
function fitCubic(p: Pt[], t1: Pt, t2: Pt, tol: number, out: Seg[]): void {
  if (p.length <= 2 || lineError(p) <= tol) {
    out.push({ kind: 'L', to: p[p.length - 1]! });
    return;
  }
  let u = chordParams(p);
  let b = generateBezier(p, u, t1, t2);
  let { err, at } = maxError(b, p, u);
  if (err <= tol && curveHugs(b, p, tol)) {
    out.push({ kind: 'C', c1: b[1]!, c2: b[2]!, to: b[3]! });
    return;
  }
  // Newton reparameterization, while it keeps helping (Schneider gives up early on far misses; with pixel-grid
  // ripple in the points, that early exit splits curves a single cubic fits).
  for (let k = 0; k < 20; k++) {
    u = reparameterize(b, p, u);
    const nb = generateBezier(p, u, t1, t2);
    const ne = maxError(nb, p, u);
    if (ne.err > err * 0.999) break;
    b = nb;
    ({ err, at } = ne);
    if (err <= tol && curveHugs(b, p, tol)) {
      out.push({ kind: 'C', c1: b[1]!, c2: b[2]!, to: b[3]! });
      return;
    }
  }
  at = Math.max(1, Math.min(p.length - 2, at));
  const centre = unit(sub(p[Math.max(0, at - 1)]!, p[Math.min(p.length - 1, at + 1)]!));
  fitCubic(p.slice(0, at + 1), t1, centre, tol, out);
  fitCubic(p.slice(at), mul(centre, -1), t2, tol, out);
}

/** Unit tangent leaving p[0] along the points, averaged over a few pixels of arc. */
function endTangent(p: Pt[]): Pt {
  const reach = Math.min(CORNER_SPAN, len(sub(p[p.length - 1]!, p[0]!)) / 3);
  let s: Pt = [0, 0];
  for (let i = 1; i < p.length; i++) {
    const v = sub(p[i]!, p[0]!);
    s = add(s, unit(v));
    if (len(v) >= reach) break;
  }
  const t = unit(s);
  return t[0] === 0 && t[1] === 0 ? unit(sub(p[p.length - 1]!, p[0]!)) : t;
}

/** One closed contour as segments: corners kept sharp, the stretches between them smoothed and fitted. */
function fitContour(raw: Pt[], tol: number): { start: Pt; segs: Seg[] } {
  // Thin the marching-squares points (they can sit a hair apart where the contour clips a grid corner).
  const p: Pt[] = [];
  for (const q of raw) if (!p.length || len(sub(q, p[p.length - 1]!)) > 0.02) p.push(q);
  if (p.length > 1 && len(sub(p[0]!, p[p.length - 1]!)) <= 0.02) p.pop();
  const n = p.length;
  const corners = findCorners(p);
  const isCorner = new Uint8Array(n);
  for (const c of corners) isCorner[c] = 1;
  // Light smoothing away from corners takes out the grid's sub-pixel ripple.
  let sm = p;
  for (let pass = 0; pass < SMOOTHING_PASSES; pass++)
    sm = sm.map((q, i) =>
      isCorner[i]
        ? q
        : [
            (sm[(i - 1 + n) % n]![0] + 2 * q[0] + sm[(i + 1) % n]![0]) / 4,
            (sm[(i - 1 + n) % n]![1] + 2 * q[1] + sm[(i + 1) % n]![1]) / 4,
          ],
    );
  const segs: Seg[] = [];
  if (corners.length === 0) {
    // A smooth loop: split at the start and at the point farthest from it, with smooth tangents at both joins.
    let far = 0;
    for (let i = 1; i < n; i++) if (len(sub(sm[i]!, sm[0]!)) > len(sub(sm[far]!, sm[0]!))) far = i;
    const tanAt = (i: number) => unit(sub(sm[(i + 1) % n]!, sm[(i - 1 + n) % n]!));
    const t0 = tanAt(0);
    const tf = tanAt(far);
    fitCubic(sm.slice(0, far + 1), t0, mul(tf, -1), tol, segs);
    fitCubic([...sm.slice(far), sm[0]!], tf, mul(t0, -1), tol, segs);
    return { start: sm[0]!, segs };
  }
  for (let c = 0; c < corners.length; c++) {
    const from = corners[c]!;
    const to = corners[(c + 1) % corners.length]!;
    const span: Pt[] = [];
    for (let i = from; ; i = (i + 1) % n) {
      span.push(sm[i]!);
      if (i === to && span.length > 1) break;
    }
    fitCubic(span, endTangent(span), endTangent([...span].reverse()), tol, segs);
  }
  return { start: sm[corners[0]!]!, segs };
}

const num = (v: number) => {
  const s = (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
};

/** Traces a raster mark to SVG: one evenodd path per face, holes as subpaths. */
export function traceRaster(img: Raster, opts: TraceOptions = {}): TraceResult {
  const colors = Math.round(opts.colors ?? 1);
  if (!(colors >= 1 && colors <= MAX_TRACE_COLORS))
    throw new MarkiloError('USAGE', `--colors must be between 1 and ${MAX_TRACE_COLORS}.`);
  if (opts.threshold !== undefined && !(opts.threshold >= 0 && opts.threshold <= 255))
    throw new MarkiloError('USAGE', '--threshold must be between 0 and 255.');
  if (opts.tolerance !== undefined && !(opts.tolerance > 0))
    throw new MarkiloError('USAGE', '--tolerance must be a positive number of pixels.');
  const field = inkField(img, opts.threshold, opts.background);
  const { w, h, f, rgb, core, scale } = field;
  const turd = opts.turdSize ?? 0.0005 * img.width * img.height;
  // An explicit tolerance is honoured as given; the default never asks for more than the working grid can show.
  const tol =
    opts.tolerance !== undefined ? opts.tolerance / scale : Math.max(0.25 / scale, MIN_WORK_TOLERANCE);

  const faceFields: { field: Float32Array; color: string }[] = [];
  const meanColor = (keep: (i: number) => boolean): string | undefined => {
    let r = 0;
    let g = 0;
    let b = 0;
    let c = 0;
    for (let i = 0; i < f.length; i++)
      if (core[i] && keep(i)) {
        r += rgb[i * 3]!;
        g += rgb[i * 3 + 1]!;
        b += rgb[i * 3 + 2]!;
        c++;
      }
    return c ? rgbToHex({ r: Math.round(r / c), g: Math.round(g / c), b: Math.round(b / c) }) : undefined;
  };
  if (colors > 1) {
    const s = splitColors(field, colors);
    for (let k = 0; k < s.centers; k++) {
      const ff = new Float32Array(f.length);
      for (let i = 0; i < f.length; i++) {
        if (f[i]! <= 0) continue;
        const m = s.first[i] === k ? 1 - s.t[i]! : s.second[i] === k ? s.t[i]! : 0;
        ff[i] = f[i]! * m;
      }
      const color = meanColor(
        (i) => (s.first[i] === k ? 1 - s.t[i]! : s.second[i] === k ? s.t[i]! : 0) >= 0.98,
      );
      if (color) faceFields.push({ field: ff, color });
    }
  } else {
    // The dominant colour of the ink (4 bits per channel), not an average that mixes a two-tone mark into mud.
    const hist = new Map<number, number>();
    const binOf = (i: number) =>
      ((rgb[i * 3]! >> 4) << 8) | ((rgb[i * 3 + 1]! >> 4) << 4) | (rgb[i * 3 + 2]! >> 4);
    for (let i = 0; i < f.length; i++) if (core[i]) hist.set(binOf(i), (hist.get(binOf(i)) ?? 0) + 1);
    const top = [...hist.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
    faceFields.push({
      field: f,
      color: (top !== undefined && meanColor((i) => binOf(i) === top)) || '#000000',
    });
  }

  const sx = img.width / w;
  const sy = img.height / h;
  const faces: (TraceFace & { d: string })[] = [];
  let nodes = 0;
  for (const face of faceFields) {
    const parts: string[] = [];
    let area = 0;
    for (const loop of contours(face.field, w, h)) {
      const a = signedArea(loop) * sx * sy;
      if (Math.abs(a) < turd) continue;
      area += a;
      const { start, segs } = fitContour(loop, tol);
      const P = (q: Pt) => `${num(q[0] * sx)} ${num(q[1] * sy)}`;
      let d = `M${P(start)}`;
      for (const s of segs) d += s.kind === 'L' ? `L${P(s.to)}` : `C${P(s.c1)} ${P(s.c2)} ${P(s.to)}`;
      parts.push(`${d}Z`);
      nodes += segs.length;
    }
    if (parts.length) faces.push({ color: face.color, area: Math.round(Math.abs(area)), d: parts.join('') });
  }
  faces.sort((a, b) => b.area - a.area);
  const paths = faces.map((fc) => `<path fill="${fc.color}" fill-rule="evenodd" d="${fc.d}"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${img.width} ${img.height}" width="${img.width}" height="${img.height}">${paths}</svg>\n`;
  return { svg, faces: faces.map(({ color, area }) => ({ color, area })), nodes, warnings: field.warnings };
}

/**
 * The raster's own ink mask as an SVG: every iso-contour of the ink, unsimplified and unfitted (polygons through the
 * marching-squares points, sub-pixel accurate), in source pixels. What a trace is measured against with silhouetteIoU;
 * pixel runs would add their own half-pixel staircase to the measurement.
 */
export function rasterMaskSvg(
  img: Raster,
  opts: Pick<TraceOptions, 'threshold' | 'background'> = {},
): string {
  const { w, h, f } = inkField(img, opts.threshold, opts.background);
  const sx = img.width / w;
  const sy = img.height / h;
  const d = contours(f, w, h)
    .map((loop) => `M${loop.map((q) => `${num(q[0] * sx)} ${num(q[1] * sy)}`).join('L')}Z`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${img.width} ${img.height}" width="${img.width}" height="${img.height}"><path fill="#000" fill-rule="evenodd" d="${d}"/></svg>`;
}
