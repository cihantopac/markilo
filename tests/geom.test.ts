import { beforeAll, describe, expect, it } from 'vitest';
import {
  booleanOp,
  boundsOf,
  ensurePathKit,
  offsetPath,
  roundCorners,
  strokeOutline,
  transformPath,
} from '../src/geom/pathkit.js';
import { circleD, polygonD, rectD } from '../src/geom/shapes.js';

const commands = (d: string) => (d.match(/[MLCQZ]/g) ?? []).length;

beforeAll(async () => {
  await ensurePathKit();
});

describe('path operations', () => {
  it('subtracts and keeps curves as cubics', () => {
    const d = booleanOp('subtract', [rectD(0, 0, 100, 100), circleD(100, 50, 40)]);
    expect(d).toMatch(/C/);
    expect(d).not.toMatch(/Q/);
    expect(boundsOf(d)).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });
  it('unions overlapping circles into one contour', () => {
    const d = booleanOp('union', [circleD(40, 50, 30), circleD(70, 50, 30)]);
    expect(d.match(/M/g)).toHaveLength(1);
    expect(boundsOf(d).w).toBeCloseTo(90, 1);
  });
  it('refits round stroke caps into a few cubics', () => {
    const d = strokeOutline('M10 50L90 50', 20, 'round', 'round');
    expect(commands(d)).toBeLessThan(14);
    const b = boundsOf(d);
    expect(b.x).toBeCloseTo(0, 0);
    expect(b.w).toBeCloseTo(100, 0);
    expect(b.h).toBeCloseTo(20, 0);
  });
  it('offsets and rounds corners', () => {
    const grown = boundsOf(offsetPath(rectD(0, 0, 100, 100), 10));
    expect(grown.w).toBeCloseTo(120, 0);
    const rounded = roundCorners(rectD(0, 0, 100, 100), 20);
    expect(boundsOf(rounded).w).toBeCloseTo(100, 0);
    expect(rounded).toMatch(/C/);
    expect(commands(rounded)).toBeLessThan(20);
  });
  // Regression: Skia emits even-odd data (holes may run the same way as outlines); reading it back as nonzero
  // filled every hole, so xor overlaps stayed filled and shrinking a polygon returned nothing.
  it('keeps holes through xor, negative offsets and fillets on polygons', () => {
    const tri = polygonD([
      [100, 800],
      [500, 100],
      [900, 800],
    ]);
    const shrunk = boundsOf(offsetPath(tri, -40));
    expect(shrunk.w).toBeGreaterThan(600);
    expect(shrunk.w).toBeLessThan(800);
    const rounded = boundsOf(roundCorners(tri, 40));
    expect(rounded.w).toBeGreaterThan(700);
    const x = booleanOp('xor', [rectD(0, 0, 300, 300), rectD(150, 150, 300, 300)]);
    const overlap = booleanOp('intersect', [x, rectD(160, 160, 130, 130)]);
    expect(overlap).toBe('');
    const hollow = booleanOp('subtract', [rectD(0, 0, 100, 100), rectD(20, 20, 60, 60)]);
    expect(booleanOp('intersect', [hollow, rectD(40, 40, 20, 20)])).toBe('');
  });
  it('transforms with SVG matrix order', () => {
    const d = transformPath(rectD(0, 0, 10, 10), [1, 0, 0, 1, 5, 7]);
    expect(boundsOf(d)).toEqual({ x: 5, y: 7, w: 10, h: 10 });
  });
});
