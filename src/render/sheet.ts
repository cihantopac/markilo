import { MarkiloError } from '../core/errors.js';
import { loadBundledFace } from '../design/fonts.js';
import { hasWordMetrics, wordMetrics } from '../design/glyphs.js';
import { textPathMarkup } from '../design/wordmark.js';
import { type GroundPalette, groundsFor, markOnGround, tileGround } from '../export/variants.js';
import { aspectOf, fmt, nestSvg, svgDocument } from '../svg/compose.js';
import { monochrome, substitute } from '../svg/variants.js';
import { intrinsicBox, parseXml } from '../svg/xml.js';
import { renderPng } from './resvg.js';

/** The tile ground of a tile row when no --primary is given. */
const DEFAULT_TILE = '#2b3a67';

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
  opts: { tile?: boolean } = {},
): string {
  const g = groundsFor(paper);
  const tileGroundHex = palette ? tileGround(palette) : DEFAULT_TILE;
  const rows: SheetRow[] = items.flatMap((it) => [
    { label: it.label, background: g.native, svg: it.svg },
    {
      label: `${it.label} · on ${g.darkFirst ? 'light' : 'dark'}`,
      background: g.opposite,
      svg: markOnGround(it.svg, g.opposite, palette),
    },
    ...(opts.tile
      ? [
          {
            label: `${it.label} · tile`,
            background: tileGroundHex,
            svg: markOnGround(it.svg, tileGroundHex, palette, { tile: true }),
          },
        ]
      : []),
  ]);
  const sizes = [16, 32, 64, 128, 256];
  return sheetSvg(rows, sizes, title);
}

export async function renderCompareSheet(
  items: { label: string; svg: string }[],
  paper = '#ffffff',
  title = 'Options',
  palette?: GroundPalette,
  opts: { tile?: boolean } = {},
): Promise<Buffer> {
  const sheet = compareSheetSvg(items, paper, title, palette, opts);
  const width = Number(/width="(\d+)"/.exec(sheet)![1]);
  return renderPng(sheet, { width });
}

/** Cap height and baseline (source units) of a word: its recorded metrics, else measured from the outlines. */
async function wordGeometry(svg: string): Promise<{ cap: number; baseline: number }> {
  if (hasWordMetrics(svg)) {
    const root = parseXml(svg);
    return {
      cap: Number.parseFloat(root.attrs['data-cap-height']!),
      baseline: Number.parseFloat(root.attrs['data-baseline']!),
    };
  }
  const m = await wordMetrics(svg, { part: 'auto' });
  return { cap: m.capHeight, baseline: m.baseline };
}

/**
 * Words one above the other at the same cap height, standing on one baseline, with a faint cap and baseline guide
 * across every row. Parents come first, the new word last: a letter that differs shows against the same guides.
 */
export async function familySheetSvg(words: { label: string; svg: string }[], width = 1600): Promise<string> {
  const pad = 24;
  const labelH = 30;
  const geo = await Promise.all(
    words.map(async (w) => {
      const vb = intrinsicBox(parseXml(w.svg));
      if (!vb) throw new MarkiloError('INVALID_SVG', `${w.label}: the word has no viewBox or size.`);
      return { vb, ...(await wordGeometry(w.svg)) };
    }),
  );
  const widest = Math.max(...geo.map((g) => g.vb.width / g.cap));
  const capPx = Math.min(160, (width - pad * 2) / widest);
  const above = Math.max(...geo.map((g) => ((g.baseline - g.vb.y) / g.cap) * capPx));
  const below = Math.max(...geo.map((g) => ((g.vb.y + g.vb.height - g.baseline) / g.cap) * capPx));
  const rowH = labelH + above + below + pad;
  let body = '';
  words.forEach((w, i) => {
    const g = geo[i]!;
    const y0 = i * rowH;
    const s = capPx / g.cap;
    const baseY = y0 + labelH + above;
    body += `<rect x="0" y="${fmt(y0)}" width="${fmt(width)}" height="${fmt(rowH)}" fill="${i % 2 ? '#f6f7f9' : '#ffffff'}"/>`;
    body += label(w.label, pad, y0 + 20, 13, '#5b6170');
    body += nestSvg(
      w.svg,
      { x: pad, y: baseY - (g.baseline - g.vb.y) * s, width: g.vb.width * s, height: g.vb.height * s },
      { extraAttrs: { 'data-cap-px': fmt(capPx) } },
    );
    for (const [role, y] of [
      ['cap', baseY - capPx],
      ['baseline', baseY],
    ] as const)
      body += `<line data-guide="${role}" x1="0" x2="${fmt(width)}" y1="${fmt(y)}" y2="${fmt(y)}" stroke="#e03131" stroke-opacity="0.4" stroke-width="1"/>`;
  });
  return svgDocument(width, rowH * words.length, body, { background: '#ffffff' });
}

export async function renderFamilySheet(
  words: { label: string; svg: string }[],
  width = 1600,
): Promise<Buffer> {
  return renderPng(await familySheetSvg(words, width), { width });
}

/**
 * One column per candidate primary colour: the symbol on its tile, then the lockup on paper and on dark, each column
 * labelled "<n> · #hex". The concept's other palette choices (paper, ink, onBrand) stay; its own onDark / onLight
 * belong to its primary, so they give way to the automatic adaptation for a candidate.
 */
export function paletteSheetSvg(opts: {
  symbol: string;
  lockup: string;
  primary: string;
  palette: Omit<GroundPalette, 'primary'>;
  candidates: string[];
  paper?: string;
  dark?: string;
}): string {
  const pad = 20;
  const col = 260;
  const tile = 160;
  const paper = opts.paper ?? opts.palette.paper ?? '#ffffff';
  const dark = opts.dark ?? '#111318';
  const lockH = 96;
  const headH = 34;
  const width = pad + opts.candidates.length * (col + pad);
  const height = headH + tile + lockH * 2 + pad * 4;
  let body = '';
  opts.candidates.forEach((hex, i) => {
    const x = pad + i * (col + pad);
    const pal: GroundPalette = { ...opts.palette, primary: hex, tile: hex };
    delete pal.onDark;
    delete pal.onLight;
    const recolor = (svg: string) => substitute(svg, { [opts.primary]: hex });
    body += label(`${i + 1} · ${hex}`, x, 24, 16, '#30343c');
    const tileY = headH;
    body += `<rect x="${x}" y="${tileY}" width="${tile}" height="${tile}" rx="${fmt(tile * 0.22)}" fill="${hex}"/>`;
    body += nestSvg(markOnGround(recolor(opts.symbol), hex, pal, { tile: true }), {
      x: x + tile * 0.2,
      y: tileY + tile * 0.2,
      width: tile * 0.6,
      height: tile * 0.6,
    });
    let y = tileY + tile + pad;
    for (const ground of [paper, dark]) {
      body += `<rect x="${x}" y="${y}" width="${col}" height="${lockH}" fill="${ground}" stroke="#d5d8de"/>`;
      body += nestSvg(markOnGround(recolor(opts.lockup), ground, pal), {
        x: x + 16,
        y: y + 16,
        width: col - 32,
        height: lockH - 32,
      });
      y += lockH + pad;
    }
  });
  return svgDocument(width, height, body, { background: '#ffffff' });
}
