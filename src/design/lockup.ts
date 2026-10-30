import { MarkiloError } from '../core/errors.js';
import { fmt, nestSvg } from '../svg/compose.js';
import { intrinsicBox, parseXml } from '../svg/xml.js';

export type LockupLayout = 'horizontal' | 'stacked';

export interface LockupOptions {
  layout: LockupLayout;
  /** Symbol height as a multiple of the wordmark cap height (horizontal ~1.4–1.9, stacked ~2.4–3.2). */
  symbolScale?: number;
  /** Gap between symbol and wordmark as a multiple of cap height. */
  gap?: number;
  title?: string;
}

export interface Lockup {
  svg: string;
  /** Recommended minimum clear space around the lockup, in lockup units (one cap height). */
  clearSpace: number;
  width: number;
  height: number;
}

function wordmarkMetrics(svg: string) {
  const root = parseXml(svg);
  const vb = intrinsicBox(root);
  if (!vb) throw new MarkiloError('INVALID_SVG', 'Wordmark SVG needs a viewBox.');
  const cap = Number.parseFloat(root.attrs['data-cap-height'] ?? '');
  const baseline = Number.parseFloat(root.attrs['data-baseline'] ?? '0');
  // Hand-drawn wordmarks without metrics: assume the ink box is the cap box.
  return {
    vb,
    cap: cap > 0 ? cap : vb.height,
    baseline: Number.isFinite(baseline) ? baseline : vb.y + vb.height,
  };
}

/** Composes symbol + wordmark with proportions tied to the wordmark's cap height. */
export function composeLockup(symbolSvg: string, wordmark: string, opts: LockupOptions): Lockup {
  const sym = intrinsicBox(parseXml(symbolSvg));
  if (!sym) throw new MarkiloError('INVALID_SVG', 'Symbol SVG needs a viewBox.');
  const wm = wordmarkMetrics(wordmark);
  const CAP = 100; // lockup units: the wordmark cap height is 100
  const s = CAP / wm.cap;
  const wmW = wm.vb.width * s;
  const wmH = wm.vb.height * s;
  // Position of the baseline and the cap line inside the scaled wordmark box.
  const baselineInBox = (wm.baseline - wm.vb.y) * s;
  const capTopInBox = baselineInBox - CAP;
  const symRatio = sym.width / sym.height;
  let body: string;
  let width: number;
  let height: number;
  if (opts.layout === 'horizontal') {
    const sh = CAP * (opts.symbolScale ?? 1.6);
    const sw = sh * symRatio;
    const gap = CAP * (opts.gap ?? 0.75);
    // Center the symbol on the cap-height band, not on the ink box (descenders would pull it down).
    const capCenter = capTopInBox + CAP / 2;
    const top = Math.min(0, capCenter - sh / 2);
    const symY = capCenter - sh / 2 - top;
    const wmY = -top;
    width = sw + gap + wmW;
    height = Math.max(symY + sh, wmY + wmH);
    body =
      nestSvg(symbolSvg, { x: 0, y: symY, width: sw, height: sh }) +
      nestSvg(wordmark, { x: sw + gap, y: wmY, width: wmW, height: wmH });
  } else {
    const sh = CAP * (opts.symbolScale ?? 2.8);
    const sw = sh * symRatio;
    const gap = CAP * (opts.gap ?? 0.7);
    width = Math.max(sw, wmW);
    height = sh + gap + wmH;
    body =
      nestSvg(symbolSvg, { x: (width - sw) / 2, y: 0, width: sw, height: sh }) +
      nestSvg(wordmark, { x: (width - wmW) / 2, y: sh + gap, width: wmW, height: wmH });
  }
  const title = opts.title ? `<title>${opts.title.replace(/[<&]/g, '')}</title>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(round(width))} ${fmt(round(height))}" data-markilo-role="lockup-${opts.layout}" data-clear-space="${CAP}">${title}${body}</svg>\n`;
  return { svg, clearSpace: CAP, width, height };
}

const round = (n: number) => Math.round(n * 100) / 100;
