import { type MarkSample, sampleFromSvg } from '../analyze/mark.js';
import { assessQuality } from '../analyze/quality.js';
import { compareMarks, genericity } from '../analyze/similarity.js';
import { MarkiloError } from '../core/errors.js';
import { renderPng } from '../render/resvg.js';
import { label } from '../render/sheet.js';
import { nestSvg, svgDocument } from '../svg/compose.js';
import { type ConstructionSpec, compileSpec } from './compile.js';

/** Every combination of the spec's `vary` values, thinned evenly to at most `max`. */
export function variantParams(spec: ConstructionSpec, max = 24): Record<string, number>[] {
  const entries = Object.entries(spec.vary ?? {}).filter(([, v]) => Array.isArray(v) && v.length);
  if (!entries.length)
    throw new MarkiloError(
      'USAGE',
      'This spec has no "vary" block.',
      'Add e.g. "vary": { "gap": [24, 40, 56], "angle": [0, 15] } — names must exist under "params".',
    );
  for (const [k, vals] of entries) {
    if (!Object.hasOwn(spec.params ?? {}, k))
      throw new MarkiloError('INVALID_INPUT', `vary.${k} has no matching params.${k}.`);
    if (!vals.every((v) => typeof v === 'number' && Number.isFinite(v)))
      throw new MarkiloError('INVALID_INPUT', `vary.${k} must be a list of numbers.`);
  }
  let combos: Record<string, number>[] = [{}];
  for (const [k, vals] of entries) combos = combos.flatMap((c) => vals.map((v) => ({ ...c, [k]: v })));
  if (combos.length <= max) return combos;
  const step = combos.length / max;
  return Array.from({ length: max }, (_, i) => combos[Math.floor(i * step)]!);
}

export interface ScoredVariant {
  id: string;
  params: Record<string, number>;
  svg: string;
  warnings: string[];
  quality: { pass: number; warn: number; fail: number; legibility16: number; failing: string[] };
  genericity: { closest: string; similarity: number; level: string };
  closestReference?: { name: string; visual: number; risk: string };
  /** 0–1, higher is better: small-size legibility, distance from stock shapes and from collected references. */
  score: number;
}

export interface Reference {
  name: string;
  sample: MarkSample;
}

export async function scoreSvg(
  id: string,
  svg: string,
  opts: { paper?: string; references?: Reference[] } = {},
): Promise<Omit<ScoredVariant, 'params' | 'warnings'>> {
  const q = await assessQuality(svg, id, 'symbol', opts.paper ? { paper: opts.paper } : {});
  const sample = await sampleFromSvg(svg, { id });
  const g = await genericity(sample);
  let closest: ScoredVariant['closestReference'];
  for (const r of opts.references ?? []) {
    const c = await compareMarks(sample, r.sample);
    if (!closest || c.visual > closest.visual) closest = { name: r.name, visual: c.visual, risk: c.risk };
  }
  const legibility16 = Number(q.checks.find((c) => c.id === 'fidelity-16')?.value ?? 0);
  const distinct = 1 - g.similarity;
  const base = closest
    ? 0.45 * legibility16 + 0.3 * distinct + 0.25 * (1 - closest.visual)
    : 0.6 * legibility16 + 0.4 * distinct;
  const score = Math.max(0, base - 0.25 * q.summary.fail - 0.03 * q.summary.warn);
  return {
    id,
    svg,
    quality: {
      pass: q.summary.pass,
      warn: q.summary.warn,
      fail: q.summary.fail,
      legibility16,
      failing: q.checks.filter((c) => c.status === 'fail').map((c) => `${c.label}: ${c.message}`),
    },
    genericity: g,
    ...(closest ? { closestReference: closest } : {}),
    score: Math.round(score * 1000) / 1000,
  };
}

export async function runVariants(
  spec: ConstructionSpec,
  opts: {
    palette?: Record<string, string>;
    paper?: string;
    max?: number;
    references?: Reference[];
    title?: string;
  },
): Promise<ScoredVariant[]> {
  const out: ScoredVariant[] = [];
  const combos = variantParams(spec, opts.max ?? 24);
  for (const [i, params] of combos.entries()) {
    const id = `v${String(i + 1).padStart(2, '0')}`;
    let compiled: Awaited<ReturnType<typeof compileSpec>>;
    try {
      compiled = await compileSpec(spec, {
        params,
        ...(opts.palette ? { palette: opts.palette } : {}),
        ...(opts.title ? { title: opts.title } : {}),
      });
    } catch (err) {
      out.push({
        id,
        params,
        svg: '',
        warnings: [(err as Error).message],
        quality: {
          pass: 0,
          warn: 0,
          fail: 1,
          legibility16: 0,
          failing: [`does not compile: ${(err as Error).message}`],
        },
        genericity: { closest: 'none', similarity: 0, level: 'distinct' },
        score: 0,
      });
      continue;
    }
    const scored = await scoreSvg(id, compiled.svg, {
      ...(opts.paper ? { paper: opts.paper } : {}),
      ...(opts.references ? { references: opts.references } : {}),
    });
    out.push({ ...scored, params, warnings: compiled.warnings });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Contact sheet of variants, best first: each at 160 px on the brand's paper, plus 32 px and 16 px at 1:1. */
export async function renderVariantSheet(variants: ScoredVariant[], paper = '#ffffff'): Promise<Buffer> {
  const shown = variants.filter((v) => v.svg);
  if (!shown.length) throw new MarkiloError('INVALID_INPUT', 'No variant compiled; nothing to show.');
  const cols = Math.min(4, shown.length);
  const tw = 230;
  const th = 268;
  const W = cols * tw + 16;
  const H = Math.ceil(shown.length / cols) * th + 46;
  const dark = Number.parseInt(paper.slice(1), 16);
  const ink =
    ((dark >> 16) & 255) * 0.3 + ((dark >> 8) & 255) * 0.59 + (dark & 255) * 0.11 < 128
      ? '#d9dce3'
      : '#30343c';
  let body = label(
    'Variants, best first (score · 16 px legibility · stock-shape similarity)',
    16,
    28,
    14,
    ink,
  );
  shown.forEach((v, i) => {
    const x = 16 + (i % cols) * tw;
    const y = 46 + Math.floor(i / cols) * th;
    body += `<rect x="${x}" y="${y}" width="${tw - 16}" height="${th - 16}" rx="10" fill="${paper}" stroke="${i === 0 ? '#2f9e44' : '#c9ced8'}" stroke-width="${i === 0 ? 3 : 1}"/>`;
    body += nestSvg(v.svg, { x: x + 27, y: y + 12, width: 160, height: 160 });
    body += nestSvg(v.svg, { x: x + 60, y: y + 182, width: 32, height: 32 });
    body += nestSvg(v.svg, { x: x + 110, y: y + 190, width: 16, height: 16 });
    const head = `${v.id} · ${v.score.toFixed(2)} · ${Math.round(v.quality.legibility16 * 100)}% · ${Math.round(v.genericity.similarity * 100)}%${v.quality.fail ? ' · FAIL' : ''}`;
    body += label(head, x + 10, y + 232, 11, v.quality.fail ? '#e5484d' : ink);
    const ps = Object.entries(v.params)
      .map(([k, n]) => `${k}=${n}`)
      .join(' ');
    // A failing variant names its first failing check instead of its parameters (they are in variants.json).
    const second = v.quality.fail ? (v.quality.failing[0] ?? '').split(':')[0]! : ps;
    body += label(second.slice(0, 40), x + 10, y + 247, 10, v.quality.fail ? '#e5484d' : ink);
  });
  const sheet = svgDocument(W, H, body, { background: paper });
  return renderPng(sheet, { width: W });
}
