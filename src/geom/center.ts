import { sampleFromSvg } from '../analyze/mark.js';
import { balanceOffset } from '../analyze/quality.js';
import { MarkiloError } from '../core/errors.js';
import { maskBBox, maskOf } from '../render/image.js';
import { renderSvg } from '../render/resvg.js';
import { fmt } from '../svg/compose.js';
import { intrinsicBox, parseXml, serializeXml, type XmlNode } from '../svg/xml.js';

/** Slightly high reads as optically centred (the balance check forgives up to 5% upward). */
const TARGET = { x: 0, y: -0.02 };
const PASSES = 3;
const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const KEEP_OUTSIDE = new Set(['title', 'desc', 'metadata', 'defs']);

function wrap(svg: string, dx: number, dy: number): string {
  const root = parseXml(svg);
  const outside: XmlNode[] = [];
  const inside: XmlNode[] = [];
  for (const c of root.children) {
    if (c.type === 'element' && KEEP_OUTSIDE.has(c.name)) outside.push(c);
    else inside.push(c);
  }
  root.children = [
    ...outside,
    {
      type: 'element',
      name: 'g',
      attrs: { transform: `translate(${fmt(dx)} ${fmt(dy)})` },
      children: inside,
    },
  ];
  return serializeXml(root);
}

/** True when any ink of `svg` falls outside its own viewBox (checked on a canvas three times as large). */
async function inkLeavesViewBox(svg: string): Promise<boolean> {
  const root = parseXml(svg);
  const vb = intrinsicBox(root);
  if (!vb) return false;
  root.attrs.viewBox = `${fmt(vb.x - vb.width)} ${fmt(vb.y - vb.height)} ${fmt(vb.width * 3)} ${fmt(vb.height * 3)}`;
  root.attrs.width = fmt(vb.width * 3);
  root.attrs.height = fmt(vb.height * 3);
  const width = 768;
  const r = await renderSvg(serializeXml(root), { width });
  const box = maskBBox(maskOf(r), 0.5);
  if (!box) return false;
  const k = r.width / 3;
  const slack = 1;
  return (
    box.x < k - slack ||
    box.y < r.height / 3 - slack ||
    box.x + box.w > 2 * k + slack ||
    box.y + box.h > (2 * r.height) / 3 + slack
  );
}

/**
 * Shifts a mark so its visual centroid sits at the optical centre. Path data is untouched: everything but
 * title/desc/metadata/defs moves into one translated group. `before`/`after` are the balance check's values.
 */
export async function centerOptically(
  svg: string,
): Promise<{ svg: string; dx: number; dy: number; before: number; after: number }> {
  const vb = intrinsicBox(parseXml(svg));
  if (!vb) throw new MarkiloError('INVALID_SVG', 'The SVG needs a viewBox (or width and height).');
  // Offsets are fractions of the rendered square, which spans the larger viewBox side.
  const side = Math.max(vb.width, vb.height);
  const measure = async (s: string) => (await sampleFromSvg(s, { id: 'center' })).features.centroidOffset;

  const first = await measure(svg);
  const before = round2(balanceOffset(first));
  let dx = 0;
  let dy = 0;
  let cur = svg;
  let o = first;
  for (let i = 0; i < PASSES; i++) {
    const sx = (TARGET.x - o.x) * side;
    const sy = (TARGET.y - o.y) * side;
    if (Math.hypot(sx, sy) < side * 0.001) break;
    dx = round4(dx + sx);
    dy = round4(dy + sy);
    cur = wrap(svg, dx, dy);
    o = await measure(cur);
  }
  if (dx === 0 && dy === 0) return { svg, dx: 0, dy: 0, before, after: before };
  if (await inkLeavesViewBox(cur)) {
    throw new MarkiloError(
      'INVALID_INPUT',
      `Centring needs a shift of (${fmt(dx)}, ${fmt(dy)}) but the mark would then leave its viewBox.`,
      'Add margin around the artwork (a larger viewBox) and try again.',
    );
  }
  return { svg: cur, dx, dy, before, after: round2(balanceOffset(o)) };
}
