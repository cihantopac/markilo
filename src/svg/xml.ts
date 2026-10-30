import { MarkiloError } from '../core/errors.js';

/** Minimal, dependency-free XML tree for SVG inspection and rewriting. */
export interface XmlElement {
  type: 'element';
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}
export interface XmlText {
  type: 'text';
  value: string;
}
export type XmlNode = XmlElement | XmlText;

const NAME = /[A-Za-z_:][-A-Za-z0-9_:.]*/y;
const ATTR = /\s*([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/y;

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
    if (e[0] === '#')
      return String.fromCodePoint(e[1] === 'x' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e] ?? '';
  });
}

export const escapeAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const escapeText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Parses an XML document and returns the root element.
 * DOCTYPE declarations are rejected outright: they enable entity expansion attacks and SVG never needs them.
 */
export const XML_LIMITS = { maxBytes: 10_000_000, maxDepth: 256, maxElements: 200_000 };

export function parseXml(src: string): XmlElement {
  if (src.length > XML_LIMITS.maxBytes) {
    throw new MarkiloError('INVALID_SVG', `SVG is larger than ${XML_LIMITS.maxBytes / 1_000_000} MB.`);
  }
  let elements = 0;
  let i = 0;
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  const fail = (msg: string): never => {
    const line = src.slice(0, i).split('\n').length;
    throw new MarkiloError('INVALID_SVG', `XML parse error at line ${line}: ${msg}`);
  };
  const push = (node: XmlNode) => {
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
  };

  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      const text = src.slice(i);
      if (text.trim() && stack.length) push({ type: 'text', value: decodeEntities(text) });
      else if (text.trim()) fail('text outside the root element');
      break;
    }
    if (lt > i) {
      const text = src.slice(i, lt);
      if (stack.length) push({ type: 'text', value: decodeEntities(text) });
      else if (text.trim()) fail('text outside the root element');
    }
    i = lt;
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      if (end === -1) fail('unterminated comment');
      i = end + 3;
    } else if (src.startsWith('<![CDATA[', i)) {
      const end = src.indexOf(']]>', i + 9);
      if (end === -1) fail('unterminated CDATA');
      if (stack.length) push({ type: 'text', value: src.slice(i + 9, end) });
      i = end + 3;
    } else if (src.startsWith('<?', i)) {
      const end = src.indexOf('?>', i + 2);
      if (end === -1) fail('unterminated processing instruction');
      i = end + 2;
    } else if (src.startsWith('<!', i)) {
      fail('DOCTYPE and entity declarations are not allowed in SVG input');
    } else if (src[i + 1] === '/') {
      i += 2;
      NAME.lastIndex = i;
      const m = NAME.exec(src);
      if (!m) fail('bad closing tag');
      const name = m![0];
      i = NAME.lastIndex;
      const gt = src.indexOf('>', i);
      if (gt === -1) fail('unterminated closing tag');
      i = gt + 1;
      const open = stack.pop();
      if (!open || open.name !== name) fail(`mismatched </${name}>`);
    } else {
      i += 1;
      NAME.lastIndex = i;
      const m = NAME.exec(src);
      if (!m) fail('bad tag name');
      if (++elements > XML_LIMITS.maxElements) fail(`more than ${XML_LIMITS.maxElements} elements`);
      if (stack.length >= XML_LIMITS.maxDepth) fail(`nesting deeper than ${XML_LIMITS.maxDepth} levels`);
      const el: XmlElement = { type: 'element', name: m![0], attrs: {}, children: [] };
      i = NAME.lastIndex;
      for (;;) {
        ATTR.lastIndex = i;
        const a = ATTR.exec(src);
        if (!a) break;
        el.attrs[a[1]!] = decodeEntities(a[3] ?? a[4] ?? '');
        i = ATTR.lastIndex;
      }
      while (src[i] === ' ' || src[i] === '\n' || src[i] === '\t' || src[i] === '\r') i++;
      let selfClosing = false;
      if (src.startsWith('/>', i)) {
        selfClosing = true;
        i += 2;
      } else if (src[i] === '>') {
        i += 1;
      } else {
        fail(`malformed attributes in <${el.name}>`);
      }
      if (stack.length) push(el);
      else if (root) fail('multiple root elements');
      else root = el;
      if (!selfClosing) stack.push(el);
    }
  }
  if (stack.length) fail(`unclosed <${stack[stack.length - 1]!.name}>`);
  if (!root) fail('empty document');
  return root!;
}

export function serializeXml(el: XmlElement, indent = ''): string {
  const attrs = Object.entries(el.attrs)
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('');
  if (!el.children.length) return `${indent}<${el.name}${attrs}/>`;
  const onlyText = el.children.every((c) => c.type === 'text');
  if (onlyText) {
    const text = el.children.map((c) => escapeText((c as XmlText).value)).join('');
    return `${indent}<${el.name}${attrs}>${text}</${el.name}>`;
  }
  const inner = el.children
    .filter((c) => c.type === 'element' || c.value.trim())
    .map((c) =>
      c.type === 'element' ? serializeXml(c, `${indent}  `) : `${indent}  ${escapeText(c.value.trim())}`,
    )
    .join('\n');
  return `${indent}<${el.name}${attrs}>\n${inner}\n${indent}</${el.name}>`;
}

export function walk(
  el: XmlElement,
  visit: (el: XmlElement, parents: XmlElement[]) => void,
  parents: XmlElement[] = [],
): void {
  visit(el, parents);
  for (const c of el.children) if (c.type === 'element') walk(c, visit, [...parents, el]);
}

export const localName = (name: string): string => name.slice(name.indexOf(':') + 1);

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function parseViewBox(root: XmlElement): ViewBox | undefined {
  const raw = root.attrs.viewBox;
  if (!raw) return undefined;
  const n = raw
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x)) || n[2]! <= 0 || n[3]! <= 0) return undefined;
  return { x: n[0]!, y: n[1]!, width: n[2]!, height: n[3]! };
}

/** viewBox or, failing that, numeric width/height. */
export function intrinsicBox(root: XmlElement): ViewBox | undefined {
  const vb = parseViewBox(root);
  if (vb) return vb;
  const w = Number.parseFloat(root.attrs.width ?? '');
  const h = Number.parseFloat(root.attrs.height ?? '');
  if (w > 0 && h > 0) return { x: 0, y: 0, width: w, height: h };
  return undefined;
}

/** Returns the inner markup of the root <svg> (children serialized), for nesting into compositions. */
export function innerMarkup(root: XmlElement): string {
  return root.children.map((c) => (c.type === 'element' ? serializeXml(c) : escapeText(c.value))).join('\n');
}
