import { type Mask, maskBBox, maskOf, resizeMask } from '../render/image.js';
import { lintSvg } from '../svg/lint.js';
import { contrastRatio, deltaE2000, hexToRgb } from './color.js';
import { shapeFeatures } from './features.js';
import { rasterizeSvgSquare, sampleFromSvg } from './mark.js';
import { genericity, softIoU } from './similarity.js';

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';

export interface QualityCheck {
  id: string;
  label: string;
  status: CheckStatus;
  value: number | string;
  message: string;
}

export interface QualityReport {
  subject: string;
  /** small: the simplified symbol for 32 px and below, measured like a symbol. */
  role: 'symbol' | 'wordmark' | 'lockup' | 'small';
  measuredAt: string;
  checks: QualityCheck[];
  summary: Record<CheckStatus, number>;
  /** Measured facts only. Brand fit, memorability and similar judgments are recorded separately. */
  note: string;
}

const LIGHT = '#ffffff';
const DARK = '#111318';

function status(value: number, pass: number, warn: number, higherIsBetter = true): CheckStatus {
  if (higherIsBetter) return value >= pass ? 'pass' : value >= warn ? 'warn' : 'fail';
  return value <= pass ? 'pass' : value <= warn ? 'warn' : 'fail';
}

/** Share of opaque edges that exist only because of a color change (lost in one-color reproduction). */
async function colorOnlyEdges(svg: string): Promise<number> {
  const r = await rasterizeSvgSquare(svg, 256);
  const { width: w, data } = r;
  let colorEdges = 0;
  let alphaEdges = 0;
  for (let y = 0; y < r.height - 1; y++)
    for (let x = 0; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (const j of [i + 4, i + w * 4]) {
        const a1 = data[i + 3]! > 200;
        const a2 = data[j + 3]! > 200;
        if (a1 !== a2) alphaEdges++;
        else if (a1 && a2) {
          const d =
            Math.abs(data[i]! - data[j]!) +
            Math.abs(data[i + 1]! - data[j + 1]!) +
            Math.abs(data[i + 2]! - data[j + 2]!);
          if (d > 40) colorEdges++;
        }
      }
    }
  return colorEdges + alphaEdges ? colorEdges / (colorEdges + alphaEdges) : 0;
}

export async function assessQuality(
  svg: string,
  subject: string,
  role: QualityReport['role'] = 'symbol',
  opts: { paper?: string } = {},
): Promise<QualityReport> {
  const checks: QualityCheck[] = [];
  const add = (c: QualityCheck) => checks.push(c);
  const paper = opts.paper ?? LIGHT;

  const lint = lintSvg(svg, { master: true });
  const errors = lint.issues.filter((i) => i.severity === 'error');
  add({
    id: 'svg-integrity',
    label: 'Clean vector master',
    status: errors.length ? 'fail' : lint.issues.some((i) => i.severity === 'warning') ? 'warn' : 'pass',
    value: `${errors.length} errors, ${lint.issues.filter((i) => i.severity === 'warning').length} warnings`,
    message: errors.length
      ? errors.map((e) => e.message).join(' ')
      : 'Pure vector, self-contained, scalable.',
  });

  const sample = await sampleFromSvg(svg, { id: subject });
  const f = sample.features;

  if (role === 'symbol') {
    // Small-size fidelity: render natively at small sizes and compare, in artboard coordinates and after
    // thresholding, with the large render. Blurred-but-readable shapes survive; sub-pixel detail does not.
    const binarize = (m: Mask): Mask => ({
      ...m,
      data: m.data.map((v) => (v >= 0.5 ? 1 : 0)) as Float32Array,
    });
    const ref = binarize(resizeMask(sample.mask, 64, 64));
    for (const size of [16, 32]) {
      const small = maskOf(await rasterizeSvgSquare(svg, size));
      const fidelity = softIoU(ref, binarize(resizeMask(small, 64, 64)));
      const smallF = shapeFeatures(resizeMask(small, 256, 256));
      const lostHoles = Math.max(0, f.holes - smallF.holes);
      const st =
        lostHoles > 0 && size === 16 ? (fidelity >= 0.85 ? 'warn' : 'fail') : status(fidelity, 0.85, 0.7);
      add({
        id: `fidelity-${size}`,
        label: `Legibility at ${size} px`,
        status: st,
        value: round(fidelity),
        message:
          lostHoles > 0
            ? `${lostHoles} counter-space(s) close up at ${size} px; the silhouette changes.`
            : `${Math.round(fidelity * 100)}% of the shape survives at ${size} px (≥ 85% reads clearly).`,
      });
    }
    const thin16 = (f.minFeature * 16) / 256;
    add({
      id: 'thin-detail',
      label: 'Thinnest detail at 16 px',
      status: f.minFeature === 0 ? 'info' : status(thin16, 1.2, 0.7),
      value: round(thin16),
      message: `Thin strokes/gaps are ~${round(thin16)} px wide at 16 px (≥ 1.2 px stays crisp).`,
    });
    // The optical centre sits a little above the geometric one, so up to 5% upward is not counted as imbalance.
    const { x: ox, y: oy } = f.centroidOffset;
    const off = Math.hypot(ox, oy < 0 ? Math.min(0, oy + 0.05) : oy);
    const dist = Math.round(Math.hypot(ox, oy) * 100);
    add({
      id: 'balance',
      label: 'Optical balance',
      status: status(off, 0.04, 0.09, false),
      value: round(off),
      message:
        off <= 0.04
          ? `Visual centroid sits ${dist}% from center${oy < -0.01 ? ', slightly high, which reads as optically centered' : ''}.`
          : `Visual centroid sits ${dist}% from center (${[
              Math.abs(ox) > 0.02 ? (ox > 0 ? 'right' : 'left') : '',
              oy > 0.02 ? 'low' : oy < -0.05 ? 'too high' : '',
            ]
              .filter(Boolean)
              .join(', ')}); shift or rebalance the heavier part.`,
    });
    const box = maskBBox(sample.mask, 0.5);
    const extent = box ? Math.max(box.w, box.h) / 256 : 0;
    add({
      id: 'artboard-fit',
      label: 'Artboard fit',
      status: extent >= 0.995 ? 'warn' : status(extent, 0.8, 0.6),
      value: round(extent),
      message:
        extent >= 0.995
          ? 'Mark touches the artboard edge; leave a little room so antialiasing is not clipped.'
          : `Mark spans ${Math.round(extent * 100)}% of the artboard (80–98% keeps icon exports consistent).`,
    });
    // A geometric fact for app icons and favicons, which are square: a mark twice as wide as it is tall fills at most
    // half of their height.
    const aspect = box?.w && box.h ? Math.max(box.w, box.h) / Math.min(box.w, box.h) : 1;
    add({
      id: 'square-fit',
      label: 'Fits a square icon',
      status: aspect >= 2 ? 'warn' : 'pass',
      value: round(aspect),
      message:
        aspect >= 2
          ? `The mark is ${round(aspect)}:1, so in a square app icon or favicon it fills only ${Math.round(100 / aspect)}% of the ${box!.w >= box!.h ? 'height' : 'width'}. Make a more compact arrangement or a small version for icons.`
          : `The mark is ${round(aspect)}:1 and fills a square icon well.`,
    });
    const g = await genericity(sample);
    add({
      id: 'genericity',
      label: 'Distinct from stock primitives',
      status: g.level === 'generic' ? 'fail' : g.level === 'near-primitive' ? 'warn' : 'pass',
      value: g.similarity,
      message:
        g.level === 'distinct'
          ? `Closest stock shape is a ${g.closest} at ${Math.round(g.similarity * 100)}% overlap.`
          : `Reads as a ${g.closest} (${Math.round(g.similarity * 100)}% overlap); hard to own or protect.`,
    });
  }

  add({
    id: 'complexity',
    label: 'Construction complexity',
    status: status(
      lint.stats.pathCommands,
      role === 'wordmark' ? 900 : 260,
      role === 'wordmark' ? 1600 : 600,
      false,
    ),
    value: lint.stats.pathCommands,
    message: `${lint.stats.paths} paths, ${lint.stats.pathCommands} path commands, compactness ${round(f.compactness)}.`,
  });

  const edgeShare = await colorOnlyEdges(svg);
  add({
    id: 'monochrome',
    label: 'One-color reproduction',
    status: status(edgeShare, 0.08, 0.3, false),
    value: round(edgeShare),
    message:
      edgeShare > 0.08
        ? `${Math.round(edgeShare * 100)}% of internal edges exist only as color changes; a one-color version needs gaps or knockouts.`
        : 'Shapes stay separable in a single color.',
  });

  // Visible on the background the brand is designed for (its paper color, light or dark).
  if (lint.stats.colors.length) {
    const ratios = lint.stats.colors.map((c) => ({ c, r: contrastRatio(c, paper) }));
    const best = Math.max(...ratios.map((x) => x.r));
    const worst = ratios.reduce((a, b) => (b.r < a.r ? b : a));
    const textLike = role !== 'symbol';
    const value = textLike ? worst.r : best;
    add({
      id: 'ground-contrast',
      label: `Visible on its paper (${paper})`,
      status: value >= 3 ? 'pass' : value >= 1.6 ? 'warn' : 'fail',
      value: `${round(value)}:1`,
      message:
        value >= 3
          ? `Reads on its own background (${textLike ? 'every color' : 'strongest color'} ≥ 3:1).`
          : `${textLike ? `${worst.c} in the ${role}` : 'The mark'} nearly disappears on ${paper} (${round(value)}:1). Exports adapt it for other grounds, but the design itself should read on its paper.`,
    });
  }
  const colors = lint.stats.colors.filter((c) => c !== '#ffffff' || lint.stats.colors.length === 1);
  for (const c of colors.slice(0, 4)) {
    const onLight = contrastRatio(c, LIGHT);
    const onDark = contrastRatio(c, DARK);
    const best = Math.max(onLight, onDark);
    add({
      id: `contrast-${c.slice(1)}`,
      label: `Contrast of ${c}`,
      status: onLight >= 3 && onDark >= 3 ? 'pass' : best >= 3 ? 'info' : 'warn',
      value: `${round(onLight)}:1 light / ${round(onDark)}:1 dark`,
      message:
        onLight >= 3 && onDark >= 3
          ? 'Meets the 3:1 non-text contrast guideline (WCAG 1.4.11) on light and dark grounds.'
          : best >= 3
            ? `Works on ${onLight >= 3 ? 'light' : 'dark'} grounds; use a reversed variant on the other.`
            : 'Under 3:1 on both light and dark grounds; pair it with a stronger color.',
    });
  }
  if (colors.length >= 2) {
    let minDe = Number.POSITIVE_INFINITY;
    for (let i = 0; i < colors.length; i++)
      for (let j = i + 1; j < colors.length; j++) minDe = Math.min(minDe, deltaE2000(colors[i]!, colors[j]!));
    add({
      id: 'palette-separation',
      label: 'Palette separation',
      status: status(minDe, 20, 6),
      value: round(minDe),
      message: `Closest pair of colors differs by ΔE₀₀ ${round(minDe)}. Under 20, shapes separated only by these colors blur together for many viewers; vary lightness too.`,
    });
    const lum = colors.map((c) => {
      const { r, g, b } = hexToRgb(c);
      return 0.299 * r + 0.587 * g + 0.114 * b;
    });
    const spread = Math.max(...lum) - Math.min(...lum);
    add({
      id: 'lightness-contrast',
      label: 'Lightness contrast inside the mark',
      status: status(spread, 60, 30),
      value: Math.round(spread),
      message:
        'Lightness difference between brand colors (matters for grayscale print and color-vision deficiencies).',
    });
  }

  const summary: Record<CheckStatus, number> = { pass: 0, warn: 0, fail: 0, info: 0 };
  for (const c of checks) summary[c.status]++;
  return {
    subject,
    role,
    measuredAt: new Date().toISOString(),
    checks,
    summary,
    note: 'Measured technical checks. Brand fit, memorability, cultural fit and timelessness require visual review and are recorded as judgment.',
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
