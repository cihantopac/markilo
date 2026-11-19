import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import { describe, expect, it } from 'vitest';
import { contrastRatio, hexToRgb } from '../src/analyze/color.js';
import { locateMark, measureInSitu } from '../src/analyze/locate.js';
import { sampleFromSvg } from '../src/analyze/mark.js';
import { parseCommand } from '../src/cli/args.js';
import { findCommand } from '../src/cli/commands.js';
import type { MarkiloError } from '../src/core/errors.js';
import { createRaster, type Raster } from '../src/render/image.js';
import { decodeImage, encodePng } from '../src/render/png.js';
import { renderSvg } from '../src/render/resvg.js';
import { nestSvg, svgDocument } from '../src/svg/compose.js';
import { mark, synthBrand } from './helpers.js';

type Box = { x: number; y: number; w: number; h: number };

/** The mark drawn `size` px wide (its artboard), turned by `angle` degrees, centred on a transparent canvas. */
async function placed(svg: string, size: number, angle: number): Promise<{ img: Raster; ink: Box }> {
  const c = Math.ceil(size * 1.6);
  const o = (c - size) / 2;
  const body = `<g transform="rotate(${angle} ${c / 2} ${c / 2})">${nestSvg(svg, { x: o, y: o, width: size, height: size })}</g>`;
  const img = await renderSvg(svgDocument(c, c, body), { width: c });
  let x0 = c;
  let y0 = c;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < c; y++)
    for (let x = 0; x < c; x++)
      if (img.data[(y * c + x) * 4 + 3]! >= 128) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  return { img, ink: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}

function fillRect(dst: Raster, x: number, y: number, w: number, h: number, hex: string): void {
  const { r, g, b } = hexToRgb(hex);
  for (let yy = Math.max(0, y); yy < Math.min(dst.height, y + h); yy++)
    for (let xx = Math.max(0, x); xx < Math.min(dst.width, x + w); xx++)
      dst.data.set([r, g, b, 255], (yy * dst.width + xx) * 4);
}

function composite(dst: Raster, src: Raster, ox: number, oy: number): void {
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) {
      const dx = x + ox;
      const dy = y + oy;
      if (dx < 0 || dy < 0 || dx >= dst.width || dy >= dst.height) continue;
      const s = (y * src.width + x) * 4;
      const a = src.data[s + 3]! / 255;
      if (!a) continue;
      const d = (dy * dst.width + dx) * 4;
      for (let k = 0; k < 3; k++)
        dst.data[d + k] = Math.round(src.data[s + k]! * a + dst.data[d + k]! * (1 - a));
    }
}

const GROUND = '#7f8288';
/** About 1.27:1 against the ground, like the field report's launcher tile. */
const TILE = '#6e7177';

interface Launcher {
  photo: Raster;
  /** The target mark's ink box in the photo, when it was placed. */
  box?: Box;
  tiles: Box[];
}

/**
 * A synthetic TV launcher: a row of tiles on a grey ground, each carrying one of `marks` (null leaves it empty).
 * The target (`target`) goes into tile `at`, `size` px wide and turned by `angle` degrees.
 */
async function launcher(opts: {
  width: number;
  height: number;
  marks: (string | null)[];
  target?: { svg: string; at: number; size: number; angle: number };
}): Promise<Launcher> {
  const { width, height } = opts;
  const photo = createRaster(width, height, [...Object.values(hexToRgb(GROUND)), 255] as [
    number,
    number,
    number,
    number,
  ]);
  const n = opts.marks.length;
  const tileSize = Math.round((width * 0.8) / n);
  const gap = Math.round((width - tileSize * n) / (n + 1));
  const top = Math.round((height - tileSize) / 2);
  const tiles: Box[] = [];
  let box: Box | undefined;
  for (let i = 0; i < n; i++) {
    const t = { x: gap + i * (tileSize + gap), y: top, w: tileSize, h: tileSize };
    tiles.push(t);
    fillRect(photo, t.x, t.y, t.w, t.h, TILE);
    const tgt = opts.target && opts.target.at === i ? opts.target : undefined;
    const svg = tgt ? tgt.svg : opts.marks[i];
    if (!svg) continue;
    const { img, ink } = await placed(svg, tgt ? tgt.size : Math.round(tileSize * 0.7), tgt ? tgt.angle : 0);
    const ox = Math.round(t.x + (t.w - img.width) / 2);
    const oy = Math.round(t.y + (t.h - img.height) / 2);
    composite(photo, img, ox, oy);
    if (tgt) box = { x: ink.x + ox, y: ink.y + oy, w: ink.w, h: ink.h };
  }
  return { photo, tiles, ...(box ? { box } : {}) };
}

function expectBox(got: Box, want: Box, tol = 0.04): void {
  expect(Math.abs(got.x - want.x)).toBeLessThanOrEqual(want.w * tol);
  expect(Math.abs(got.y - want.y)).toBeLessThanOrEqual(want.h * tol);
  expect(Math.abs(got.w - want.w)).toBeLessThanOrEqual(want.w * tol);
  expect(Math.abs(got.h - want.h)).toBeLessThanOrEqual(want.h * tol);
}

const jpegOf = (r: Raster, quality = 72) =>
  decodeImage(jpeg.encode({ width: r.width, height: r.height, data: Buffer.from(r.data) }, quality).data);

const DISTRACTORS = [mark('bolt'), mark('bars'), mark('leaf-letter'), mark('orbit')];
const TARGET = mark('fold-n');

describe('locateMark', () => {
  it('finds a scaled, slightly turned mark on a launcher tile (box within 4 %, score ≥ 0.7)', async () => {
    const l = await launcher({
      width: 1280,
      height: 720,
      marks: [null, null, null, null, null],
      target: { svg: TARGET, at: 2, size: 150, angle: 4 },
    });
    const found = await locateMark(l.photo, TARGET);
    expect(found).toBeDefined();
    expect(found!.score).toBeGreaterThanOrEqual(0.7);
    expectBox(found!.box, l.box!);
    expect(found!.scale).toBeCloseTo(150 / 256, 1);
  });

  it('finds it in a JPEG of the screen too', async () => {
    const l = await launcher({
      width: 1280,
      height: 720,
      marks: [DISTRACTORS[0]!, null, null, DISTRACTORS[1]!, null],
      target: { svg: TARGET, at: 1, size: 130, angle: -3 },
    });
    const found = await locateMark(jpegOf(l.photo), TARGET);
    expect(found).toBeDefined();
    expect(found!.score).toBeGreaterThanOrEqual(0.7);
    expectBox(found!.box, l.box!);
  });

  it('says "not found" for a photo without the mark', async () => {
    const l = await launcher({ width: 1280, height: 720, marks: [null, null, null, null, null] });
    expect(await locateMark(l.photo, TARGET)).toBeUndefined();
  });

  it('says "not found" on a busy screen of other marks, and picks the right tile when the mark is there', async () => {
    const marks = [...DISTRACTORS, DISTRACTORS[0]!, DISTRACTORS[2]!];
    const absent = await launcher({ width: 1600, height: 900, marks });
    expect(await locateMark(absent.photo, TARGET)).toBeUndefined();
    expect(await locateMark(jpegOf(absent.photo), TARGET)).toBeUndefined();

    const present = await launcher({
      width: 1600,
      height: 900,
      marks,
      target: { svg: TARGET, at: 4, size: 140, angle: 2 },
    });
    for (const photo of [present.photo, jpegOf(present.photo)]) {
      const found = await locateMark(photo, TARGET);
      expect(found).toBeDefined();
      expectBox(found!.box, present.box!);
      const t = present.tiles[4]!;
      expect(found!.box.x).toBeGreaterThan(t.x);
      expect(found!.box.x + found!.box.w).toBeLessThan(t.x + t.w);
    }
  });

  it('locates in a 1920×1080 and a 4000×3000 photo within a few seconds', async () => {
    for (const [width, height, size] of [
      [1920, 1080, 160],
      [4000, 3000, 420],
    ] as const) {
      const l = await launcher({
        width,
        height,
        marks: [DISTRACTORS[1]!, null, DISTRACTORS[2]!, null, DISTRACTORS[3]!, null],
        target: { svg: TARGET, at: 3, size, angle: 3 },
      });
      const t0 = performance.now();
      const found = await locateMark(l.photo, TARGET);
      const ms = performance.now() - t0;
      expect(found).toBeDefined();
      expectBox(found!.box, l.box!);
      // About 1 s each on its own; the bound leaves room for a loaded, parallel test run.
      expect(ms).toBeLessThan(8000);
    }
  });
});

const RING =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="#2346d8" fill-rule="evenodd" d="M50 8a42 42 0 1 1 0 84a42 42 0 1 1 0-84zm0 18a24 24 0 1 0 0 48a24 24 0 1 0 0-48z"/></svg>';
const SQUARE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" fill="#222"/></svg>';

/** A text-like screen: rows of black glyph-sized bars on white (a settings page, an app's text). */
function textScreen(width: number, height: number): Raster {
  const img = createRaster(width, height, [255, 255, 255, 255]);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let line = 0; line * 23 + 40 < height; line++)
    for (let x = 20; x < width - 20; ) {
      const w = 3 + Math.floor(rnd() * 14);
      const h = 10 + Math.floor(rnd() * 8);
      if (rnd() < 0.8) fillRect(img, x, 20 + line * 23 + (18 - h), w, h, '#000000');
      x += w + 2 + Math.floor(rnd() * 4);
    }
  return img;
}

describe('locateMark hard negatives', () => {
  const absent = async (photo: Raster, target: string) => {
    expect(await locateMark(photo, target)).toBeUndefined();
    expect(await locateMark(jpegOf(photo), target)).toBeUndefined();
  };
  it('does not take a mirrored mark for the mark', async () => {
    const l = await launcher({ width: 1280, height: 720, marks: [null, mark('orbit-mirrored'), null] });
    await absent(l.photo, mark('orbit'));
  });
  it('does not take a plain disc for a ring or for orbit', async () => {
    const l = await launcher({ width: 1280, height: 720, marks: [null, mark('plain-circle'), null] });
    await absent(l.photo, mark('orbit'));
    await absent(l.photo, RING);
  });
  it('does not take a cluster of glyphs on a text screen for a mark', async () => {
    const photo = textScreen(1280, 720);
    for (const t of [mark('bars'), mark('bolt'), SQUARE, TARGET]) await absent(photo, t);
  });
  it('does not take an empty tile for a plain square mark', async () => {
    const l = await launcher({ width: 1280, height: 720, marks: [null, null, null, null] });
    await absent(l.photo, SQUARE);
  });
  it('still finds orbit among its mirror image, its tweak and a plain disc', async () => {
    const l = await launcher({
      width: 1600,
      height: 900,
      marks: [mark('orbit-mirrored'), mark('orbit-tweaked'), null, mark('plain-circle')],
      target: { svg: mark('orbit'), at: 2, size: 200, angle: -2 },
    });
    for (const photo of [l.photo, jpegOf(l.photo)]) {
      const found = await locateMark(photo, mark('orbit'));
      expect(found).toBeDefined();
      expect(found!.score).toBeGreaterThanOrEqual(0.7);
      expectBox(found!.box, l.box!);
    }
  });
  it('says "not found" without throwing on tiny, flat and strip-shaped photos', async () => {
    for (const photo of [
      createRaster(1, 1, [0, 0, 0, 255]),
      createRaster(2, 3, [0, 0, 0, 255]),
      createRaster(15, 15, [255, 255, 255, 255]),
      createRaster(1000, 800, [0, 0, 0, 255]),
      createRaster(1000, 800, [255, 255, 255, 255]),
      createRaster(600, 400, [0, 0, 0, 0]),
      createRaster(1, 4000, [128, 128, 128, 255]),
      createRaster(5000, 10, [128, 128, 128, 255]),
    ])
      expect(await locateMark(photo, TARGET)).toBeUndefined();
  });
});

describe('measureInSitu', () => {
  it('measures tile-to-ground contrast, ink-to-ring contrast, shares and the smallest stroke', async () => {
    const want = contrastRatio(TILE, GROUND);
    expect(want).toBeGreaterThan(1.2);
    expect(want).toBeLessThan(1.35);
    const l = await launcher({
      width: 1280,
      height: 720,
      marks: [null, null, null, null, null],
      target: { svg: TARGET, at: 2, size: 150, angle: 4 },
    });
    for (const photo of [l.photo, jpegOf(l.photo)]) {
      const found = (await locateMark(photo, TARGET))!;
      const m = await measureInSitu(photo, TARGET, found);
      expect(m.tile).not.toBeNull();
      expect(Math.abs(m.contrast.tileToSurround!.ratio - want)).toBeLessThanOrEqual(0.05);
      // fold-n's dominant blue on the tile.
      expect(Math.abs(m.contrast.inkToRing!.ratio - contrastRatio('#3b5bdb', TILE))).toBeLessThanOrEqual(
        0.25,
      );
      const t = l.tiles[2]!;
      expectBox(m.tile!, t, 0.03);
      expect(m.share.tile).toBeCloseTo((l.box!.w * l.box!.h) / (t.w * t.h), 2);
      expect(m.share.frame).toBeCloseTo((l.box!.w * l.box!.h) / (1280 * 720), 3);
      const minFeature = (await sampleFromSvg(TARGET, { id: 'fold-n' })).features.minFeature;
      expect(m.smallestStrokePx).toBeCloseTo(minFeature * (150 / 256), 0);
    }
  });
});

async function cmd(argv: string[], cwd: string): Promise<Record<string, unknown>> {
  const f = findCommand(['audit', 'in-situ'])!;
  return (await f.spec.run(parseCommand(f.spec, argv, cwd))) as Record<string, unknown>;
}

describe('audit in-situ', () => {
  it('prints the measurements and writes reports/in-situ-<id>.png with the box drawn', async () => {
    const { ws, dir } = synthBrand();
    const l = await launcher({
      width: 1280,
      height: 720,
      marks: [DISTRACTORS[0]!, null, null, null, DISTRACTORS[1]!],
      target: { svg: TARGET, at: 2, size: 150, angle: 4 },
    });
    writeFileSync(join(dir, 'tv-home.png'), encodePng(l.photo));
    writeFileSync(join(dir, 'mark.svg'), TARGET);
    const r = await cmd(['--brand', 'nimbra', '--photo', 'tv-home.png', '--mark', 'mark.svg'], dir);
    expect(r.found).toBe(true);
    expectBox(r.box as Box, l.box!);
    const contrast = r.contrast as { inkToRing: { ratio: number }; tileToSurround: { ratio: number } };
    expect(Math.abs(contrast.tileToSurround.ratio - contrastRatio(TILE, GROUND))).toBeLessThanOrEqual(0.05);
    expect(r.smallestStrokePx).toBeGreaterThan(0);
    const out = join(ws.reportsDir('nimbra'), 'in-situ-tv-home.png');
    expect(r.report).toBe(out);
    expect(existsSync(out)).toBe(true);
    const png = decodeImage(readFileSync(out));
    expect(png.width).toBe(1280);
  });

  it('reports "not found" with a non-zero exit and writes no report', async () => {
    const { ws, dir } = synthBrand();
    const l = await launcher({ width: 1280, height: 720, marks: [DISTRACTORS[0]!, null, DISTRACTORS[2]!] });
    writeFileSync(join(dir, 'empty.png'), encodePng(l.photo));
    writeFileSync(join(dir, 'mark.svg'), TARGET);
    const r = await cmd(['--brand', 'nimbra', '--photo', 'empty.png', '--mark', 'mark.svg'], dir);
    expect(r.found).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(existsSync(join(ws.reportsDir('nimbra'), 'in-situ-empty.png'))).toBe(false);
  });

  it('reads --photo as an in-situ reference id, and refuses a reference of another category', async () => {
    const { ws, dir } = synthBrand();
    const l = await launcher({
      width: 1280,
      height: 720,
      marks: [null, null, null],
      target: { svg: TARGET, at: 1, size: 150, angle: 0 },
    });
    writeFileSync(join(dir, 'home.png'), encodePng(l.photo));
    writeFileSync(join(dir, 'mark.svg'), TARGET);
    const add = async (category: string, file: string) => {
      const f = findCommand(['reference', 'add'])!;
      const argv = [
        '--brand',
        'nimbra',
        '--file',
        file,
        '--name',
        'TV home',
        '--source',
        'photo',
        '--category',
        category,
      ];
      return ((await f.spec.run(parseCommand(f.spec, argv, dir))) as { added: string }).added;
    };
    const id = await add('in-situ', 'home.png');
    const r = await cmd(['--brand', 'nimbra', '--photo', id, '--mark', 'mark.svg'], dir);
    expect(r.found).toBe(true);
    expectBox(r.box as Box, l.box!);
    expect(r.report).toBe(join(ws.reportsDir('nimbra'), `in-situ-${id}.png`));
    expect(existsSync(r.report as string)).toBe(true);

    const other = await add('inspiration', 'mark.svg');
    const err = (await cmd(['--brand', 'nimbra', '--photo', other, '--mark', 'mark.svg'], dir).catch(
      (e: unknown) => e,
    )) as MarkiloError;
    expect(err.code).toBe('USAGE');
    expect(err.message).toContain('not an in-situ photo');
  });

  it('refuses a --photo that is neither a file nor an in-situ reference', async () => {
    const { dir } = synthBrand();
    writeFileSync(join(dir, 'mark.svg'), TARGET);
    const err = (await cmd(['--brand', 'nimbra', '--photo', 'ref-nope', '--mark', 'mark.svg'], dir).catch(
      (e: unknown) => e,
    )) as MarkiloError;
    expect(err.code).toBe('USAGE');
    expect(err.message).toContain('ref-nope');
  });
});
