import { describe, expect, it } from 'vitest';
import { loadMark, rasterizeSvgSquare, sampleFromRaster } from '../src/analyze/mark.js';
import { compareMarks, genericity } from '../src/analyze/similarity.js';
import { encodePng } from '../src/render/png.js';
import { fixture } from './helpers.js';

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
