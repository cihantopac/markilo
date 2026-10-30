import { localName, parseXml, serializeXml, type XmlElement, type XmlNode } from './xml.js';

const DROP = new Set([
  'script',
  'foreignObject',
  'iframe',
  'object',
  'embed',
  'audio',
  'video',
  'canvas',
  'handler',
  'listener',
]);
const EXTERNAL_URL = /url\(\s*['"]?\s*(?!#)[^)]*\)/gi;

function cleanElement(el: XmlElement): XmlElement | XmlNode[] | null {
  const name = localName(el.name);
  if (DROP.has(name)) return null;
  for (const k of Object.keys(el.attrs)) {
    const v = el.attrs[k]!;
    if (/^on/i.test(k)) delete el.attrs[k];
    else if (k === 'href' || k === 'xlink:href') {
      const ok =
        v.startsWith('#') || (name === 'image' && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(v));
      if (!ok) delete el.attrs[k];
    } else if (k === 'style') {
      el.attrs[k] = v
        .replace(EXTERNAL_URL, 'none')
        .replace(/@import[^;]*;?/gi, '')
        .replace(/expression\s*\(/gi, '');
    } else if (EXTERNAL_URL.test(v)) {
      el.attrs[k] = v.replace(EXTERNAL_URL, 'none');
    }
    EXTERNAL_URL.lastIndex = 0;
  }
  if (name === 'style') {
    el.children = el.children.map((c) =>
      c.type === 'text'
        ? { type: 'text', value: c.value.replace(/@import[^;]*;?/gi, '').replace(EXTERNAL_URL, 'none') }
        : c,
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
  // Links are unwrapped: their drawing is kept, the navigation is not.
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
