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

describe('trace and score commands', () => {
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
