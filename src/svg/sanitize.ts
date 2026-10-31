import { localName, parseXml, serializeXml, type XmlElement, type XmlNode } from './xml.js';

/**
 * The SVG elements a logo can be drawn with. Everything else is dropped with its content: scripts, foreign HTML,
 * frames, media and any element this list does not name. Names are compared in lower case, because the gallery and
 * the guidelines inline SVG into HTML, whose parser lowercases names (`<SCRIPT>` runs there just like `<script>`).
 */
const ALLOWED = new Set(
  [
    'svg',
    'g',
    'defs',
    'symbol',
    'use',
    'title',
    'desc',
    'metadata',
    'path',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'text',
    'tspan',
    'textPath',
    'image',
    'linearGradient',
    'radialGradient',
    'stop',
    'clipPath',
    'mask',
    'pattern',
    'marker',
    'filter',
    'feBlend',
    'feColorMatrix',
    'feComponentTransfer',
    'feComposite',
    'feFlood',
    'feGaussianBlur',
    'feMerge',
    'feMergeNode',
    'feMorphology',
    'feOffset',
    'feFuncR',
    'feFuncG',
    'feFuncB',
    'feFuncA',
    'feDropShadow',
    'style',
    // Links are unwrapped below: the drawing inside is kept, the navigation is not.
    'a',
  ].map((n) => n.toLowerCase()),
);
const EXTERNAL_URL = /url\(\s*['"]?\s*(?!#)[^)]*\)/gi;
/** CSS that can reach outside the file in ways a url() rewrite does not catch: escapes, image-set, imports. */
const RISKY_CSS = /\\|image-set\s*\(|@import|expression\s*\(|behavio(u)?r\s*:|-moz-binding/i;

function cleanElement(el: XmlElement): XmlElement | XmlNode[] | null {
  const name = localName(el.name).toLowerCase();
  if (!ALLOWED.has(name)) return null;
  for (const k of Object.keys(el.attrs)) {
    const v = el.attrs[k]!;
    const key = k.toLowerCase();
    if (/^on/.test(key) || key === 'xml:base') delete el.attrs[k];
    else if (key === 'href' || key.endsWith(':href')) {
      const ok =
        v.startsWith('#') || (name === 'image' && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(v));
      if (!ok) delete el.attrs[k];
    } else if (key === 'style') {
      if (RISKY_CSS.test(v)) delete el.attrs[k];
      else el.attrs[k] = v.replace(EXTERNAL_URL, 'none');
    } else if (EXTERNAL_URL.test(v) || /\\/.test(v)) {
      el.attrs[k] = v.replace(EXTERNAL_URL, 'none').replace(/\\/g, '');
    }
    EXTERNAL_URL.lastIndex = 0;
  }
  if (name === 'style') {
    el.children = el.children.flatMap((c) =>
      c.type === 'text'
        ? RISKY_CSS.test(c.value)
          ? []
          : [{ type: 'text' as const, value: c.value.replace(EXTERNAL_URL, 'none') }]
        : [],
    );
  }
  const kids: XmlNode[] = [];
  for (const c of el.children) {
    if (c.type === 'text') {
      kids.push(c);
      continue;
    }
    const r = cleanElement(c);
    if (r === null) continue;
    if (Array.isArray(r)) kids.push(...r);
    else kids.push(r);
  }
  el.children = kids;
  if (name === 'a') return kids;
  return el;
}

/** Removes active content from an SVG tree: scripts, event handlers, foreign content, links and external references. */
export function sanitizeTree(root: XmlElement): XmlElement {
  const r = cleanElement(root);
  return r && !Array.isArray(r) ? r : { type: 'element', name: 'svg', attrs: root.attrs, children: [] };
}

export function sanitizeSvg(source: string): string {
  return serializeXml(sanitizeTree(parseXml(source)));
}
