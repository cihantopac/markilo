import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assessQuality, assessRich, richSilhouetteStatus } from '../src/analyze/quality.js';
import { type ConstructionSpec, compileSpec } from '../src/construct/compile.js';
import { transformPath } from '../src/geom/pathkit.js';
import { verifyConcept, wordmarkLetters } from '../src/report/quality.js';
import { optimizeSvg } from '../src/svg/optimize.js';
import { mark, richFoldN, synthBrand } from './helpers.js';

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

describe('verify messages', () => {
  const check = async (svg: string, id: string) =>
    (await assessQuality(svg, 't')).checks.find((c) => c.id === id);
  it('prints the artboard fit with one decimal, so 79.6 does not read as the 80 boundary', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><rect x="102" y="102" width="796" height="796" fill="#111"/></svg>';
    const c = await check(svg, 'artboard-fit');
    expect(c?.status).toBe('warn');
    expect(c?.message).toMatch(/79\.\d %/);
  });
  it('does not ask a one-colour lockup for palette separation or lightness contrast', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="30" height="30" fill="#14181f"/><rect x="50" y="50" width="40" height="30" fill="#000000"/></svg>';
    const sep = await check(svg, 'palette-separation');
    expect(sep?.status).toBe('pass');
    expect(sep?.message).toContain('single-colour lockup');
    expect(await check(svg, 'lightness-contrast')).toBeUndefined();
  });
  it('reads a navy icon beside a black word as one colour', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="30" height="30" fill="#060f26"/><rect x="50" y="50" width="40" height="30" fill="#000000"/></svg>';
    const sep = await check(svg, 'palette-separation');
    expect(sep?.status).toBe('pass');
    expect(sep?.message).toContain('single-colour lockup');
  });
  it('reads colours declared in a <style> block', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><style>.a{fill:#1d4ed8}.b{fill:#f97316}</style><rect class="a" x="10" y="10" width="40" height="80"/><rect class="b" x="50" y="10" width="40" height="80"/></svg>';
    const sep = await check(svg, 'palette-separation');
    expect(sep).toBeDefined();
    expect(sep?.message).not.toContain('single-colour');
  });
  it('still checks a two-colour mark', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="40" height="80" fill="#1d4ed8"/><rect x="50" y="10" width="40" height="80" fill="#f97316"/></svg>';
    expect((await check(svg, 'palette-separation'))?.message).not.toContain('single-colour');
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

  it('still checks a wordmark that differs from the recipe only by close commands', async () => {
    const { ws, compiled, svg } = await wordmarkWorkspace();
    const r = await wordmarkLetters(
      ws,
      'nimbra',
      'fold',
      svg(compiled.layers.map((l) => l.d.replace(/Z/g, ''))),
    );
    expect('checked' in r).toBe(false);
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

describe('a rich rendering on a flat master', () => {
  const withRich = (rich: string) => {
    const { ws } = synthBrand();
    writeFileSync(ws.conceptFile('nimbra', 'fold', 'symbol-rich.svg'), rich);
    const c = ws.concept('nimbra', 'fold');
    ws.saveConcept({ ...c, files: { ...c.files, rich: { symbol: 'symbol-rich.svg' } } });
    return ws;
  };
  const silhouette = (ws: ReturnType<typeof withRich>) =>
    (
      JSON.parse(readFileSync(join(ws.reportsDir('nimbra'), 'quality-fold.json'), 'utf8')) as {
        checks: { id: string; status: string; value: number; message: string }[];
      }
    ).checks.find((c) => c.id === 'rich-symbol:silhouette-match');

  it('a gradient copy of the master adds no failure and matches its silhouette', async () => {
    const { ws: plain } = synthBrand();
    const before = await verifyConcept(plain, 'nimbra', 'fold');
    const ws = withRich(richFoldN());
    const r = await verifyConcept(ws, 'nimbra', 'fold');
    expect(r.failing).toEqual(before.failing);
    const m = silhouette(ws);
    expect(m?.status).toBe('pass');
    expect(m?.value).toBeGreaterThanOrEqual(0.97);
    // Gradient stops are not palette roles: the rich file gets no palette or contrast checks of its own.
    const q = JSON.parse(readFileSync(join(ws.reportsDir('nimbra'), 'quality-fold.json'), 'utf8')) as {
      checks: { id: string }[];
    };
    const richChecks = q.checks.filter((c) => c.id.startsWith('rich-symbol:')).map((c) => c.id);
    expect(richChecks.sort()).toEqual(['rich-symbol:silhouette-match', 'rich-symbol:svg-integrity']);
  }, 60_000);

  it('a rich file moved 15 % off its master fails silhouette-match', async () => {
    const ws = withRich(richFoldN(18));
    const r = await verifyConcept(ws, 'nimbra', 'fold');
    const m = silhouette(ws);
    expect(m?.status).toBe('fail');
    expect(r.status).toBe('needs-work');
    expect(r.failing.some((f) => /silhouette/i.test(f))).toBe(true);
  }, 60_000);

  it('allows 2 % registration slack on the artboard, not more', async () => {
    const status = async (dx: number) =>
      (await assessRich(richFoldN(dx), mark('fold-n'), 't', 'rich-symbol', { registered: true })).checks.find(
        (c) => c.id === 'silhouette-match',
      )?.status;
    expect(await status(1)).toBe('pass');
    expect(await status(6)).toBe('fail');
  }, 30_000);

  it('grades silhouette-match at 0.97 and 0.93', () => {
    expect(richSilhouetteStatus(0.97)).toBe('pass');
    expect(richSilhouetteStatus(0.95)).toBe('warn');
    expect(richSilhouetteStatus(0.93)).toBe('warn');
    expect(richSilhouetteStatus(0.929)).toBe('fail');
  });
});
