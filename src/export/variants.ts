import { contrastRatio, hexToOklch, luminance, oklchToHex } from '../analyze/color.js';
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

/** Darkens (OKLCH) a color until it reaches `min` contrast against a light `bg`; falls back to near-black. */
export function deepenForLight(color: string, bg: string, min = 3): string {
  if (contrastRatio(color, bg) >= min) return color;
  const o = hexToOklch(color);
  for (let l = o.l; l >= 0.08; l -= 0.02) {
    const c = oklchToHex({ l, c: o.c, h: o.h });
    if (contrastRatio(c, bg) >= min) return c;
  }
  return '#111318';
}

export const isDarkGround = (hex: string): boolean => luminance(hex) < 0.2;

/**
 * Adapts artwork to a background: colors under 3:1 contrast change. Neutral inks flip to the opposite neutral;
 * saturated brand colors keep their hue and move in lightness. Works for light-first and dark-first brands.
 */
export function adaptToGround(
  svg: string,
  ground: string,
  neutrals: { light?: string; dark?: string } = {},
): string {
  const dark = isDarkGround(ground);
  return recolorSvg(svg, (c) => {
    if (contrastRatio(c, ground) >= 3) return undefined;
    const o = hexToOklch(c);
    const neutral = o.c < 0.09 || o.l < 0.3 || o.l > 0.93;
    if (neutral) {
      // A supplied neutral is only used when it actually contrasts with the ground (a dark-first brand's "ink" is light).
      const wanted = dark ? neutrals.light : neutrals.dark;
      const fallback = dark ? '#ffffff' : '#111318';
      return wanted && contrastRatio(wanted, ground) >= 4.5 ? wanted : fallback;
    }
    return dark ? liftForDark(c, ground) : deepenForLight(c, ground);
  });
}

/** Light-on-dark version (kept for callers that always target a dark ground). */
export function reversedVariant(svg: string, darkBg: string, paper = '#ffffff'): string {
  return adaptToGround(svg, darkBg, { light: isDarkGround(paper) ? '#ffffff' : paper });
}

/** The two grounds a brand is shown on: its own paper, and the opposite one for reversed artwork. */
export function groundsFor(
  paper: string | undefined,
  dark = '#111318',
): { native: string; opposite: string; darkFirst: boolean } {
  const native = paper ?? '#ffffff';
  const darkFirst = isDarkGround(native);
  return { native, opposite: darkFirst ? '#ffffff' : dark, darkFirst };
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
