import { describe, expect, it } from 'vitest';
import { nestSvg, prefixIds } from '../src/svg/compose.js';
import { lintSvg } from '../src/svg/lint.js';
import { optimizeSvg } from '../src/svg/optimize.js';
import { monochrome, substitute } from '../src/svg/variants.js';
import { parseXml, serializeXml } from '../src/svg/xml.js';

const ok =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#123456"/></svg>';
const rules = (svg: string, master = false) =>
  lintSvg(svg, { master }).issues.map((i) => `${i.severity}:${i.rule}`);

describe('xml', () => {
  it('parses and round-trips', () => {
    const root = parseXml('<?xml version="1.0"?><!-- c --><svg a="1 &amp; 2"><g><path d="M0 0"/></g></svg>');
    expect(root.attrs.a).toBe('1 & 2');
    expect(serializeXml(root)).toContain('a="1 &amp; 2"');
  });
  it('rejects DOCTYPE / entity declarations (XXE, billion laughs)', () => {
    expect(() => parseXml('<!DOCTYPE svg [<!ENTITY x "y">]><svg>&x;</svg>')).toThrow(/DOCTYPE/);
  });
  it('reports malformed documents', () => {
    expect(() => parseXml('<svg><g></svg>')).toThrow(/mismatched/);
    expect(() => parseXml('<svg/><svg/>')).toThrow(/multiple root/);
  });
});

describe('lint', () => {
  it('accepts a clean master', () => {
    expect(lintSvg(ok, { master: true }).ok).toBe(true);
  });
  it('rejects raster images, scripts, handlers, external references', () => {
    const bad =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="x()"><script>x</script><image href="data:image/png;base64,AAAA"/><use href="https://evil.example/a.svg#b"/><rect width="1" height="1" fill="url(http://x/y)"/></svg>';
    const r = rules(bad);
    expect(r).toContain('error:no-raster');
    expect(r).toContain('error:no-script');
    expect(r).toContain('error:no-event-handlers');
    expect(r.filter((x) => x === 'error:no-external').length).toBeGreaterThanOrEqual(2);
  });
  it('requires a viewBox and flags broken references and duplicate ids', () => {
    expect(
      rules(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect id="a" width="1" height="1"/><rect id="a" fill="url(#missing)" width="1" height="1"/></svg>',
      ),
    ).toEqual(expect.arrayContaining(['error:viewbox', 'error:unique-ids', 'error:broken-reference']));
  });
  it('live text is a warning in drafts and an error in masters', () => {
    const t = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>Hi</text></svg>';
    expect(rules(t)).toContain('warning:outline-text');
    expect(rules(t, true)).toContain('error:outline-text');
  });
  it('collects colors from attributes and styles', () => {
    const r = lintSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect style="fill:#F00" width="1" height="1"/><circle fill="rgb(0,0,255)" r="1"/></svg>',
    );
    expect(r.stats.colors).toEqual(['#0000ff', '#ff0000']);
  });
});

describe('transforms', () => {
  it('optimize keeps the viewBox and title', () => {
    const out = optimizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>T</title><rect x="0.123456" width="10" height="10" fill="#123456"/></svg>',
    );
    expect(out).toContain('viewBox="0 0 10 10"');
    expect(out).toContain('<title>T</title>');
  });
  it('monochrome and substitute recolor every paint', () => {
    const two =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect fill="#ff0000" width="5" height="5"/><rect style="fill:#00ff00" width="5" height="5"/></svg>';
    expect(lintSvg(monochrome(two, '#000000')).stats.colors).toEqual(['#000000']);
    expect(lintSvg(substitute(two, { '#ff0000': '#0000ff' })).stats.colors).toEqual(['#0000ff', '#00ff00']);
  });
  it('prefixes ids so nested copies do not collide', () => {
    const root = parseXml(
      '<svg><defs><clipPath id="c"><rect/></clipPath></defs><g clip-path="url(#c)"/><use href="#c"/></svg>',
    );
    prefixIds(root, 'p-');
    const s = serializeXml(root);
    expect(s).toContain('id="p-c"');
    expect(s).toContain('url(#p-c)');
    expect(s).toContain('href="#p-c"');
    expect(nestSvg(ok, { x: 1, y: 2, width: 3, height: 4 })).toContain('matrix(0.3 0 0 0.3 1 2.5)');
  });
});
