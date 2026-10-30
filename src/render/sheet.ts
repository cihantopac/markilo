import { loadBundledFace } from '../design/fonts.js';
import { textPathMarkup } from '../design/wordmark.js';
import { adaptToGround, groundsFor } from '../export/variants.js';
import { fmt, nestSvg, svgDocument } from '../svg/compose.js';
import { monochrome } from '../svg/variants.js';
import { renderPng } from './resvg.js';

export const SHEET_SIZES = [16, 24, 32, 48, 64, 128, 256];

export interface SheetRow {
  label: string;
  background: string;
  svg: string;
}

/**
 * Builds a review contact sheet: every row shows the mark at each size on one background.
 * Small sizes are placed at 1:1 pixel scale so the PNG shows true favicon-size rendering.
 */
export function reviewSheetSvg(
  svg: string,
  opts: { title?: string; dark?: string; light?: string } = {},
): string {
  const light = opts.light ?? '#ffffff';
  const dark = opts.dark ?? '#111318';
  const rows: SheetRow[] = [
    { label: 'Color on light', background: light, svg },
    { label: 'Color on dark', background: dark, svg },
    { label: 'Black', background: light, svg: monochrome(svg, '#000000') },
    { label: 'White (reversed)', background: dark, svg: monochrome(svg, '#ffffff') },
  ];
  return sheetSvg(rows, SHEET_SIZES, opts.title);
}

/** Text rendered as outlines (Inter) so labels look the same on every machine. */
export function label(text: string, x: number, y: number, size: number, fill: string): string {
  return textPathMarkup(loadBundledFace('inter', 500), text, x, y, size, fill).markup;
}

export function sheetSvg(rows: SheetRow[], sizes: number[], title?: string): string {
  const pad = 16;
  const labelH = 22;
  const max = Math.max(...sizes);
  const rowH = max + pad * 2 + labelH;
  const width = sizes.reduce((a, s) => a + s + pad, pad);
  const headerH = title ? 34 : 0;
  const height = headerH + rows.length * rowH;
  let body = '';
  if (title) body += label(title, pad, 23, 15, '#30343c');
  rows.forEach((row, r) => {
    const y0 = headerH + r * rowH;
    body += `<rect x="0" y="${y0}" width="${width}" height="${rowH}" fill="${row.background}"/>`;
    const caption = `${row.label} · ${sizes.map((s) => `${fmt(s)}`).join(' / ')} px`;
    body += label(caption, pad, y0 + 17, 11, isDark(row.background) ? '#c9ced8' : '#5b6170');
    let x = pad;
    for (const s of sizes) {
      body += nestSvg(row.svg, { x, y: y0 + labelH + pad + (max - s), width: s, height: s });
      x += s + pad;
    }
  });
  return svgDocument(width, height, body, { background: '#ffffff' });
}

const isDark = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 < 128;
};

export async function renderReviewSheet(svg: string, title?: string): Promise<Buffer> {
  const sheet = reviewSheetSvg(svg, title ? { title } : {});
  const width = Number(/width="(\d+)"/.exec(sheet)![1]);
  return renderPng(sheet, { width });
}

/**
 * Side-by-side comparison of several sketches: each sketch on its paper and on the opposite ground, at
 * 16–256 px. Used to choose between alternatives before refining one.
 */
export async function renderCompareSheet(
  items: { label: string; svg: string }[],
  paper = '#ffffff',
): Promise<Buffer> {
  const g = groundsFor(paper);
  const rows: SheetRow[] = items.flatMap((it, i) => [
    { label: `${String.fromCharCode(65 + i)} · ${it.label}`, background: g.native, svg: it.svg },
    {
      label: `${String.fromCharCode(65 + i)} · on ${g.darkFirst ? 'light' : 'dark'}`,
      background: g.opposite,
      svg: adaptToGround(it.svg, g.opposite),
    },
  ]);
  const sizes = [16, 32, 64, 128, 256];
  const sheet = sheetSvg(rows, sizes, 'Sketch comparison');
  const width = Number(/width="(\d+)"/.exec(sheet)![1]);
  return renderPng(sheet, { width });
}
