import { normalizeColor } from '../analyze/color.js';
import { localName, parseViewBox, parseXml, walk, type XmlElement } from './xml.js';

export type Severity = 'error' | 'warning' | 'info';

export interface LintIssue {
  rule: string;
  severity: Severity;
  message: string;
}

export interface SvgStats {
  bytes: number;
  elements: number;
  paths: number;
  pathCommands: number;
  colors: string[];
  hasGradients: boolean;
  hasStrokes: boolean;
  hasText: boolean;
  hasFilters: boolean;
  viewBox: string | null;
}

export interface LintResult {
  ok: boolean;
  issues: LintIssue[];
  stats: SvgStats;
}

export interface LintOptions {
  /** Master files are held to a stricter standard: no live text, no filters, no opacity tricks. */
  master?: boolean;
}

const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line']);
const DRAWABLE = new Set([...SHAPES, 'text', 'use']);
const PAINT_ATTRS = ['fill', 'stroke', 'stop-color', 'color', 'flood-color'];

function styleDecls(style: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (style ?? '').split(';')) {
    const idx = part.indexOf(':');
    if (idx > 0) out[part.slice(0, idx).trim().toLowerCase()] = part.slice(idx + 1).trim();
  }
  return out;
}

/** Paint value of an element from attributes or inline style (style wins, as in CSS). */
export function paintOf(el: XmlElement, prop: string): string | undefined {
  return styleDecls(el.attrs.style)[prop] ?? el.attrs[prop];
}

export function lintSvg(source: string, opts: LintOptions = {}): LintResult {
  const issues: LintIssue[] = [];
  const add = (rule: string, severity: Severity, message: string) => issues.push({ rule, severity, message });
  const stats: SvgStats = {
    bytes: Buffer.byteLength(source),
    elements: 0,
    paths: 0,
    pathCommands: 0,
    colors: [],
    hasGradients: false,
    hasStrokes: false,
    hasText: false,
    hasFilters: false,
    viewBox: null,
  };

  let root: XmlElement;
  try {
    root = parseXml(source);
  } catch (err) {
    add('parse', 'error', (err as Error).message);
    return { ok: false, issues, stats };
  }

  if (localName(root.name) !== 'svg') add('root', 'error', `Root element is <${root.name}>, expected <svg>.`);
  const vb = parseViewBox(root);
  if (!vb) add('viewbox', 'error', 'Missing or invalid viewBox; the mark cannot scale predictably.');
  else {
    stats.viewBox = `${vb.x} ${vb.y} ${vb.width} ${vb.height}`;
    if (opts.master && vb.width !== vb.height && root.attrs['data-markilo-role'] === 'symbol')
      add(
        'viewbox-square',
        'warning',
        'Symbol masters should use a square viewBox so icon exports stay centered.',
      );
  }

  const ids = new Map<string, number>();
  const refs: string[] = [];
  const colors = new Set<string>();
  let opacityUsed = false;
  let drawables = 0;

  walk(root, (el) => {
    stats.elements++;
    const name = localName(el.name);
    // In lower case: an SVG inlined into HTML is parsed case-insensitively, so <SCRIPT> runs like <script>.
    const lower = name.toLowerCase();
    if (el.attrs.id) ids.set(el.attrs.id, (ids.get(el.attrs.id) ?? 0) + 1);

    if (lower === 'script') add('no-script', 'error', '<script> is not allowed in brand assets.');
    if (lower === 'foreignobject')
      add('no-foreign-object', 'error', '<foreignObject> embeds HTML and is not portable.');
    if (['iframe', 'object', 'embed', 'audio', 'video', 'canvas', 'handler', 'listener'].includes(lower))
      add('no-active-content', 'error', `<${name}> is active content and is not allowed in brand assets.`);
    if (name === 'image') {
      const href = el.attrs.href ?? el.attrs['xlink:href'] ?? '';
      add(
        'no-raster',
        'error',
        href.startsWith('data:image/svg')
          ? '<image> with an embedded SVG; inline the vector content instead.'
          : '<image> embeds raster or external content. Markilo masters must be pure vector.',
      );
    }
    if (name === 'text' || name === 'tspan' || name === 'textPath') {
      stats.hasText = true;
    }
    if (name === 'style') {
      const css = el.children.map((c) => (c.type === 'text' ? c.value : '')).join('');
      if (/@import|url\(\s*['"]?(?:https?:|\/\/)/i.test(css))
        add('no-external', 'error', '<style> loads external resources.');
      if (/@font-face/i.test(css)) add('no-webfont', 'error', '@font-face in SVG; outline text instead.');
      add(
        'prefer-attributes',
        'info',
        '<style> block found; presentation attributes are more portable across tools.',
      );
    }
    if (name === 'linearGradient' || name === 'radialGradient') stats.hasGradients = true;
    if (name === 'filter' || name.startsWith('fe')) stats.hasFilters = true;
    if (name === 'path') {
      stats.paths++;
      stats.pathCommands += (el.attrs.d ?? '').match(/[MLHVCSQTAZmlhvcsqtaz]/g)?.length ?? 0;
    }
    if (DRAWABLE.has(name)) drawables++;

    for (const [k, v] of Object.entries(el.attrs)) {
      if (/^on/i.test(k)) add('no-event-handlers', 'error', `Event handler attribute "${k}" on <${name}>.`);
      if (k === 'href' || k === 'xlink:href') {
        if (v.startsWith('#')) refs.push(v.slice(1));
        else if (name !== 'image' && !v.startsWith('data:'))
          add('no-external', 'error', `<${name}> references an external resource (${v.slice(0, 60)}).`);
        else if (name !== 'image' && /^data:/i.test(v))
          add('no-external', 'error', `<${name}> uses a data: URI reference.`);
      }
      for (const m of v.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
        const target = m[1]!;
        if (target.startsWith('#')) refs.push(target.slice(1));
        else add('no-external', 'error', `url(${target.slice(0, 60)}) points outside the document.`);
      }
    }

    for (const prop of PAINT_ATTRS) {
      const value = paintOf(el, prop);
      if (!value) continue;
      const c = normalizeColor(value);
      if (c) colors.add(c);
    }
    const stroke = paintOf(el, 'stroke');
    if (stroke && stroke !== 'none') {
      stats.hasStrokes = true;
      const width = Number.parseFloat(paintOf(el, 'stroke-width') ?? '1');
      if (vb && width > 0 && width < Math.max(vb.width, vb.height) / 96) {
        add(
          'thin-stroke',
          'warning',
          `Stroke width ${width} is under 1/96 of the artboard and will vanish at favicon sizes.`,
        );
      }
    }
    const op = Number.parseFloat(paintOf(el, 'opacity') ?? paintOf(el, 'fill-opacity') ?? '1');
    if (op < 1) opacityUsed = true;
  });

  for (const [id, n] of ids) if (n > 1) add('unique-ids', 'error', `id="${id}" is used ${n} times.`);
  for (const r of new Set(refs))
    if (!ids.has(r)) add('broken-reference', 'error', `Reference to missing id "#${r}".`);
  if (drawables === 0) add('empty', 'error', 'The SVG draws nothing.');

  stats.colors = [...colors].sort();
  if (stats.hasText) {
    add(
      'outline-text',
      opts.master ? 'error' : 'warning',
      'Live <text> depends on installed fonts. Convert to outlines (markilo wordmark) for master files.',
    );
  }
  if (stats.hasFilters) {
    add(
      'no-filters',
      opts.master ? 'error' : 'warning',
      'Filters (blur, shadow) do not survive small sizes, print or embroidery.',
    );
  }
  if (opacityUsed)
    add('opacity', 'warning', 'Transparency makes single-color reproduction ambiguous; prefer solid fills.');
  if (stats.hasGradients) add('gradients', 'info', 'Gradients used; make sure a flat-color version exists.');
  if (stats.colors.length > 4)
    add('color-count', 'warning', `${stats.colors.length} colors; most enduring marks use 1–3.`);
  if (stats.pathCommands > 600)
    add('complexity', 'warning', `${stats.pathCommands} path commands; consider simplifying.`);
  if (stats.bytes > 40_000)
    add('file-size', 'warning', `${Math.round(stats.bytes / 1024)} KB; run "markilo svg optimize".`);
  if (/\d\.\d{5,}/.test(source))
    add('precision', 'info', 'Coordinates with 5+ decimals; optimize to reduce size.');

  return { ok: !issues.some((i) => i.severity === 'error'), issues, stats };
}
