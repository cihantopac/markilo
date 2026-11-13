import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  deltaE2000,
  hexToOklch,
  normalizeColor,
  oklchToHex,
  wcagRating,
} from '../src/analyze/color.js';
import { generatePalette, tonalScale } from '../src/design/palette.js';
import { extractCssSignals } from '../src/research/repo.js';

describe('color', () => {
  it('normalizes CSS colors', () => {
    expect(normalizeColor('#ABC')).toBe('#aabbcc');
    expect(normalizeColor('rgb(255, 0, 0)')).toBe('#ff0000');
    expect(normalizeColor('white')).toBe('#ffffff');
    expect(normalizeColor('none')).toBeUndefined();
    expect(normalizeColor('url(#g)')).toBeUndefined();
  });
  it('reads hsl(), oklch() and oklab()', () => {
    expect(normalizeColor('hsl(210 80% 40%)')).toBe('#1466b8');
    expect(normalizeColor('hsl(0, 100%, 50%)')).toBe('#ff0000');
    expect(normalizeColor('hsla(120deg 100% 25% / 0.5)')).toBe('#008000');
    const red = normalizeColor('oklch(0.62 0.2 25)')!;
    expect(red).toBe(oklchToHex({ l: 0.62, c: 0.2, h: 25 }));
    expect(hexToOklch(red).h).toBeGreaterThan(15);
    expect(hexToOklch(red).h).toBeLessThan(35);
    expect(normalizeColor('oklch(62% 0.2 25 / 80%)')).toBe(red);
    // Out of gamut: chroma is reduced until it fits, never clipped to a different hue.
    expect(normalizeColor('oklch(0.7 0.5 145)')).toMatch(/^#[0-9a-f]{6}$/);
    const lab = normalizeColor('oklab(0.62 0.18 0.08)')!;
    expect(
      deltaE2000(
        lab,
        oklchToHex({ l: 0.62, c: Math.hypot(0.18, 0.08), h: (Math.atan2(0.08, 0.18) * 180) / Math.PI }),
      ),
    ).toBeLessThan(0.5);
  });
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
    expect(wcagRating(4.6)).toBe('AA');
  });
  it('computes CIEDE2000 sensibly', () => {
    expect(deltaE2000('#3b5bdb', '#3b5bdb')).toBe(0);
    expect(deltaE2000('#000000', '#ffffff')).toBeCloseTo(100, 0);
    expect(deltaE2000('#ff0000', '#fe0000')).toBeLessThan(1);
  });
  it('round-trips OKLCH', () => {
    for (const c of ['#3b5bdb', '#ff8a3d', '#118a55', '#7a3cf0'])
      expect(deltaE2000(oklchToHex(hexToOklch(c)), c)).toBeLessThan(0.5);
  });
});

describe('palette', () => {
  it('pins the brand color into its scale', () => {
    const { scale, anchorStep } = tonalScale('#3b5bdb');
    expect(scale[anchorStep as 500]).toBe('#3b5bdb');
    expect(Object.keys(scale)).toHaveLength(11);
  });
  it('reports contrast pairs and semantic clashes', () => {
    const p = generatePalette({ primary: '#d92d20' });
    expect(p.pairs.length).toBeGreaterThan(4);
    expect(p.warnings.join(' ')).toMatch(/danger/);
  });
  it('rejects invalid input', () => {
    expect(() => generatePalette({ primary: 'blue' })).toThrow(/#rrggbb/);
  });
});

describe('css signals', () => {
  it('resolves custom properties and reports the dark theme apart', () => {
    const sig = extractCssSignals(
      `:root{--brand-hue:345;--accent:hsl(210 80% 40%);--ink:var(--accent)}
      .a{color:oklch(0.6 0.2 var(--brand-hue))}.b{border-color:var(--ink)}.c{color:var(--missing, #0e9f6e)}
      @media (prefers-color-scheme: dark){:root{--accent:#334455}.a{color:#112233}}
      [data-theme="dark"] .b{color:#223344}`,
    );
    const hue = normalizeColor('oklch(0.6 0.2 345)')!;
    expect(sig.colors).toContain(hue);
    expect(sig.colors).toContain('#1466b8');
    expect(sig.colors).toContain('#0e9f6e');
    expect(sig.colors).not.toContain('#112233');
    expect(sig.darkColors).toEqual(expect.arrayContaining(['#334455', '#112233', '#223344']));
  });
});
