import { contrastRatio, hexToOklch, oklchToHex } from '../analyze/color.js';
import { lintSvg } from '../svg/lint.js';
import { monochrome, recolorSvg } from '../svg/variants.js';

/** Lightens (OKLCH) a color until it reaches `min` contrast against `bg`; falls back to white. */
export function liftForDark(color: string, bg: string, min = 3): string {
  if (contrastRatio(color, bg) >= min) return color;
  const o = hexToOklch(color);
  for (let l = o.l; l <= 0.98; l += 0.02) {
    const c = oklchToHex({ l, c: o.c, h: o.h });
    if (contrastRatio(c, bg) >= min) return c;
  }
  return '#ffffff';
}

/** Light-on-dark version: dark inks become paper color, low-contrast brand colors are lifted. */
export function reversedVariant(svg: string, darkBg: string, paper = '#ffffff'): string {
  return recolorSvg(svg, (c) => {
    if (contrastRatio(c, darkBg) >= 3) return undefined;
    // Inks (dark or muted colors) flip to paper; saturated brand colors are lightened in place.
    const o = hexToOklch(c);
    return o.c < 0.09 || o.l < 0.32 ? paper : liftForDark(c, darkBg);
  });
}

/** Best one-color treatment for a mark that sits on a solid brand fill (app icons, tiles). */
export function onFillVariant(
  svg: string,
  fill: string,
  candidates: string[] = ['#ffffff', '#0b0d12'],
): { svg: string; color: string | null } {
  const colors = lintSvg(svg).stats.colors;
  const ok = colors.length > 0 && colors.every((c) => contrastRatio(c, fill) >= 3);
  if (ok) return { svg, color: null };
  const best = [...candidates].sort((a, b) => contrastRatio(b, fill) - contrastRatio(a, fill))[0]!;
  return { svg: monochrome(svg, best), color: best };
}

export { monochrome };
