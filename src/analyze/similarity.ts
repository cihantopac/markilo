import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { dihedral, type Mask } from '../render/image.js';
import { encodePng } from '../render/png.js';
import { deltaE2000 } from './color.js';
import type { ShapeFeatures } from './features.js';
import { hashSimilarity, pHash } from './hash.js';
import { coreSample, type MarkSample, sampleFromSvg } from './mark.js';

export type RiskLevel = 'low' | 'review' | 'high';

export interface ComparatorResult {
  /** 0 = unrelated, 1 = identical. */
  score: number;
  details: Record<string, number | string>;
}

/** Pluggable similarity signal. Register extra comparators (for example an embedding model) with `registerComparator`. */
export interface Comparator {
  id: string;
  description: string;
  /** Contribution to the combined visual score; built-ins sum to 1. */
  weight: number;
  compare(a: MarkSample, b: MarkSample): ComparatorResult | Promise<ComparatorResult>;
}

/** Soft IoU (Σmin / Σmax) of two equally sized masks. */
export function softIoU(a: Mask, b: Mask): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < a.data.length; i++) {
    const x = a.data[i]!;
    const y = b.data[i]!;
    num += Math.min(x, y);
    den += Math.max(x, y);
  }
  return den ? num / den : 0;
}

const TRANSFORMS = [
  'identity',
  'rot90',
  'rot180',
  'rot270',
  'mirror',
  'mirror+rot90',
  'mirror+rot180',
  'mirror+rot270',
];

const silhouette: Comparator = {
  id: 'silhouette',
  description: 'Best soft IoU of normalized silhouettes over the 8 rotations/reflections',
  weight: 0.5,
  compare(a, b) {
    let best = 0;
    let bestK = 0;
    for (let k = 0; k < 8; k++) {
      const s = softIoU(a.normalized, dihedral(b.normalized, k));
      if (s > best) {
        best = s;
        bestK = k;
      }
    }
    return { score: best, details: { iou: round(best), transform: TRANSFORMS[bestK]! } };
  },
};

const perceptual: Comparator = {
  id: 'perceptual-hash',
  description: 'DCT pHash and dHash agreement (best over rotations/reflections for pHash)',
  weight: 0.25,
  compare(a, b) {
    let best = hashSimilarity(a.hashes.pHash, b.hashes.pHash);
    for (let k = 1; k < 8; k++)
      best = Math.max(best, hashSimilarity(a.hashes.pHash, pHash(dihedral(b.normalized, k))));
    const d = hashSimilarity(a.hashes.dHash, b.hashes.dHash);
    // Random 64-bit hashes agree on ~50% of bits; rescale so chance agreement maps to 0.
    const rescale = (s: number) => Math.max(0, (s - 0.5) / 0.5);
    const score = 0.7 * rescale(best) + 0.3 * rescale(d);
    return { score, details: { pHash: round(best), dHash: round(d) } };
  },
};

function descriptor(f: ShapeFeatures): number[] {
  return [
    f.bboxFill,
    Math.min(1, f.negativeSpace * 3),
    Math.min(1, f.holes / 4),
    Math.min(1, (f.components - 1) / 4),
    f.symmetry.horizontal,
    f.symmetry.vertical,
    f.symmetry.rotational,
    Math.min(1, (f.compactness - 1) / 6),
    Math.min(1, Math.log2(f.aspect + 1) / 2),
  ];
}

const structure: Comparator = {
  id: 'structure',
  description: 'Shape descriptors: fill, negative space, holes, components, symmetry, compactness, aspect',
  weight: 0.25,
  compare(a, b) {
    const da = descriptor(a.features);
    const db = descriptor(b.features);
    const l1 = da.reduce((s, v, i) => s + Math.abs(v - db[i]!), 0) / da.length;
    const sameTopology =
      a.features.holes === b.features.holes && a.features.components === b.features.components;
    const score = Math.max(0, 1 - l1 * 2.5) * (sameTopology ? 1 : 0.8);
    return {
      score,
      details: {
        descriptorDistance: round(l1),
        holes: `${a.features.holes} vs ${b.features.holes}`,
        components: `${a.features.components} vs ${b.features.components}`,
      },
    };
  },
};

const registry: Comparator[] = [silhouette, perceptual, structure];

export function registerComparator(c: Comparator): void {
  if (registry.some((x) => x.id === c.id)) throw new Error(`Comparator ${c.id} already registered`);
  registry.push(c);
}

export const comparators = (): readonly Comparator[] => registry;

/**
 * Optional local embedding comparator. Markilo bundles no model (hundreds of MB, licensing, platform builds); set
 * MARKILO_EMBEDDER to an executable that takes two PNG paths and prints their similarity (0–1), e.g. a small CLIP
 * script, and it joins the combined score (weight MARKILO_EMBEDDER_WEIGHT, default 0.3). Measure it with
 * `markilo similarity calibrate` before trusting it.
 */
const embedFiles = new WeakMap<MarkSample, string>();
let embedDir: string | undefined;
function embedFile(s: MarkSample): string {
  const hit = embedFiles.get(s);
  if (hit) return hit;
  embedDir ??= mkdtempSync(join(tmpdir(), 'markilo-embed-'));
  const f = join(
    embedDir,
    `${embedFiles instanceof WeakMap ? Math.random().toString(36).slice(2) : 'x'}.png`,
  );
  writeFileSync(f, encodePng(s.raster));
  embedFiles.set(s, f);
  return f;
}
export function externalEmbedder(cmd = process.env.MARKILO_EMBEDDER): Comparator | undefined {
  if (!cmd) return undefined;
  const weight = Number(process.env.MARKILO_EMBEDDER_WEIGHT ?? 0.3);
  return {
    id: 'embedding',
    description: `External image embedder (${basename(cmd)})`,
    weight: Number.isFinite(weight) && weight > 0 ? weight : 0.3,
    compare(a, b): ComparatorResult {
      // A .js/.mjs script runs with this Node (also on Windows, where shebangs do nothing).
      const [bin, pre] = /\.(m?js|cjs)$/i.test(cmd) ? [process.execPath, [cmd]] : [cmd, []];
      const r = spawnSync(bin, [...pre, embedFile(a), embedFile(b)], { encoding: 'utf8', timeout: 30_000 });
      const v = Number.parseFloat(String(r.stdout).trim());
      if (r.status !== 0 || !Number.isFinite(v))
        return {
          score: 0,
          details: { error: (r.stderr || r.error?.message || 'no number printed').slice(0, 120) },
        };
      return { score: Math.max(0, Math.min(1, v)), details: { similarity: round(v) } };
    },
  };
}
const embedder = externalEmbedder();
if (embedder) registry.push(embedder);

/** Average best-match CIEDE2000 between palettes, mapped to 0..1 similarity. */
export function paletteSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const best = (x: string, ys: string[]) => Math.min(...ys.map((y) => deltaE2000(x, y)));
  const d =
    (a.reduce((s, x) => s + best(x, b), 0) / a.length + b.reduce((s, y) => s + best(y, a), 0) / b.length) / 2;
  return Math.max(0, 1 - d / 35);
}

export interface Comparison {
  a: string;
  b: string;
  visual: number;
  shape: number;
  color: number;
  risk: RiskLevel;
  signals: Record<string, ComparatorResult>;
  reasons: string[];
}

export const RISK_THRESHOLDS = { review: 0.62, high: 0.78 } as const;

async function scoreOf(a: MarkSample, b: MarkSample) {
  const signals: Record<string, ComparatorResult> = {};
  let shape = 0;
  let weights = 0;
  for (const c of registry) {
    const r = await c.compare(a, b);
    signals[c.id] = { score: round(r.score), details: r.details };
    shape += r.score * c.weight;
    weights += c.weight;
  }
  shape /= weights;
  const color = paletteSimilarity(a.colors, b.colors);
  // Color matters only once shapes are already alike: identical shapes in new colors are still copies.
  const visual = shape * (0.92 + 0.08 * color);
  return { signals, shape, color, visual };
}

export async function compareMarks(a: MarkSample, b: MarkSample): Promise<Comparison> {
  let best = await scoreOf(a, b);
  // Also compare the marks without their minor parts: an added dot or badge must not hide a copy.
  const ac = coreSample(a);
  const bc = coreSample(b);
  let viaCore = false;
  for (const [x, y] of [
    [ac, b],
    [a, bc],
    [ac, bc],
  ] as const) {
    if (!x || !y) continue;
    const alt = await scoreOf(x, y);
    if (alt.visual > best.visual + 0.05) {
      best = alt;
      viaCore = true;
    }
  }
  const { signals, shape, color, visual } = best;
  const risk: RiskLevel =
    visual >= RISK_THRESHOLDS.high ? 'high' : visual >= RISK_THRESHOLDS.review ? 'review' : 'low';
  const reasons: string[] = [];
  const sil = signals.silhouette!;
  if (sil.score >= 0.8) reasons.push(`Silhouettes overlap ${pct(sil.score)} (${sil.details.transform}).`);
  else if (sil.score >= 0.65) reasons.push(`Silhouettes partly overlap (${pct(sil.score)}).`);
  if (sil.details.transform !== 'identity' && sil.score >= 0.75)
    reasons.push('Match found after rotating/mirroring: possible flipped copy.');
  if ((signals['perceptual-hash']?.score ?? 0) >= 0.7)
    reasons.push('Perceptual hashes agree strongly (same overall composition).');
  if ((signals.structure?.score ?? 0) >= 0.85)
    reasons.push('Same topology and proportions (holes, parts, symmetry).');
  if (color >= 0.75 && shape >= 0.5)
    reasons.push(`Palettes are close (${pct(color)}), which raises confusion risk.`);
  if (viaCore && risk !== 'low')
    reasons.push('Matches once a small extra element is ignored (a copy with an added detail).');
  if (!reasons.length) reasons.push('No strong overlap in silhouette, composition or structure.');
  return {
    a: a.id,
    b: b.id,
    visual: round(visual),
    shape: round(shape),
    color: round(color),
    risk,
    signals,
    reasons,
  };
}

// ---- genericity: how close a mark is to a stock primitive ----
const PRIMITIVES: Record<string, string> = {
  circle: '<circle cx="50" cy="50" r="48"/>',
  ring: '<path fill-rule="evenodd" d="M50 2a48 48 0 1 1 0 96a48 48 0 1 1 0-96zm0 22a26 26 0 1 0 0 52a26 26 0 1 0 0-52z"/>',
  square: '<rect x="2" y="2" width="96" height="96"/>',
  'rounded square': '<rect x="2" y="2" width="96" height="96" rx="24"/>',
  triangle: '<path d="M50 4 98 92H2z"/>',
  diamond: '<path d="M50 2 98 50 50 98 2 50z"/>',
  hexagon: '<path d="M50 2 92 26v48L50 98 8 74V26z"/>',
  star: '<path d="m50 3 13.8 29.3 32.2 3.9-23.7 22.1 6.1 31.8L50 74.6 21.6 90.1l6.1-31.8L4 36.2l32.2-3.9z"/>',
  shield: '<path d="M50 2 92 16v34c0 25-18 41-42 48C26 91 8 75 8 50V16z"/>',
  'plus/cross': '<path d="M36 2h28v34h34v28H64v34H36V64H2V36h34z"/>',
};

let primitiveCache: MarkSample[] | undefined;

async function primitives(): Promise<MarkSample[]> {
  primitiveCache ??= await Promise.all(
    Object.entries(PRIMITIVES).map(([name, body]) =>
      sampleFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`, {
        id: `primitive:${name}`,
        label: name,
      }),
    ),
  );
  return primitiveCache;
}

export interface Genericity {
  closest: string;
  similarity: number;
  /** `generic`: essentially the primitive itself; `near-primitive`: a primitive with minor additions. */
  level: 'distinct' | 'near-primitive' | 'generic';
}

/** Flags marks that are essentially a stock geometric primitive (low distinctiveness, hard to own). */
export async function genericity(m: MarkSample): Promise<Genericity> {
  let best = { closest: 'none', similarity: 0 };
  for (const p of await primitives()) {
    const s = silhouette.compare(m, p) as ComparatorResult;
    if (s.score > best.similarity) best = { closest: p.label, similarity: s.score };
  }
  const level = best.similarity >= 0.93 ? 'generic' : best.similarity >= 0.85 ? 'near-primitive' : 'distinct';
  return { closest: best.closest, similarity: round(best.similarity), level };
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const pct = (n: number) => `${Math.round(n * 100)}%`;
