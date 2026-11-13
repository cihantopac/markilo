import { placeMark } from '../export/geometry.js';
import { renderSvg } from '../render/resvg.js';

/** Below this, a drawing is no longer the form the user chose (calibrated in tests/silhouette.test.ts). */
export const FORM_CHANGE_LIMIT = 0.85;

const SIZE = 256;

/** Alpha > 0.5 mask of an SVG fitted to its own ink box inside a SIZE×SIZE square. */
async function maskOfFitted(svg: string): Promise<Uint8Array> {
  const placed = await placeMark(
    svg,
    { x: 0, y: 0, width: SIZE, height: SIZE },
    { mode: 'box', fraction: 1 },
  );
  const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${placed}</svg>`;
  const r = await renderSvg(wrapped, { width: SIZE });
  const m = new Uint8Array(r.width * r.height);
  for (let i = 0; i < m.length; i++) m[i] = r.data[i * 4 + 3]! > 127 ? 1 : 0;
  return m;
}

/**
 * Intersection over union of two drawings' silhouettes (1 = same form, 0 = nothing shared). Each is fitted to its
 * own ink box first, so a change of artboard padding or overall size does not count as a change of form.
 */
export async function silhouetteIoU(a: string, b: string): Promise<number> {
  const [ma, mb] = await Promise.all([maskOfFitted(a), maskOfFitted(b)]);
  let inter = 0;
  let union = 0;
  for (let i = 0; i < ma.length; i++) {
    if (ma[i] && mb[i]) inter++;
    if (ma[i] || mb[i]) union++;
  }
  return union === 0 ? 1 : inter / union;
}

export function formChangeWarning(kind: 'symbol' | 'wordmark', iou: number): string {
  return `the ${kind}'s form changed from what the user chose (IoU ${iou.toFixed(2)}) — show chosen-vs-now and ask before going on`;
}
