import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assessQuality } from '../src/analyze/quality.js';
import { type ConstructionSpec, compileSpec } from '../src/construct/compile.js';
import { transformPath } from '../src/geom/pathkit.js';
import { wordmarkLetters } from '../src/report/quality.js';
import { optimizeSvg } from '../src/svg/optimize.js';
import { mark, synthBrand } from './helpers.js';

const status = async (svg: string, id: string) =>
  (await assessQuality(svg, 't')).checks.find((c) => c.id === id)?.status;

describe('quality checks', () => {
  it('passes a sturdy mark at small sizes', async () => {
    expect(await status(mark('fold-n'), 'fidelity-16')).toBe('pass');
    expect(await status(mark('bolt'), 'svg-integrity')).toBe('pass');
  });
  it('fails hairline detail at 16 px', async () => {
    expect(await status(mark('fine-lines'), 'fidelity-16')).toBe('fail');
  });
  it('fails stock shapes on genericity', async () => {
    expect(await status(mark('plain-circle'), 'genericity')).toBe('fail');
  });
  it('fails embedded raster images', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#111"/><image href="data:image/png;base64,iVBORw0KGgo=" width="5" height="5"/></svg>';
    expect(await status(svg, 'svg-integrity')).toBe('fail');
  });
  it('warns when shapes are separated only by color', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="40" height="80" fill="#1d4ed8"/><rect x="50" y="10" width="40" height="80" fill="#f97316"/></svg>';
    expect(await status(svg, 'monochrome')).not.toBe('pass');
  });
});

describe('the letter check says whether it ran', () => {
  async function wordmarkWorkspace() {
    const { ws } = synthBrand();
    const spec = {
      role: 'wordmark',
      size: 1600,
      layers: [
        {
          fill: 'primary',
          shape: { glyph: { text: 'Acme hub', font: 'inter', weight: 700, size: 400, at: [80, 600] } },
        },
      ],
    } as unknown as ConstructionSpec;
    const compiled = await compileSpec(spec, {});
    writeFileSync(ws.conceptFile('nimbra', 'fold', 'construction-wordmark.json'), JSON.stringify(spec));
    const svg = (d: string[]) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1600">${d.map((x) => `<path fill="#000" d="${x}"/>`).join('')}</svg>`;
    return { ws, compiled, svg };
  }

  it('still checks a wordmark whose numbers were reformatted by the optimizer', async () => {
    const { ws, compiled, svg } = await wordmarkWorkspace();
    const raw = svg(compiled.layers.map((l) => l.d));
    const optimized = optimizeSvg(raw);
    expect(optimized).not.toBe(raw);
    const r = await wordmarkLetters(ws, 'nimbra', 'fold', optimized);
    expect('checked' in r).toBe(false);
    expect(r).toEqual({ fix: [], notes: [] });
  });

  it('reports checked: false with the reason when the drawing was moved by hand', async () => {
    const { ws, compiled, svg } = await wordmarkWorkspace();
    const moved = svg(compiled.layers.map((l) => transformPath(l.d, [1, 0, 0, 1, 12, 7])));
    expect(await wordmarkLetters(ws, 'nimbra', 'fold', moved)).toEqual({
      checked: false,
      reason: 'the wordmark on disk differs from its recipe',
    });
  });

  it('says a freeform wordmark has no recipe', async () => {
    const { ws } = synthBrand();
    expect(await wordmarkLetters(ws, 'nimbra', 'fold', '<svg xmlns="http://www.w3.org/2000/svg"/>')).toEqual({
      checked: false,
      reason: 'no recipe (freeform wordmark)',
    });
  });
});
