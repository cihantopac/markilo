import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadMark, rasterizeSvgSquare, sampleFromRaster } from '../src/analyze/mark.js';
import { compareMarks, genericity } from '../src/analyze/similarity.js';
import { encodePng } from '../src/render/png.js';
import { buildOriginalityReport, readReferences } from '../src/report/originality.js';
import { addReference, removeReferences } from '../src/research/competitors.js';
import { fixture, mark, synthBrand } from './helpers.js';

const load = (n: string) => loadMark(fixture(`marks/${n}.svg`));

describe('visual similarity', () => {
  it('flags exact and mirrored copies as high risk', async () => {
    const [a, b] = await Promise.all([load('orbit'), load('orbit-mirrored')]);
    const r = await compareMarks(a, b);
    expect(r.risk).toBe('high');
    expect(r.visual).toBeGreaterThan(0.95);
  });
  it('flags a recolored, re-proportioned copy', async () => {
    const r = await compareMarks(await load('orbit'), await load('orbit-tweaked'));
    expect(r.risk).toBe('high');
  });
  it('keeps unrelated marks low', async () => {
    const names = ['bolt', 'bars', 'leaf-letter', 'fold-n'];
    const marks = await Promise.all(names.map(load));
    for (let i = 0; i < marks.length; i++)
      for (let j = i + 1; j < marks.length; j++)
        expect((await compareMarks(marks[i]!, marks[j]!)).risk).toBe('low');
  });
  it('matches an SVG against a raster screenshot of itself', async () => {
    const svg = await load('bolt');
    const png = encodePng(
      await rasterizeSvgSquare(
        (await import('node:fs')).readFileSync(fixture('marks/bolt.svg'), 'utf8'),
        180,
        '#ffffff',
      ),
    );
    const raster = await sampleFromRaster(png, { id: 'bolt-png' });
    const r = await compareMarks(svg, raster);
    expect(r.visual).toBeGreaterThan(0.85);
  });
  it('detects stock primitives', async () => {
    expect((await genericity(await load('plain-circle'))).level).toBe('generic');
    expect((await genericity(await load('fold-n'))).level).toBe('distinct');
  });
});

describe('optional external embedder', () => {
  it('runs the configured command on two PNGs and uses its number', async () => {
    const { externalEmbedder } = await import('../src/analyze/similarity.js');
    const { sampleFromSvg } = await import('../src/analyze/mark.js');
    const cmp = externalEmbedder(fixture('embedder/size-embedder.mjs'))!;
    const a = await sampleFromSvg(readFileSync(fixture('marks/orbit.svg'), 'utf8'), { id: 'a' });
    const same = await cmp.compare(a, a);
    expect(same.score).toBe(1);
    expect(externalEmbedder('/nonexistent/embedder')!.compare(a, a)).toMatchObject({ score: 0 });
  });
});

describe('calibration on the fixture marks', () => {
  it('catches mirrored, rotated and recolored copies and separates different marks', async () => {
    const { calibrate } = await import('../src/analyze/calibrate.js');
    const { readdirSync } = await import('node:fs');
    const dir = fixture('marks');
    const marks = readdirSync(dir)
      .filter((f) => f.endsWith('.svg') && !/orbit-(mirrored|tweaked)/.test(f))
      .map((f) => ({ id: f, svg: readFileSync(`${dir}/${f}`, 'utf8') }));
    const r = await calibrate(marks);
    expect(r.auc).toBeGreaterThan(0.95);
    for (const t of ['mirror', 'rotate-90', 'recolor'] as const)
      expect(r.copiesCaught.byTransform[t]!.review).toBe(1);
    expect(r.falseAlarms.review).toBe(0);
  }, 60_000);
});

describe('family references', () => {
  it('a family reference is not an originality risk', async () => {
    const { ws } = synthBrand();
    const before = (await buildOriginalityReport(ws, 'nimbra', 'fold')).report;
    // The parent brand's own mark: near-identical, and expected to be.
    const bytes = new TextEncoder().encode(mark('fold-n'));
    await addReference(ws, 'nimbra', {
      name: 'Nimbra Parent',
      source: 'family',
      bytes,
      ext: '.svg',
      category: 'family',
    });
    const after = (await buildOriginalityReport(ws, 'nimbra', 'fold')).report;
    expect(after.verdict).toBe(before.verdict);
    expect(after.visual.risk).toBe(before.visual.risk);
    expect(after.name.risk).toBe(before.name.risk);
    expect(after.scope.referencesCompared).toBe(before.scope.referencesCompared);
    expect(after.visual.matches.map((m) => m.name)).not.toContain('Nimbra Parent');
    expect(after.family?.map((f) => f.name)).toEqual(['Nimbra Parent']);
    expect(after.family?.[0]?.visual).toBeGreaterThan(0.9);
    // The same file filed as a competitor is a risk.
    removeReferences(
      ws,
      'nimbra',
      readReferences(ws, 'nimbra').references.map((r) => r.id),
    );
    await addReference(ws, 'nimbra', { name: 'Rival', source: 'x', bytes, ext: '.svg' });
    expect((await buildOriginalityReport(ws, 'nimbra', 'fold')).report.visual.risk).toBe('high');
  }, 60_000);
});
