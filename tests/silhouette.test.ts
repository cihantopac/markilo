import { describe, expect, it } from 'vitest';
import { FORM_CHANGE_LIMIT, silhouetteIoU, wordmarkIoU } from '../src/analyze/silhouette.js';

/** A ring with a gap (a "cut") whose ends are at the given angles; the stroke width and cap are parameters. */
function ring(
  opts: { w?: number; from?: number; to?: number; cap?: 'round' | 'butt' | 'square' } = {},
): string {
  const { w = 20, from = 20, to = 340, cap = 'butt' } = opts;
  const r = 36;
  const pt = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
  };
  const large = to - from > 180 ? 1 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M${pt(from)} A${r} ${r} 0 ${large} 1 ${pt(to)}" fill="none" stroke="#111" stroke-width="${w}" stroke-linecap="${cap}"/></svg>`;
}

// Calibration of the 0.85 limit (measured at 256 px, alpha > 0.5, each drawing fitted to its own ink box):
//   same drawing 1.00 · 5 % heavier stroke 0.969 · butt -> round caps on the same cut 0.913 (craft, above the limit)
//   cut moved 25 degrees 0.792 · a flare added at one terminal 0.747 (form, below the limit)
describe('silhouetteIoU', () => {
  it('is 1 for the same drawing, however it is padded', async () => {
    const a = ring();
    expect(await silhouetteIoU(a, a)).toBe(1);
    const padded = a.replace('viewBox="0 0 100 100"', 'viewBox="-60 -60 220 220"');
    expect(await silhouetteIoU(a, padded)).toBeGreaterThan(0.97);
  });

  it('a 5 % heavier stroke stays above 0.9', async () => {
    const iou = await silhouetteIoU(ring({ w: 20 }), ring({ w: 21 }));
    expect(iou).toBeGreaterThan(0.9);
  });

  it('a moved cut falls below the limit', async () => {
    const iou = await silhouetteIoU(ring({ from: 20, to: 340 }), ring({ from: 45, to: 365 }));
    expect(iou).toBeLessThan(FORM_CHANGE_LIMIT);
  });

  it('a reshaped terminal (a flared end instead of a cut-off one) falls below the limit', async () => {
    const plain = ring();
    const flared = plain.replace('</svg>', '<circle cx="86" cy="62" r="17" fill="#111"/></svg>');
    const iou = await silhouetteIoU(plain, flared);
    expect(iou).toBeLessThan(FORM_CHANGE_LIMIT);
  });

  it('only a rounded cap on the same cut stays a craft change', async () => {
    const iou = await silhouetteIoU(ring({ cap: 'butt' }), ring({ cap: 'round' }));
    expect(iou).toBeGreaterThan(FORM_CHANGE_LIMIT);
  });
});

/**
 * A synthetic six-letter word "NIMELO" (cap 100, stems `stem` wide), `gap` units between letters. `squareO` draws the O
 * as a box; `spur` adds a spur rising from the foot of the L.
 */
function word(opts: { gap?: number; stem?: number; squareO?: boolean; spur?: boolean } = {}): string {
  const { gap = 10, stem: s = 14, squareO = false, spur = false } = opts;
  const parts: string[] = [];
  let x = 0;
  const add = (w: number, d: (x: number) => string) => {
    parts.push(d(x));
    x += w + gap;
  };
  const bar = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h-${w}z`;
  add(70, (x) => `${bar(x, 0, s, 100)}${bar(x + 70 - s, 0, s, 100)}M${x} 0h${s}l${70 - s} 100h-${s}z`);
  add(s, (x) => bar(x, 0, s, 100));
  add(
    84,
    (x) =>
      `${bar(x, 0, s, 100)}${bar(x + 84 - s, 0, s, 100)}M${x + s} 0L${x + 42} 60L${x + 84 - s} 0v${s * 1.4}L${x + 42} ${60 + s * 1.4}L${x + s} ${s * 1.4}z`,
  );
  add(
    60,
    (x) => `${bar(x, 0, s, 100)}${bar(x, 0, 60, s)}${bar(x, 50 - s / 2, 50, s)}${bar(x, 100 - s, 60, s)}`,
  );
  add(
    56,
    (x) =>
      `${bar(x, 0, s, 100)}${bar(x, 100 - s, 56, s)}${spur ? `M${x + 56 - 1.5 * s} ${100 - s}v-60l${1.5 * s} 60z` : ''}`,
  );
  add(80, (x) =>
    squareO
      ? `M${x} 0h80v100h-80zM${x + s} ${s}v${100 - 2 * s}h${80 - 2 * s}v-${100 - 2 * s}z`
      : `M${x + 40} 0a40 50 0 1 0 0.01 0zM${x + 40} ${s}a${40 - s} ${50 - s} 0 1 1 -0.01 0z`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 ${x - gap + 20} 120"><path fill="#111" d="${parts.join('')}"/></svg>`;
}

// Calibration of wordmarkIoU against the same 0.85 limit (cap 100, stems 14; letters at 256 px ink height):
//   spacing +1 / +3 / +5 / -3 units (1-5 % of cap): 0.979 / 0.972 / 0.970 / 0.984 (whole-silhouette IoU: 0.904 / 0.810
//   / 0.705 / 0.825 — spacing alone used to read as a change of form) · 5 % heavier stems 0.942 · the O drawn as a box
//   0.505 · a wedge spur (1.5 stems wide, 60 tall) added to the L 0.760 (form, below the limit)
describe('wordmarkIoU', () => {
  it('is 1 for the same word', async () => {
    expect(await wordmarkIoU(word(), word())).toBe(1);
  });

  it('tracking +3 % and +5 % of the cap (and -3 %) stays above the limit', async () => {
    for (const gap of [13, 15, 7]) {
      expect(await wordmarkIoU(word(), word({ gap }))).toBeGreaterThan(0.95);
      expect(await wordmarkIoU(word(), word({ gap }))).toBeGreaterThan(FORM_CHANGE_LIMIT);
    }
    // The symbol comparison would have called the same tracking change a change of form.
    expect(await silhouetteIoU(word(), word({ gap: 15 }))).toBeLessThan(FORM_CHANGE_LIMIT);
  });

  it('5 % heavier stems stay above 0.9', async () => {
    expect(await wordmarkIoU(word(), word({ stem: 14.7 }))).toBeGreaterThan(0.9);
  });

  it('one reshaped letter falls below the limit', async () => {
    expect(await wordmarkIoU(word(), word({ squareO: true }))).toBeLessThan(FORM_CHANGE_LIMIT);
    expect(await wordmarkIoU(word(), word({ spur: true }))).toBeLessThan(FORM_CHANGE_LIMIT);
    // ... also when the spacing changed in the same pass.
    expect(await wordmarkIoU(word(), word({ squareO: true, gap: 15 }))).toBeLessThan(FORM_CHANGE_LIMIT);
  });
});
