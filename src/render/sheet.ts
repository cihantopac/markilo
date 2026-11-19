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

/** The sizes a small version is judged at: the ones the app icon, favicon and tab are drawn at. */
export const SMALL_COMPARE_SIZES = [16, 24, 32, 48];

/**
 * The main symbol above its small version, each at 16 / 24 / 32 / 48 px on a light and a dark ground (colours
 * adapted per ground as exports do). The labels are the sheets' own; "Main symbol" and "Small version" have
 * Turkish entries in src/ui/tr.ts.
 */
export function smallCompareSheetSvg(
  main: string,
  small: string,
  opts: { palette?: GroundPalette; title?: string; dark?: string; light?: string } = {},
): string {
  const light = opts.light ?? '#ffffff';
  const dark = opts.dark ?? '#111318';
  const rows: SheetRow[] = [];
  for (const [name, svg] of [
    ['Main symbol', main],
    ['Small version', small],
  ] as const)
    rows.push(
      { label: `${name} · on light`, background: light, svg: markOnGround(svg, light, opts.palette) },
      { label: `${name} · on dark`, background: dark, svg: markOnGround(svg, dark, opts.palette) },
    );
  return sheetSvg(rows, SMALL_COMPARE_SIZES, opts.title);
}

/** Text rendered as outlines (Inter) so labels look the same on every machine. */
export function label(text: string, x: number, y: number, size: number, fill: string): string {
  return textPathMarkup(loadBundledFace('inter', 500), text, x, y, size, fill).markup;
}

/** A crop of the before file's viewBox, shown for before and after side by side. */
export interface Zoom {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

/** How many times larger than its source units a zoomed crop is drawn. */
export const ZOOM_SCALE = 4;

const ZOOM_PAD = 16;
const ZOOM_HEAD = 22;
const ZOOM_CAPTION = 16;

/**
 * Parses `x,y,w,h[:label]` against the before file's viewBox. The crop must have a positive size and lie inside the
 * viewBox, so a typo cannot silently show an empty panel.
 */
export function parseZoom(spec: string, svg: string, index: number): Zoom {
  const colon = spec.indexOf(':');
  const box = colon < 0 ? spec : spec.slice(0, colon);
  const text = colon < 0 ? '' : spec.slice(colon + 1).trim();
  const parts = box.split(',').map((p) => p.trim());
  const nums = parts.map((p) => (p === '' ? Number.NaN : Number(p)));
  const usage = 'Use --zoom x,y,w,h[:label], in the viewBox of the first (before) file.';
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n)))
    throw new MarkiloError('USAGE', `--zoom "${spec}" needs four numbers: x,y,w,h.`, usage);
  const [x, y, w, h] = nums as [number, number, number, number];
  if (!(w > 0) || !(h > 0))
    throw new MarkiloError('USAGE', `--zoom "${spec}": the width and height must be above zero.`, usage);
  const vb = intrinsicBox(parseXml(svg));
  if (!vb) throw new MarkiloError('INVALID_SVG', 'The before file has no viewBox or size.');
  const eps = 1e-6;
  if (x < vb.x - eps || y < vb.y - eps || x + w > vb.x + vb.width + eps || y + h > vb.y + vb.height + eps)
    throw new MarkiloError(
      'USAGE',
      `--zoom "${spec}" lies outside the before file's viewBox (${fmt(vb.x)} ${fmt(vb.y)} ${fmt(vb.width)} ${fmt(vb.height)}).`,
      usage,
    );
  return { x, y, w, h, label: text || `Zoom ${index + 1}` };
}

/** One crop: `svg` shown through a window of `zoom`, scaled by ZOOM_SCALE, clipped to its panel. */
function cropMarkup(
  svg: string,
  frame: { x: number; y: number; width: number; height: number },
  zoom: Zoom,
  x: number,
  y: number,
  side: string,
): string {
  const w = zoom.w * ZOOM_SCALE;
  const h = zoom.h * ZOOM_SCALE;
  return (
    `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" fill="#ffffff" stroke="#d5d8de"/>` +
    `<svg data-zoom-side="${side}" x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" viewBox="${fmt(zoom.x)} ${fmt(zoom.y)} ${fmt(zoom.w)} ${fmt(zoom.h)}" overflow="hidden">` +
    nestSvg(svg, frame) +
    '</svg>'
  );
}

/** The widest zoom row, in px: two crops side by side with margins. */
const zoomMinWidth = (zooms: Zoom[]) =>
  zooms.length ? Math.ceil(ZOOM_PAD * 3 + 2 * Math.max(...zooms.map((z) => z.w)) * ZOOM_SCALE) : 0;

/** Rows of zoomed before/after crops, starting at y = 0 of the returned markup. */
export function zoomRowsSvg(
  before: string,
  after: string,
  zooms: Zoom[],
  width: number,
  background = '#ffffff',
): { svg: string; height: number } {
  // Crops are in the before file's coordinates: the after art is fitted (centred, aspect kept) into the before
  // file's viewBox, the way the main panels fit both into one box, so one window covers the same part of both marks.
  const frame = intrinsicBox(parseXml(before));
  if (!frame) throw new MarkiloError('INVALID_SVG', 'The before file has no viewBox or size.');
  let body = '';
  let y = 0;
  zooms.forEach((z, i) => {
    const w = z.w * ZOOM_SCALE;
    const h = z.h * ZOOM_SCALE;
    const rowH = ZOOM_HEAD + ZOOM_CAPTION + h + ZOOM_PAD;
    const ink = isDark(background) ? '#c9ced8' : '#5b6170';
    body += `<g data-zoom="${i}"><rect x="0" y="${fmt(y)}" width="${fmt(width)}" height="${fmt(rowH)}" fill="${background}"/>`;
    body += label(z.label, ZOOM_PAD, y + 17, 11, ink);
    const panelY = y + ZOOM_HEAD + ZOOM_CAPTION;
    const xs = [ZOOM_PAD, ZOOM_PAD * 2 + w];
    body += label('Before', xs[0]!, panelY - 5, 10, ink);
    body += label('After', xs[1]!, panelY - 5, 10, ink);
    body += cropMarkup(before, frame, z, xs[0]!, panelY, 'before');
    body += cropMarkup(after, frame, z, xs[1]!, panelY, 'after');
    body += '</g>';
    y += rowH;
  });
  return { svg: body, height: y };
}

export function sheetSvg(
  rows: SheetRow[],
  sizes: number[],
  title?: string,
  aspect = 1,
  zoom?: { before: string; after: string; zooms: Zoom[]; background: string },
): string {
  const pad = 16;
  const labelH = 22;
  const max = Math.max(...sizes);
  const rowH = max + pad * 2 + labelH;
  const wide = (s: number) => Math.round(s * aspect);
  const zooms = zoom?.zooms ?? [];
  const width = Math.max(
    sizes.reduce((a, s) => a + wide(s) + pad, pad),
    zoomMinWidth(zooms),
  );
  const headerH = title ? 34 : 0;
  const rowsH = headerH + rows.length * rowH;
  const zoomed =
    zoom && zooms.length ? zoomRowsSvg(zoom.before, zoom.after, zooms, width, zoom.background) : undefined;
  const height = rowsH + (zoomed?.height ?? 0);
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
  if (zoomed) body += `<g transform="translate(0 ${fmt(rowsH)})">${zoomed.svg}</g>`;
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
  opts: { tile?: boolean; zooms?: Zoom[] } = {},
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
  if (opts.zooms?.length) {
    if (items.length !== 2)
      throw new MarkiloError('USAGE', '--zoom compares exactly two files: before, then after.');
    return sheetSvg(rows, sizes, title, 1, {
      before: items[0]!.svg,
      after: items[1]!.svg,
      zooms: opts.zooms,
      background: g.native,
    });
  }
  return sheetSvg(rows, sizes, title);
}

export async function renderCompareSheet(
  items: { label: string; svg: string }[],
  paper = '#ffffff',
  title = 'Options',
  palette?: GroundPalette,
  opts: { tile?: boolean; zooms?: Zoom[] } = {},
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
