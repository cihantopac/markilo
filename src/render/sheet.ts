import { loadBundledFace } from '../design/fonts.js';
import { textPathMarkup } from '../design/wordmark.js';
import { type GroundPalette, groundsFor, markOnGround } from '../export/variants.js';
import { aspectOf, fmt, nestSvg, svgDocument } from '../svg/compose.js';
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
  opts: { title?: string; dark?: string; light?: string; palette?: GroundPalette } = {},
): string {
  return sheetSvg(reviewSheetRows(svg, opts), SHEET_SIZES, opts.title);
}

/**
 * The four review rows. Colors are adapted per ground the way exports adapt them (reversed variants), so the sheet
 * shows what ships: with a palette, its onDark / onLight colour replaces the primary there, and the dark row is no
 * longer "(adapted)" when the designer chose its colour.
 */
export function reviewSheetRows(
  svg: string,
  opts: { dark?: string; light?: string; palette?: GroundPalette } = {},
): SheetRow[] {
  const light = opts.light ?? '#ffffff';
  const dark = opts.dark ?? '#111318';
  return [
    { label: 'Color on light', background: light, svg: markOnGround(svg, light, opts.palette) },
    {
      label: opts.palette?.onDark ? 'Color on dark' : 'Color on dark (adapted)',
      background: dark,
      svg: markOnGround(svg, dark, opts.palette),
    },
    { label: 'Black', background: light, svg: monochrome(svg, '#000000') },
    { label: 'White (reversed)', background: dark, svg: monochrome(svg, '#ffffff') },
  ];
}

/** Text rendered as outlines (Inter) so labels look the same on every machine. */
export function label(text: string, x: number, y: number, size: number, fill: string): string {
  return textPathMarkup(loadBundledFace('inter', 500), text, x, y, size, fill).markup;
}

export function sheetSvg(rows: SheetRow[], sizes: number[], title?: string, aspect = 1): string {
  const pad = 16;
  const labelH = 22;
  const max = Math.max(...sizes);
  const rowH = max + pad * 2 + labelH;
  const wide = (s: number) => Math.round(s * aspect);
  const width = sizes.reduce((a, s) => a + wide(s) + pad, pad);
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
      body += nestSvg(row.svg, { x, y: y0 + labelH + pad + (max - s), width: wide(s), height: s });
      x += wide(s) + pad;
    }
  });
  return svgDocument(width, height, body, { background: '#ffffff' });
}

const isDark = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 < 128;
};

export async function renderReviewSheet(
  svg: string,
  title?: string,
  palette?: GroundPalette,
): Promise<Buffer> {
  const sheet = reviewSheetSvg(svg, { ...(title ? { title } : {}), ...(palette ? { palette } : {}) });
  const width = Number(/width="(\d+)"/.exec(sheet)![1]);
  return renderPng(sheet, { width });
}

/** Heights (px) a wordmark is read at: a browser tab's title, a site header, a slide, a hero. */
export const WORDMARK_HEIGHTS = [12, 16, 24, 36, 64];

/**
 * The wordmark on the same four grounds as the symbol sheet, at the heights it is read at. For a concept led by its
 * wordmark this is the identity, so the critic reads it the way it reads the symbol sheet.
 */
export async function renderWordmarkSheet(
  svg: string,
  title?: string,
  palette?: GroundPalette,
): Promise<Buffer> {
  const rows = reviewSheetRows(svg, palette ? { palette } : {});
  const sheet = sheetSvg(rows, WORDMARK_HEIGHTS, title, Math.min(8, Math.max(1, aspectOf(svg))));
  return renderPng(sheet, { width: Number(/width="(\d+)"/.exec(sheet)![1]) });
}

/**
 * Side-by-side comparison of several sketches: each sketch on its paper and on the opposite ground, at
 * 16–256 px. Used to choose between alternatives before refining one.
 */
export function compareSheetSvg(
  items: { label: string; svg: string }[],
  paper = '#ffffff',
  title = 'Options',
  palette?: GroundPalette,
): string {
  const g = groundsFor(paper);
  const rows: SheetRow[] = items.flatMap((it) => [
    { label: it.label, background: g.native, svg: it.svg },
    {
      label: `${it.label} · on ${g.darkFirst ? 'light' : 'dark'}`,
      background: g.opposite,
      svg: markOnGround(it.svg, g.opposite, palette),
    },
  ]);
  const sizes = [16, 32, 64, 128, 256];
  return sheetSvg(rows, sizes, title);
}

export async function renderCompareSheet(
  items: { label: string; svg: string }[],
  paper = '#ffffff',
  title = 'Options',
  palette?: GroundPalette,
): Promise<Buffer> {
  const sheet = compareSheetSvg(items, paper, title, palette);
  const width = Number(/width="(\d+)"/.exec(sheet)![1]);
  return renderPng(sheet, { width });
}
