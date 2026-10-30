import type { Font, PathCommand } from 'fontkit';
import { MarkiloError } from '../core/errors.js';
import { fmt } from '../svg/compose.js';
import { escapeAttr, escapeText } from '../svg/xml.js';
import type { FontFace } from './fonts.js';

export interface OutlineOptions {
  /** Em size in output units. */
  size?: number;
  /** Extra letter spacing in thousandths of an em (−50 tight … +200 airy). */
  tracking?: number;
  case?: 'as-is' | 'lower' | 'upper';
  /** Disable standard ligatures (fi, fl); logos usually want explicit letterforms. */
  ligatures?: boolean;
  /** Turkish-aware casing for i/İ/ı/I. */
  locale?: string;
}

export interface OutlinedText {
  /** One path per glyph, in output units, y-down, baseline at y = 0. */
  glyphs: { char: string; d: string }[];
  advance: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  metrics: { capHeight: number; xHeight: number; ascent: number; descent: number };
  fontLabel: string;
}

function transformCommands(cmds: PathCommand[], scale: number, dx: number): string {
  const p = (x: number, y: number) => `${fmt(round(dx + x * scale))} ${fmt(round(-y * scale))}`;
  let d = '';
  for (const c of cmds) {
    const a = c.args;
    switch (c.command) {
      case 'moveTo':
        d += `M${p(a[0]!, a[1]!)}`;
        break;
      case 'lineTo':
        d += `L${p(a[0]!, a[1]!)}`;
        break;
      case 'quadraticCurveTo':
        d += `Q${p(a[0]!, a[1]!)} ${p(a[2]!, a[3]!)}`;
        break;
      case 'bezierCurveTo':
        d += `C${p(a[0]!, a[1]!)} ${p(a[2]!, a[3]!)} ${p(a[4]!, a[5]!)}`;
        break;
      case 'closePath':
        d += 'Z';
        break;
    }
  }
  return d;
}

const round = (n: number) => Math.round(n * 100) / 100;

function applyCase(text: string, mode: OutlineOptions['case'], locale?: string): string {
  if (mode === 'upper') return text.toLocaleUpperCase(locale);
  if (mode === 'lower') return text.toLocaleLowerCase(locale);
  return text;
}

/** Splits text into runs that each use the first subset file that has all of the run's glyphs. */
function runs(face: FontFace, text: string): { font: Font; text: string }[] {
  const out: { font: Font; text: string }[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const font = face.faces.find((f) => f.hasGlyphForCodePoint(cp));
    if (!font) {
      if (/\s/.test(ch) && out.length) {
        out[out.length - 1]!.text += ch;
        continue;
      }
      throw new MarkiloError(
        'INVALID_INPUT',
        `${face.label} has no glyph for "${ch}" (U+${cp.toString(16).toUpperCase()}).`,
      );
    }
    const last = out[out.length - 1];
    if (last && last.font === font) last.text += ch;
    else out.push({ font, text: ch });
  }
  return out;
}

/** Converts text to glyph outlines with real kerning (GPOS) and optional tracking. */
export function outlineText(face: FontFace, text: string, opts: OutlineOptions = {}): OutlinedText {
  const size = opts.size ?? 100;
  const content = applyCase(text, opts.case, opts.locale);
  if (!content.trim()) throw new MarkiloError('INVALID_INPUT', 'Text is empty.');
  const primary = face.faces[0]!;
  const features = opts.ligatures === false ? { liga: false, clig: false, dlig: false } : undefined;
  const glyphs: OutlinedText['glyphs'] = [];
  const bbox = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  let x = 0;
  const tracking = ((opts.tracking ?? 0) / 1000) * size;
  const chars = [...content];
  let idx = 0;
  for (const run of runs(face, content)) {
    const scale = size / run.font.unitsPerEm;
    const laid = features ? run.font.layout(run.text, features) : run.font.layout(run.text);
    laid.glyphs.forEach((g, i) => {
      const pos = laid.positions[i]!;
      const gx = x + pos.xOffset * scale;
      const d = transformCommands(g.path.commands, scale, gx);
      const char = g.codePoints.length ? String.fromCodePoint(...g.codePoints) : (chars[idx] ?? '');
      idx += Math.max(1, g.codePoints.length);
      if (d) {
        glyphs.push({ char, d });
        bbox.minX = Math.min(bbox.minX, gx + g.bbox.minX * scale);
        bbox.maxX = Math.max(bbox.maxX, gx + g.bbox.maxX * scale);
        bbox.minY = Math.min(bbox.minY, -g.bbox.maxY * scale);
        bbox.maxY = Math.max(bbox.maxY, -g.bbox.minY * scale);
      }
      x += pos.xAdvance * scale + tracking;
    });
  }
  x -= tracking;
  const s = size / primary.unitsPerEm;
  return {
    glyphs,
    advance: x,
    bbox,
    metrics: {
      capHeight: primary.capHeight * s,
      xHeight: primary.xHeight * s,
      ascent: primary.ascent * s,
      descent: primary.descent * s,
    },
    fontLabel: face.label,
  };
}

export interface WordmarkOptions extends OutlineOptions {
  color?: string;
  title?: string;
}

/**
 * Produces an outlined wordmark SVG. The viewBox is the tight ink box; typographic metrics are kept as
 * data attributes so lockups can align the symbol to cap height and baseline.
 */
export function wordmarkSvg(face: FontFace, text: string, opts: WordmarkOptions = {}): string {
  const o = outlineText(face, text, opts);
  const { minX, minY, maxX, maxY } = o.bbox;
  const w = maxX - minX;
  const h = maxY - minY;
  const color = opts.color ?? '#111111';
  const paths = o.glyphs.map((g) => `  <path data-char="${escapeAttr(g.char)}" d="${g.d}"/>`).join('\n');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(round(minX))} ${fmt(round(minY))} ${fmt(round(w))} ${fmt(round(h))}"`,
    `  data-markilo-role="wordmark" data-font="${escapeAttr(o.fontLabel)}" data-baseline="0"`,
    `  data-cap-height="${fmt(round(o.metrics.capHeight))}" data-x-height="${fmt(round(o.metrics.xHeight))}">`,
    `  <title>${escapeText(opts.title ?? text)}</title>`,
    `  <g fill="${escapeAttr(color)}">`,
    paths,
    '  </g>',
    '</svg>',
    '',
  ].join('\n');
}

/** Small helper for labels inside generated images (contact sheets, social cards) without relying on fonts. */
export function textPathMarkup(
  face: FontFace,
  text: string,
  x: number,
  baselineY: number,
  size: number,
  fill: string,
  opts: OutlineOptions = {},
): { markup: string; width: number } {
  const o = outlineText(face, text, { ...opts, size });
  const d = o.glyphs.map((g) => g.d).join('');
  return {
    markup: `<path transform="translate(${fmt(x)} ${fmt(baselineY)})" fill="${escapeAttr(fill)}" d="${d}"/>`,
    width: o.advance,
  };
}
