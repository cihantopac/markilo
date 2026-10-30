import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { MarkiloError } from '../core/errors.js';
import { type Mask, maskOf, normalizeMask, type Raster, resizeMask } from '../render/image.js';
import { decodeImage } from '../render/png.js';
import { renderSvg } from '../render/resvg.js';
import { nestSvg, svgDocument } from '../svg/compose.js';
import { lintSvg } from '../svg/lint.js';
import { rgbToHex } from './color.js';
import { ANALYSIS_SIZE, type ShapeFeatures, shapeFeatures } from './features.js';
import { type Hashes, hashes } from './hash.js';

/** A logo prepared for analysis: rendered, masked, normalized and described. */
export interface MarkSample {
  id: string;
  label: string;
  source: string;
  kind: 'svg' | 'raster';
  raster: Raster;
  mask: Mask;
  /** Ink cropped to its bounding box and fitted into 64×64; position- and scale-invariant. */
  normalized: Mask;
  colors: string[];
  features: ShapeFeatures;
  hashes: Hashes;
}

export async function rasterizeSvgSquare(
  svg: string,
  size = ANALYSIS_SIZE,
  background?: string,
): Promise<Raster> {
  const doc = svgDocument(
    size,
    size,
    nestSvg(svg, { x: 0, y: 0, width: size, height: size }),
    background ? { background } : {},
  );
  return renderSvg(doc, { width: size });
}

function fitRasterSquare(img: Raster, size: number): Mask {
  const m = maskOf(img);
  const scale = size / Math.max(img.width, img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const r = resizeMask(m, w, h);
  const out = new Float32Array(size * size);
  const ox = Math.floor((size - w) / 2);
  const oy = Math.floor((size - h) / 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[(y + oy) * size + x + ox] = r.data[y * w + x]!;
  return { width: size, height: size, data: out };
}

/** Dominant opaque colors (≥ 4% of ink), merged in 4-bit-per-channel buckets. */
export function dominantColors(img: Raster, mask?: Mask, limit = 5): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  const step = Math.max(1, Math.floor((img.width * img.height) / 40_000));
  for (let i = 0; i < img.width * img.height; i += step) {
    const o = i * 4;
    if (img.data[o + 3]! < 200) continue;
    if (mask && mask.width === img.width && mask.data[i]! < 0.5) continue;
    const r = img.data[o]!;
    const g = img.data[o + 1]!;
    const b = img.data[o + 2]!;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    buckets.set(key, e);
    total++;
  }
  return [...buckets.values()]
    .filter((e) => e.n >= total * 0.04)
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
    .map((e) => rgbToHex({ r: e.r / e.n, g: e.g / e.n, b: e.b / e.n }));
}

export async function sampleFromSvg(
  svg: string,
  meta: { id: string; label?: string; source?: string },
): Promise<MarkSample> {
  const lint = lintSvg(svg);
  if (lint.issues.some((i) => i.rule === 'parse' || i.rule === 'root')) {
    throw new MarkiloError('INVALID_SVG', `${meta.source ?? meta.id}: ${lint.issues[0]!.message}`);
  }
  const raster = await rasterizeSvgSquare(svg);
  const mask = maskOf(raster);
  return finish(
    meta,
    'svg',
    raster,
    mask,
    lint.stats.colors.length ? lint.stats.colors : dominantColors(raster),
  );
}

export function sampleFromRaster(
  buf: Uint8Array,
  meta: { id: string; label?: string; source?: string },
): Promise<MarkSample> {
  const img = decodeImage(buf);
  const mask = fitRasterSquare(img, ANALYSIS_SIZE);
  return Promise.resolve(finish(meta, 'raster', img, mask, dominantColors(img, maskOf(img))));
}

function finish(
  meta: { id: string; label?: string; source?: string },
  kind: 'svg' | 'raster',
  raster: Raster,
  mask: Mask,
  colors: string[],
): MarkSample {
  const normalized = normalizeMask(mask, 64);
  return {
    id: meta.id,
    label: meta.label ?? meta.id,
    source: meta.source ?? meta.id,
    kind,
    raster,
    mask,
    normalized,
    colors,
    features: shapeFeatures(mask),
    hashes: hashes(normalized),
  };
}

export async function loadMark(
  path: string,
  meta: { id?: string; label?: string } = {},
): Promise<MarkSample> {
  const ext = extname(path).toLowerCase();
  const id = meta.id ?? basename(path, ext);
  const base = { id, label: meta.label ?? id, source: path };
  const buf = readFileSync(path);
  if (ext === '.svg') return sampleFromSvg(buf.toString('utf8'), base);
  if (['.png', '.jpg', '.jpeg'].includes(ext)) return sampleFromRaster(buf, base);
  throw new MarkiloError('INVALID_INPUT', `Unsupported file type ${ext} for ${path}.`);
}

const coreCache = new WeakMap<MarkSample, MarkSample | null>();

/**
 * The mark without its minor parts: ink regions under 6 % of all ink are removed. Copies often add a
 * small element (a dot, a sparkle, a badge) that shifts the bounding box and hides the match; comparing cores finds
 * them. Returns undefined when the mark has no minor parts.
 */
export function coreSample(s: MarkSample): MarkSample | undefined {
  const hit = coreCache.get(s);
  if (hit !== undefined) return hit ?? undefined;
  const { width: w, height: h, data } = s.mask;
  const label = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < data.length; start++) {
    if (data[start]! < 0.5 || label[start] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % w;
      const y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (data[q]! >= 0.5 && label[q] === -1) {
            label[q] = id;
            stack.push(q);
          }
        }
    }
    sizes.push(size);
  }
  const total = sizes.reduce((a, b) => a + b, 0);
  const minor = new Set(sizes.flatMap((n, i) => (n < total * 0.06 ? [i] : [])));
  if (!minor.size || minor.size === sizes.length) {
    coreCache.set(s, null);
    return undefined;
  }
  const kept = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    // Anti-aliased edge pixels (< 0.5) follow the nearest labelled neighbour's fate via their own label (-1 = keep).
    kept[i] = label[i]! >= 0 && minor.has(label[i]!) ? 0 : data[i]!;
  }
  const mask: Mask = { width: w, height: h, data: kept };
  const normalized = normalizeMask(mask, 64);
  const core: MarkSample = {
    ...s,
    id: `${s.id}:core`,
    mask,
    normalized,
    features: shapeFeatures(mask),
    hashes: hashes(normalized),
  };
  coreCache.set(s, core);
  return core;
}
