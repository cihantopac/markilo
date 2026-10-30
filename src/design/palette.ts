import {
  contrastRatio,
  deltaE2000,
  hexToOklch,
  hueRelation,
  oklchToHex,
  wcagRating,
} from '../analyze/color.js';
import { MarkiloError } from '../core/errors.js';

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const LIGHTNESS = [0.975, 0.94, 0.87, 0.78, 0.68, 0.58, 0.5, 0.42, 0.34, 0.27, 0.2];
const CHROMA_CURVE = [0.12, 0.25, 0.5, 0.75, 0.92, 1, 1, 0.92, 0.8, 0.65, 0.5];

export type Scale = Record<(typeof STEPS)[number], string>;

export interface PaletteInput {
  primary: string;
  secondary?: string;
  accent?: string;
}

export interface Palette {
  schema: 'markilo/palette@1';
  input: PaletteInput;
  scales: Record<string, { base: string; anchorStep: number; scale: Scale }>;
  neutral: Scale;
  semantic: Record<'success' | 'warning' | 'danger' | 'info', string>;
  pairs: { foreground: string; background: string; ratio: number; rating: string; use: string }[];
  relations: string[];
  warnings: string[];
}

/** Builds an OKLCH tonal scale and pins the brand color to its nearest step so the brand value is exact. */
export function tonalScale(base: string): { scale: Scale; anchorStep: number } {
  const b = hexToOklch(base);
  const nearest = LIGHTNESS.reduce(
    (best, l, i) => (Math.abs(l - b.l) < Math.abs(LIGHTNESS[best]! - b.l) ? i : best),
    0,
  );
  const scale = {} as Scale;
  STEPS.forEach((step, i) => {
    scale[step] =
      i === nearest
        ? base.toLowerCase()
        : oklchToHex({ l: LIGHTNESS[i]!, c: b.c * CHROMA_CURVE[i]! * 1.05, h: b.h });
  });
  return { scale, anchorStep: STEPS[nearest]! };
}

const SEMANTIC_HUES = { success: 150, warning: 75, danger: 27, info: 245 } as const;

export function generatePalette(input: PaletteInput): Palette {
  const hex = /^#[0-9a-fA-F]{6}$/;
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined && !hex.test(v))
      throw new MarkiloError('INVALID_INPUT', `${k} must be #rrggbb (got "${v}").`);
  }
  const scales: Palette['scales'] = {};
  for (const [name, base] of Object.entries(input) as [string, string | undefined][]) {
    if (!base) continue;
    scales[name] = { base, ...tonalScale(base) };
  }
  const p = hexToOklch(input.primary);
  const neutral = {} as Scale;
  STEPS.forEach((step, i) => {
    neutral[step] = oklchToHex({ l: LIGHTNESS[i]!, c: Math.min(0.012, p.c * 0.08), h: p.h });
  });
  const semantic = Object.fromEntries(
    Object.entries(SEMANTIC_HUES).map(([k, h]) => [k, oklchToHex({ l: 0.56, c: 0.15, h })]),
  ) as Palette['semantic'];

  const warnings: string[] = [];
  for (const [k, v] of Object.entries(semantic)) {
    if (deltaE2000(v, input.primary) < 12)
      warnings.push(
        `Primary color is close to the ${k} color (ΔE ${deltaE2000(v, input.primary).toFixed(1)}); users may read brand accents as ${k} states.`,
      );
  }

  const white = '#ffffff';
  const ink = neutral[950];
  const pairs: Palette['pairs'] = [];
  const pair = (fg: string, bg: string, use: string) => {
    const ratio = Math.round(contrastRatio(fg, bg) * 100) / 100;
    pairs.push({ foreground: fg, background: bg, ratio, rating: wcagRating(ratio), use });
  };
  pair(input.primary, white, 'brand color on white (logo, large text)');
  pair(input.primary, ink, 'brand color on dark (logo on dark UI)');
  pair(white, input.primary, 'white text on brand fill (buttons)');
  pair(ink, input.primary, 'dark text on brand fill');
  pair(scales.primary!.scale[700], white, 'brand-dark text on white (links, body accents)');
  pair(ink, neutral[50], 'body text');
  pair(neutral[600], white, 'secondary text');
  if (input.secondary) pair(input.secondary, white, 'secondary color on white');
  if (input.accent) pair(input.accent, ink, 'accent on dark');

  const relations: string[] = [];
  if (input.secondary) relations.push(`primary/secondary: ${hueRelation(input.primary, input.secondary)}`);
  if (input.accent) relations.push(`primary/accent: ${hueRelation(input.primary, input.accent)}`);
  if (contrastRatio(white, input.primary) < 4.5 && contrastRatio(ink, input.primary) < 4.5) {
    warnings.push(
      'Neither white nor near-black text reaches 4.5:1 on the primary color; use a darker step for text-bearing fills.',
    );
  }
  return { schema: 'markilo/palette@1', input, scales, neutral, semantic, pairs, relations, warnings };
}
