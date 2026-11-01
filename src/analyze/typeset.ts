import { listFonts, loadBundledFace } from '../design/fonts.js';
import { wordmarkSvg } from '../design/wordmark.js';
import { inkMetrics } from '../export/geometry.js';
import { type Mask, maskOf } from '../render/image.js';
import { renderSvg } from '../render/resvg.js';
import { fmt, nestSvg, svgDocument } from '../svg/compose.js';
import { parseXml, serializeXml } from '../svg/xml.js';
import { rasterizeSvgSquare } from './mark.js';
import { softIoU } from './similarity.js';

/**
 * At or above this likeness a wordmark is the typeface as set: the same letters, spacing aside. Calibrated on Markilo
 * 1.1's first real-project round: three untouched words, one with a raised square i-dot, scored 0.985–0.995; a cut
 * through every letter of the same word scored 0.895, a different grotesque 0.79 and a serif 0.51. A serif with only its
 * R legs straightened scored 0.948 and was rightly judged a stock face, hence 0.93; accepted words scored 0.40–0.79.
 */
export const TYPESET_LIMIT = 0.93;

/** The bundled family a wordmark was set in: the concept's typography, else the SVG's `data-font` ("Sora 600"). */
export function wordmarkFont(
  svg: string,
  typography?: { fontId: string; weight: number },
): { id: string; weight: number } | undefined {
  if (typography) return { id: typography.fontId, weight: typography.weight };
  const m = /data-font="([^"]+?)\s+(\d{3})"/.exec(svg);
  if (!m) return undefined;
  const f = listFonts().find((x) => x.family.toLowerCase() === m[1]!.toLowerCase());
  return f ? { id: f.id, weight: Number(m[2]) } : undefined;
}

const W = 384;
const H = 56;

/** Rows of ink a lone detail occupies (a raised dot, an accent): trimmed so it does not shift the whole word. */
const SPARSE_ROW = 0.08;

/** The word's ink, stretched to a fixed frame, so spacing differences alone do not hide an untouched setting. */
async function wordMask(svg: string): Promise<Mask> {
  const { bbox } = await inkMetrics(svg);
  const root = parseXml(svg);
  delete root.attrs.width;
  delete root.attrs.height;
  const frame = async (b: { x: number; y: number; w: number; h: number }, width: number, height: number) => {
    root.attrs.viewBox = `${fmt(b.x)} ${fmt(b.y)} ${fmt(b.w)} ${fmt(b.h)}`;
    const wide = (b.w / b.h) * height;
    const inner = nestSvg(serializeXml(root), { x: 0, y: 0, width: wide, height });
    const doc = svgDocument(width, height, `<g transform="scale(${fmt(width / wide)} 1)">${inner}</g>`);
    return maskOf(await renderSvg(doc, { width, height }));
  };
  // Trim rows at the top and bottom that hold almost no ink, measured against the fullest row.
  const probe = await frame(bbox, W, H * 4);
  const rows = Array.from({ length: probe.height }, (_, y) => {
    let sum = 0;
    for (let x = 0; x < probe.width; x++) sum += probe.data[y * probe.width + x]!;
    return sum;
  });
  const max = Math.max(...rows);
  let top = 0;
  let bottom = rows.length - 1;
  while (top < bottom && rows[top]! < max * SPARSE_ROW) top++;
  while (bottom > top && rows[bottom]! < max * SPARSE_ROW) bottom--;
  const unit = bbox.h / probe.height;
  return frame({ x: bbox.x, y: bbox.y + top * unit, w: bbox.w, h: (bottom - top + 1) * unit }, W, H);
}

/**
 * How closely a wordmark matches its own typeface set plainly (any case, tracking −80…+120): 1 = identical. A
 * designed word — custom letters, ligatures, a treatment through the word — scores clearly lower.
 */
export async function typesetLikeness(
  wordmark: string,
  font: { id: string; weight: number },
  text: string,
  locale?: string,
): Promise<{ likeness: number; case: 'as-is' | 'lower' | 'upper'; tracking: number } | undefined> {
  let face: ReturnType<typeof loadBundledFace>;
  try {
    face = loadBundledFace(font.id, font.weight);
  } catch {
    return undefined;
  }
  const own = await wordMask(wordmark);
  type Best = { likeness: number; case: 'as-is' | 'lower' | 'upper'; tracking: number };
  let best: Best | undefined;
  const tryOne = async (c: Best['case'], tracking: number) => {
    let plain: string;
    try {
      plain = wordmarkSvg(face, text, { case: c, tracking, ...(locale ? { locale } : {}) });
    } catch {
      return;
    }
    const likeness = softIoU(own, await wordMask(plain));
    if (!best || likeness > best.likeness) best = { likeness, case: c, tracking };
  };
  // A coarse pass over case and spacing, then a fine one around the best spacing.
  for (const c of ['as-is', 'lower', 'upper'] as const)
    for (let tracking = -80; tracking <= 120; tracking += 20) await tryOne(c, tracking);
  const coarse = best as Best | undefined;
  if (coarse)
    for (let tracking = coarse.tracking - 15; tracking <= coarse.tracking + 15; tracking += 5)
      await tryOne(coarse.case, tracking);
  const found = best as Best | undefined;
  return found && { ...found, likeness: Math.round(found.likeness * 1000) / 1000 };
}

/**
 * True when an icon is drawn on its own filled container (a tile or disc spanning the artboard with the mark knocked
 * out of it). Exports put icons on their own grounds, so a built-in tile becomes a tile inside a tile.
 */
export async function carriesTile(symbol: string): Promise<boolean> {
  const m = await inkMetrics(symbol);
  const vb = m.viewBox;
  const spans = m.bbox.w >= vb.width * 0.88 && m.bbox.h >= vb.height * 0.88;
  if (!spans) return false;
  const mask = maskOf(await rasterizeSvgSquare(symbol, 128));
  const ink = mask.data.reduce((a, v) => a + v, 0) / mask.data.length;
  return ink >= 0.5;
}
