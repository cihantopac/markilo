import { maskBBox } from '../render/image.js';
import { decodeImage } from '../render/png.js';
import { nestSvg } from '../svg/compose.js';
import { monochrome } from '../svg/variants.js';
import { type MarkSample, sampleFromSvg } from './mark.js';
import { compareMarks, RISK_THRESHOLDS } from './similarity.js';

/**
 * Measures how well the similarity engine separates copies from different marks on a real set of logos:
 * every mark is copied with edits an infringer might make (mirror, rotation, rescale, recolor, a cropped part,
 * an added element) and compared with its original (positives); every pair of different marks is a negative.
 * The result says how many copies the review/high thresholds catch and how often different marks trip them.
 */

export interface CalibrationMark {
  id: string;
  svg?: string;
  raster?: Uint8Array;
}

export const TRANSFORMS = ['mirror', 'rotate-90', 'rescale', 'recolor', 'crop', 'added-element'] as const;
export type Transform = (typeof TRANSFORMS)[number];

const S = 512;

function asSvg(m: CalibrationMark): string {
  if (m.svg) return m.svg;
  const img = decodeImage(m.raster!);
  const mime = m.raster![0] === 0x89 ? 'image/png' : 'image/jpeg';
  const href = `data:${mime};base64,${Buffer.from(m.raster!).toString('base64')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${img.width} ${img.height}"><image href="${href}" width="${img.width}" height="${img.height}"/></svg>`;
}

/**
 * The original placed on a fixed square canvas, so transforms are expressed in one coordinate system. Vector marks
 * are inlined (the renderer does not draw SVG inside <image>); rasters stay embedded images.
 */
function framed(m: CalibrationMark, extra = '', transform = ''): string {
  const inner = m.svg
    ? nestSvg(m.svg, { x: 0, y: 0, width: S, height: S })
    : asSvg(m).replace(/^<svg[^>]*viewBox="0 0 (\d+) (\d+)"[^>]*>|<\/svg>$/g, '');
  const img = m.svg ? undefined : decodeImage(m.raster!);
  const fit = img ? ` transform="scale(${S / Math.max(img.width, img.height)})"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}"><g transform="${transform}"><g${fit}>${inner}</g></g>${extra}</svg>`;
}

/** Ink box of the mark on the S×S canvas the transforms use (the analysis raster is a scaled copy of it). */
export type InkBox = { x: number; y: number; w: number; h: number };

export function transformed(m: CalibrationMark, t: Transform, ink?: InkBox): string | undefined {
  switch (t) {
    case 'mirror':
      return framed(m, '', `translate(${S} 0) scale(-1 1)`);
    case 'rotate-90':
      return framed(m, '', `rotate(90 ${S / 2} ${S / 2})`);
    case 'rescale':
      return framed(m, '', `translate(${S * 0.14} ${S * 0.06}) scale(0.8)`);
    case 'recolor':
      // Recoloring needs vector fills; raster references are skipped for this edit.
      return m.svg ? monochrome(m.svg, '#1f6feb') : undefined;
    case 'crop':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}"><defs><clipPath id="k"><rect width="${S * 0.86}" height="${S}"/></clipPath></defs><g clip-path="url(#k)">${framed(m).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g></svg>`;
    case 'added-element': {
      // A small accent next to the mark (a dot, a badge), the way a copy "makes it different".
      const b = ink ?? { x: S * 0.2, y: S * 0.2, w: S * 0.6, h: S * 0.6 };
      const r = Math.max(4, Math.min(b.w, b.h) * 0.09);
      return framed(m, `<circle cx="${b.x + b.w + r * 1.6}" cy="${b.y + r}" r="${r}" fill="#e5484d"/>`);
    }
  }
}

export interface CalibrationResult {
  marks: number;
  positives: number;
  negatives: number;
  /** Probability that a random copy scores higher than a random pair of different marks (1 = perfect). */
  auc: number;
  thresholds: typeof RISK_THRESHOLDS;
  /** Share of copies flagged at least "review" / "high", overall and per edit. */
  copiesCaught: {
    review: number;
    high: number;
    byTransform: Record<string, { review: number; high: number; n: number }>;
  };
  /** Share of different-mark pairs wrongly flagged "review" / "high". */
  falseAlarms: { review: number; high: number };
  /** Lowest threshold that keeps false alarms at or under 1 % and 5 % of different-mark pairs. */
  suggested: { fpr1: number; fpr5: number };
  distribution: {
    positives: { p10: number; median: number };
    negatives: { median: number; p95: number; p99: number; max: number };
  };
  hardestCopies: { mark: string; transform: string; visual: number }[];
  closestDifferentPairs: { a: string; b: string; visual: number }[];
}

const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))]! : 0;
};
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export async function calibrate(marks: CalibrationMark[]): Promise<CalibrationResult> {
  const originals: { id: string; sample: MarkSample; mark: CalibrationMark }[] = [];
  for (const m of marks) {
    try {
      originals.push({ id: m.id, mark: m, sample: await sampleFromSvg(asSvg(m), { id: m.id }) });
    } catch {
      // Unreadable files do not take part.
    }
  }
  const pos: { mark: string; transform: Transform; visual: number }[] = [];
  for (const o of originals)
    for (const t of TRANSFORMS) {
      const box = maskBBox(o.sample.mask, 0.5);
      const k = S / o.sample.mask.width;
      const ink = box ? { x: box.x * k, y: box.y * k, w: box.w * k, h: box.h * k } : undefined;
      const svg = transformed(o.mark, t, ink);
      if (!svg) continue;
      const copy = await sampleFromSvg(svg, { id: `${o.id}:${t}` });
      pos.push({ mark: o.id, transform: t, visual: (await compareMarks(o.sample, copy)).visual });
    }
  const neg: { a: string; b: string; visual: number }[] = [];
  for (let i = 0; i < originals.length; i++)
    for (let j = i + 1; j < originals.length; j++)
      neg.push({
        a: originals[i]!.id,
        b: originals[j]!.id,
        visual: (await compareMarks(originals[i]!.sample, originals[j]!.sample)).visual,
      });

  const pv = pos.map((p) => p.visual);
  const nv = neg.map((n) => n.visual);
  let wins = 0;
  for (const p of pv) for (const n of nv) wins += p > n ? 1 : p === n ? 0.5 : 0;
  const share = (xs: number[], t: number) => (xs.length ? xs.filter((x) => x >= t).length / xs.length : 0);
  const byTransform: CalibrationResult['copiesCaught']['byTransform'] = {};
  for (const t of TRANSFORMS) {
    const xs = pos.filter((p) => p.transform === t).map((p) => p.visual);
    if (xs.length)
      byTransform[t] = {
        review: r3(share(xs, RISK_THRESHOLDS.review)),
        high: r3(share(xs, RISK_THRESHOLDS.high)),
        n: xs.length,
      };
  }
  const lowestFor = (fpr: number) => {
    for (let t = 0.3; t <= 1.0001; t += 0.01) if (share(nv, t) <= fpr) return r3(t);
    return 1;
  };
  return {
    marks: originals.length,
    positives: pos.length,
    negatives: neg.length,
    auc: r3(pv.length && nv.length ? wins / (pv.length * nv.length) : 0),
    thresholds: RISK_THRESHOLDS,
    copiesCaught: {
      review: r3(share(pv, RISK_THRESHOLDS.review)),
      high: r3(share(pv, RISK_THRESHOLDS.high)),
      byTransform,
    },
    falseAlarms: { review: r3(share(nv, RISK_THRESHOLDS.review)), high: r3(share(nv, RISK_THRESHOLDS.high)) },
    suggested: { fpr1: lowestFor(0.01), fpr5: lowestFor(0.05) },
    distribution: {
      positives: { p10: r3(q(pv, 0.1)), median: r3(q(pv, 0.5)) },
      negatives: {
        median: r3(q(nv, 0.5)),
        p95: r3(q(nv, 0.95)),
        p99: r3(q(nv, 0.99)),
        max: r3(Math.max(0, ...nv)),
      },
    },
    hardestCopies: [...pos]
      .sort((a, b) => a.visual - b.visual)
      .slice(0, 5)
      .map((p) => ({ ...p, visual: r3(p.visual) })),
    closestDifferentPairs: [...neg]
      .sort((a, b) => b.visual - a.visual)
      .slice(0, 5)
      .map((n) => ({ ...n, visual: r3(n.visual) })),
  };
}
