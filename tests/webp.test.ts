import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { transformed } from '../src/analyze/calibrate.js';
import { loadMark } from '../src/analyze/mark.js';
import { silhouetteIoU } from '../src/analyze/silhouette.js';
import { parseCommand } from '../src/cli/args.js';
import { findCommand } from '../src/cli/commands.js';
import { MarkiloError } from '../src/core/errors.js';
import { inkMask, type Raster } from '../src/render/image.js';
import { decodeImage } from '../src/render/png.js';
import { decodeWebp, rasterMime } from '../src/render/webp.js';
import { readReferences } from '../src/report/originality.js';
import { referenceExtOf } from '../src/research/competitors.js';
import { mark, synthBrand, tmp } from './helpers.js';

// Fixtures: synthetic marks from tests/fixtures/marks rendered in Chromium by scripts/make-webp-fixtures.mjs.
const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`./fixtures/raster/${name}`, import.meta.url)));

/** The RIFF chunks of a WebP file, in order. */
function chunks(buf: Uint8Array): [string, Uint8Array][] {
  const out: [string, Uint8Array][] = [];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  for (let p = 12; p + 8 <= buf.length; ) {
    const size = dv.getUint32(p + 4, true);
    out.push([String.fromCharCode(...buf.subarray(p, p + 4)), buf.subarray(p + 8, p + 8 + size)]);
    p += 8 + size + (size & 1);
  }
  return out;
}

/** A WebP file made of the given chunks. */
function riff(list: [string, Uint8Array][]): Uint8Array {
  const parts: number[] = [];
  for (const [type, data] of list) {
    parts.push(...Buffer.from(type, 'ascii'));
    const n = data.length;
    parts.push(n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24, ...data);
    if (n & 1) parts.push(0);
  }
  const size = 4 + parts.length;
  return new Uint8Array([
    ...Buffer.from('RIFF'),
    size & 255,
    (size >> 8) & 255,
    (size >> 16) & 255,
    size >>> 24,
    ...Buffer.from('WEBP'),
    ...parts,
  ]);
}

const u24 = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255];
const vp8x = (flags: number, w: number, h: number) =>
  new Uint8Array([flags, 0, 0, 0, ...u24(w - 1), ...u24(h - 1)]);
const chunk = (file: Uint8Array, type: string) => chunks(file).find(([t]) => t === type)![1];

function meanAbsError(a: Raster, b: Raster, channel: number, where?: (i: number) => boolean): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.width * a.height; i++) {
    if (where && !where(i)) continue;
    sum += Math.abs(a.data[i * 4 + channel]! - b.data[i * 4 + channel]!);
    n++;
  }
  return sum / n;
}

/** IoU of the ink masks (alpha, or distance from the background for opaque images) of two rasters. */
function maskIoU(a: Raster, b: Raster): number {
  const ma = inkMask(a);
  const mb = inkMask(b);
  let inter = 0;
  let union = 0;
  for (let i = 0; i < ma.length; i++) {
    const x = ma[i]! > 0.5;
    const y = mb[i]! > 0.5;
    if (x && y) inter++;
    if (x || y) union++;
  }
  return inter / union;
}

function expectInvalid(fn: () => unknown, message?: RegExp): void {
  let error: unknown;
  try {
    fn();
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(MarkiloError);
  expect((error as MarkiloError).code).toBe('INVALID_INPUT');
  if (message) expect((error as MarkiloError).message).toMatch(message);
}

/** Boolean entropy encoder of RFC 6386 section 7.3, to write hand-made VP8 frame headers. */
class BoolEncoder {
  readonly out: number[] = [];
  private range = 255;
  private bottom = 0;
  private bitCount = 24;
  put(bit: number, prob = 128): void {
    const split = 1 + (((this.range - 1) * prob) >> 8);
    if (bit) {
      this.bottom += split;
      this.range -= split;
    } else this.range = split;
    while (this.range < 128) {
      this.range <<= 1;
      if (this.bottom >= 0x80000000) {
        let i = this.out.length - 1;
        while (i >= 0 && this.out[i] === 255) this.out[i--] = 0;
        this.out[i]!++;
      }
      this.bottom = (this.bottom * 2) % 0x100000000;
      if (!--this.bitCount) {
        this.out.push(this.bottom >>> 24);
        this.bottom &= 0xffffff;
        this.bitCount = 8;
      }
    }
  }
  value(v: number, bits: number): void {
    for (let b = bits - 1; b >= 0; b--) this.put((v >> b) & 1);
  }
  finish(): number[] {
    for (let i = 0; i < 32; i++) this.put(0);
    return this.out;
  }
}

/** A 16×16 VP8 key frame whose header asks for 2^log2 token partitions, followed by `tail`. */
function vp8Frame(log2Partitions: number, tail: number[]): Uint8Array {
  const e = new BoolEncoder();
  e.put(0); // colour space
  e.put(0); // clamping
  e.put(0); // no segmentation
  e.put(0); // normal loop filter
  e.value(0, 6); // filter level
  e.value(0, 3); // sharpness
  e.put(0); // no loop-filter deltas
  e.value(log2Partitions, 2);
  const first = e.finish();
  const tag = (first.length << 5) | 0x10; // key frame, version 0, shown
  return new Uint8Array([
    tag & 255,
    (tag >> 8) & 255,
    (tag >> 16) & 255,
    0x9d,
    0x01,
    0x2a,
    16,
    0,
    16,
    0,
    ...first,
    ...tail,
  ]);
}

/** LSB-first bit writer for hand-made VP8L streams. */
function vp8lBits(fields: [number, number][]): Uint8Array {
  const out: number[] = [];
  let acc = 0;
  let n = 0;
  for (const [value, bits] of fields) {
    for (let b = 0; b < bits; b++) {
      acc |= ((value >> b) & 1) << n;
      if (++n === 8) {
        out.push(acc);
        acc = 0;
        n = 0;
      }
    }
  }
  if (n) out.push(acc);
  return new Uint8Array(out);
}

/** A one-frame animated WebP: leaf-lossless.webp placed at (4, 2) on a canvas 10 × 6 px larger. */
function animatedWebp(): Uint8Array {
  const still = fixture('leaf-lossless.webp');
  const frame = decodeWebp(still);
  const anmf = new Uint8Array([
    ...u24(2), // x / 2
    ...u24(1), // y / 2
    ...u24(frame.width - 1),
    ...u24(frame.height - 1),
    ...u24(100), // duration
    0,
    ...riff([['VP8L', chunk(still, 'VP8L')]]).subarray(12),
  ]);
  return riff([
    ['VP8X', vp8x(0x02, frame.width + 10, frame.height + 6)],
    ['ANIM', new Uint8Array([0, 0, 0, 0, 0, 0])],
    ['ANMF', anmf],
  ]);
}

/** Deterministic PRNG for the corruption sweep. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return s / 0x100000000;
  };
}

describe('WebP decoding', () => {
  it('decodes lossless WebP pixel-identical to the PNG of the same render', () => {
    for (const [webp, png] of [
      ['orbit-lossless.webp', 'orbit.png'],
      ['leaf-lossless.webp', 'leaf.png'],
      ['bolt-alpha-lossless.webp', 'bolt-alpha.png'],
    ] as const) {
      const a = decodeImage(fixture(webp));
      const b = decodeImage(fixture(png));
      expect([a.width, a.height], webp).toEqual([b.width, b.height]);
      expect(Buffer.from(a.data).equals(Buffer.from(b.data)), webp).toBe(true);
    }
  });

  it('decodes lossy WebP within a mean absolute error of 6 per channel', () => {
    const a = decodeImage(fixture('orbit-lossy.webp'));
    const b = decodeImage(fixture('orbit.png'));
    expect([a.width, a.height]).toEqual([b.width, b.height]);
    for (let c = 0; c < 4; c++) expect(meanAbsError(a, b, c)).toBeLessThanOrEqual(6);

    const alpha = decodeImage(fixture('bolt-alpha-lossy.webp'));
    const ref = decodeImage(fixture('bolt-alpha.png'));
    expect(meanAbsError(alpha, ref, 3)).toBeLessThanOrEqual(6);
    // Colour only means something where the mark is opaque.
    const opaque = (i: number) => ref.data[i * 4 + 3]! === 255;
    for (let c = 0; c < 3; c++) expect(meanAbsError(alpha, ref, c, opaque)).toBeLessThanOrEqual(6);
  });

  it('keeps the transparent corners of an alpha WebP', () => {
    for (const name of ['bolt-alpha-lossy.webp', 'bolt-alpha-lossless.webp']) {
      const img = decodeImage(fixture(name));
      const { width: w, height: h } = img;
      for (const [x, y] of [
        [0, 0],
        [w - 1, 0],
        [0, h - 1],
        [w - 1, h - 1],
      ] as const) {
        expect(img.data[(y * w + x) * 4 + 3], `${name} ${x},${y}`).toBe(0);
      }
    }
  });

  // The decoded ink mask against the reference render's mask; `trace` on the same file is tested end to end below.
  it('keeps the silhouette of a lossy WebP (mask IoU >= 0.95)', () => {
    expect(
      maskIoU(decodeImage(fixture('orbit-lossy.webp')), decodeImage(fixture('orbit.png'))),
    ).toBeGreaterThanOrEqual(0.95);
    expect(
      maskIoU(decodeImage(fixture('bolt-alpha-lossy.webp')), decodeImage(fixture('bolt-alpha.png'))),
    ).toBeGreaterThanOrEqual(0.95);
  });

  it('decodes the simple file formats (a lone VP8 or VP8L chunk)', () => {
    for (const [name, type] of [
      ['orbit-lossless.webp', 'VP8L'],
      ['orbit-lossy.webp', 'VP8 '],
    ] as const) {
      const file = fixture(name);
      const simple = decodeWebp(riff([[type, chunk(file, type)]]));
      expect(Buffer.from(simple.data).equals(Buffer.from(decodeWebp(file).data)), name).toBe(true);
    }
  });

  it('applies every ALPH filter to raw alpha', () => {
    const file = fixture('bolt-alpha-lossy.webp');
    const { width: w, height: h, data } = decodeWebp(file);
    const alpha = Uint8Array.from({ length: w * h }, (_, i) => data[i * 4 + 3]!);
    const at = (x: number, y: number) => alpha[y * w + x]!;
    for (let filter = 0; filter < 4; filter++) {
      const coded = new Uint8Array(w * h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          let pred = 0;
          if (filter === 0) pred = 0;
          else if (x === 0 && y === 0) pred = 0;
          else if (y === 0) pred = at(x - 1, 0);
          else if (x === 0) pred = at(0, y - 1);
          else if (filter === 1) pred = at(x - 1, y);
          else if (filter === 2) pred = at(x, y - 1);
          else pred = Math.min(255, Math.max(0, at(x - 1, y) + at(x, y - 1) - at(x - 1, y - 1)));
          coded[y * w + x] = (at(x, y) - pred) & 255;
        }
      const out = decodeWebp(
        riff([
          ['VP8X', vp8x(0x10, w, h)],
          ['ALPH', new Uint8Array([filter << 2, ...coded])],
          ['VP8 ', chunk(file, 'VP8 ')],
        ]),
      );
      for (let i = 0; i < w * h; i++)
        if (out.data[i * 4 + 3] !== alpha[i]) throw new Error(`filter ${filter}`);
      expect(Buffer.from(out.data).equals(Buffer.from(data)), `filter ${filter}`).toBe(true);
    }
  });

  it('decodes the first frame of an animated WebP and says so', () => {
    const frame = decodeWebp(fixture('leaf-lossless.webp'));
    const w = frame.width + 10;
    const h = frame.height + 6;
    const out = decodeWebp(animatedWebp());
    expect([out.width, out.height]).toEqual([w, h]);
    expect(out.warnings?.join(' ')).toMatch(/animated/i);
    expect(out.data[3]).toBe(0); // outside the frame
    for (let y = 0; y < frame.height; y++)
      for (let x = 0; x < frame.width; x++)
        for (let c = 0; c < 4; c++)
          if (out.data[((y + 2) * w + x + 4) * 4 + c] !== frame.data[(y * frame.width + x) * 4 + c])
            throw new Error(`frame pixel ${x},${y}`);
  });

  it('refuses a truncated file with INVALID_INPUT', () => {
    for (const name of [
      'orbit-lossless.webp',
      'orbit-lossy.webp',
      'bolt-alpha-lossy.webp',
      'bolt-alpha-lossless.webp',
    ]) {
      const file = fixture(name);
      expectInvalid(() => decodeImage(file.subarray(0, file.length >> 1)));
      for (let cut = 0; cut < file.length; cut += 37) expectInvalid(() => decodeWebp(file.subarray(0, cut)));
    }
  });

  it('refuses declared sizes beyond the pixel cap before allocating', () => {
    expectInvalid(() => decodeWebp(riff([['VP8X', vp8x(0, 16_384, 16_384)]])), /too large/);
    // VP8L header: signature, 14-bit width-1, 14-bit height-1, alpha, version.
    expectInvalid(
      () =>
        decodeWebp(
          riff([
            [
              'VP8L',
              vp8lBits([
                [0x2f, 8],
                [16_383, 14],
                [16_383, 14],
                [0, 1],
                [0, 3],
              ]),
            ],
          ]),
        ),
      /too large/,
    );
    const lossy = vp8Frame(0, [0, 0, 0, 0]);
    lossy.set([0xff, 0x3f, 0xff, 0x3f], 6); // 16383 × 16383
    expectInvalid(() => decodeWebp(riff([['VP8 ', lossy]])), /too large/);
  });

  it('refuses an over-subscribed Huffman code', () => {
    // 1×1, no transform, no colour cache, no meta codes; the green code is a normal code whose code-length code
    // gives three symbols a length of 1.
    const bits = vp8lBits([
      [0x2f, 8],
      [0, 14],
      [0, 14],
      [0, 1],
      [0, 3],
      [0, 1], // no transform
      [0, 1], // no colour cache
      [0, 1], // no meta prefix codes
      [0, 1], // normal code
      [0, 4], // 4 code-length codes
      [1, 3],
      [1, 3],
      [1, 3],
      [0, 3],
      [0, 32],
    ]);
    expectInvalid(() => decodeWebp(riff([['VP8L', bits]])), /Huffman/);
  });

  it('refuses a VP8 frame that claims more partitions than it has', () => {
    // 8 partitions need a 21-byte size table: give it 4 bytes.
    expectInvalid(() => decodeWebp(riff([['VP8 ', vp8Frame(3, [1, 0, 0, 1])]])), /partition/);
    // A full size table whose first partition runs past the end of the chunk.
    expectInvalid(() => decodeWebp(riff([['VP8 ', vp8Frame(1, [200, 0, 0, 5, 5, 5])]])), /partition/);
    // One partition announced, none present.
    expectInvalid(() => decodeWebp(riff([['VP8 ', vp8Frame(0, [])]])), /partition/);
  });

  it('refuses inter frames and malformed containers', () => {
    const inter = vp8Frame(0, [0, 0, 0]);
    inter[0]! |= 1;
    expectInvalid(() => decodeWebp(riff([['VP8 ', inter]])), /key frame/);
    expectInvalid(() => decodeWebp(new Uint8Array(Buffer.from('RIFF\x04\x00\x00\x00WEBP', 'latin1'))));
    expectInvalid(() => decodeImage(new Uint8Array(Buffer.from('RIFF\x10\x00\x00\x00WAVEfmt ', 'latin1'))));
    const file = fixture('bolt-alpha-lossy.webp');
    expectInvalid(
      () =>
        decodeWebp(
          riff([
            ['VP8X', vp8x(0x10, 128, 128)],
            ['ALPH', new Uint8Array([0, 1, 2, 3])],
            ['VP8 ', chunk(file, 'VP8 ')],
          ]),
        ),
      /alpha/i,
    );
  });

  it('ends every corrupted stream in a picture or INVALID_INPUT', () => {
    const rand = prng(1234);
    for (const name of [
      'orbit-lossless.webp',
      'leaf-lossless.webp',
      'bolt-alpha-lossless.webp',
      'orbit-lossy.webp',
      'bolt-alpha-lossy.webp',
    ]) {
      const file = fixture(name);
      const start = 12 + 8 + 10 + 8 + 456; // past VP8X and ICCP
      for (let round = 0; round < 60; round++) {
        const copy = file.slice();
        const flips = 1 + Math.floor(rand() * 4);
        for (let f = 0; f < flips; f++) {
          const at = start + Math.floor(rand() * (copy.length - start));
          copy[at]! ^= 1 << Math.floor(rand() * 8);
        }
        try {
          const img = decodeWebp(copy);
          expect(img.data.length).toBe(img.width * img.height * 4);
        } catch (e) {
          if (!(e instanceof MarkiloError) || e.code !== 'INVALID_INPUT') throw e;
        }
      }
    }
  });
});

async function cmd(name: string, argv: string[], cwd: string): Promise<Record<string, unknown>> {
  const f = findCommand([name])!;
  return (await f.spec.run(parseCommand(f.spec, argv, cwd))) as Record<string, unknown>;
}

describe('WebP end to end', () => {
  it('trace on orbit-lossy.webp reaches IoU >= 0.95 against the SVG it was rendered from', async () => {
    const cwd = tmp();
    writeFileSync(join(cwd, 'orbit.webp'), fixture('orbit-lossy.webp'));
    const r = await cmd('trace', ['orbit.webp', '-o', 'orbit.svg'], cwd);
    expect(r.iou).toBeGreaterThanOrEqual(0.95);
    const svg = readFileSync(join(cwd, 'orbit.svg'), 'utf8');
    expect(await silhouetteIoU(svg, mark('orbit'))).toBeGreaterThanOrEqual(0.95);
    expect(r.warnings).toBeUndefined();
  });

  it('carries the animated-file warning into the JSON of trace and score', async () => {
    const cwd = tmp();
    writeFileSync(join(cwd, 'anim.webp'), animatedWebp());
    const t = await cmd('trace', ['anim.webp', '-o', 'anim.svg'], cwd);
    expect((t.warnings as string[]).join(' ')).toMatch(/animated webp/i);
    const s = await cmd('score', ['anim.webp'], cwd);
    expect(((s.tracedFrom as { warnings: string[] }).warnings ?? []).join(' ')).toMatch(/animated webp/i);
  });

  it('carries the animated-file warning into rebuild --against', async () => {
    const cwd = tmp();
    writeFileSync(join(cwd, 'anim.webp'), animatedWebp());
    await cmd('trace', ['anim.webp', '-o', 'anim.svg'], cwd);
    const r = await cmd('rebuild', ['anim.svg', '-o', 'clean.svg', '--against', 'anim.webp'], cwd);
    expect((r.warnings as string[]).join(' ')).toMatch(/animated webp/i);
  });

  it('loads a WebP as a mark and embeds it as image/webp in calibration', async () => {
    const m = await loadMark(new URL('./fixtures/raster/orbit-lossless.webp', import.meta.url).pathname);
    expect(m.kind).toBe('raster');
    const png = await loadMark(new URL('./fixtures/raster/orbit.png', import.meta.url).pathname);
    expect(m.hashes).toEqual(png.hashes);
    const svg = transformed({ id: 'orbit', raster: fixture('orbit-lossy.webp') }, 'mirror')!;
    expect(svg).toContain('data:image/webp;base64,');
    expect(svg).not.toContain('image/jpeg');
  });
});

describe('WebP references', () => {
  it('reference add stores a WebP photo as in-situ, and audit in-situ resolves it by id', async () => {
    const { ws, dir } = synthBrand();
    writeFileSync(join(dir, 'screen.webp'), fixture('orbit-lossy.webp'));
    const r = await cmd(
      'reference add',
      [
        '--brand',
        'nimbra',
        '--file',
        'screen.webp',
        '--name',
        'Launcher',
        '--source',
        'photo',
        '--category',
        'in-situ',
      ],
      dir,
    );
    const id = r.added as string;
    const ref = readReferences(ws, 'nimbra').references.find((x) => x.id === id)!;
    expect(ref.file.endsWith('.webp')).toBe(true);
    const a = await cmd(
      'audit in-situ',
      [
        '--brand',
        'nimbra',
        '--photo',
        id,
        '--mark',
        new URL('./fixtures/marks/orbit.svg', import.meta.url).pathname,
      ],
      dir,
    );
    // The photo resolves to the stored WebP file and decodes; whether the bare mark is "found" is locate's business.
    const photo = a.photo as { file: string; width: number; height: number };
    expect(photo.file).toBe(join(ws.referencesDir('nimbra'), ref.file));
    expect(photo.width).toBeGreaterThan(0);
  });

  it('similarity calibrate reads WebP files from a folder', async () => {
    const dir = tmp();
    for (const f of ['orbit-lossless.webp', 'leaf-lossless.webp', 'bolt-alpha-lossless.webp'])
      writeFileSync(join(dir, f), fixture(f));
    const r = await cmd('similarity calibrate', [dir], dir);
    expect(r.marks).toBe(3);
  });

  it('labels raster bytes by content, and saves .webp logos found on a site', () => {
    expect(rasterMime(fixture('orbit-lossy.webp'))).toBe('image/webp');
    expect(rasterMime(fixture('orbit.png'))).toBe('image/png');
    expect(rasterMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(referenceExtOf('image/webp', 'https://acme.example/logo')).toBe('.webp');
    expect(referenceExtOf('application/octet-stream', 'https://acme.example/logo.webp?v=2')).toBe('.webp');
  });
});
