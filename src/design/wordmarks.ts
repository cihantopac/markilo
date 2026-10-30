import { assessQuality } from '../analyze/quality.js';
import { MarkiloError } from '../core/errors.js';
import { inkMetrics } from '../export/geometry.js';
import { renderPng } from '../render/resvg.js';
import { label } from '../render/sheet.js';
import { nestSvg, svgDocument } from '../svg/compose.js';
import { fontInfo, listFonts, loadBundledFace } from './fonts.js';
import { composeLockup } from './lockup.js';
import { wordmarkSvg } from './wordmark.js';

/**
 * Wordmark exploration: the name set in several faces, weights and spacings, each next to the concept's symbol, so
 * the typeface is chosen by eye like the symbol's sketch — not left at the first font that came to mind.
 */

export interface WordmarkCandidate {
  id: string;
  font: string;
  family: string;
  weight: number;
  tracking: number;
  svg: string;
  checks: { pass: number; warn: number; fail: number };
  failing: string[];
}

/** The concept's face first, then contrasting bundled faces (grotesque, serif, geometric, technical). */
export function defaultFonts(conceptFont?: string, count = 4): string[] {
  const known = new Set(listFonts().map((f) => f.id));
  const order = [conceptFont, 'inter', 'fraunces', 'sora', 'space-grotesk', 'manrope', 'ibm-plex-serif'];
  return [...new Set(order.filter((f): f is string => !!f && known.has(f)))].slice(0, count);
}

/** The weight the family has that is closest to the one asked for. */
function nearestWeight(font: string, weight: number): number {
  const ws = fontInfo(font).weights;
  return ws.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), ws[0]!);
}

export async function exploreWordmarks(opts: {
  text: string;
  fonts: string[];
  weights: number[];
  tracking: number[];
  color: string;
  paper: string;
  symbol?: string;
  case?: 'as-is' | 'lower' | 'upper';
  locale?: string;
}): Promise<{ candidates: WordmarkCandidate[]; board: Buffer }> {
  const combos: { font: string; weight: number; tracking: number }[] = [];
  for (const font of opts.fonts)
    for (const w of opts.weights)
      for (const tracking of opts.tracking) {
        const weight = nearestWeight(font, w);
        if (!combos.some((c) => c.font === font && c.weight === weight && c.tracking === tracking))
          combos.push({ font, weight, tracking });
      }
  if (combos.length > 12)
    throw new MarkiloError(
      'USAGE',
      `${combos.length} combinations; a board holds 12.`,
      'Use fewer fonts, weights or tracking values; explore spacing for the chosen face in a second round.',
    );
  const candidates: WordmarkCandidate[] = [];
  for (const [i, c] of combos.entries()) {
    const svg = wordmarkSvg(loadBundledFace(c.font, c.weight), opts.text, {
      tracking: c.tracking,
      color: opts.color,
      ...(opts.case ? { case: opts.case } : {}),
      ...(opts.locale ? { locale: opts.locale } : {}),
    });
    const q = await assessQuality(svg, `w${i + 1}`, 'wordmark', { paper: opts.paper });
    candidates.push({
      id: `w${i + 1}`,
      font: c.font,
      family: fontInfo(c.font).family,
      weight: c.weight,
      tracking: c.tracking,
      svg,
      checks: { pass: q.summary.pass, warn: q.summary.warn, fail: q.summary.fail },
      failing: q.checks.filter((x) => x.status === 'fail').map((x) => x.label),
    });
  }
  return { candidates, board: await wordmarkBoard(candidates, opts.paper, opts.symbol) };
}

async function wordmarkBoard(items: WordmarkCandidate[], paper: string, symbol?: string): Promise<Buffer> {
  const cols = Math.min(3, items.length);
  const tw = 320;
  const th = 196;
  const W = cols * tw + 16;
  const H = Math.ceil(items.length / cols) * th + 46;
  const rgb = Number.parseInt(paper.slice(1), 16);
  const dark = ((rgb >> 16) & 255) * 0.3 + ((rgb >> 8) & 255) * 0.59 + (rgb & 255) * 0.11 < 128;
  const ink = dark ? '#d9dce3' : '#30343c';
  const symbolInk = symbol ? (await inkMetrics(symbol)).bbox : undefined;
  let body = label('Wordmarks next to the symbol (lockup, then the word at 96 px wide)', 16, 28, 14, ink);
  for (const [i, v] of items.entries()) {
    const x = 16 + (i % cols) * tw;
    const y = 46 + Math.floor(i / cols) * th;
    body += `<rect x="${x}" y="${y}" width="${tw - 16}" height="${th - 16}" rx="10" fill="${paper}" stroke="#c9ced8"/>`;
    const lock = symbol
      ? composeLockup(symbol, v.svg, { layout: 'horizontal', ...(symbolInk ? { symbolInk } : {}) }).svg
      : v.svg;
    body += nestSvg(lock, { x: x + 16, y: y + 14, width: tw - 48, height: 84 });
    body += nestSvg(v.svg, { x: x + 16, y: y + 112, width: 96, height: 24 });
    body += label(
      `${v.id} · ${v.family} ${v.weight} · ${v.tracking > 0 ? '+' : ''}${v.tracking}${v.checks.fail ? ' · FAIL' : ''}`,
      x + 10,
      y + 160,
      11,
      v.checks.fail ? '#e5484d' : ink,
    );
  }
  return renderPng(svgDocument(W, H, body, { background: paper }), { width: W });
}
