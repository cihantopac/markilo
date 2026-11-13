import { contrastRatio, hexToOklch, luminance, normalizeColor, oklchToHex } from '../analyze/color.js';
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

/** The brand colour a designer chose for each ground: it replaces `primary` there instead of an automatic shade. */
export interface GroundColors {
  primary: string;
  onDark?: string;
  onLight?: string;
}

/** The ground colours of a palette, or undefined when it sets none (the export then adapts colours as before). */
export const groundColors = (p: {
  primary: string;
  onDark?: string;
  onLight?: string;
}): GroundColors | undefined =>
  p.onDark || p.onLight
    ? {
        primary: p.primary,
        ...(p.onDark ? { onDark: normalizeColor(p.onDark) ?? p.onDark } : {}),
        ...(p.onLight ? { onLight: normalizeColor(p.onLight) ?? p.onLight } : {}),
      }
    : undefined;

/**
 * Adapts artwork to a background: colors under 3:1 contrast change. Neutral inks flip to the opposite neutral;
 * saturated brand colors keep their hue and move in lightness. Works for light-first and dark-first brands.
 * With `brand`, the primary colour takes the colour chosen for that ground (onDark / onLight) instead.
 */
export function adaptToGround(
  svg: string,
  ground: string,
  neutrals: { light?: string; dark?: string } = {},
  brand?: GroundColors,
): string {
  const dark = isDarkGround(ground);
  const chosen = brand && (dark ? brand.onDark : brand.onLight);
  const primary = chosen && normalizeColor(brand!.primary);
  return recolorSvg(svg, (c) => {
    if (primary && normalizeColor(c) === primary) return chosen;
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
export function reversedVariant(
  svg: string,
  darkBg: string,
  paper = '#ffffff',
  brand?: GroundColors,
): string {
  return adaptToGround(svg, darkBg, { light: isDarkGround(paper) ? '#ffffff' : paper }, brand);
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
  const readable = (art: string) => {
    const colors = lintSvg(art).stats.colors;
    return colors.length > 0 && colors.every((c) => contrastRatio(c, fill) >= 3);
  };
  if (readable(svg)) return { svg, color: null };
  // Keep the brand's colors where possible (a dark ink flips light, an accent is lifted), the way the reversed
  // logo does; only fall back to one color when that still cannot reach 3:1 on the fill.
  const adapted = adaptToGround(svg, fill, { dark: '#0b0d12', light: '#ffffff' });
  if (readable(adapted)) return { svg: adapted, color: null };
  const best = [...candidates].sort((a, b) => contrastRatio(b, fill) - contrastRatio(a, fill))[0]!;
  return { svg: monochrome(svg, best), color: best };
}

/** The palette fields that decide how a mark sits on a ground or on the brand tile. */
export interface GroundPalette {
  primary: string;
  paper?: string;
  ink?: string;
  onDark?: string;
  onLight?: string;
  /** The mark colour on the brand tile: #hex, or `auto` (the higher contrast of paper and ink). */
  onBrand?: string;
  /** The brand tile's ground; `primary` when unset. */
  tile?: string;
}

/** The ground of the brand tile (app icons, avatars, the appmark): `tile` when set, else `primary`. */
export const tileGround = (p: { primary: string; tile?: string }): string => p.tile ?? p.primary;

/**
 * The mark colour the palette sets for the brand tile, or undefined when it sets none. `auto` takes whichever of
 * paper (default white) and ink (default near-black) has the higher contrast on the tile.
 */
export function onBrandColor(p: GroundPalette): string | undefined {
  if (!p.onBrand) return undefined;
  if (p.onBrand !== 'auto') return normalizeColor(p.onBrand) ?? p.onBrand;
  const ground = tileGround(p);
  const paper = p.paper ?? '#ffffff';
  const ink = p.ink ?? '#0b0d12';
  return contrastRatio(ink, ground) > contrastRatio(paper, ground) ? ink : paper;
}

/**
 * The one resolver for how a mark sits on a ground, shared by previews and export. On a plain ground the palette's
 * onDark / onLight replace `primary` when set; on the brand tile (`tile: true`) the palette's onBrand colours the
 * mark when set. Otherwise — and always for a locked identity — the behaviour is the automatic one
 * (`adaptToGround` / `onFillVariant`).
 */
export function markOnGround(
  svg: string,
  ground: string,
  palette: GroundPalette | undefined,
  opts: { locked?: boolean; tile?: boolean; neutrals?: { light?: string; dark?: string } } = {},
): string {
  const own = palette && !opts.locked ? palette : undefined;
  if (opts.tile) {
    const color = own && onBrandColor(own);
    return color ? monochrome(svg, color) : onFillVariant(svg, ground).svg;
  }
  return adaptToGround(svg, ground, opts.neutrals ?? {}, own && groundColors(own));
}

export { monochrome };
