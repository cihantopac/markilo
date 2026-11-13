import { describe, expect, it } from 'vitest';
import { FORM_CHANGE_LIMIT, silhouetteIoU } from '../src/analyze/silhouette.js';

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
