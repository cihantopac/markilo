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

describe('color', () => {
  it('normalizes CSS colors', () => {
    expect(normalizeColor('#ABC')).toBe('#aabbcc');
    expect(normalizeColor('rgb(255, 0, 0)')).toBe('#ff0000');
    expect(normalizeColor('white')).toBe('#ffffff');
    expect(normalizeColor('none')).toBeUndefined();
    expect(normalizeColor('url(#g)')).toBeUndefined();
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
