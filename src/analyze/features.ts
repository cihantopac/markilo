import { type Mask, maskBBox, normalizeMask, resizeMask } from '../render/image.js';

export interface ShapeFeatures {
  /** Share of the artboard covered by ink. */
  coverage: number;
  /** Share of the ink bounding box covered by ink (1 = solid rectangle). */
  bboxFill: number;
  /** Bounding-box width / height. */
  aspect: number;
  /** Visual centroid offset from the artboard center, as a fraction of the artboard size. */
  centroidOffset: { x: number; y: number };
  /** 1 = perfectly mirror-symmetric. */
  symmetry: { horizontal: number; vertical: number; rotational: number };
  /** Separate ink shapes (ignoring specks). */
  components: number;
  /** Enclosed counter-spaces (negative-space shapes). */
  holes: number;
  /** Share of the bounding box that is enclosed negative space. */
  negativeSpace: number;
  /** Perimeter² / (4π·area); 1 for a disc, higher for intricate outlines. */
  compactness: number;
  /** Thin-detail width (20th percentile of stroke and gap widths) in pixels at 256 px. */
  minFeature: number;
  /** 16-bin angular ink distribution around the centroid (rotation-sensitive descriptor). */
  radial: number[];
}

export const ANALYSIS_SIZE = 256;

function binary(m: Mask, t = 0.5): Uint8Array {
  const b = new Uint8Array(m.width * m.height);
  for (let i = 0; i < b.length; i++) b[i] = m.data[i]! >= t ? 1 : 0;
  return b;
}

/** Labels 4-connected regions with value `target`; returns sizes and whether each touches the border. */
function regions(bin: Uint8Array, w: number, h: number, target: 0 | 1): { size: number; border: boolean }[] {
  const label = new Int32Array(w * h).fill(-1);
  const out: { size: number; border: boolean }[] = [];
  const stack: number[] = [];
  for (let start = 0; start < bin.length; start++) {
    if (bin[start] !== target || label[start] !== -1) continue;
    const id = out.length;
    let size = 0;
    let border = false;
    stack.push(start);
    label[start] = id;
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % w;
      const y = (p - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nb) {
        if (q >= 0 && bin[q] === target && label[q] === -1) {
          label[q] = id;
          stack.push(q);
        }
      }
    }
    out.push({ size, border });
  }
  return out;
}

/** Chamfer (3-4) distance transform; returns distance to the nearest pixel of the other class. */
function distance(bin: Uint8Array, w: number, h: number, inside: 0 | 1): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = bin[i] === inside ? INF : 0;
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? (inside === 1 ? 0 : INF) : d[y * w + x]!;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      d[i] = Math.min(d[i]!, at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      d[i] = Math.min(d[i]!, at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
    }
  for (let i = 0; i < d.length; i++) d[i] = d[i]! / 3;
  return d;
}

/** Local-maximum ("ridge") distance values: half-widths of strokes (inside=1) or gaps (inside=0). */
function ridgeWidths(bin: Uint8Array, w: number, h: number, inside: 0 | 1): number[] {
  const d = distance(bin, w, h, inside);
  const widths: number[] = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = d[i]!;
      if (v === 0 || v > 1e8) continue;
      if (v >= d[i - 1]! && v >= d[i + 1]! && v >= d[i - w]! && v >= d[i + w]!) widths.push(2 * v);
    }
  return widths;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
}

function mirrorScore(m: Mask, fn: (x: number, y: number) => number): number {
  let diff = 0;
  let total = 0;
  for (let i = 0; i < m.data.length; i++) {
    const x = i % m.width;
    const y = (i - x) / m.width;
    diff += Math.abs(m.data[i]! - m.data[fn(x, y)]!);
    total += m.data[i]!;
  }
  return total ? Math.max(0, 1 - diff / (2 * total)) : 0;
}

/** Separate ink parts and enclosed counters, ignoring specks under 0.15 % of the area. */
export function topology(m: Mask): { parts: number; holes: number } {
  const bin = binary(m);
  const speck = m.width * m.height * 0.0015;
  return {
    parts: regions(bin, m.width, m.height, 1).filter((r) => r.size >= speck).length,
    holes: regions(bin, m.width, m.height, 0).filter((r) => !r.border && r.size >= speck).length,
  };
}

export function shapeFeatures(mask: Mask): ShapeFeatures {
  const m =
    mask.width === ANALYSIS_SIZE && mask.height === ANALYSIS_SIZE
      ? mask
      : resizeMask(mask, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const w = m.width;
  const h = m.height;
  const n = w * h;
  let ink = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const v = m.data[i]!;
    ink += v;
    cx += v * (i % w);
    cy += v * Math.floor(i / w);
  }
  const box = maskBBox(m, 0.5) ?? { x: 0, y: 0, w: 1, h: 1 };
  cx = ink ? cx / ink : w / 2;
  cy = ink ? cy / ink : h / 2;

  const bin = binary(m);
  const speck = n * 0.0015;
  const inkRegions = regions(bin, w, h, 1).filter((r) => r.size >= speck);
  const bgRegions = regions(bin, w, h, 0);
  const holes = bgRegions.filter((r) => !r.border && r.size >= speck);
  const holeArea = holes.reduce((a, r) => a + r.size, 0);

  let perimeter = 0;
  let area = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!bin[i]) continue;
      area++;
      if (
        x === 0 ||
        !bin[i - 1] ||
        x === w - 1 ||
        !bin[i + 1] ||
        y === 0 ||
        !bin[i - w] ||
        y === h - 1 ||
        !bin[i + w]
      )
        perimeter++;
    }

  const strokes = ridgeWidths(bin, w, h, 1);
  // Gaps only matter inside the mark: crop to the bounding box so the empty margin is ignored.
  const gaps = ridgeWidths(bin, w, h, 0).filter((x) => x < Math.max(box.w, box.h) * 0.5);
  const sig = (xs: number[]) => xs.filter((x) => x >= 1.5);
  const minFeature = Math.min(
    percentile(sig(strokes), 0.2) || Number.POSITIVE_INFINITY,
    percentile(sig(gaps), 0.2) || Number.POSITIVE_INFINITY,
  );

  const radial = new Array(16).fill(0);
  for (let i = 0; i < n; i++) {
    const v = m.data[i]!;
    if (!v) continue;
    const a = Math.atan2(Math.floor(i / w) - cy, (i % w) - cx);
    radial[Math.min(15, Math.floor(((a + Math.PI) / (2 * Math.PI)) * 16))] += v;
  }
  const rs = radial.reduce((a, b) => a + b, 0) || 1;

  const norm = normalizeMask(m, 64);
  const N = 64;
  return {
    coverage: ink / n,
    bboxFill: area / (box.w * box.h),
    aspect: box.w / box.h,
    centroidOffset: { x: (cx - (w - 1) / 2) / w, y: (cy - (h - 1) / 2) / h },
    symmetry: {
      horizontal: mirrorScore(norm, (x, y) => y * N + (N - 1 - x)),
      vertical: mirrorScore(norm, (x, y) => (N - 1 - y) * N + x),
      rotational: mirrorScore(norm, (x, y) => (N - 1 - y) * N + (N - 1 - x)),
    },
    components: inkRegions.length,
    holes: holes.length,
    negativeSpace: holeArea / (box.w * box.h),
    compactness: area ? perimeter ** 2 / (4 * Math.PI * area) : 0,
    minFeature: Number.isFinite(minFeature) ? minFeature : 0,
    radial: radial.map((v) => v / rs),
  };
}
