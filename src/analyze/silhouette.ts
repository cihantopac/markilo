import { inkMetrics, placeMark } from '../export/geometry.js';
import { MAX_RENDER_SIDE, renderSvg } from '../render/resvg.js';
import { nestSvg } from '../svg/compose.js';

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

/** Alpha > 0.5 mask of an SVG's whole artboard stretched to a SIZE×SIZE square (no fitting to the ink). */
async function maskOfArtboard(svg: string): Promise<Uint8Array> {
  const placed = nestSvg(svg, { x: 0, y: 0, width: SIZE, height: SIZE });
  const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${placed}</svg>`;
  const r = await renderSvg(wrapped, { width: SIZE });
  const m = new Uint8Array(r.width * r.height);
  for (let i = 0; i < m.length; i++) m[i] = r.data[i * 4 + 3]! > 127 ? 1 : 0;
  return m;
}

/**
 * Intersection over union of two drawings laid on the same artboard (each artboard scaled to one square, nothing
 * refitted): unlike silhouetteIoU it also sees a drawing that moved or changed size on its artboard. `slack`: the
 * best IoU over shifts of up to this share of the artboard, so registration within it is not counted as a move.
 */
export async function artboardIoU(a: string, b: string, opts: { slack?: number } = {}): Promise<number> {
  const [ma, mb] = await Promise.all([maskOfArtboard(a), maskOfArtboard(b)]);
  const k = Math.round((opts.slack ?? 0) * SIZE);
  let best = 0;
  let any = false;
  for (let dy = -k; dy <= k; dy++)
    for (let dx = -k; dx <= k; dx++) {
      let inter = 0;
      let union = 0;
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          const va = ma[y * SIZE + x]!;
          const bx = x - dx;
          const by = y - dy;
          const vb = bx >= 0 && bx < SIZE && by >= 0 && by < SIZE ? mb[by * SIZE + bx]! : 0;
          if (va && vb) inter++;
          if (va || vb) union++;
        }
      if (union) any = true;
      if (union) best = Math.max(best, inter / union);
    }
  return any ? best : 1;
}

/** Ink height a word is rendered at for wordmarkIoU (its letters keep this size whatever their spacing). */
const WORD_HEIGHT = 256;

/** A word's alpha mask, scaled so its ink height is WORD_HEIGHT, as ink columns split into letters at empty columns. */
async function letterColumns(svg: string): Promise<Uint8Array[][]> {
  const m = await inkMetrics(svg);
  const pad = 2;
  const draw = (box: { x: number; y: number; w: number; h: number }) => {
    const s = WORD_HEIGHT / Math.max(box.h, 1e-6);
    const width = Math.max(1, Math.min(MAX_RENDER_SIDE, Math.ceil(box.w * s) + pad * 2));
    const height = WORD_HEIGHT + pad * 2;
    const placed = nestSvg(svg, {
      x: pad - (box.x - m.viewBox.x) * s,
      y: pad - (box.y - m.viewBox.y) * s,
      width: m.viewBox.width * s,
      height: m.viewBox.height * s,
    });
    const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${placed}</svg>`;
    return { s, raster: renderSvg(wrapped, { width, height }) };
  };
  // inkMetrics measures on a small square, too coarse for a long word: measure the ink box once more at full size,
  // so both words get exactly the same letter height.
  const margin = m.bbox.h * 0.1;
  const rough = {
    x: m.bbox.x - margin,
    y: m.bbox.y - margin,
    w: m.bbox.w + 2 * margin,
    h: m.bbox.h + 2 * margin,
  };
  const first = draw(rough);
  const r1 = await first.raster;
  let [x0, y0, x1, y1] = [r1.width, r1.height, -1, -1];
  for (let y = 0; y < r1.height; y++)
    for (let x = 0; x < r1.width; x++)
      if (r1.data[(y * r1.width + x) * 4 + 3]! > 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x + 1);
        y1 = Math.max(y1, y + 1);
      }
  const exact =
    x1 > x0 && y1 > y0
      ? {
          x: rough.x + (x0 - pad) / first.s,
          y: rough.y + (y0 - pad) / first.s,
          w: (x1 - x0) / first.s,
          h: (y1 - y0) / first.s,
        }
      : m.bbox;
  const r = await draw(exact).raster;
  const letters: Uint8Array[][] = [];
  let open = false;
  for (let x = 0; x < r.width; x++) {
    const col = new Uint8Array(r.height);
    let any = false;
    for (let y = 0; y < r.height; y++) {
      if (r.data[(y * r.width + x) * 4 + 3]! > 127) {
        col[y] = 1;
        any = true;
      }
    }
    if (!any) {
      open = false;
      continue;
    }
    if (!open) letters.push([]);
    letters[letters.length - 1]!.push(col);
    open = true;
  }
  return letters;
}

/**
 * IoU of two runs of columns, left-aligned (the shorter one padded with empty columns). The best of a one-pixel shift
 * either way: where a letter starts is rounded to a whole pixel, and that rounding is not a change of form.
 */
function columnsIoU(a: Uint8Array[], b: Uint8Array[]): number {
  return Math.max(shiftedIoU(a, b, 0), shiftedIoU(a, b, 1), shiftedIoU(b, a, 1));
}

function shiftedIoU(a: Uint8Array[], b: Uint8Array[], shift: number): number {
  let inter = 0;
  let union = 0;
  for (let x = 0; x < Math.max(a.length, b.length + shift); x++) {
    const ca = a[x];
    const cb = b[x - shift];
    const n = Math.max(ca?.length ?? 0, cb?.length ?? 0);
    for (let y = 0; y < n; y++) {
      const pa = ca?.[y] ?? 0;
      const pb = cb?.[y] ?? 0;
      if (pa && pb) inter++;
      if (pa || pb) union++;
    }
  }
  return union === 0 ? 1 : inter / union;
}

/**
 * How closely a wordmark keeps the letterforms of another (1 = same letters). Spacing is craft, not form: both words
 * are scaled to the same ink height and the empty columns between letters are dropped, so opening or tightening the
 * tracking or kerning does not count. With the same number of separate letters, the letters are paired in order and the
 * lowest pair is the result (one reshaped letter is a change of form); otherwise the gap-free words are compared whole.
 * Calibrated in tests/silhouette.test.ts against the same FORM_CHANGE_LIMIT as symbols.
 */
export async function wordmarkIoU(a: string, b: string): Promise<number> {
  const [la, lb] = await Promise.all([letterColumns(a), letterColumns(b)]);
  if (la.length === lb.length && la.length > 1) return Math.min(...la.map((l, i) => columnsIoU(l, lb[i]!)));
  // Different letter counts: kerning may have joined two letters (r+n) in one word. Place the letters of the word that
  // has more of them into the other and compare there; the gap-free whole-word IoU cannot, because an overlap shifts
  // every later column.
  if (la.length !== lb.length && Math.min(la.length, lb.length) > 0) {
    const [fine, coarse] = la.length > lb.length ? [la, lb] : [lb, la];
    return Math.max(columnsIoU(la.flat(), lb.flat()), placedLettersIoU(fine, coarse.flat()));
  }
  return columnsIoU(la.flat(), lb.flat());
}

const inkAt = (c: Uint8Array | undefined, y: number) => (c?.[y] ? 1 : 0);

/**
 * The letters of one word laid left to right into the columns of another, each at the offset where it fits best
 * (it may start up to 60 % of its width before the previous one ended: kerned letters overlap). The result is the
 * lowest of each letter's IoU, with the neighbours' ink left out of its union, and the IoU of the whole composite.
 */
function placedLettersIoU(letters: Uint8Array[][], target: Uint8Array[]): number {
  const height = target[0]?.length ?? letters[0]?.[0]?.length ?? 0;
  const placed: { at: number; cols: Uint8Array[] }[] = [];
  const explained = (x: number, y: number, except: number) =>
    placed.some((p, i) => i !== except && inkAt(p.cols[x - p.at], y));
  let cursor = 0;
  for (const cols of letters) {
    let best = { at: cursor, score: -1 };
    for (let at = Math.max(0, cursor - Math.ceil(cols.length * 0.6)); at <= cursor + 8; at++) {
      let inter = 0;
      let union = 0;
      for (let x = at; x < at + cols.length; x++)
        for (let y = 0; y < height; y++) {
          const a = inkAt(cols[x - at], y);
          const t = inkAt(target[x], y);
          if (a && t) inter++;
          if (a || (t && !explained(x, y, -1))) union++;
        }
      const score = union ? inter / union : 0;
      if (score > best.score) best = { at, score };
    }
    placed.push({ at: best.at, cols });
    cursor = best.at + cols.length;
  }
  let lowest = 1;
  for (const [i, p] of placed.entries()) {
    let inter = 0;
    let union = 0;
    for (let x = p.at; x < p.at + p.cols.length; x++)
      for (let y = 0; y < height; y++) {
        const a = inkAt(p.cols[x - p.at], y);
        const t = inkAt(target[x], y);
        if (a && t) inter++;
        if (a || (t && !explained(x, y, i))) union++;
      }
    lowest = Math.min(lowest, union ? inter / union : 1);
  }
  let inter = 0;
  let union = 0;
  for (let x = 0; x < Math.max(target.length, cursor); x++)
    for (let y = 0; y < height; y++) {
      const a = explained(x, y, -1) ? 1 : 0;
      const b = inkAt(target[x], y);
      if (a && b) inter++;
      if (a || b) union++;
    }
  return Math.min(lowest, union ? inter / union : 1);
}

/** The form comparison for a kind of master: per letter for a wordmark, whole silhouette for a symbol. */
export function formIoU(kind: 'symbol' | 'wordmark', a: string, b: string): Promise<number> {
  return kind === 'wordmark' ? wordmarkIoU(a, b) : silhouetteIoU(a, b);
}

export function formChangeWarning(kind: 'symbol' | 'wordmark', iou: number): string {
  return `the ${kind}'s form changed from what the user chose (IoU ${iou.toFixed(2)}) — show chosen-vs-now and ask before going on`;
}
