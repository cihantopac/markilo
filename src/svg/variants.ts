import { normalizeColor } from '../analyze/color.js';
import { localName, parseXml, serializeXml, walk, type XmlElement } from './xml.js';

const PAINT = ['fill', 'stroke', 'stop-color'];

function rewriteStyle(style: string, map: (c: string) => string | undefined): string {
  return style
    .split(';')
    .map((decl) => {
      const idx = decl.indexOf(':');
      if (idx < 0) return decl;
      const prop = decl.slice(0, idx).trim().toLowerCase();
      if (!PAINT.includes(prop)) return decl;
      const c = normalizeColor(decl.slice(idx + 1));
      const next = c ? map(c) : undefined;
      return next ? `${prop}:${next}` : decl;
    })
    .join(';');
}

/** Applies a color mapping to every paint in the document. Gradients are flattened when `flatten` is set. */
export function recolorSvg(
  source: string,
  map: (hex: string) => string | undefined,
  opts: { flatten?: string } = {},
): string {
  const root = parseXml(source);
  const gradientIds = new Set<string>();
  walk(root, (el) => {
    const n = localName(el.name);
    if ((n === 'linearGradient' || n === 'radialGradient') && el.attrs.id) gradientIds.add(el.attrs.id);
  });
  walk(root, (el) => {
    for (const p of PAINT) {
      const v = el.attrs[p];
      if (!v) continue;
      if (opts.flatten && /^url\(#/.test(v)) {
        const id = /url\(#([^)]+)\)/.exec(v)?.[1];
        if (id && gradientIds.has(id)) el.attrs[p] = opts.flatten;
        continue;
      }
      const c = normalizeColor(v);
      const next = c ? map(c) : undefined;
      if (next) el.attrs[p] = next;
    }
    if (el.attrs.style) el.attrs.style = rewriteStyle(el.attrs.style, map);
  });
  // Root without explicit fill inherits black; make the mapping explicit so dark variants work.
  if (!hasAnyPaint(root)) root.attrs.fill = map('#000000') ?? '#000000';
  return serializeXml(root);
}

function hasAnyPaint(root: XmlElement): boolean {
  let found = false;
  walk(root, (el) => {
    if (el.attrs.fill || el.attrs.stroke || /fill|stroke/.test(el.attrs.style ?? '')) found = true;
  });
  return found;
}

/** Every visible paint becomes `color`; transparent areas stay transparent. */
export function monochrome(source: string, color: string): string {
  return recolorSvg(source, () => color, { flatten: color });
}

/** Explicit color substitution, e.g. for light-on-dark variants. Unmapped colors are kept. */
export function substitute(source: string, mapping: Record<string, string>): string {
  const norm: Record<string, string> = {};
  for (const [k, v] of Object.entries(mapping)) {
    const nk = normalizeColor(k);
    if (nk) norm[nk] = v;
  }
  return recolorSvg(source, (c) => norm[c]);
}
