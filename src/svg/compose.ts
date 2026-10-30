import { MarkiloError } from '../core/errors.js';
import { escapeAttr, intrinsicBox, parseXml, serializeXml, walk, type XmlElement } from './xml.js';

/** Rewrites every id (and every reference to it) with a prefix so several copies can share one document. */
export function prefixIds(root: XmlElement, prefix: string): void {
  const ids = new Set<string>();
  walk(root, (el) => {
    if (el.attrs.id) ids.add(el.attrs.id);
  });
  if (!ids.size) return;
  walk(root, (el) => {
    for (const [k, v] of Object.entries(el.attrs)) {
      if (k === 'id' && ids.has(v)) el.attrs[k] = `${prefix}${v}`;
      else if ((k === 'href' || k === 'xlink:href') && v.startsWith('#') && ids.has(v.slice(1)))
        el.attrs[k] = `#${prefix}${v.slice(1)}`;
      else if (v.includes('url(#'))
        el.attrs[k] = v.replace(/url\(\s*#([^)\s]+)\s*\)/g, (m, id: string) =>
          ids.has(id) ? `url(#${prefix}${id})` : m,
        );
    }
  });
}

export interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
}

let counter = 0;

/**
 * Places `source` inside the given box (aspect preserved, centered) as a <g transform> group.
 * Groups instead of nested <svg> elements keep the output portable: design tools and optimizers
 * handle transforms reliably, while nested viewports are often flattened or mis-sized.
 */
export function nestSvg(
  source: string,
  box: Placement,
  opts: { idPrefix?: string; extraAttrs?: Record<string, string> } = {},
): string {
  const root = parseXml(source);
  const vb = intrinsicBox(root);
  if (!vb) throw new MarkiloError('INVALID_SVG', 'Cannot place an SVG without viewBox or width/height.');
  prefixIds(root, opts.idPrefix ?? `m${++counter}-`);
  const keep: Record<string, string> = {};
  for (const [k, v] of Object.entries(root.attrs)) {
    if (
      [
        'width',
        'height',
        'x',
        'y',
        'viewBox',
        'xmlns',
        'xmlns:xlink',
        'version',
        'style',
        'preserveAspectRatio',
      ].includes(k)
    )
      continue;
    if (k.startsWith('data-')) continue;
    keep[k] = v;
  }
  const s = Math.min(box.width / vb.width, box.height / vb.height);
  const tx = box.x + (box.width - vb.width * s) / 2 - vb.x * s;
  const ty = box.y + (box.height - vb.height * s) / 2 - vb.y * s;
  const group: XmlElement = {
    type: 'element',
    name: 'g',
    attrs: {
      ...keep,
      transform: `matrix(${fmt(s)} 0 0 ${fmt(s)} ${fmt(tx)} ${fmt(ty)})`,
      ...(opts.extraAttrs ?? {}),
    },
    children: root.children.filter((c) => c.type !== 'element' || c.name !== 'title'),
  };
  return serializeXml(group);
}

export function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/\.?0+$/, '');
}

export function svgDocument(
  width: number,
  height: number,
  body: string,
  opts: { background?: string; title?: string } = {},
): string {
  const bg = opts.background
    ? `<rect width="${fmt(width)}" height="${fmt(height)}" fill="${escapeAttr(opts.background)}"/>`
    : '';
  const title = opts.title ? `<title>${escapeAttr(opts.title)}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}" height="${fmt(height)}" viewBox="0 0 ${fmt(width)} ${fmt(height)}">${title}${bg}${body}</svg>`;
}

export function aspectOf(source: string): number {
  const vb = intrinsicBox(parseXml(source));
  if (!vb) throw new MarkiloError('INVALID_SVG', 'SVG has no viewBox or size.');
  return vb.width / vb.height;
}
