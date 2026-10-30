import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../src/analyze/color.js';
import { assessQuality } from '../src/analyze/quality.js';
import { adaptToGround, groundsFor } from '../src/export/variants.js';
import { lintSvg } from '../src/svg/lint.js';

const darkFirstWordmark =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20"><rect width="60" height="20" fill="#f5f1ea"/><rect x="70" width="30" height="20" fill="#efc27f"/></svg>';

describe('dark-first brands', () => {
  it('knows which ground is native and which is opposite', () => {
    expect(groundsFor('#0a0a0a')).toMatchObject({ darkFirst: true, opposite: '#ffffff' });
    expect(groundsFor('#ffffff')).toMatchObject({ darkFirst: false });
    expect(groundsFor(undefined).native).toBe('#ffffff');
  });
  it('adapts light inks and pale brand colors for light grounds, keeping hue', () => {
    const onWhite = lintSvg(adaptToGround(darkFirstWordmark, '#ffffff')).stats.colors;
    for (const c of onWhite) expect(contrastRatio(c, '#ffffff'), c).toBeGreaterThanOrEqual(3);
    expect(adaptToGround(darkFirstWordmark, '#0a0a0a')).toContain('#f5f1ea');
    // Passing the brand's own (light) ink as the "dark" neutral must not leave the art invisible on white.
    const withLightInk = lintSvg(adaptToGround(darkFirstWordmark, '#ffffff', { dark: '#f5f1ea' })).stats
      .colors;
    for (const c of withLightInk) expect(contrastRatio(c, '#ffffff'), c).toBeGreaterThanOrEqual(3);
  });
  it('flags artwork that disappears on its own paper', async () => {
    const onLight = await assessQuality(darkFirstWordmark, 't', 'wordmark', { paper: '#ffffff' });
    expect(onLight.checks.find((c) => c.id === 'ground-contrast')?.status).toBe('fail');
    const onDark = await assessQuality(darkFirstWordmark, 't', 'wordmark', { paper: '#0a0a0a' });
    expect(onDark.checks.find((c) => c.id === 'ground-contrast')?.status).toBe('pass');
  });
});
