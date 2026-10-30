import { describe, expect, it } from 'vitest';
import { listFonts, loadBundledFace } from '../src/design/fonts.js';
import { composeLockup } from '../src/design/lockup.js';
import { outlineText, wordmarkSvg } from '../src/design/wordmark.js';
import { lintSvg } from '../src/svg/lint.js';
import { mark } from './helpers.js';

describe('fonts and wordmarks', () => {
  it('bundles only OFL fonts with license files', () => {
    const fonts = listFonts();
    expect(fonts.length).toBeGreaterThanOrEqual(10);
    for (const f of fonts) expect(f.license).toBe('OFL-1.1');
  });
  it('applies GPOS kerning', () => {
    const face = loadBundledFace('inter', 600);
    const av = outlineText(face, 'AV').advance;
    const separate = outlineText(face, 'A').advance + outlineText(face, 'V').advance;
    expect(av).toBeLessThan(separate - 1);
  });
  it('handles Turkish letters and locale-aware casing', () => {
    const face = loadBundledFace('manrope', 700);
    expect(outlineText(face, 'Şığ').glyphs).toHaveLength(3);
    expect(outlineText(face, 'istanbul', { case: 'upper', locale: 'tr' }).glyphs[0]?.char).toBe('İ');
  });
  it('tracking widens the advance', () => {
    const face = loadBundledFace('inter', 500);
    expect(outlineText(face, 'brand', { tracking: 100 }).advance).toBeGreaterThan(
      outlineText(face, 'brand').advance + 30,
    );
  });
  it('produces a lint-clean outlined master with metrics', () => {
    const svg = wordmarkSvg(loadBundledFace('sora', 600), 'Nimbra');
    const lint = lintSvg(svg, { master: true });
    expect(lint.ok).toBe(true);
    expect(lint.stats.hasText).toBe(false);
    expect(svg).toMatch(/data-cap-height="\d/);
  });
  it('composes lockups from symbol and wordmark', () => {
    const wm = wordmarkSvg(loadBundledFace('inter', 600), 'Nimbra');
    const h = composeLockup(mark('fold-n'), wm, { layout: 'horizontal' });
    const s = composeLockup(mark('fold-n'), wm, { layout: 'stacked' });
    expect(h.width / h.height).toBeGreaterThan(2.5);
    expect(s.height).toBeGreaterThan(s.width * 0.6);
    expect(lintSvg(h.svg).ok).toBe(true);
  });
  it('places the symbol by its ink, so artboard margins do not widen the gap', async () => {
    const { inkMetrics } = await import('../src/export/geometry.js');
    const wm = wordmarkSvg(loadBundledFace('inter', 600), 'Nimbra');
    // The same mark with a much larger artboard margin must give the same lockup when placed by ink.
    const tight =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10h80v80H10z"/></svg>';
    const loose =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 300 300"><path d="M10 10h80v80H10z"/></svg>';
    const a = composeLockup(tight, wm, { layout: 'horizontal', symbolInk: (await inkMetrics(tight)).bbox });
    const b = composeLockup(loose, wm, { layout: 'horizontal', symbolInk: (await inkMetrics(loose)).bbox });
    expect(b.width).toBeCloseTo(a.width, 0);
    expect(composeLockup(loose, wm, { layout: 'horizontal' }).width).toBeGreaterThan(a.width);
  });
  it('stands an ink-placed symbol on the wordmark baseline', async () => {
    const { inkMetrics } = await import('../src/export/geometry.js');
    const wm = wordmarkSvg(loadBundledFace('inter', 600), 'Nimbra');
    const sym =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10h80v80H10z"/></svg>';
    const ink = (await inkMetrics(sym)).bbox;
    const l = composeLockup(sym, wm, { layout: 'horizontal', symbolInk: ink });
    const [m1, m2] = [...l.svg.matchAll(/matrix\(([^)]+)\)/g)].map((m) => m[1]!.split(' ').map(Number));
    const symbolBottom = m1![3]! * (ink.y + ink.h) + m1![5]!;
    const baseline = m2![3]! * 0 + m2![5]!; // the wordmark's baseline is y = 0 in its own units
    expect(symbolBottom).toBeCloseTo(baseline, 0);
  });
});

describe('optimized compositions', () => {
  it('render identically before and after SVGO', async () => {
    const { optimizeSvg } = await import('../src/svg/optimize.js');
    const { renderSvg } = await import('../src/render/resvg.js');
    const { maskOf } = await import('../src/render/image.js');
    const { softIoU } = await import('../src/analyze/similarity.js');
    const wm = wordmarkSvg(loadBundledFace('inter', 600), 'Nimbra');
    const lockup = composeLockup(mark('fold-n'), wm, { layout: 'horizontal' }).svg;
    const a = maskOf(await renderSvg(lockup, { width: 600 }));
    const b = maskOf(await renderSvg(optimizeSvg(lockup), { width: 600 }));
    expect(softIoU(a, b)).toBeGreaterThan(0.99);
  });
});
