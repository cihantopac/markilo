import { createRaster, type Raster } from '../render/image.js';
import { renderSvg } from '../render/resvg.js';
import { nestSvg, svgDocument } from '../svg/compose.js';
import { contrastRatio, hexToRgb, rgbToHex } from './color.js';
import { ANALYSIS_SIZE } from './features.js';
import { sampleFromSvg } from './mark.js';

/**
 * Finding a mark in a photo of the real screen (a TV launcher, a phone home screen) and measuring it there.
 *
 * `locateMark` runs normalized cross-correlation on edge maps (the photo's colour gradient against the mark's
 * outline), coarse to fine: every candidate size is first searched over the whole photo at a level where the mark
 * is only ~12–17 px long, then the best few places are refined at ~48 px and at ~128 px (or the photo's own
 * resolution), where small turns (±5°) are tried as rotated templates. Edge maps make the match blind to the
 * mark's colours and to the tile it sits on; the normalization makes it blind to contrast.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Located {
  /** The mark's ink box in photo pixels (axis-aligned, around the turned mark). */
  box: Box;
  /** Photo pixels per pixel of the mark drawn at the analysis size (its artboard 256 px wide, as `analyze` draws it). */
  scale: number;
  /** Normalized cross-correlation of the edge maps at the match, -1…1. */
  score: number;
  /** The turn (degrees, clockwise) that matched best. */
  angle: number;
}

/** Below this score the best place is not the mark: `locateMark` says "not found" rather than measure the wrong tile. */
export const LOCATE_MIN_SCORE = 0.5;

/** Single-channel or multi-channel float image. */
interface Planes {
  w: number;
  h: number;
  p: Float32Array[];
}

interface Plane {
  w: number;
  h: number;
  d: Float32Array;
}

/** Source spans of an area-averaging shrink from n to m samples (m ≤ n). */
function spans(n: number, m: number, offset = 0): { start: Int32Array; count: Int32Array; wt: Float32Array } {
  const s = n / m;
  const start = new Int32Array(m);
  const count = new Int32Array(m);
  const wts: number[] = [];
  for (let i = 0; i < m; i++) {
    const a = i * s;
    const b = Math.min(n, (i + 1) * s);
    const j0 = Math.floor(a);
    const j1 = Math.min(n, Math.ceil(b));
    start[i] = j0 + offset;
    count[i] = j1 - j0;
    for (let j = j0; j < j1; j++) wts.push((Math.min(b, j + 1) - Math.max(a, j)) / s);
  }
  return { start, count, wt: Float32Array.from(wts) };
}

/**
 * The RGB of `rect` of a raster (composited on white), shrunk by area averaging to `nw`×`nh`, in 0…1. Rows are
 * shrunk one output row at a time, so no full-size intermediate is ever allocated.
 */
function shrinkRegion(r: Raster, rect: Box, nw: number, nh: number): Planes {
  const xs = spans(rect.w, nw, rect.x);
  const ys = spans(rect.h, nh, rect.y);
  const out = [new Float32Array(nw * nh), new Float32Array(nw * nh), new Float32Array(nw * nh)];
  const row = [new Float32Array(nw), new Float32Array(nw), new Float32Array(nw)];
  const { data, width } = r;
  let yw = 0;
  for (let oy = 0; oy < nh; oy++) {
    const base = oy * nw;
    for (let k = 0; k < ys.count[oy]!; k++) {
      const sy = ys.start[oy]! + k;
      const wy = ys.wt[yw++]!;
      let xw = 0;
      for (let ox = 0; ox < nw; ox++) {
        let r0 = 0;
        let g0 = 0;
        let b0 = 0;
        for (let j = 0; j < xs.count[ox]!; j++) {
          const o = (sy * width + xs.start[ox]! + j) * 4;
          const a = data[o + 3]! / 255;
          const wx = xs.wt[xw++]!;
          const white = 255 * (1 - a);
          r0 += wx * (data[o]! * a + white);
          g0 += wx * (data[o + 1]! * a + white);
          b0 += wx * (data[o + 2]! * a + white);
        }
        row[0]![ox] = r0;
        row[1]![ox] = g0;
        row[2]![ox] = b0;
      }
      for (let c = 0; c < 3; c++) {
        const pl = out[c]!;
        const rc = row[c]!;
        for (let ox = 0; ox < nw; ox++) pl[base + ox]! += (wy * rc[ox]!) / 255;
      }
    }
  }
  return { w: nw, h: nh, p: out };
}

/** A coarser copy of planes, by area averaging. */
function shrinkPlanes(src: Planes, nw: number, nh: number): Planes {
  const xs = spans(src.w, nw);
  const ys = spans(src.h, nh);
  const out = src.p.map((pl) => {
    const tmp = new Float32Array(nw * src.h);
    for (let y = 0; y < src.h; y++) {
      let xw = 0;
      for (let ox = 0; ox < nw; ox++) {
        let acc = 0;
        for (let j = 0; j < xs.count[ox]!; j++) acc += xs.wt[xw++]! * pl[y * src.w + xs.start[ox]! + j]!;
        tmp[y * nw + ox] = acc;
      }
    }
    const o = new Float32Array(nw * nh);
    let yw = 0;
    for (let oy = 0; oy < nh; oy++)
      for (let j = 0; j < ys.count[oy]!; j++) {
        const wy = ys.wt[yw++]!;
        const row = (ys.start[oy]! + j) * nw;
        for (let ox = 0; ox < nw; ox++) o[oy * nw + ox]! += wy * tmp[row + ox]!;
      }
    return o;
  });
  return { w: nw, h: nh, p: out };
}

/** Colour Sobel gradient magnitude, softened by a 3×3 box blur so a pixel of misalignment still correlates. */
function edgeMap(img: Planes): Plane {
  const { w, h } = img;
  const mag = new Float32Array(w * h);
  for (const pl of img.p) {
    for (let y = 0; y < h; y++) {
      const ym = (y > 0 ? y - 1 : y) * w;
      const y0 = y * w;
      const yp = (y < h - 1 ? y + 1 : y) * w;
      for (let x = 0; x < w; x++) {
        const xm = x > 0 ? x - 1 : x;
        const xp = x < w - 1 ? x + 1 : x;
        const gx =
          pl[ym + xp]! + 2 * pl[y0 + xp]! + pl[yp + xp]! - pl[ym + xm]! - 2 * pl[y0 + xm]! - pl[yp + xm]!;
        const gy =
          pl[yp + xm]! + 2 * pl[yp + x]! + pl[yp + xp]! - pl[ym + xm]! - 2 * pl[ym + x]! - pl[ym + xp]!;
        mag[y0 + x]! += gx * gx + gy * gy;
      }
    }
  }
  for (let i = 0; i < mag.length; i++) mag[i] = Math.sqrt(mag[i]!);
  // Separable 3×3 box blur.
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      tmp[i] = (mag[x > 0 ? i - 1 : i]! + mag[i]! + mag[x < w - 1 ? i + 1 : i]!) / 3;
    }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      out[i] = (tmp[y > 0 ? i - w : i]! + tmp[i]! + tmp[y < h - 1 ? i + w : i]!) / 3;
    }
  return { w, h, d: out };
}

/** An edge map with summed-area tables of its values and squares, for O(1) window statistics. */
interface Searchable extends Plane {
  s1: Float64Array;
  s2: Float64Array;
}

function searchable(e: Plane): Searchable {
  const W = e.w + 1;
  const s1 = new Float64Array(W * (e.h + 1));
  const s2 = new Float64Array(W * (e.h + 1));
  for (let y = 0; y < e.h; y++) {
    let r1 = 0;
    let r2 = 0;
    for (let x = 0; x < e.w; x++) {
      const v = e.d[y * e.w + x]!;
      r1 += v;
      r2 += v * v;
      s1[(y + 1) * W + x + 1] = s1[y * W + x + 1]! + r1;
      s2[(y + 1) * W + x + 1] = s2[y * W + x + 1]! + r2;
    }
  }
  return { ...e, s1, s2 };
}

/** The mark's outline as a correlation template, at one size and turn. */
interface Template {
  w: number;
  h: number;
  /** Ink box inside the template. */
  ink: Box;
  /** Non-zero template values and their (dx, dy). */
  vx: Int32Array;
  vy: Int32Array;
  v: Float32Array;
  sum: number;
  norm: number;
}

/** Flat windows (a uniform tile, a plain ground) never match: their edge variance is floored at this level. */
const FLAT = 0.01;

function ncc(img: Searchable, t: Template, off: Int32Array, x: number, y: number): number {
  const W = img.w + 1;
  const n = t.w * t.h;
  const a = y * W + x;
  const b = (y + t.h) * W + x;
  const s1 = img.s1[b + t.w]! - img.s1[a + t.w]! - img.s1[b]! + img.s1[a]!;
  const s2 = img.s2[b + t.w]! - img.s2[a + t.w]! - img.s2[b]! + img.s2[a]!;
  const varE = Math.max(s2 - (s1 * s1) / n, n * FLAT * FLAT);
  const base = y * img.w + x;
  const d = img.d;
  let cross = 0;
  for (let k = 0; k < t.v.length; k++) cross += t.v[k]! * d[base + off[k]!]!;
  return (cross - (t.sum * s1) / n) / (t.norm * Math.sqrt(varE));
}

const offsets = (t: Template, stride: number): Int32Array =>
  Int32Array.from(t.v, (_, k) => t.vy[k]! * stride + t.vx[k]!);

/** Draws the mark `size` px wide (its artboard), turned by `angle`, on a canvas with room for the turn. */
async function drawMark(svg: string, size: number, angle: number): Promise<{ img: Raster; ink?: Box }> {
  const c = Math.ceil(size * 1.5) + 4;
  const o = (c - size) / 2;
  const nested = nestSvg(svg, { x: o, y: o, width: size, height: size });
  const body = angle ? `<g transform="rotate(${angle} ${c / 2} ${c / 2})">${nested}</g>` : nested;
  const img = await renderSvg(svgDocument(c, c, body), { width: c });
  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (img.data[(y * img.width + x) * 4 + 3]! >= 128) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? { img } : { img, ink: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}

class Templates {
  private cache = new Map<string, Promise<Template | undefined>>();
  constructor(private svg: string) {}

  get(size: number, angle: number): Promise<Template | undefined> {
    const key = `${size.toFixed(2)}:${angle.toFixed(2)}`;
    let t = this.cache.get(key);
    if (!t) {
      t = this.build(size, angle);
      this.cache.set(key, t);
    }
    return t;
  }

  private async build(size: number, angle: number): Promise<Template | undefined> {
    if (size < 4) return undefined;
    const { img, ink } = await drawMark(this.svg, size, angle);
    if (!ink || ink.w < 3 || ink.h < 3) return undefined;
    // A margin of ground around the ink: a match also needs the calm around the mark, which a busy patch lacks.
    const pad = Math.max(2, Math.round(Math.max(ink.w, ink.h) * 0.1));
    const x0 = Math.max(0, ink.x - pad);
    const y0 = Math.max(0, ink.y - pad);
    const w = Math.min(img.width, ink.x + ink.w + pad) - x0;
    const h = Math.min(img.height, ink.y + ink.h + pad) - y0;
    const alpha = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) alpha[y * w + x] = img.data[((y + y0) * img.width + x + x0) * 4 + 3]! / 255;
    const e = edgeMap({ w, h, p: [alpha] });
    let max = 0;
    for (const v of e.d) if (v > max) max = v;
    const vx: number[] = [];
    const vy: number[] = [];
    const v: number[] = [];
    let sum = 0;
    let sq = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const val = e.d[y * w + x]!;
        if (val <= max * 1e-3) continue;
        vx.push(x);
        vy.push(y);
        v.push(val);
        sum += val;
        sq += val * val;
      }
    const norm = Math.sqrt(sq - (sum * sum) / (w * h));
    if (!(norm > 0)) return undefined;
    return {
      w,
      h,
      ink: { x: ink.x - x0, y: ink.y - y0, w: ink.w, h: ink.h },
      vx: Int32Array.from(vx),
      vy: Int32Array.from(vy),
      v: Float32Array.from(v),
      sum,
      norm,
    };
  }
}

interface Candidate {
  /** Ink centre in photo pixels. */
  cx: number;
  cy: number;
  scale: number;
  angle: number;
  score: number;
  /** Photo pixels per search pixel when this candidate was found. */
  f: number;
  box?: Box;
}

/** Long side, in search pixels, of the mark in the whole-photo search and in the two refinements. */
const COARSE = { min: 12, max: 17 } as const;
const REFINE = [48, 128] as const;

/** Edge map of a region of the photo, shrunk by `f`. */
function regionSearch(photo: Raster, rect: Box, f: number): { img: Searchable; fx: number; fy: number } {
  const nw = Math.max(1, Math.round(rect.w / f));
  const nh = Math.max(1, Math.round(rect.h / f));
  const img = searchable(edgeMap(shrinkRegion(photo, rect, nw, nh)));
  return { img, fx: rect.w / nw, fy: rect.h / nh };
}

/**
 * Finds `mark` (SVG text) in `photo`. Returns undefined ("not found") when the best match scores below
 * LOCATE_MIN_SCORE. `minScale`/`maxScale` bound the search in `Located.scale` units; by default the mark's long
 * side is searched from 2 % of the photo's long side (at least 12 px) up to the photo's short side.
 */
export async function locateMark(
  photo: Raster,
  mark: string,
  opts: { minScale?: number; maxScale?: number } = {},
): Promise<Located | undefined> {
  const templates = new Templates(mark);
  const base = await templates.get(ANALYSIS_SIZE, 0);
  if (!base) return undefined;
  const inkLong0 = Math.max(base.ink.w, base.ink.h);
  const W = photo.width;
  const H = photo.height;
  const minScale = opts.minScale ?? Math.max(12, 0.02 * Math.max(W, H)) / inkLong0;
  const maxScale =
    opts.maxScale ?? Math.min(Math.min(W, H) / inkLong0, W / base.ink.w, H / base.ink.h) * 0.98;
  if (!(minScale > 0) || minScale > maxScale) return undefined;

  // ---- Coarse: every size over the whole photo, on a pyramid level where the mark is 12–17 px long.
  const levels = new Map<number, { img: Searchable; fx: number; fy: number }>();
  // The finest level needed is read from the photo once; coarser ones are shrunk from it.
  let finest: Planes | undefined;
  const level = (k: number) => {
    let l = levels.get(k);
    if (!l) {
      const nw = Math.max(1, Math.round(W / Math.SQRT2 ** k));
      const nh = Math.max(1, Math.round(H / Math.SQRT2 ** k));
      const planes = finest
        ? shrinkPlanes(finest, nw, nh)
        : shrinkRegion(photo, { x: 0, y: 0, w: W, h: H }, nw, nh);
      finest ??= planes;
      l = { img: searchable(edgeMap(planes)), fx: W / nw, fy: H / nh };
      levels.set(k, l);
    }
    return l;
  };
  const coarse: Candidate[] = [];
  for (let s = minScale; s <= maxScale * 1.0001; s *= 1.15) {
    const inkLong = inkLong0 * s;
    let k = 0;
    while (inkLong / Math.SQRT2 ** (k + 1) >= COARSE.min) k++;
    const f = Math.SQRT2 ** k;
    const lv = level(k);
    const t = await templates.get((ANALYSIS_SIZE * s) / f, 0);
    if (!t || t.w > lv.img.w || t.h > lv.img.h) continue;
    const off = offsets(t, lv.img.w);
    const xs = lv.img.w - t.w;
    const ys = lv.img.h - t.h;
    // Every other position first (the blurred edges make the peak wider than that), then the 3×3 around each peak.
    const gw = (xs >> 1) + 1;
    const gh = (ys >> 1) + 1;
    const grid = new Float32Array(gw * gh);
    for (let gy = 0; gy < gh; gy++)
      for (let gx = 0; gx < gw; gx++) grid[gy * gw + gx] = ncc(lv.img, t, off, gx * 2, gy * 2);
    const kept: { x: number; y: number; score: number }[] = [];
    const r = Math.ceil(Math.max(t.ink.w, t.ink.h) / 4);
    for (let pick = 0; pick < 3; pick++) {
      let at = -1;
      for (let i = 0; i < grid.length; i++) if (grid[i]! >= 0.25 && (at < 0 || grid[i]! > grid[at]!)) at = i;
      if (at < 0) break;
      const px = (at % gw) * 2;
      const py = Math.floor(at / gw) * 2;
      let hit = { x: px, y: py, score: grid[at]! };
      for (let y = Math.max(0, py - 1); y <= Math.min(ys, py + 1); y++)
        for (let x = Math.max(0, px - 1); x <= Math.min(xs, px + 1); x++) {
          const sc = ncc(lv.img, t, off, x, y);
          if (sc > hit.score) hit = { x, y, score: sc };
        }
      kept.push(hit);
      const cx = at % gw;
      const cy = Math.floor(at / gw);
      for (let y = Math.max(0, cy - r); y <= Math.min(gh - 1, cy + r); y++)
        for (let x = Math.max(0, cx - r); x <= Math.min(gw - 1, cx + r); x++) grid[y * gw + x] = -1;
    }
    for (const hit of kept)
      coarse.push({
        cx: (hit.x + t.ink.x + t.ink.w / 2) * lv.fx,
        cy: (hit.y + t.ink.y + t.ink.h / 2) * lv.fy,
        scale: s,
        angle: 0,
        score: hit.score,
        f,
      });
  }
  levels.clear();

  // One candidate per place: the best-scoring size there.
  coarse.sort((a, b) => b.score - a.score);
  const places: Candidate[] = [];
  for (const c of coarse) {
    if (places.length >= 12) break;
    const near = places.some((p) => {
      const r = (inkLong0 * Math.min(p.scale, c.scale)) / 2;
      return (
        Math.abs(p.cx - c.cx) < r &&
        Math.abs(p.cy - c.cy) < r &&
        Math.max(p.scale, c.scale) / Math.min(p.scale, c.scale) < 1.3
      );
    });
    if (!near) places.push(c);
  }

  // ---- Refine each place at ~48 px, then at ~128 px, trying sizes and small turns.
  // Every place at ~48 px; the three best of those again at ~128 px.
  const mid: Candidate[] = [];
  for (const start of places) {
    const c = await refine(photo, templates, inkLong0, start, REFINE[0], true);
    if (c && c.score >= 0.35) mid.push(c);
  }
  mid.sort((a, b) => b.score - a.score);
  let best: Candidate | undefined;
  for (const start of mid.slice(0, 3)) {
    const c = (await refine(photo, templates, inkLong0, start, REFINE[1], false)) ?? start;
    if (c.box && (!best || c.score > best.score)) best = c;
  }
  if (!best?.box || best.score < LOCATE_MIN_SCORE) return undefined;
  const round = (v: number, d = 1000) => Math.round(v * d) / d;
  return {
    box: {
      x: Math.round(best.box.x),
      y: Math.round(best.box.y),
      w: Math.round(best.box.w),
      h: Math.round(best.box.h),
    },
    scale: round(best.scale, 10_000),
    score: round(best.score),
    angle: round(best.angle, 100),
  };
}

async function refine(
  photo: Raster,
  templates: Templates,
  inkLong0: number,
  c: Candidate,
  target: number,
  wide: boolean,
): Promise<Candidate | undefined> {
  const inkLong = inkLong0 * c.scale;
  const f = Math.max(1, inkLong / target);
  const rad = Math.ceil((c.f / f) * 1.5) + 2;
  const scales = wide ? [0.88, 0.94, 1, 1.06, 1.12] : [0.975, 1, 1.025];
  const turns = wide ? [-5, -2.5, 2.5, 5] : [-1.25, 1.25];
  // The region: the mark at the largest size tried, turned, plus the search radius.
  const half = (inkLong * Math.max(...scales) * 0.75 + (rad + 4) * f) | 0;
  const x0 = Math.max(0, Math.floor(c.cx - half));
  const y0 = Math.max(0, Math.floor(c.cy - half));
  const rect = {
    x: x0,
    y: y0,
    w: Math.min(photo.width, Math.ceil(c.cx + half)) - x0,
    h: Math.min(photo.height, Math.ceil(c.cy + half)) - y0,
  };
  if (rect.w < 4 || rect.h < 4) return undefined;
  const { img, fx, fy } = regionSearch(photo, rect, f);

  let best: Candidate | undefined;
  const tryOne = async (scale: number, angle: number) => {
    const t = await templates.get((ANALYSIS_SIZE * scale) / f, angle);
    if (!t || t.w > img.w || t.h > img.h) return;
    const off = offsets(t, img.w);
    // Expected top-left of the template, in region search pixels.
    const ex = Math.round((c.cx - rect.x) / fx - (t.ink.x + t.ink.w / 2));
    const ey = Math.round((c.cy - rect.y) / fy - (t.ink.y + t.ink.h / 2));
    for (let y = Math.max(0, ey - rad); y <= Math.min(img.h - t.h, ey + rad); y++)
      for (let x = Math.max(0, ex - rad); x <= Math.min(img.w - t.w, ex + rad); x++) {
        const sc = ncc(img, t, off, x, y);
        if (best && sc <= best.score) continue;
        best = {
          cx: rect.x + (x + t.ink.x + t.ink.w / 2) * fx,
          cy: rect.y + (y + t.ink.y + t.ink.h / 2) * fy,
          scale,
          angle,
          score: sc,
          f,
          box: {
            x: rect.x + (x + t.ink.x) * fx,
            y: rect.y + (y + t.ink.y) * fy,
            w: t.ink.w * fx,
            h: t.ink.h * fy,
          },
        };
      }
  };
  for (const k of scales) await tryOne(c.scale * k, c.angle);
  if (!best) return undefined;
  const at = best as Candidate;
  for (const d of turns) if (Math.abs(at.angle + d) <= 5.01) await tryOne(at.scale, at.angle + d);
  return best;
}

// ---------------------------------------------------------------------------------------------------------------
// Measuring the located mark.

export interface InSituMeasures {
  /** The tile the mark sits on (a flat patch of one colour around it), or null when it sits on the ground itself. */
  tile: Box | null;
  colors: { ink: string; ring: string; tile: string | null; surround: string | null };
  contrast: {
    /** The mark's ink against the ring of ground just around it. */
    inkToRing: { ratio: number };
    /** The tile against what surrounds it (the launcher ground). */
    tileToSurround: { ratio: number } | null;
  };
  /** Area of the mark's box as a share of the photo and of its tile. */
  share: { frame: number; tile: number | null };
  /** The mark's thinnest stroke or gap (`analyze`'s minFeature) at the located scale, in photo pixels. */
  smallestStrokePx: number | null;
}

/** Per-channel median of the pixels `pick` accepts inside `rect`. */
function medianColor(photo: Raster, rect: Box, pick: (x: number, y: number) => boolean): string | undefined {
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let n = 0;
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(photo.width, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(photo.height, Math.ceil(rect.y + rect.h));
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (!pick(x, y)) continue;
      const o = (y * photo.width + x) * 4;
      hist[0]![photo.data[o]!]!++;
      hist[1]![photo.data[o + 1]!]!++;
      hist[2]![photo.data[o + 2]!]!++;
      n++;
    }
  if (!n) return undefined;
  const med = (h: Uint32Array) => {
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += h[i]!;
      if (acc * 2 >= n) return i;
    }
    return 255;
  };
  return rgbToHex({ r: med(hist[0]!), g: med(hist[1]!), b: med(hist[2]!) });
}

const inside = (r: Box, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
const grow = (r: Box, d: number): Box => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });

/** Pixels of the band between `inner` grown by `gap` and grown by `gap + thick`. */
function band(
  inner: Box,
  gap: number,
  thick: number,
): { rect: Box; pick: (x: number, y: number) => boolean } {
  const hole = grow(inner, gap);
  const rect = grow(inner, gap + thick);
  return { rect, pick: (x, y) => !inside(hole, x, y) };
}

/**
 * The flat patch of the ring's colour around the mark: grown side by side from the ring while at least 60 % of
 * each new line stays within `tol` of that colour (a label or a gradient line may interrupt it for two lines).
 */
function findTile(photo: Raster, around: Box, color: string, tol: number): Box | null {
  const { r, g, b } = hexToRgb(color);
  const ok = (x: number, y: number) => {
    const o = (y * photo.width + x) * 4;
    return (
      Math.abs(photo.data[o]! - r) <= tol &&
      Math.abs(photo.data[o + 1]! - g) <= tol &&
      Math.abs(photo.data[o + 2]! - b) <= tol
    );
  };
  let x0 = Math.max(0, Math.floor(around.x));
  let y0 = Math.max(0, Math.floor(around.y));
  let x1 = Math.min(photo.width - 1, Math.ceil(around.x + around.w) - 1);
  let y1 = Math.min(photo.height - 1, Math.ceil(around.y + around.h) - 1);
  const lineOk = (fixed: number, from: number, to: number, vertical: boolean) => {
    let n = 0;
    for (let i = from; i <= to; i++) if (vertical ? ok(fixed, i) : ok(i, fixed)) n++;
    return n >= (to - from + 1) * 0.6;
  };
  const side = (pos: number, dir: -1 | 1, limit: number, vertical: boolean, from: number, to: number) => {
    let last = pos;
    let misses = 0;
    for (let p = pos + dir; dir < 0 ? p >= limit : p <= limit; p += dir) {
      if (lineOk(p, from, to, vertical)) {
        last = p;
        misses = 0;
      } else if (++misses > 2) break;
    }
    return last;
  };
  // Two rounds: the second sees the full extent the first found on the other sides.
  for (let round = 0; round < 2; round++) {
    x0 = side(x0, -1, 0, true, y0, y1);
    x1 = side(x1, 1, photo.width - 1, true, y0, y1);
    y0 = side(y0, -1, 0, false, x0, x1);
    y1 = side(y1, 1, photo.height - 1, false, x0, x1);
  }
  const box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  const spansWidth = x0 === 0 && x1 === photo.width - 1;
  const spansHeight = y0 === 0 && y1 === photo.height - 1;
  if (spansWidth || spansHeight || box.w * box.h > photo.width * photo.height * 0.6) return null;
  return box;
}

/** Per-channel spread (median absolute deviation, as a standard deviation) of the band's pixels. */
function spread(photo: Raster, rect: Box, pick: (x: number, y: number) => boolean, center: string): number {
  const c = hexToRgb(center);
  const hist = new Uint32Array(256);
  let n = 0;
  for (let y = Math.max(0, Math.floor(rect.y)); y < Math.min(photo.height, rect.y + rect.h); y++)
    for (let x = Math.max(0, Math.floor(rect.x)); x < Math.min(photo.width, rect.x + rect.w); x++) {
      if (!pick(x, y)) continue;
      const o = (y * photo.width + x) * 4;
      const d = Math.max(
        Math.abs(photo.data[o]! - c.r),
        Math.abs(photo.data[o + 1]! - c.g),
        Math.abs(photo.data[o + 2]! - c.b),
      );
      hist[Math.min(255, d)]!++;
      n++;
    }
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i]!;
    if (acc * 2 >= n) return i * 1.4826;
  }
  return 0;
}

/** The photo composited on white (photos are opaque; a screenshot with transparency is read as on white). */
function flatten(r: Raster): Raster {
  let opaque = true;
  for (let i = 3; i < r.data.length; i += 4)
    if (r.data[i]! !== 255) {
      opaque = false;
      break;
    }
  if (opaque) return r;
  const out = createRaster(r.width, r.height);
  for (let i = 0; i < r.data.length; i += 4) {
    const a = r.data[i + 3]! / 255;
    for (let k = 0; k < 3; k++) out.data[i + k] = Math.round(r.data[i + k]! * a + 255 * (1 - a));
    out.data[i + 3] = 255;
  }
  return out;
}

/** Measures a located mark in its photo: contrasts, tile, shares and the smallest stroke in photo pixels. */
export async function measureInSitu(raw: Raster, mark: string, at: Located): Promise<InSituMeasures> {
  const photo = flatten(raw);
  const box = at.box;
  const long = Math.max(box.w, box.h);
  // The ink: the mark drawn at the located size and turn, laid on its box, eroded so edge blur and JPEG ringing stay out.
  const { img, ink } = await drawMark(mark, ANALYSIS_SIZE * at.scale, at.angle);
  const sx = ink ? ink.w / box.w : 1;
  const sy = ink ? ink.h / box.h : 1;
  const alphaAt = (x: number, y: number) => {
    if (!ink) return 0;
    const tx = Math.round(ink.x + (x - box.x) * sx);
    const ty = Math.round(ink.y + (y - box.y) * sy);
    if (tx < 0 || ty < 0 || tx >= img.width || ty >= img.height) return 0;
    return img.data[(ty * img.width + tx) * 4 + 3]!;
  };
  const erode = Math.max(1, Math.round(long * 0.02));
  const solid = (x: number, y: number, r: number) =>
    alphaAt(x, y) >= 250 &&
    alphaAt(x - r, y) >= 250 &&
    alphaAt(x + r, y) >= 250 &&
    alphaAt(x, y - r) >= 250 &&
    alphaAt(x, y + r) >= 250;
  const inkColor =
    medianColor(photo, box, (x, y) => solid(x, y, erode)) ??
    medianColor(photo, box, (x, y) => alphaAt(x, y) >= 250) ??
    '#000000';

  const ringBand = band(box, 2, Math.max(3, Math.round(long * 0.06)));
  const ringColor = medianColor(photo, ringBand.rect, ringBand.pick) ?? '#ffffff';
  const tol = Math.min(12, Math.max(6, spread(photo, ringBand.rect, ringBand.pick, ringColor) * 3));
  const tile = findTile(photo, ringBand.rect, ringColor, tol);
  let surround: string | undefined;
  if (tile) {
    const tl = Math.max(tile.w, tile.h);
    const sb = band(tile, Math.max(2, Math.round(tl * 0.01)), Math.max(4, Math.round(tl * 0.08)));
    surround = medianColor(photo, sb.rect, sb.pick);
  }
  const sample = await sampleFromSvg(mark, { id: 'mark' });
  const minFeature = sample.features.minFeature;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const area = box.w * box.h;
  return {
    tile,
    colors: { ink: inkColor, ring: ringColor, tile: tile ? ringColor : null, surround: surround ?? null },
    contrast: {
      inkToRing: { ratio: r2(contrastRatio(inkColor, ringColor)) },
      tileToSurround: tile && surround ? { ratio: r2(contrastRatio(ringColor, surround)) } : null,
    },
    share: {
      frame: Math.round((area / (photo.width * photo.height)) * 10_000) / 10_000,
      tile: tile ? Math.round((area / (tile.w * tile.h)) * 10_000) / 10_000 : null,
    },
    smallestStrokePx:
      Number.isFinite(minFeature) && minFeature > 0 ? Math.round(minFeature * at.scale * 10) / 10 : null,
  };
}

/** The photo with the mark's box (and its tile) drawn, at most `maxSide` px on its long side. */
export function annotateInSitu(raw: Raster, box: Box, tile: Box | null, maxSide = 1600): Raster {
  const photo = flatten(raw);
  const k = Math.min(1, maxSide / Math.max(photo.width, photo.height));
  const w = Math.max(1, Math.round(photo.width * k));
  const h = Math.max(1, Math.round(photo.height * k));
  let out: Raster;
  if (k === 1) out = { width: w, height: h, data: new Uint8Array(photo.data) };
  else {
    const p = shrinkRegion(photo, { x: 0, y: 0, w: photo.width, h: photo.height }, w, h);
    out = createRaster(w, h);
    for (let i = 0; i < w * h; i++) {
      out.data[i * 4] = Math.round(p.p[0]![i]! * 255);
      out.data[i * 4 + 1] = Math.round(p.p[1]![i]! * 255);
      out.data[i * 4 + 2] = Math.round(p.p[2]![i]! * 255);
      out.data[i * 4 + 3] = 255;
    }
  }
  const stroke = (b: Box, rgb: [number, number, number], t: number) => {
    const x0 = Math.round(b.x * k);
    const y0 = Math.round(b.y * k);
    const x1 = Math.round((b.x + b.w) * k) - 1;
    const y1 = Math.round((b.y + b.h) * k) - 1;
    const put = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      out.data.set([...rgb, 255], (y * w + x) * 4);
    };
    for (let d = 0; d < t; d++) {
      for (let x = x0 - d; x <= x1 + d; x++) {
        put(x, y0 - d);
        put(x, y1 + d);
      }
      for (let y = y0 - d; y <= y1 + d; y++) {
        put(x0 - d, y);
        put(x1 + d, y);
      }
    }
  };
  if (tile) stroke(tile, [0, 194, 255], 2);
  stroke(box, [255, 45, 149], 3);
  return out;
}
