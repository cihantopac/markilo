import { aspectOf, nestSvg, svgDocument } from '../svg/compose.js';
import { SPECS } from './specs.js';
import { adaptToGround, type GroundColors } from './variants.js';

export interface TvSurfaceInput {
  /** The primary logo (lockup or wordmark), or the symbol when the identity has nothing else. */
  art: string;
  /** Roughly how much of the art's height its lettering takes: 1 for a wordmark, less for a lockup, 0 for a symbol. */
  textShare: number;
  width: number;
  height: number;
  ground: string;
  /** Locked artwork is reproduced as given; otherwise its inks are adapted to the ground. */
  locked: boolean;
  /** A rich rendering (gradients, highlights): drawn as it is, like locked artwork. */
  asDrawn?: boolean;
  inks: { dark: string; light: string };
  groundColors?: GroundColors;
}

export interface TvSurface {
  svg: string;
  /** Height of the lettering as a share of the surface height (0 when the art has none). */
  textShare: number;
  /** Set when the lettering falls under the readable minimum. */
  warning?: string;
}

/**
 * A banner, splash or background: the logo centred on the ground inside the safe margin (10 % on every side),
 * never taller than half the surface. Reports the height its lettering ends up with.
 */
export function tvSurface(input: TvSurfaceInput, label: string): TvSurface {
  const { width: w, height: h } = input;
  const m = SPECS.tv.safeMargin;
  const art =
    input.locked || input.asDrawn
      ? input.art
      : adaptToGround(input.art, input.ground, input.inks, input.groundColors);
  const a = aspectOf(art);
  let aw = w * (1 - 2 * m);
  let ah = aw / a;
  const maxH = Math.min(h * (1 - 2 * m), h * 0.5);
  if (ah > maxH) {
    ah = maxH;
    aw = ah * a;
  }
  const svg = svgDocument(w, h, nestSvg(art, { x: (w - aw) / 2, y: (h - ah) / 2, width: aw, height: ah }), {
    background: input.ground,
  });
  const textShare = (ah * input.textShare) / h;
  const min = SPECS.tv.minTextShare;
  const warning =
    input.textShare > 0 && textShare < min
      ? `${label}: the lettering is ${(textShare * 100).toFixed(1)}% of the ${h} px height (under ${min * 100}%), too small to read from a sofa. Use a shorter wordmark or replace this file.`
      : undefined;
  return { svg, textShare, ...(warning ? { warning } : {}) };
}
