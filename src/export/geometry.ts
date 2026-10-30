import { rasterizeSvgSquare } from '../analyze/mark.js';
import { maskBBox, maskOf } from '../render/image.js';
import { fmt, nestSvg } from '../svg/compose.js';
import { intrinsicBox, parseXml } from '../svg/xml.js';

/** Where the ink actually is, in viewBox units. Used for content-aware (optical) placement. */
export interface InkMetrics {
  viewBox: { x: number; y: number; width: number; height: number };
  bbox: { x: number; y: number; w: number; h: number };
  center: { x: number; y: number };
  /** Farthest ink pixel from the bbox center, in viewBox units. */
  radius: number;
}

const cache = new Map<string, InkMetrics>();

export async function inkMetrics(svg: string): Promise<InkMetrics> {
  const hit = cache.get(svg);
  if (hit) return hit;
  const vb = intrinsicBox(parseXml(svg))!;
  const N = 512;
  // rasterizeSvgSquare fits the viewBox into N×N preserving aspect; recover the mapping.
  const scale = N / Math.max(vb.width, vb.height);
  const offX = (N - vb.width * scale) / 2;
  const offY = (N - vb.height * scale) / 2;
  const m = maskOf(await rasterizeSvgSquare(svg, N));
  const b = maskBBox(m, 0.08) ?? { x: offX, y: offY, w: vb.width * scale, h: vb.height * scale };
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  let r2 = 0;
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++)
      if (m.data[y * N + x]! >= 0.08) r2 = Math.max(r2, (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2);
  const toVb = (px: number, py: number) => ({ x: vb.x + (px - offX) / scale, y: vb.y + (py - offY) / scale });
  const tl = toVb(b.x, b.y);
  const metrics: InkMetrics = {
    viewBox: vb,
    bbox: { x: tl.x, y: tl.y, w: b.w / scale, h: b.h / scale },
    center: toVb(cx, cy),
    radius: Math.sqrt(r2) / scale,
  };
  cache.set(svg, metrics);
  return metrics;
}

export type Fit =
  /** Ink bounding box fills `fraction` of the box (longest side). */
  | { mode: 'box'; fraction: number }
  /** Every ink pixel stays inside a circle of `radius` (fraction of the box size) around the center. */
  | { mode: 'circle'; radius: number };

/**
 * Places a mark inside a target box, centered on its ink (not its artboard), sized by content.
 * This keeps optical size consistent across marks with different artboard padding.
 */
export async function placeMark(
  svg: string,
  box: { x: number; y: number; width: number; height: number },
  fit: Fit,
): Promise<string> {
  const m = await inkMetrics(svg);
  const size = Math.min(box.width, box.height);
  const s =
    fit.mode === 'box'
      ? (size * fit.fraction) / Math.max(m.bbox.w, m.bbox.h)
      : (size * fit.radius) / m.radius;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // Nested svg spans the whole viewBox; shift it so the ink center lands on the box center.
  const w = m.viewBox.width * s;
  const h = m.viewBox.height * s;
  const x = cx - (m.center.x - m.viewBox.x) * s;
  const y = cy - (m.center.y - m.viewBox.y) * s;
  return nestSvg(svg, { x, y, width: w, height: h });
}

export function squircle(size: number, inset: number, radius: number, fill: string): string {
  const s = size - inset * 2;
  return `<rect x="${fmt(inset)}" y="${fmt(inset)}" width="${fmt(s)}" height="${fmt(s)}" rx="${fmt(radius)}" fill="${fill}"/>`;
}
