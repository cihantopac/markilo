import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { silhouetteIoU } from '../src/analyze/silhouette.js';
import { parseCommand } from '../src/cli/args.js';
import { findCommand } from '../src/cli/commands.js';
import { exitCodeFor, type MarkiloError } from '../src/core/errors.js';
import { ensurePathKit } from '../src/geom/pathkit.js';
import { contourAreas, rebuildPath } from '../src/geom/rebuild.js';
import { traceRaster } from '../src/geom/trace.js';
import { encodePng } from '../src/render/png.js';
import { renderSvg } from '../src/render/resvg.js';
import { mark, tmp } from './helpers.js';

beforeAll(async () => {
  await ensurePathKit();
});

async function cmd(name: string, argv: string[], cwd: string): Promise<Record<string, unknown>> {
  const f = findCommand([name])!;
  return (await f.spec.run(parseCommand(f.spec, argv, cwd))) as Record<string, unknown>;
}

const svgOf = (d: string, size = 100, rule = 'evenodd') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><path fill="#000" fill-rule="${rule}" d="${d}"/></svg>`;

/** Alpha of an SVG rendered at `width` px. */
async function alpha(svg: string, width: number): Promise<Uint8Array> {
  const r = await renderSvg(svg, { width });
  return Uint8Array.from({ length: r.width * r.height }, (_, i) => r.data[i * 4 + 3]!);
}

/** Share of pixels whose alpha differs by more than half. */
function pixelChange(a: Uint8Array, b: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i]! - b[i]!) > 127) n++;
  return n / a.length;
}

/** Three right triangles whose hypotenuses rise at the given angles (degrees, counter-clockwise from horizontal). */
function triangles(angles: number[]): string {
  return angles
    .map((deg, i) => {
      const x = 10 + i * 80;
      const h = 60 * Math.tan((deg * Math.PI) / 180);
      return `M${x} 90H${x + 60}V${(90 - h).toFixed(4)}Z`;
    })
    .join('');
}

/** Undirected visual angle of every line command in an absolute M/L/A/C/Z path. */
function lineAngles(d: string): number[] {
  const out: number[] = [];
  let cur: number[] = [0, 0];
  let start: number[] = [0, 0];
  for (const m of d.matchAll(/([MLACZ])([^MLACZ]*)/g)) {
    const n = m[2]!.trim()
      ? m[2]!
          .trim()
          .split(/[\s,]+/)
          .map(Number)
      : [];
    const to = m[1] === 'Z' ? start : n.slice(-2);
    if (m[1] === 'L' || (m[1] === 'Z' && Math.hypot(to[0]! - cur[0]!, to[1]! - cur[1]!) > 1e-6)) {
      const a = (Math.atan2(-(to[1]! - cur[1]!), to[0]! - cur[0]!) * 180) / Math.PI;
      out.push(((a % 180) + 180) % 180);
    }
    if (m[1] === 'M') start = to;
    cur = to;
  }
  return out;
}

describe('rebuildPath', () => {
  it('rebuilds a traced circle as one or two arcs', async () => {
    const t = traceRaster(await renderSvg(mark('plain-circle'), { width: 400 }), {});
    const d = t.svg.match(/ d="([^"]+)"/)![1]!;
    const r = rebuildPath(d, { tolerance: 0.5 });
    expect(r.segments.lines + r.segments.cubics).toBe(0);
    expect(r.segments.arcs).toBeGreaterThanOrEqual(1);
    expect(r.segments.arcs).toBeLessThanOrEqual(2);
    expect(await silhouetteIoU(svgOf(r.d, 400), mark('plain-circle'))).toBeGreaterThanOrEqual(0.99);
  });

  it('snaps lines at 31.2°, 32.6° and 31.9° to one shared angle', () => {
    const r = rebuildPath(triangles([31.2, 32.6, 31.9]), { tolerance: 0.1, angles: 'auto' });
    expect(r.snapped[0]!.count).toBe(3);
    expect(r.snapped[0]!.angle).toBeCloseTo(31.9, 1);
    const diagonal = lineAngles(r.d).filter((a) => a > 10 && a < 80);
    expect(diagonal).toHaveLength(3);
    for (const a of diagonal) expect(a).toBeCloseTo(31.9, 1);
    // Horizontal and vertical legs were already exact: they stay where they are.
    expect(lineAngles(r.d).filter((a) => a < 0.01 || a > 179.99)).toHaveLength(3);
  });

  it('snaps to explicit angles within 4° and leaves the rest', () => {
    const r = rebuildPath(triangles([31.2, 32.6, 38.5]), { tolerance: 0.1, angles: [32, 90] });
    expect(r.snapped).toEqual([{ angle: 32, count: 2 }]);
    const diagonal = lineAngles(r.d)
      .filter((a) => a > 10 && a < 80)
      .sort();
    expect(diagonal[0]).toBeCloseTo(32, 1);
    expect(diagonal[1]).toBeCloseTo(32, 1);
    expect(diagonal[2]).toBeCloseTo(38.5, 1);
  });

  it('does not snap without angles, or a cluster of two', () => {
    expect(rebuildPath(triangles([31.2, 32.6, 31.9]), { tolerance: 0.1 }).snapped).toEqual([]);
    expect(rebuildPath(triangles([31.2, 32.6, 45]), { tolerance: 0.1, angles: 'auto' }).snapped).toEqual([]);
  });

  it('keeps the hole and the winding of a ring', async () => {
    // orbit's ring: the outer circle clockwise, the hole counter-clockwise.
    const ring = 'M50 8a42 42 0 1 1 0 84a42 42 0 1 1 0-84zm0 18a24 24 0 1 0 0 48a24 24 0 1 0 0-48z';
    const r = rebuildPath(ring, { tolerance: 0.05, angles: 'auto' });
    expect(r.segments.arcs).toBeGreaterThanOrEqual(4);
    expect(r.segments.cubics + r.segments.lines).toBe(0);
    expect(contourAreas(r.d).map(Math.sign)).toEqual(contourAreas(ring).map(Math.sign));
    for (const rule of ['evenodd', 'nonzero']) {
      const before = await alpha(svgOf(ring, 100, rule), 200);
      const after = await alpha(svgOf(r.d, 100, rule), 200);
      expect(pixelChange(before, after), rule).toBeLessThan(0.002);
      expect(after[100 * 200 + 100], `${rule}: the hole`).toBe(0);
    }
  });

  it('keeps holes and winding when snapping a slightly skewed frame', async () => {
    // Outer contour clockwise, inner counter-clockwise; every edge is off square by up to 1.5°.
    const frame = 'M10 10L90 11.4L91 89L9.5 90ZM30 30L30.6 70L70 70.9L69 29.2Z';
    const r = rebuildPath(frame, { tolerance: 0.05, angles: 'auto' });
    expect(r.snapped.reduce((s, x) => s + x.count, 0)).toBe(8);
    expect(contourAreas(r.d).map(Math.sign)).toEqual(contourAreas(frame).map(Math.sign));
    for (const a of lineAngles(r.d)) expect(Math.min(a % 90, 90 - (a % 90))).toBeLessThan(1.6);
    for (const rule of ['evenodd', 'nonzero']) {
      const after = await alpha(svgOf(r.d, 100, rule), 100);
      expect(after[50 * 100 + 50], `${rule}: the hole`).toBe(0);
      expect(after[20 * 100 + 50], `${rule}: the band`).toBe(255);
    }
  });

  it('refuses a snap that would collapse or flip a contour', () => {
    // A thin wedge between edges at 0° and 2.5°: snapping both to one angle would make them parallel.
    const wedge = 'M0 50L100 50L0 45.63ZM0 70H100V80H0Z';
    const r = rebuildPath(wedge, { tolerance: 0.05, angles: 'auto' });
    const before = contourAreas(wedge);
    const after = contourAreas(r.d);
    expect(after.map(Math.sign)).toEqual(before.map(Math.sign));
    expect(Math.abs(after[0]! / before[0]!)).toBeGreaterThan(0.8);
    expect(Math.abs(after[0]! / before[0]!)).toBeLessThan(1.25);
  });

  it('keeps lines and curves when arcs are turned off', async () => {
    const t = traceRaster(await renderSvg(mark('plain-circle'), { width: 400 }), {});
    const d = t.svg.match(/ d="([^"]+)"/)![1]!;
    const r = rebuildPath(d, { tolerance: 0.5, arcs: false });
    expect(r.segments.arcs).toBe(0);
    expect(r.segments.cubics).toBeGreaterThanOrEqual(2);
    expect(r.d).not.toMatch(/A/);
  });
});

describe('rebuild command', () => {
  async function tracedFoldN(cwd: string): Promise<{ nodes: number }> {
    const t = traceRaster(await renderSvg(mark('fold-n'), { width: 552 }), {});
    writeFileSync(join(cwd, 'traced.svg'), t.svg);
    writeFileSync(join(cwd, 'fold-n.svg'), mark('fold-n'));
    return t;
  }

  it('rebuilds the fold-n trace with fewer nodes and the same form', async () => {
    const cwd = tmp();
    const t = await tracedFoldN(cwd);
    const r = await cmd('rebuild', ['traced.svg', '-o', 'clean.svg', '--against', 'fold-n.svg'], cwd);
    expect(r.out).toBe('clean.svg');
    expect(r.nodesBefore).toBe(t.nodes);
    expect(r.nodesAfter).toBeLessThan(r.nodesBefore as number);
    expect(r.iou).toBeGreaterThanOrEqual(0.96);
    const out = readFileSync(join(cwd, 'clean.svg'), 'utf8');
    expect(await silhouetteIoU(out, mark('fold-n'))).toBeGreaterThanOrEqual(0.96);
    const seg = r.segments as { lines: number; arcs: number; cubics: number };
    expect(seg.lines + seg.arcs + seg.cubics).toBe(r.nodesAfter);
    expect(Array.isArray(r.snapped)).toBe(true);
  });

  it('rebuilds a traced circle and measures it against the raster', async () => {
    const cwd = tmp();
    const png = encodePng(await renderSvg(mark('plain-circle'), { width: 400 }));
    writeFileSync(join(cwd, 'circle.png'), png);
    await cmd('trace', ['circle.png', '-o', 'traced.svg'], cwd);
    const r = await cmd('rebuild', ['traced.svg', '-o', 'clean.svg', '--against', 'circle.png'], cwd);
    const seg = r.segments as { lines: number; arcs: number; cubics: number };
    expect(seg.arcs).toBeGreaterThanOrEqual(1);
    expect(seg.arcs).toBeLessThanOrEqual(2);
    expect(seg.lines + seg.cubics).toBe(0);
    expect(r.iou).toBeGreaterThanOrEqual(0.99);
  });

  it('writes nothing and exits 1 when the rebuild falls below --min-iou', async () => {
    const cwd = tmp();
    const r = await renderSvg(mark('fold-n'), { width: 552, background: '#ffffff' });
    const jpg = jpeg.encode({ width: r.width, height: r.height, data: Buffer.from(r.data) }, 60).data;
    writeFileSync(join(cwd, 'lossy.jpg'), jpg);
    await cmd('trace', ['lossy.jpg', '-o', 'lossy.svg'], cwd);
    writeFileSync(join(cwd, 'fold-n.svg'), mark('fold-n'));
    const err = (await cmd(
      'rebuild',
      ['lossy.svg', '-o', 'clean.svg', '--against', 'fold-n.svg', '--min-iou', '0.999'],
      cwd,
    ).catch((e: unknown) => e)) as MarkiloError;
    expect(err.code).toBeDefined();
    expect(exitCodeFor(err.code)).toBe(1);
    expect(err.details?.iou).toBeLessThan(0.999);
    expect(err.details?.minIou).toBe(0.999);
    expect(existsSync(join(cwd, 'clean.svg'))).toBe(false);
  });

  it('gates on the input itself without --against, and keeps fill rules and colours', async () => {
    const cwd = tmp();
    await tracedFoldN(cwd);
    const r = await cmd('rebuild', ['traced.svg', '-o', 'clean.svg', '--angles', 'none'], cwd);
    expect(r.iou).toBeGreaterThanOrEqual(0.97);
    expect(r.snapped).toEqual([]);
    const out = readFileSync(join(cwd, 'clean.svg'), 'utf8');
    expect(out).toMatch(/fill-rule="evenodd"/);
    expect(out).toMatch(/viewBox="0 0 552 552"/);
    await expect(cmd('rebuild', ['traced.svg', '-o', 'clean.svg'], cwd)).rejects.toMatchObject({
      code: 'EXISTS',
    });
  });

  it('rejects bad options', async () => {
    const cwd = tmp();
    await tracedFoldN(cwd);
    for (const argv of [
      ['--angles', 'steep'],
      ['--tolerance', '0'],
      ['--min-iou', '1.5'],
    ])
      await expect(cmd('rebuild', ['traced.svg', '-o', 'x.svg', ...argv], cwd)).rejects.toMatchObject({
        code: 'USAGE',
      });
  });
});
