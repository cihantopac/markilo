import type { GroundPalette } from '../export/variants.js';
import { nestSvg, svgDocument } from '../svg/compose.js';
import { intrinsicBox, parseXml } from '../svg/xml.js';
import { type BoardLang, boardText } from '../ui/board-text.js';
import { decodeImage, encodePng } from './png.js';
import { renderPng } from './resvg.js';
import { label, smallCompareSheetSvg } from './sheet.js';

/** The sizes the original and the refreshed mark are compared at: the artwork, an app icon, a tab and a favicon. */
export const REFRESH_SIZES = [512, 64, 32, 16];

/** Every label the refresh board draws (each has a Turkish entry in src/ui/tr.ts). */
export const REFRESH_BOARD_LABELS = [
  'Refresh',
  'Original',
  'Rebuild',
  'Trace',
  'IoU {0} against the original',
  'The rebuild fell below --min-iou {0}: the trace is kept',
  'Kept as it is',
  'The rebuild fell below --min-iou {0}: the original is kept',
  'Lockups',
  'Horizontal',
  'Stacked',
  'Small sizes',
] as const;

type Label = (typeof REFRESH_BOARD_LABELS)[number];

/** What a refresh keeps: the rebuild, the trace of a raster, or an SVG original as it is (its rebuild was refused). */
export type RefreshKept = 'rebuild' | 'trace' | 'original';

const KEPT_CAPTION: Record<RefreshKept, Label> = {
  rebuild: 'Rebuild',
  trace: 'Trace',
  original: 'Kept as it is',
};

/** A board label in `lang`, through the boards' shared text helper. */
const say = (en: Label, lang: BoardLang, vars?: (string | number)[]) => boardText(en, lang, vars);

/** A raster (PNG, JPEG or WebP) as an SVG document of its own size, so it is placed like any mark. */
export function rasterSvg(bytes: Uint8Array): string {
  const img = decodeImage(bytes);
  const href = `data:image/png;base64,${encodePng(img).toString('base64')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${img.width} ${img.height}"><image href="${href}" x="0" y="0" width="${img.width}" height="${img.height}"/></svg>`;
}

export interface RefreshBoardInput {
  /** The owner's current mark (an SVG, or a raster wrapped by `rasterSvg`). */
  original: string;
  /** The drawing the refresh keeps: the rebuild, or the trace when the rebuild fell below the bar. */
  refreshed: string;
  kept: RefreshKept;
  iou: number;
  minIou?: number;
  /** The brand name. */
  title: string;
  lockups?: { layout: 'horizontal' | 'stacked'; svg: string }[];
  /** The small-size board (Task 5's): the main symbol above the small version. */
  small?: { main: string; small: string; palette?: GroundPalette };
}

const PAD = 24;
const BIG = REFRESH_SIZES[0]!;
const INK = '#30343c';
const MUTED = '#5b6170';
const LINE = '#d5d8de';

/**
 * The refresh on one board: the original and the kept drawing side by side at 512, 64, 32 and 16 px with the IoU
 * between them, then the lockups, then the small-size board. Every label goes through the sheets' label helper.
 */
export function refreshBoardSvg(input: RefreshBoardInput, lang: BoardLang = 'en'): string {
  const colW = BIG;
  const width = PAD * 3 + colW * 2;
  let body = label(`${input.title} — ${say('Refresh', lang)}`, PAD, 30, 18, INK);
  let y = 48;
  const columns = [
    { caption: say('Original', lang), svg: input.original, side: 'original' },
    {
      caption: `${say(KEPT_CAPTION[input.kept], lang)} · ${say('IoU {0} against the original', lang, [input.iou])}`,
      svg: input.refreshed,
      side: input.kept,
    },
  ];
  columns.forEach((col, i) => {
    body += label(col.caption, PAD + i * (colW + PAD), y + 16, 13, INK);
  });
  y += 24;
  if (input.kept !== 'rebuild') {
    body += label(
      say(
        input.kept === 'trace'
          ? 'The rebuild fell below --min-iou {0}: the trace is kept'
          : 'The rebuild fell below --min-iou {0}: the original is kept',
        lang,
        [input.minIou ?? 0.95],
      ),
      PAD + colW + PAD,
      y + 12,
      11,
      MUTED,
    );
    y += 18;
  }
  const smalls = REFRESH_SIZES.slice(1);
  const rowH = Math.max(...smalls);
  columns.forEach((col, i) => {
    const x0 = PAD + i * (colW + PAD);
    body += `<g data-refresh="${col.side}"><rect x="${x0}" y="${y}" width="${colW}" height="${BIG}" fill="#ffffff" stroke="${LINE}"/>`;
    body += nestSvg(col.svg, { x: x0, y, width: colW, height: BIG });
    let x = x0;
    for (const s of smalls) {
      body += nestSvg(col.svg, { x, y: y + BIG + PAD + (rowH - s), width: s, height: s });
      x += s + PAD;
    }
    body += label(`${smalls.join(' / ')} px`, x, y + BIG + PAD + rowH - 2, 11, MUTED);
    body += '</g>';
  });
  y += BIG + PAD + rowH + PAD * 2;

  if (input.lockups?.length) {
    body += label(say('Lockups', lang), PAD, y, 15, INK);
    y += PAD / 2;
    for (const l of input.lockups) {
      const h = l.layout === 'horizontal' ? 120 : 220;
      body += label(say(l.layout === 'horizontal' ? 'Horizontal' : 'Stacked', lang), PAD, y + 16, 11, MUTED);
      y += 24;
      body += `<rect x="${PAD}" y="${y}" width="${width - PAD * 2}" height="${h}" fill="#ffffff" stroke="${LINE}"/>`;
      body += nestSvg(l.svg, { x: PAD * 2, y: y + PAD, width: width - PAD * 4, height: h - PAD * 2 });
      y += h + PAD;
    }
    y += PAD;
  }

  if (input.small) {
    const sheet = smallCompareSheetSvg(input.small.main, input.small.small, {
      ...(input.small.palette ? { palette: input.small.palette } : {}),
      title: say('Small sizes', lang),
      lang,
    });
    const box = intrinsicBox(parseXml(sheet))!;
    const s = Math.min(1, (width - PAD * 2) / box.width);
    body += nestSvg(sheet, { x: PAD, y, width: box.width * s, height: box.height * s });
    y += box.height * s + PAD;
  }
  return svgDocument(width, Math.ceil(y), body, { background: '#ffffff' });
}

export async function renderRefreshBoard(input: RefreshBoardInput, lang: BoardLang = 'en'): Promise<Buffer> {
  const svg = refreshBoardSvg(input, lang);
  return renderPng(svg, { width: Number(/width="([\d.]+)"/.exec(svg)![1]) });
}
