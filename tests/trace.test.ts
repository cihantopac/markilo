import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import { describe, expect, it } from 'vitest';
import { deltaE2000 } from '../src/analyze/color.js';
import { silhouetteIoU } from '../src/analyze/silhouette.js';
import { parseCommand } from '../src/cli/args.js';
import { findCommand } from '../src/cli/commands.js';
import { traceRaster } from '../src/geom/trace.js';
import { decodeImage, encodePng } from '../src/render/png.js';
import { renderSvg } from '../src/render/resvg.js';
import { mark, tmp } from './helpers.js';

/** A synthetic fixture rendered to PNG bytes (transparent background unless `background` is given). */
async function pngOf(name: string, width: number, background?: string): Promise<Buffer> {
  return encodePng(await renderSvg(mark(name), { width, ...(background ? { background } : {}) }));
}

async function cmd(name: string, argv: string[], cwd: string): Promise<Record<string, unknown>> {
  const f = findCommand([name])!;
  return (await f.spec.run(parseCommand(f.spec, argv, cwd))) as Record<string, unknown>;
}

describe('traceRaster', () => {
  it('traces a 552 px render of fold-n back to the same form in few nodes', async () => {
    const img = decodeImage(await pngOf('fold-n', 552));
    const t = traceRaster(img, {});
    expect(await silhouetteIoU(t.svg, mark('fold-n'))).toBeGreaterThanOrEqual(0.97);
    expect(t.nodes).toBeLessThanOrEqual(60);
  });

  it('keeps the two colours of a two-tone mark as two faces', async () => {
    const img = decodeImage(await pngOf('orbit', 400));
    const t = traceRaster(img, { colors: 2 });
    expect(t.faces).toHaveLength(2);
    const fills = ['#2346d8', '#ff7a3d'];
    for (const fill of fills) {
      const best = Math.min(...t.faces.map((f) => deltaE2000(f.color, fill)));
      expect(best).toBeLessThan(5);
    }
    expect(t.svg.match(/<path /g)).toHaveLength(2);
  });

  it('keeps the hole of a ring', async () => {
    const img = decodeImage(await pngOf('orbit', 400));
    const t = traceRaster(img, {});
    const r = await renderSvg(t.svg, { width: 400 });
    const alphaAt = (x: number, y: number) => r.data[(y * r.width + x) * 4 + 3]!;
    // orbit: ring of radii 24..42 around (50, 50) in a 100 viewBox.
    expect(alphaAt(200, 200)).toBe(0);
    expect(alphaAt(200, 200 + 33 * 4)).toBe(255);
  });

  it('reads a quality-60 JPEG of the mark almost as well', async () => {
    const r = await renderSvg(mark('fold-n'), { width: 552, background: '#ffffff' });
    const jpg = jpeg.encode({ width: r.width, height: r.height, data: Buffer.from(r.data) }, 60).data;
    const t = traceRaster(decodeImage(jpg), {});
    expect(await silhouetteIoU(t.svg, mark('fold-n'))).toBeGreaterThanOrEqual(0.95);
  });

  it('traces a 4000 × 4000 PNG in under 10 s', async () => {
    const png = await pngOf('fold-n', 4000);
    const t0 = performance.now();
    const t = traceRaster(decodeImage(png), {});
    const ms = performance.now() - t0;
    expect(t.faces.length).toBe(1);
    expect(ms).toBeLessThan(10_000);
  }, 120_000);
});

/** A tight-cropped badge: a rounded plate filling the crop, with a hole cut through it (white corners on paper). */
const BADGE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><path fill="#2346d8" fill-rule="evenodd" d="M12 0h76a12 12 0 0 1 12 12v36a12 12 0 0 1-12 12H12A12 12 0 0 1 0 48V12A12 12 0 0 1 12 0zM30 18h40v24H30z"/></svg>';
/** A mark that runs off the left, top and bottom edges. */
const THREE_EDGES =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="60" height="100" fill="#2346d8"/><circle cx="80" cy="50" r="18" fill="#2346d8"/></svg>';

describe('traceRaster on hard grounds and sizes', () => {
  it('reads the paper, not the ink, as the ground of a tight-cropped badge', async () => {
    const img = await renderSvg(BADGE, { width: 500, background: '#ffffff' });
    const t = traceRaster(img, {});
    expect(await silhouetteIoU(t.svg, BADGE)).toBeGreaterThanOrEqual(0.97);
  });

  it('reads the paper as the ground when the mark touches three edges, and warns', async () => {
    const img = await renderSvg(THREE_EDGES, { width: 500, background: '#ffffff' });
    const t = traceRaster(img, {});
    expect(await silhouetteIoU(t.svg, THREE_EDGES)).toBeGreaterThanOrEqual(0.97);
    expect(t.warnings?.join(' ')).toMatch(/inverted/);
  });

  it('does not warn about the ground of an ordinary mark on paper', async () => {
    const img = await renderSvg(mark('fold-n'), { width: 552, background: '#ffffff' });
    expect(traceRaster(img, {}).warnings ?? []).toEqual([]);
  });

  it('--background names the ground when the guess is wrong', async () => {
    const img = await renderSvg(THREE_EDGES, { width: 500, background: '#ffffff' });
    const t = traceRaster(img, { background: '#2346d8' });
    // The ground is now the blue: what is traced is the white paper.
    expect(await silhouetteIoU(t.svg, THREE_EDGES)).toBeLessThan(0.5);
  });

  for (const width of [1700, 2000]) {
    it(`traces fold-n at ${width} px without ripple from the reduction`, async () => {
      const t = traceRaster(await renderSvg(mark('fold-n'), { width }), {});
      expect(t.nodes).toBeLessThanOrEqual(80);
      expect(await silhouetteIoU(t.svg, mark('fold-n'))).toBeGreaterThanOrEqual(0.97);
    });
  }

  it('honours an explicit tolerance finer than the default on a reduced image', async () => {
    const img = await renderSvg(mark('orbit'), { width: 2000 });
    expect(traceRaster(img, { tolerance: 0.05 }).nodes).toBeGreaterThan(traceRaster(img, {}).nodes);
  });

  it('decodes a 4000 × 4000 JPEG, and reports a broken one as invalid input', async () => {
    const r = await renderSvg(mark('fold-n'), { width: 4000, background: '#ffffff' });
    const jpg = jpeg.encode({ width: r.width, height: r.height, data: Buffer.from(r.data) }, 80).data;
    expect(decodeImage(jpg).width).toBe(4000);
    expect(() => decodeImage(Buffer.concat([jpg.subarray(0, 600), Buffer.alloc(64, 7)]))).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
  }, 120_000);
});

describe('trace and score commands', () => {
  it('documents --colors as 1–8 (1 is one silhouette, the default) and refuses values outside it', async () => {
    for (const name of ['trace', 'score', 'refresh']) {
      const f = findCommand([name])!;
      const opt = (f.spec.options as Record<string, { description?: string }>).colors!;
      expect(opt.description, name).toMatch(/1–8/);
    }
    const cwd = tmp();
    writeFileSync(join(cwd, 'orbit.png'), await pngOf('orbit', 200));
    const one = await cmd('trace', ['orbit.png', '-o', 'one.svg', '--colors', '1'], cwd);
    expect(one.faces).toHaveLength(1);
    for (const n of ['0', '9'])
      await expect(cmd('trace', ['orbit.png', '-o', 'x.svg', '--colors', n], cwd)).rejects.toThrow(
        /--colors must be between 1 and 8/,
      );
  });

  it('trace writes the SVG and reports faces, nodes and its IoU against the raster', async () => {
    const cwd = tmp();
    writeFileSync(join(cwd, 'orbit.png'), await pngOf('orbit', 400));
    const r = await cmd('trace', ['orbit.png', '-o', 'orbit.svg', '--colors', '2'], cwd);
    expect(r.out).toBe('orbit.svg');
    expect(r.faces).toHaveLength(2);
    expect(r.nodes).toBeGreaterThan(0);
    expect(r.iou).toBeGreaterThanOrEqual(0.97);
    expect(readFileSync(join(cwd, 'orbit.svg'), 'utf8')).toMatch(/^<svg /);
  });

  it('score reads a PNG by tracing it', async () => {
    const cwd = tmp();
    writeFileSync(join(cwd, 'fold.png'), await pngOf('fold-n', 552));
    const r = await cmd('score', ['fold.png'], cwd);
    const traced = r.tracedFrom as { file: string; iou: number };
    expect(traced.file).toBe('fold.png');
    expect(traced.iou).toBeGreaterThanOrEqual(0.97);
    expect(Array.isArray(r.checks)).toBe(true);
  });

  it('score rejects a raster it cannot decode', async () => {
    const cwd = tmp();
    writeFileSync(join(cwd, 'logo.png'), Buffer.from('not an image at all'));
    await expect(cmd('score', ['logo.png'], cwd)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
