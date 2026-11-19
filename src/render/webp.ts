/**
 * WebP decoder without a dependency (RFC 9649 container and lossless bitstream, RFC 6386 lossy key frames).
 *
 * - `VP8L` lossless, with its four transforms and colour cache;
 * - `VP8 ` lossy key frames: boolean decoder, DCT/WHT, loop filter, YUV 4:2:0 to RGB with libwebp's "fancy"
 *   upsampling, so the pixels match what libwebp-based browsers show;
 * - `VP8X` extended files with an `ALPH` chunk (raw or lossless, with its filters), and the first frame of an
 *   animation (with a warning).
 *
 * The input is untrusted: every declared size is checked against the pixel cap before anything is allocated, every
 * read is bounds-checked, and every malformed stream ends in INVALID_INPUT.
 */
import { MarkiloError } from '../core/errors.js';
import { MAX_IMAGE_PIXELS, type Raster } from './image.js';

export type WebpRaster = Raster & { warnings?: string[] };

const fail = (message: string): never => {
  throw new MarkiloError('INVALID_INPUT', `Invalid WebP: ${message}`);
};

function checkSize(width: number, height: number): void {
  if (width < 1 || height < 1) fail('empty image.');
  if (width * height > MAX_IMAGE_PIXELS || width > 16_384 || height > 16_384) {
    throw new MarkiloError('INVALID_INPUT', `WebP is too large to analyze (${width}×${height}).`);
  }
}

const u24 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
const u32 = (b: Uint8Array, o: number) => (u24(b, o) | (b[o + 3]! << 24)) >>> 0;
const fourcc = (b: Uint8Array, o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);

export function isWebp(buf: Uint8Array): boolean {
  return buf.length >= 12 && fourcc(buf, 0) === 'RIFF' && fourcc(buf, 8) === 'WEBP';
}

interface Chunk {
  type: string;
  data: Uint8Array;
}

function readChunks(buf: Uint8Array, start: number, end: number): Chunk[] {
  const out: Chunk[] = [];
  let p = start;
  while (p + 8 <= end) {
    const size = u32(buf, p + 4);
    if (size > end - p - 8) fail(`truncated ${fourcc(buf, p).trim()} chunk.`);
    out.push({ type: fourcc(buf, p), data: buf.subarray(p + 8, p + 8 + size) });
    p += 8 + size + (size & 1);
  }
  return out;
}

/** Decodes a WebP file (still, or the first frame of an animation) to straight RGBA. */
export function decodeWebp(buf: Uint8Array): WebpRaster {
  if (buf.length < 12 || !isWebp(buf)) fail('not a RIFF/WEBP file.');
  const riffSize = u32(buf, 4);
  if (riffSize < 4 || riffSize > buf.length - 8) fail('truncated file.');
  const list = readChunks(buf, 12, 8 + riffSize);
  const first = list[0] ?? fail('no image chunk.');
  if (first.type === 'VP8 ' || first.type === 'VP8L') return decodeFrame(list);
  if (first.type !== 'VP8X') return fail(`unknown first chunk "${first.type}".`);
  const x = first.data;
  if (x.length < 10) fail('truncated VP8X chunk.');
  const width = 1 + u24(x, 4);
  const height = 1 + u24(x, 7);
  checkSize(width, height);
  if (x[0]! & 0x02) {
    const anmf = list.find((c) => c.type === 'ANMF') ?? fail('animation without frames.');
    const f = anmf.data;
    if (f.length < 16) fail('truncated ANMF chunk.');
    const fx = 2 * u24(f, 0);
    const fy = 2 * u24(f, 3);
    const fw = 1 + u24(f, 6);
    const fh = 1 + u24(f, 9);
    if (fx + fw > width || fy + fh > height) fail('animation frame outside the canvas.');
    const frame = decodeFrame(readChunks(f, 16, f.length));
    if (frame.width !== fw || frame.height !== fh) fail('animation frame size does not match its header.');
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < fh; y++) {
      data.set(frame.data.subarray(y * fw * 4, (y + 1) * fw * 4), ((fy + y) * width + fx) * 4);
    }
    return {
      width,
      height,
      data,
      warnings: ['Animated WebP: only the first frame was decoded.'],
    };
  }
  const img = decodeFrame(list);
  if (img.width !== width || img.height !== height) fail('image size does not match the VP8X canvas.');
  return img;
}

function decodeFrame(list: Chunk[]): Raster {
  const image = list.find((c) => c.type === 'VP8 ' || c.type === 'VP8L') ?? fail('no image chunk.');
  if (image.type === 'VP8L') return decodeLossless(image.data);
  return decodeLossy(image.data, list.find((c) => c.type === 'ALPH')?.data);
}

// ---------------------------------------------------------------------------------------------------------------
// VP8L lossless (RFC 9649 section 3+)
// ---------------------------------------------------------------------------------------------------------------

/** LSB-first bit reader; reading past the end is an error (so no loop can spin on missing data). */
class LsbReader {
  pos = 0;
  private readonly bitLength: number;
  constructor(private readonly buf: Uint8Array) {
    this.bitLength = buf.length * 8;
  }
  peek(n: number): number {
    const b = this.buf;
    const i = this.pos >>> 3;
    const v = (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8) | ((b[i + 2] ?? 0) << 16) | ((b[i + 3] ?? 0) << 24);
    return (v >>> (this.pos & 7)) & ((1 << n) - 1);
  }
  skip(n: number): void {
    this.pos += n;
    if (this.pos > this.bitLength) fail('truncated lossless stream.');
  }
  read(n: number): number {
    const v = this.peek(n);
    this.skip(n);
    return v;
  }
}

/** Two-level canonical Huffman table read with LSB-first bit order (entry = length << 16 | symbol). */
interface Huffman {
  root: number;
  table: Int32Array;
}

const ROOT_BITS = 8;
/** Upper bound on Huffman table entries per image: far above real files, far below a memory problem. */
const HUFFMAN_BUDGET = 1 << 24;

interface Budget {
  left: number;
}

function buildHuffman(lengths: Uint8Array, budget: Budget | null): Huffman {
  const count = new Int32Array(16);
  let symbols = 0;
  let only = 0;
  let maxLen = 0;
  for (let s = 0; s < lengths.length; s++) {
    const len = lengths[s]!;
    if (!len) continue;
    count[len]!++;
    symbols++;
    only = s;
    if (len > maxLen) maxLen = len;
  }
  if (symbols === 0) fail('empty Huffman code.');
  if (symbols === 1) return { root: 0, table: Int32Array.of(only) };
  let left = 1;
  for (let len = 1; len < 16; len++) {
    left = left * 2 - count[len]!;
    if (left < 0) fail('over-subscribed Huffman code.');
  }
  if (left !== 0) fail('incomplete Huffman code.');
  const next = new Int32Array(16);
  for (let len = 1, code = 0; len < 16; len++) {
    code = (code + count[len - 1]!) << 1;
    next[len] = code;
  }
  const root = Math.min(ROOT_BITS, maxLen);
  const rootSize = 1 << root;
  const rev = new Int32Array(lengths.length);
  const sub = new Int8Array(rootSize);
  for (let s = 0; s < lengths.length; s++) {
    const len = lengths[s]!;
    if (!len) continue;
    let code = next[len]!++;
    let r = 0;
    for (let i = 0; i < len; i++) {
      r = (r << 1) | (code & 1);
      code >>= 1;
    }
    rev[s] = r;
    if (len > root) {
      const i = r & (rootSize - 1);
      if (len - root > sub[i]!) sub[i] = len - root;
    }
  }
  let total = rootSize;
  const offset = new Int32Array(rootSize);
  for (let i = 0; i < rootSize; i++) {
    if (sub[i]) {
      offset[i] = total;
      total += 1 << sub[i]!;
    }
  }
  if (budget) {
    budget.left -= total;
    if (budget.left < 0) fail('too many Huffman codes.');
  }
  const table = new Int32Array(total);
  for (let i = 0; i < rootSize; i++) if (sub[i]) table[i] = ((32 + sub[i]!) << 16) | offset[i]!;
  for (let s = 0; s < lengths.length; s++) {
    const len = lengths[s]!;
    if (!len) continue;
    const r = rev[s]!;
    if (len <= root) {
      for (let k = r; k < rootSize; k += 1 << len) table[k] = (len << 16) | s;
    } else {
      const i = r & (rootSize - 1);
      const size = 1 << sub[i]!;
      for (let k = r >>> root; k < size; k += 1 << (len - root))
        table[offset[i]! + k] = ((len - root) << 16) | s;
    }
  }
  return { root, table };
}

function readSymbol(h: Huffman, br: LsbReader): number {
  let e = h.table[br.peek(h.root)]!;
  let bits = e >>> 16;
  if (bits >= 32) {
    br.skip(h.root);
    e = h.table[(e & 0xffff) + br.peek(bits - 32)]!;
    bits = e >>> 16;
  }
  br.skip(bits);
  return e & 0xffff;
}

const CODE_LENGTH_ORDER = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

function readHuffmanCode(br: LsbReader, alphabet: number, budget: Budget | null): Huffman {
  const lengths = new Uint8Array(alphabet);
  if (br.read(1)) {
    const two = br.read(1);
    const s0 = br.read(br.read(1) ? 8 : 1);
    if (s0 >= alphabet) fail('Huffman symbol outside its alphabet.');
    lengths[s0] = 1;
    if (two) {
      const s1 = br.read(8);
      if (s1 >= alphabet) fail('Huffman symbol outside its alphabet.');
      lengths[s1] = 1;
    }
    return buildHuffman(lengths, budget);
  }
  const clLengths = new Uint8Array(19);
  const n = br.read(4) + 4;
  for (let i = 0; i < n; i++) clLengths[CODE_LENGTH_ORDER[i]!] = br.read(3);
  const cl = buildHuffman(clLengths, null);
  let max = alphabet;
  if (br.read(1)) {
    max = 2 + br.read(2 + 2 * br.read(3));
    if (max > alphabet) fail('Huffman code longer than its alphabet.');
  }
  let prev = 8;
  for (let s = 0; s < alphabet; ) {
    if (max-- === 0) break;
    const c = readSymbol(cl, br);
    if (c < 16) {
      lengths[s++] = c;
      if (c) prev = c;
      continue;
    }
    const repeat = c === 16 ? 3 + br.read(2) : c === 17 ? 3 + br.read(3) : 11 + br.read(7);
    if (s + repeat > alphabet) fail('Huffman code lengths overflow their alphabet.');
    lengths.fill(c === 16 ? prev : 0, s, s + repeat);
    s += repeat;
  }
  return buildHuffman(lengths, budget);
}

interface Group {
  green: Huffman;
  red: Huffman;
  blue: Huffman;
  alpha: Huffman;
  dist: Huffman;
}

const PREDICTOR = 0;
const CROSS_COLOR = 1;
const SUBTRACT_GREEN = 2;
const COLOR_INDEXING = 3;

interface Transform {
  type: number;
  /** Image width when the transform was read (the width it applies to). */
  xsize: number;
  bits: number;
  data: Uint32Array;
}

const subSize = (size: number, bits: number) => (size + (1 << bits) - 1) >> bits;

/** (dx, dy) of the 120 short distance codes. */
const PLANE = [
  0, 1, 1, 0, 1, 1, -1, 1, 0, 2, 2, 0, 1, 2, -1, 2, 2, 1, -2, 1, 2, 2, -2, 2, 0, 3, 3, 0, 1, 3, -1, 3, 3, 1,
  -3, 1, 2, 3, -2, 3, 3, 2, -3, 2, 0, 4, 4, 0, 1, 4, -1, 4, 4, 1, -4, 1, 3, 3, -3, 3, 2, 4, -2, 4, 4, 2, -4,
  2, 0, 5, 3, 4, -3, 4, 4, 3, -4, 3, 5, 0, 1, 5, -1, 5, 5, 1, -5, 1, 2, 5, -2, 5, 5, 2, -5, 2, 4, 4, -4, 4, 3,
  5, -3, 5, 5, 3, -5, 3, 0, 6, 6, 0, 1, 6, -1, 6, 6, 1, -6, 1, 2, 6, -2, 6, 6, 2, -6, 2, 4, 5, -4, 5, 5, 4,
  -5, 4, 3, 6, -3, 6, 6, 3, -6, 3, 0, 7, 7, 0, 1, 7, -1, 7, 5, 5, -5, 5, 7, 1, -7, 1, 4, 6, -4, 6, 6, 4, -6,
  4, 2, 7, -2, 7, 7, 2, -7, 2, 3, 7, -3, 7, 7, 3, -7, 3, 5, 6, -5, 6, 6, 5, -6, 5, 8, 0, 4, 7, -4, 7, 7, 4,
  -7, 4, 8, 1, 8, 2, 6, 6, -6, 6, 8, 3, 5, 7, -5, 7, 7, 5, -7, 5, 8, 4, 6, 7, -6, 7, 7, 6, -7, 6, 8, 5, 7, 7,
  -7, 7, 8, 6, 8, 7,
];

function prefixValue(symbol: number, br: LsbReader): number {
  if (symbol < 4) return symbol + 1;
  const extra = (symbol - 2) >> 1;
  return ((2 + (symbol & 1)) << extra) + br.read(extra) + 1;
}

/** An entropy-coded image of `xsize` × `ysize` ARGB pixels; level 0 is the main image (transforms, meta codes). */
function decodeImageStream(
  xsize: number,
  ysize: number,
  br: LsbReader,
  level0: boolean,
  budget: Budget,
): Uint32Array {
  const transforms: Transform[] = [];
  let width = xsize;
  if (level0) {
    let seen = 0;
    while (br.read(1)) {
      const type = br.read(2);
      if (seen & (1 << type)) fail('a lossless transform is repeated.');
      seen |= 1 << type;
      const t: Transform = { type, xsize: width, bits: 0, data: new Uint32Array(0) };
      if (type === PREDICTOR || type === CROSS_COLOR) {
        t.bits = br.read(3) + 2;
        t.data = decodeImageStream(subSize(width, t.bits), subSize(ysize, t.bits), br, false, budget);
      } else if (type === COLOR_INDEXING) {
        const colors = br.read(8) + 1;
        t.bits = colors > 16 ? 0 : colors > 4 ? 1 : colors > 2 ? 2 : 3;
        const raw = decodeImageStream(colors, 1, br, false, budget);
        const palette = new Uint32Array(256);
        palette[0] = raw[0]!;
        for (let i = 1; i < colors; i++) palette[i] = addPixels(raw[i]!, palette[i - 1]!);
        t.data = palette;
        width = subSize(width, t.bits);
      }
      transforms.push(t);
    }
  }
  let cacheBits = 0;
  if (br.read(1)) {
    cacheBits = br.read(4);
    if (cacheBits < 1 || cacheBits > 11) fail('invalid colour cache size.');
  }
  let huffBits = 0;
  let entropy: Uint32Array | null = null;
  if (level0 && br.read(1)) {
    huffBits = br.read(3) + 2;
    entropy = decodeImageStream(subSize(width, huffBits), subSize(ysize, huffBits), br, false, budget);
  }
  // Prefix code groups. Only the groups the entropy image uses are kept (a hostile stream may declare 65536).
  let groupCount = 1;
  let slots: Int32Array | null = null;
  let used: Uint8Array | null = null;
  if (entropy) {
    for (const px of entropy) groupCount = Math.max(groupCount, ((px >>> 8) & 0xffff) + 1);
    used = new Uint8Array(groupCount);
    for (const px of entropy) used[(px >>> 8) & 0xffff] = 1;
  }
  const greenSize = 256 + 24 + (cacheBits ? 1 << cacheBits : 0);
  const groups: Group[] = [];
  const slotOf = new Int32Array(groupCount);
  for (let g = 0; g < groupCount; g++) {
    const keep = !used || used[g] === 1;
    const b = keep ? budget : { left: HUFFMAN_BUDGET };
    const group: Group = {
      green: readHuffmanCode(br, greenSize, b),
      red: readHuffmanCode(br, 256, b),
      blue: readHuffmanCode(br, 256, b),
      alpha: readHuffmanCode(br, 256, b),
      dist: readHuffmanCode(br, 40, b),
    };
    if (keep) {
      slotOf[g] = groups.length;
      groups.push(group);
    }
  }
  if (entropy) {
    slots = new Int32Array(entropy.length);
    for (let i = 0; i < entropy.length; i++) slots[i] = slotOf[(entropy[i]! >>> 8) & 0xffff]!;
  }

  const total = width * ysize;
  const out = new Uint32Array(total);
  const mask = huffBits ? (1 << huffBits) - 1 : 0;
  const entropyWidth = subSize(width, huffBits);
  const cache = cacheBits ? new Uint32Array(1 << cacheBits) : null;
  const cacheShift = 32 - cacheBits;
  let cached = 0;
  let group = groups[0]!;
  let pos = 0;
  let x = 0;
  let y = 0;
  let refresh = false;
  while (pos < total) {
    if (slots && (refresh || (x & mask) === 0)) {
      group = groups[slots[(y >> huffBits) * entropyWidth + (x >> huffBits)]!]!;
      refresh = false;
    }
    const code = readSymbol(group.green, br);
    if (code < 256) {
      const r = readSymbol(group.red, br);
      const b = readSymbol(group.blue, br);
      const a = readSymbol(group.alpha, br);
      out[pos++] = ((a << 24) | (r << 16) | (code << 8) | b) >>> 0;
      if (++x === width) {
        x = 0;
        y++;
      }
    } else if (code < 280) {
      const length = prefixValue(code - 256, br);
      const distCode = prefixValue(readSymbol(group.dist, br), br);
      let dist: number;
      if (distCode > 120) dist = distCode - 120;
      else {
        dist = PLANE[(distCode - 1) * 2]! + PLANE[(distCode - 1) * 2 + 1]! * width;
        if (dist < 1) dist = 1;
      }
      if (dist > pos || length > total - pos) fail('back-reference outside the image.');
      for (let i = 0; i < length; i++, pos++) out[pos] = out[pos - dist]!;
      x += length;
      y += Math.floor(x / width);
      x %= width;
      refresh = true;
    } else {
      if (!cache) return fail('colour cache code without a cache.');
      while (cached < pos) {
        const px = out[cached++]!;
        cache[Math.imul(px, 0x1e35a7bd) >>> cacheShift] = px;
      }
      out[pos++] = cache[code - 280]!;
      if (++x === width) {
        x = 0;
        y++;
      }
    }
  }

  let data: Uint32Array = out;
  for (let i = transforms.length - 1; i >= 0; i--) {
    const t = transforms[i]!;
    if (t.type === PREDICTOR) inversePredictor(data, t, ysize);
    else if (t.type === CROSS_COLOR) inverseCrossColor(data, t, ysize);
    else if (t.type === SUBTRACT_GREEN) addGreen(data);
    else data = inverseColorIndexing(data, t, ysize);
  }
  return data;
}

function addPixels(a: number, b: number): number {
  return (
    (((((a & 0xff00ff00) >>> 0) + ((b & 0xff00ff00) >>> 0)) & 0xff00ff00) |
      (((a & 0x00ff00ff) + (b & 0x00ff00ff)) & 0x00ff00ff)) >>>
    0
  );
}

const average2 = (a: number, b: number) => ((((a ^ b) & 0xfefefefe) >>> 1) + (a & b)) >>> 0;
const clip255 = (v: number) => (v < 0 ? 0 : Math.min(v, 255));

function select(l: number, t: number, tl: number): number {
  let pl = 0;
  let pt = 0;
  for (let s = 0; s < 32; s += 8) {
    const lc = (l >>> s) & 255;
    const tc = (t >>> s) & 255;
    const tlc = (tl >>> s) & 255;
    pl += Math.abs(tc - tlc);
    pt += Math.abs(lc - tlc);
  }
  return pl < pt ? l : t;
}

function clampAddSubtractFull(a: number, b: number, c: number): number {
  let out = 0;
  for (let s = 0; s < 32; s += 8) {
    out |= clip255(((a >>> s) & 255) + ((b >>> s) & 255) - ((c >>> s) & 255)) << s;
  }
  return out >>> 0;
}

function clampAddSubtractHalf(a: number, b: number): number {
  let out = 0;
  for (let s = 0; s < 32; s += 8) {
    const ac = (a >>> s) & 255;
    out |= clip255(ac + Math.trunc((ac - ((b >>> s) & 255)) / 2)) << s;
  }
  return out >>> 0;
}

function inversePredictor(data: Uint32Array, t: Transform, ysize: number): void {
  const w = t.xsize;
  const tw = subSize(w, t.bits);
  for (let y = 0; y < ysize; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let pred: number;
      if (y === 0) pred = x === 0 ? 0xff000000 : data[i - 1]!;
      else if (x === 0) pred = data[i - w]!;
      else {
        const l = data[i - 1]!;
        const top = data[i - w]!;
        switch ((t.data[(y >> t.bits) * tw + (x >> t.bits)]! >>> 8) & 15) {
          case 1:
            pred = l;
            break;
          case 2:
            pred = top;
            break;
          case 3:
            pred = data[i - w + 1]!;
            break;
          case 4:
            pred = data[i - w - 1]!;
            break;
          case 5:
            pred = average2(average2(l, data[i - w + 1]!), top);
            break;
          case 6:
            pred = average2(l, data[i - w - 1]!);
            break;
          case 7:
            pred = average2(l, top);
            break;
          case 8:
            pred = average2(data[i - w - 1]!, top);
            break;
          case 9:
            pred = average2(top, data[i - w + 1]!);
            break;
          case 10:
            pred = average2(average2(l, data[i - w - 1]!), average2(top, data[i - w + 1]!));
            break;
          case 11:
            pred = select(l, top, data[i - w - 1]!);
            break;
          case 12:
            pred = clampAddSubtractFull(l, top, data[i - w - 1]!);
            break;
          case 13:
            pred = clampAddSubtractHalf(average2(l, top), data[i - w - 1]!);
            break;
          default:
            pred = 0xff000000;
        }
      }
      data[i] = addPixels(data[i]!, pred);
    }
  }
}

const int8 = (v: number) => (v << 24) >> 24;

function inverseCrossColor(data: Uint32Array, t: Transform, ysize: number): void {
  const w = t.xsize;
  const tw = subSize(w, t.bits);
  for (let y = 0; y < ysize; y++) {
    for (let x = 0; x < w; x++) {
      const e = t.data[(y >> t.bits) * tw + (x >> t.bits)]!;
      const i = y * w + x;
      const px = data[i]!;
      const green = int8(px >>> 8);
      const red = ((px >>> 16) + ((int8(e) * green) >> 5)) & 255;
      const blue = (px + ((int8(e >>> 8) * green) >> 5) + ((int8(e >>> 16) * int8(red)) >> 5)) & 255;
      data[i] = ((px & 0xff00ff00) | (red << 16) | blue) >>> 0;
    }
  }
}

function addGreen(data: Uint32Array): void {
  for (let i = 0; i < data.length; i++) {
    const px = data[i]!;
    const g = (px >>> 8) & 255;
    data[i] = ((px & 0xff00ff00) | (((px & 0x00ff00ff) + ((g << 16) | g)) & 0x00ff00ff)) >>> 0;
  }
}

function inverseColorIndexing(data: Uint32Array, t: Transform, ysize: number): Uint32Array {
  const w = t.xsize;
  const out = new Uint32Array(w * ysize);
  const palette = t.data;
  if (t.bits === 0) {
    for (let i = 0; i < out.length; i++) out[i] = palette[(data[i]! >>> 8) & 255]!;
    return out;
  }
  const pw = subSize(w, t.bits);
  const per = 8 >> t.bits;
  const m = (1 << per) - 1;
  const xm = (1 << t.bits) - 1;
  for (let y = 0; y < ysize; y++) {
    for (let x = 0; x < w; x++) {
      const packed = (data[y * pw + (x >> t.bits)]! >>> 8) & 255;
      out[y * w + x] = palette[(packed >> ((x & xm) * per)) & m]!;
    }
  }
  return out;
}

function decodeLossless(data: Uint8Array): Raster {
  if (data.length < 5 || data[0] !== 0x2f) fail('bad VP8L signature.');
  const br = new LsbReader(data);
  br.skip(8);
  const width = br.read(14) + 1;
  const height = br.read(14) + 1;
  br.read(1); // alpha hint: the pixels say what the alpha is
  if (br.read(3) !== 0) fail('unknown VP8L version.');
  checkSize(width, height);
  const argb = decodeImageStream(width, height, br, true, { left: HUFFMAN_BUDGET });
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < argb.length; i++) {
    const px = argb[i]!;
    out[i * 4] = (px >>> 16) & 255;
    out[i * 4 + 1] = (px >>> 8) & 255;
    out[i * 4 + 2] = px & 255;
    out[i * 4 + 3] = px >>> 24;
  }
  return { width, height, data: out };
}

/** The alpha plane of an ALPH chunk (raw or lossless, then unfiltered). */
function decodeAlpha(chunk: Uint8Array, width: number, height: number): Uint8Array {
  if (chunk.length < 1) fail('empty ALPH chunk.');
  const header = chunk[0]!;
  const method = header & 3;
  const filter = (header >> 2) & 3;
  if (method > 1 || ((header >> 4) & 3) > 1 || header >> 6) fail('unknown alpha compression.');
  const n = width * height;
  let alpha: Uint8Array;
  if (method === 0) {
    if (chunk.length - 1 < n) fail('truncated raw alpha.');
    alpha = chunk.slice(1, 1 + n);
  } else {
    const argb = decodeImageStream(width, height, new LsbReader(chunk.subarray(1)), true, {
      left: HUFFMAN_BUDGET,
    });
    alpha = new Uint8Array(n);
    for (let i = 0; i < n; i++) alpha[i] = (argb[i]! >>> 8) & 255;
  }
  if (filter === 0) return alpha;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let pred: number;
      if (y === 0) pred = x === 0 ? 0 : alpha[i - 1]!;
      else if (x === 0) pred = alpha[i - width]!;
      else if (filter === 1) pred = alpha[i - 1]!;
      else if (filter === 2) pred = alpha[i - width]!;
      else pred = clip255(alpha[i - 1]! + alpha[i - width]! - alpha[i - width - 1]!);
      alpha[i] = (alpha[i]! + pred) & 255;
    }
  }
  return alpha;
}

// ---------------------------------------------------------------------------------------------------------------
// VP8 lossy key frames (RFC 6386), bit-exact with libwebp's decoder
// ---------------------------------------------------------------------------------------------------------------

class BoolDecoder {
  private value = 0;
  private range = 254;
  private bits = -8;
  eof = false;
  constructor(
    private readonly buf: Uint8Array,
    private pos: number,
    private readonly end: number,
  ) {
    this.load();
  }
  private load(): void {
    if (this.pos < this.end) {
      this.bits += 8;
      this.value = (this.value << 8) | this.buf[this.pos++]!;
    } else if (!this.eof) {
      this.value <<= 8;
      this.bits += 8;
      this.eof = true;
    } else {
      this.bits = 0;
    }
  }
  bit(prob: number): number {
    let range = this.range;
    if (this.bits < 0) this.load();
    const pos = this.bits;
    const split = (range * prob) >>> 8;
    let bit = 0;
    if (this.value >>> pos > split) {
      range -= split;
      this.value -= (split + 1) << pos;
      bit = 1;
    } else {
      range = split + 1;
    }
    const shift = 7 ^ (31 - Math.clz32(range));
    this.bits -= shift;
    this.range = (range << shift) - 1;
    return bit;
  }
  literal(n: number): number {
    let v = 0;
    while (n-- > 0) v |= this.bit(0x80) << n;
    return v;
  }
  signed(n: number): number {
    const v = this.literal(n);
    return this.bit(0x80) ? -v : v;
  }
}

const BANDS = [0, 1, 2, 3, 6, 4, 5, 6, 6, 6, 6, 6, 6, 6, 6, 7, 0];
const ZIGZAG = [0, 1, 4, 8, 5, 2, 3, 6, 9, 12, 13, 10, 7, 11, 14, 15];
const CAT = [
  [173, 148, 140],
  [176, 155, 140, 135],
  [180, 157, 141, 134, 130],
  [254, 254, 243, 230, 196, 177, 153, 140, 133, 130, 129],
];
/** Tree of the 4×4 intra modes (negative = leaf, mode = -value). */
const YMODES_INTRA4 = [0, 1, -1, 2, -2, 3, 4, 6, -3, 5, -4, -5, -6, 7, -7, 8, -8, -9];

interface Quant {
  y1: [number, number];
  y2: [number, number];
  uv: [number, number];
}

interface FilterInfo {
  limit: number;
  ilevel: number;
  hev: number;
}

const BPS = 32;
const Y_OFF = BPS + 8;
const clip8 = (v: number) => (v < 0 ? 0 : Math.min(v, 255));

function decodeLossy(data: Uint8Array, alph: Uint8Array | undefined): Raster {
  if (data.length < 10) fail('truncated VP8 frame.');
  const tag = u24(data, 0);
  if (tag & 1) fail('not a key frame (an inter frame cannot be decoded on its own).');
  if (((tag >> 1) & 7) > 3) fail('unknown VP8 profile.');
  if (!((tag >> 4) & 1)) fail('VP8 frame is not displayable.');
  const partLength = tag >>> 5;
  if (data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) fail('bad VP8 start code.');
  const width = (data[6]! | (data[7]! << 8)) & 0x3fff;
  const height = (data[8]! | (data[9]! << 8)) & 0x3fff;
  checkSize(width, height);
  if (partLength > data.length - 10) fail('truncated first VP8 partition.');
  const br = new BoolDecoder(data, 10, 10 + partLength);
  br.literal(2); // colour space, clamping type (clamping is always applied)

  // Segment header.
  const useSegment = br.bit(0x80);
  let updateMap = 0;
  let absoluteDelta = 1;
  const segQuant = [0, 0, 0, 0];
  const segFilter = [0, 0, 0, 0];
  const segProba = [255, 255, 255];
  if (useSegment) {
    updateMap = br.bit(0x80);
    if (br.bit(0x80)) {
      absoluteDelta = br.bit(0x80);
      for (let s = 0; s < 4; s++) segQuant[s] = br.bit(0x80) ? br.signed(7) : 0;
      for (let s = 0; s < 4; s++) segFilter[s] = br.bit(0x80) ? br.signed(6) : 0;
    }
    if (updateMap) for (let s = 0; s < 3; s++) segProba[s] = br.bit(0x80) ? br.literal(8) : 255;
  }

  // Filter header.
  const simple = br.bit(0x80);
  const level = br.literal(6);
  const sharpness = br.literal(3);
  const refDelta = [0, 0, 0, 0];
  const modeDelta = [0, 0, 0, 0];
  const useDelta = br.bit(0x80);
  if (useDelta && br.bit(0x80)) {
    for (let i = 0; i < 4; i++) if (br.bit(0x80)) refDelta[i] = br.signed(6);
    for (let i = 0; i < 4; i++) if (br.bit(0x80)) modeDelta[i] = br.signed(6);
  }
  const filterType = level === 0 ? 0 : simple ? 1 : 2;

  // Token partitions: every announced partition must be present.
  const partCount = 1 << br.literal(2);
  const sizes = 10 + partLength;
  let p = sizes + 3 * (partCount - 1);
  if (p > data.length)
    fail(`VP8 frame announces ${partCount} partitions but the partition table is cut short.`);
  const parts: BoolDecoder[] = [];
  for (let i = 0; i < partCount - 1; i++) {
    const size = u24(data, sizes + 3 * i);
    if (size > data.length - p) fail('a VP8 partition runs past the end of the frame.');
    parts.push(new BoolDecoder(data, p, p + size));
    p += size;
  }
  if (p >= data.length) fail('the last VP8 partition is missing.');
  parts.push(new BoolDecoder(data, p, data.length));

  // Quantizers.
  const baseQ = br.literal(7);
  const delta = () => (br.bit(0x80) ? br.signed(4) : 0);
  const dqY1dc = delta();
  const dqY2dc = delta();
  const dqY2ac = delta();
  const dqUVdc = delta();
  const dqUVac = delta();
  const clipQ = (v: number, max: number) => (v < 0 ? 0 : Math.min(v, max));
  const quants: Quant[] = [];
  for (let s = 0; s < 4; s++) {
    let q = baseQ;
    if (useSegment) q = segQuant[s]! + (absoluteDelta ? 0 : baseQ);
    else if (s > 0) {
      quants.push(quants[0]!);
      continue;
    }
    const y2ac = (AC[clipQ(q + dqY2ac, 127)]! * 101581) >> 16;
    quants.push({
      y1: [DC[clipQ(q + dqY1dc, 127)]!, AC[clipQ(q, 127)]!],
      y2: [DC[clipQ(q + dqY2dc, 127)]! * 2, Math.max(y2ac, 8)],
      uv: [DC[clipQ(q + dqUVdc, 117)]!, AC[clipQ(q + dqUVac, 127)]!],
    });
  }

  br.bit(0x80); // refresh entropy probabilities: irrelevant for a single frame
  const proba = new Uint8Array(1056);
  for (let i = 0; i < 1056; i++) proba[i] = br.bit(UPDATE[i]!) ? br.literal(8) : DEFAULT[i]!;
  const useSkip = br.bit(0x80);
  const skipProba = useSkip ? br.literal(8) : 0;
  if (br.eof) fail('truncated VP8 frame header.');

  // Loop-filter strengths per segment and per "is 4×4".
  const strengths: FilterInfo[][] = [];
  for (let s = 0; s < 4; s++) {
    let base = level;
    if (useSegment) base = segFilter[s]! + (absoluteDelta ? 0 : level);
    const pair: FilterInfo[] = [];
    for (let i4 = 0; i4 < 2; i4++) {
      let lvl = base;
      if (useDelta) {
        lvl += refDelta[0]!;
        if (i4) lvl += modeDelta[0]!;
      }
      lvl = lvl < 0 ? 0 : Math.min(lvl, 63);
      if (lvl > 0) {
        let ilevel = lvl;
        if (sharpness > 0) {
          ilevel >>= sharpness > 4 ? 2 : 1;
          if (ilevel > 9 - sharpness) ilevel = 9 - sharpness;
        }
        if (ilevel < 1) ilevel = 1;
        pair.push({ limit: 2 * lvl + ilevel, ilevel, hev: lvl >= 40 ? 2 : lvl >= 15 ? 1 : 0 });
      } else pair.push({ limit: 0, ilevel: 0, hev: 0 });
    }
    strengths.push(pair);
  }

  const mbw = (width + 15) >> 4;
  const mbh = (height + 15) >> 4;
  const ys = mbw * 16;
  const uvs = mbw * 8;
  const Y = new Uint8Array(ys * mbh * 16);
  const U = new Uint8Array(uvs * mbh * 8);
  const V = new Uint8Array(uvs * mbh * 8);
  const mbFilter: (FilterInfo | null)[] = new Array(mbw * mbh);
  const mbInner = new Uint8Array(mbw * mbh);

  const intraTop = new Uint8Array(mbw * 4);
  const intraLeft = new Uint8Array(4);
  const nzTop = new Uint8Array(mbw * 9);
  const nzLeft = new Uint8Array(9);
  const coeffs = new Int16Array(384);
  const dc = new Int16Array(16);
  const modes = new Uint8Array(16);
  const yw = new Uint8Array(BPS * 17);
  const uw = new Uint8Array(BPS * 9);
  const vw = new Uint8Array(BPS * 9);

  const getCoeffs = (
    tb: BoolDecoder,
    type: number,
    ctx: number,
    dq: [number, number],
    n: number,
    out: Int16Array,
    off: number,
  ): number => {
    let pi = ((type * 8 + BANDS[n]!) * 3 + ctx) * 11;
    while (n < 16) {
      if (!tb.bit(proba[pi]!)) return n;
      while (!tb.bit(proba[pi + 1]!)) {
        if (++n === 16) return 16;
        pi = (type * 8 + BANDS[n]!) * 33;
      }
      let v: number;
      let next: number;
      if (!tb.bit(proba[pi + 2]!)) {
        v = 1;
        next = 1;
      } else {
        next = 2;
        if (!tb.bit(proba[pi + 3]!)) {
          v = tb.bit(proba[pi + 4]!) ? 3 + tb.bit(proba[pi + 5]!) : 2;
        } else if (!tb.bit(proba[pi + 6]!)) {
          v = tb.bit(proba[pi + 7]!) ? 7 + 2 * tb.bit(165) + tb.bit(145) : 5 + tb.bit(159);
        } else {
          const b1 = tb.bit(proba[pi + 8]!);
          const b0 = tb.bit(proba[pi + 9 + b1]!);
          const cat = 2 * b1 + b0;
          v = 0;
          for (const pr of CAT[cat]!) v = 2 * v + tb.bit(pr);
          v += 3 + (8 << cat);
        }
      }
      out[off + ZIGZAG[n]!] = (tb.bit(0x80) ? -v : v) * dq[n > 0 ? 1 : 0];
      n++;
      pi = ((type * 8 + BANDS[n]!) * 3 + next) * 11;
    }
    return 16;
  };

  for (let mby = 0; mby < mbh; mby++) {
    intraLeft.fill(0);
    nzLeft.fill(0);
    const tokens = parts[mby & (partCount - 1)]!;
    for (let mbx = 0; mbx < mbw; mbx++) {
      // Modes, from the first partition.
      const segment = updateMap
        ? !br.bit(segProba[0]!)
          ? br.bit(segProba[1]!)
          : br.bit(segProba[2]!) + 2
        : 0;
      const skip = useSkip ? br.bit(skipProba) : 0;
      const isI4 = !br.bit(145);
      let ymode = 0;
      const top = mbx * 4;
      if (!isI4) {
        ymode = br.bit(156) ? (br.bit(128) ? 1 : 3) : br.bit(163) ? 2 : 0;
        intraTop.fill(ymode, top, top + 4);
        intraLeft.fill(ymode);
      } else {
        for (let y = 0; y < 4; y++) {
          let m = intraLeft[y]!;
          for (let x = 0; x < 4; x++) {
            const pb = (intraTop[top + x]! * 10 + m) * 9;
            let i = YMODES_INTRA4[br.bit(BMODES[pb]!)]!;
            while (i > 0) i = YMODES_INTRA4[2 * i + br.bit(BMODES[pb + i]!)]!;
            m = -i;
            intraTop[top + x] = m;
            modes[y * 4 + x] = m;
          }
          intraLeft[y] = m;
        }
      }
      const uvmode = !br.bit(142) ? 0 : !br.bit(114) ? 2 : br.bit(183) ? 1 : 3;

      // Residuals, from the token partition of this row.
      coeffs.fill(0);
      const tn = mbx * 9;
      let hasCoeffs = false;
      if (!skip) {
        const q = quants[segment]!;
        let first = 0;
        let acType = 3;
        if (!isI4) {
          dc.fill(0);
          const nz = getCoeffs(tokens, 1, nzTop[tn + 8]! + nzLeft[8]!, q.y2, 0, dc, 0);
          nzTop[tn + 8] = nzLeft[8] = nz > 0 ? 1 : 0;
          if (nz > 1) inverseWht(dc, coeffs);
          else {
            const dc0 = (dc[0]! + 3) >> 3;
            for (let i = 0; i < 256; i += 16) coeffs[i] = dc0;
          }
          first = 1;
          acType = 0;
        }
        for (let y = 0; y < 4; y++) {
          for (let x = 0; x < 4; x++) {
            const nz = getCoeffs(
              tokens,
              acType,
              nzTop[tn + x]! + nzLeft[y]!,
              q.y1,
              first,
              coeffs,
              (y * 4 + x) * 16,
            );
            nzTop[tn + x] = nzLeft[y] = nz > first ? 1 : 0;
          }
        }
        for (let ch = 0; ch < 2; ch++) {
          for (let y = 0; y < 2; y++) {
            for (let x = 0; x < 2; x++) {
              const t = tn + 4 + ch * 2 + x;
              const l = 4 + ch * 2 + y;
              const nz = getCoeffs(
                tokens,
                2,
                nzTop[t]! + nzLeft[l]!,
                q.uv,
                0,
                coeffs,
                (16 + ch * 4 + y * 2 + x) * 16,
              );
              nzTop[t] = nzLeft[l] = nz > 0 ? 1 : 0;
            }
          }
        }
        for (let i = 0; i < 384; i++) {
          if (coeffs[i]) {
            hasCoeffs = true;
            break;
          }
        }
      } else {
        nzTop.fill(0, tn, tn + 8);
        nzLeft.fill(0, 0, 8);
        if (!isI4) nzTop[tn + 8] = nzLeft[8] = 0;
      }
      if (tokens.eof) fail('truncated VP8 token partition.');
      const mb = mby * mbw + mbx;
      mbFilter[mb] = filterType ? strengths[segment]![isI4 ? 1 : 0]! : null;
      mbInner[mb] = isI4 || hasCoeffs ? 1 : 0;

      // Reconstruction in the work buffers, then into the planes.
      const px = mbx * 16;
      const py = mby * 16;
      const cx = mbx * 8;
      const cy = mby * 8;
      if (mby === 0) {
        yw.fill(127, Y_OFF - BPS - 1, Y_OFF - BPS + 20);
        uw.fill(127, Y_OFF - BPS - 1, Y_OFF - BPS + 8);
        vw.fill(127, Y_OFF - BPS - 1, Y_OFF - BPS + 8);
      } else {
        const row = (py - 1) * ys;
        yw[Y_OFF - BPS - 1] = mbx === 0 ? 129 : Y[row + px - 1]!;
        yw.set(Y.subarray(row + px, row + px + 16), Y_OFF - BPS);
        if (mbx === mbw - 1) yw.fill(Y[row + px + 15]!, Y_OFF - BPS + 16, Y_OFF - BPS + 20);
        else yw.set(Y.subarray(row + px + 16, row + px + 20), Y_OFF - BPS + 16);
        const crow = (cy - 1) * uvs;
        uw[Y_OFF - BPS - 1] = mbx === 0 ? 129 : U[crow + cx - 1]!;
        vw[Y_OFF - BPS - 1] = mbx === 0 ? 129 : V[crow + cx - 1]!;
        uw.set(U.subarray(crow + cx, crow + cx + 8), Y_OFF - BPS);
        vw.set(V.subarray(crow + cx, crow + cx + 8), Y_OFF - BPS);
      }
      for (let j = 0; j < 16; j++) yw[Y_OFF + j * BPS - 1] = mbx === 0 ? 129 : Y[(py + j) * ys + px - 1]!;
      for (let j = 0; j < 8; j++) {
        uw[Y_OFF + j * BPS - 1] = mbx === 0 ? 129 : U[(cy + j) * uvs + cx - 1]!;
        vw[Y_OFF + j * BPS - 1] = mbx === 0 ? 129 : V[(cy + j) * uvs + cx - 1]!;
      }
      if (isI4) {
        // The top-right samples of the macroblock serve the right column of 4×4 blocks on every row.
        const tr = Y_OFF - BPS + 16;
        for (let k = 1; k < 4; k++) yw.copyWithin(tr + 4 * k * BPS, tr, tr + 4);
        for (let n = 0; n < 16; n++) {
          const o = Y_OFF + (n & 3) * 4 + (n >> 2) * 4 * BPS;
          predict4(yw, o, modes[n]!);
          addResidual(coeffs, n * 16, yw, o);
        }
      } else {
        predictBlock(yw, Y_OFF, 16, dcMode(ymode, mbx, mby));
        for (let n = 0; n < 16; n++)
          addResidual(coeffs, n * 16, yw, Y_OFF + (n & 3) * 4 + (n >> 2) * 4 * BPS);
      }
      const cm = dcMode(uvmode, mbx, mby);
      predictBlock(uw, Y_OFF, 8, cm);
      predictBlock(vw, Y_OFF, 8, cm);
      for (let n = 0; n < 4; n++) {
        const o = Y_OFF + (n & 1) * 4 + (n >> 1) * 4 * BPS;
        addResidual(coeffs, (16 + n) * 16, uw, o);
        addResidual(coeffs, (20 + n) * 16, vw, o);
      }
      for (let j = 0; j < 16; j++)
        Y.set(yw.subarray(Y_OFF + j * BPS, Y_OFF + j * BPS + 16), (py + j) * ys + px);
      for (let j = 0; j < 8; j++) {
        U.set(uw.subarray(Y_OFF + j * BPS, Y_OFF + j * BPS + 8), (cy + j) * uvs + cx);
        V.set(vw.subarray(Y_OFF + j * BPS, Y_OFF + j * BPS + 8), (cy + j) * uvs + cx);
      }
    }
    if (br.eof) fail('truncated first VP8 partition.');
  }

  if (filterType) {
    for (let mby = 0; mby < mbh; mby++) {
      for (let mbx = 0; mbx < mbw; mbx++) {
        const f = mbFilter[mby * mbw + mbx]!;
        if (!f.limit) continue;
        const inner = mbInner[mby * mbw + mbx]!;
        const yo = mby * 16 * ys + mbx * 16;
        const co = mby * 8 * uvs + mbx * 8;
        if (filterType === 1) {
          if (mbx > 0) simpleFilter(Y, yo, 1, ys, f.limit + 4);
          if (inner) for (let k = 4; k < 16; k += 4) simpleFilter(Y, yo + k, 1, ys, f.limit);
          if (mby > 0) simpleFilter(Y, yo, ys, 1, f.limit + 4);
          if (inner) for (let k = 4; k < 16; k += 4) simpleFilter(Y, yo + k * ys, ys, 1, f.limit);
        } else {
          const { ilevel, hev } = f;
          if (mbx > 0) {
            filterLoop(Y, yo, 1, ys, 16, f.limit + 4, ilevel, hev, true);
            filterLoop(U, co, 1, uvs, 8, f.limit + 4, ilevel, hev, true);
            filterLoop(V, co, 1, uvs, 8, f.limit + 4, ilevel, hev, true);
          }
          if (inner) {
            for (let k = 4; k < 16; k += 4) filterLoop(Y, yo + k, 1, ys, 16, f.limit, ilevel, hev, false);
            filterLoop(U, co + 4, 1, uvs, 8, f.limit, ilevel, hev, false);
            filterLoop(V, co + 4, 1, uvs, 8, f.limit, ilevel, hev, false);
          }
          if (mby > 0) {
            filterLoop(Y, yo, ys, 1, 16, f.limit + 4, ilevel, hev, true);
            filterLoop(U, co, uvs, 1, 8, f.limit + 4, ilevel, hev, true);
            filterLoop(V, co, uvs, 1, 8, f.limit + 4, ilevel, hev, true);
          }
          if (inner) {
            for (let k = 4; k < 16; k += 4)
              filterLoop(Y, yo + k * ys, ys, 1, 16, f.limit, ilevel, hev, false);
            filterLoop(U, co + 4 * uvs, uvs, 1, 8, f.limit, ilevel, hev, false);
            filterLoop(V, co + 4 * uvs, uvs, 1, 8, f.limit, ilevel, hev, false);
          }
        }
      }
    }
  }

  const out = new Uint8Array(width * height * 4);
  yuvToRgba(Y, U, V, ys, uvs, width, height, out);
  if (alph) {
    const alpha = decodeAlpha(alph, width, height);
    for (let i = 0; i < alpha.length; i++) out[i * 4 + 3] = alpha[i]!;
  } else {
    for (let i = 3; i < out.length; i += 4) out[i] = 255;
  }
  return { width, height, data: out };
}

/** DC prediction falls back when the top or left edge lies outside the frame. 4..6 = no top, no left, neither. */
function dcMode(mode: number, mbx: number, mby: number): number {
  if (mode !== 0) return mode;
  if (mbx === 0) return mby === 0 ? 6 : 5;
  return mby === 0 ? 4 : 0;
}

/** 16×16 luma or 8×8 chroma prediction (0 DC, 1 TM, 2 V, 3 H, 4 DC no top, 5 DC no left, 6 DC no edges). */
function predictBlock(b: Uint8Array, o: number, size: number, mode: number): void {
  const shift = size === 16 ? 4 : 3;
  let v = 128;
  if (mode === 0 || mode === 4 || mode === 5) {
    let sum = 0;
    if (mode !== 4) for (let i = 0; i < size; i++) sum += b[o - BPS + i]!;
    if (mode !== 5) for (let i = 0; i < size; i++) sum += b[o - 1 + i * BPS]!;
    v = mode === 0 ? (sum + size) >> (shift + 1) : (sum + (size >> 1)) >> shift;
  }
  for (let y = 0; y < size; y++) {
    const row = o + y * BPS;
    for (let x = 0; x < size; x++) {
      if (mode === 1) b[row + x] = clip8(b[row - 1]! + b[o - BPS + x]! - b[o - BPS - 1]!);
      else if (mode === 2) b[row + x] = b[o - BPS + x]!;
      else if (mode === 3) b[row + x] = b[row - 1]!;
      else b[row + x] = v;
    }
  }
}

const avg3 = (a: number, b: number, c: number) => (a + 2 * b + c + 2) >> 2;
const avg2 = (a: number, b: number) => (a + b + 1) >> 1;

function predict4(b: Uint8Array, o: number, mode: number): void {
  const t = o - BPS;
  const X = b[t - 1]!;
  const A = b[t]!;
  const B = b[t + 1]!;
  const C = b[t + 2]!;
  const D = b[t + 3]!;
  const E = b[t + 4]!;
  const F = b[t + 5]!;
  const G = b[t + 6]!;
  const H = b[t + 7]!;
  const I = b[o - 1]!;
  const J = b[o - 1 + BPS]!;
  const K = b[o - 1 + 2 * BPS]!;
  const L = b[o - 1 + 3 * BPS]!;
  const set = (x: number, y: number, v: number) => {
    b[o + x + y * BPS] = v;
  };
  switch (mode) {
    case 0: {
      const v = (A + B + C + D + I + J + K + L + 4) >> 3;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) set(x, y, v);
      break;
    }
    case 1:
      for (let y = 0; y < 4; y++) {
        const l = b[o - 1 + y * BPS]!;
        for (let x = 0; x < 4; x++) set(x, y, clip8(l + b[t + x]! - X));
      }
      break;
    case 2: {
      const v = [avg3(X, A, B), avg3(A, B, C), avg3(B, C, D), avg3(C, D, E)];
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) set(x, y, v[x]!);
      break;
    }
    case 3: {
      const v = [avg3(X, I, J), avg3(I, J, K), avg3(J, K, L), avg3(K, L, L)];
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) set(x, y, v[y]!);
      break;
    }
    case 4: // down-right
      set(0, 3, avg3(J, K, L));
      set(1, 3, avg3(I, J, K));
      set(0, 2, avg3(I, J, K));
      set(2, 3, avg3(X, I, J));
      set(1, 2, avg3(X, I, J));
      set(0, 1, avg3(X, I, J));
      for (let k = 0; k < 4; k++) set(k, k, avg3(A, X, I));
      set(3, 2, avg3(B, A, X));
      set(2, 1, avg3(B, A, X));
      set(1, 0, avg3(B, A, X));
      set(3, 1, avg3(C, B, A));
      set(2, 0, avg3(C, B, A));
      set(3, 0, avg3(D, C, B));
      break;
    case 5: // vertical-right
      set(0, 0, avg2(X, A));
      set(1, 2, avg2(X, A));
      set(1, 0, avg2(A, B));
      set(2, 2, avg2(A, B));
      set(2, 0, avg2(B, C));
      set(3, 2, avg2(B, C));
      set(3, 0, avg2(C, D));
      set(0, 3, avg3(K, J, I));
      set(0, 2, avg3(J, I, X));
      set(0, 1, avg3(I, X, A));
      set(1, 3, avg3(I, X, A));
      set(1, 1, avg3(X, A, B));
      set(2, 3, avg3(X, A, B));
      set(2, 1, avg3(A, B, C));
      set(3, 3, avg3(A, B, C));
      set(3, 1, avg3(B, C, D));
      break;
    case 6: // down-left
      set(0, 0, avg3(A, B, C));
      set(1, 0, avg3(B, C, D));
      set(0, 1, avg3(B, C, D));
      set(2, 0, avg3(C, D, E));
      set(1, 1, avg3(C, D, E));
      set(0, 2, avg3(C, D, E));
      set(3, 0, avg3(D, E, F));
      set(2, 1, avg3(D, E, F));
      set(1, 2, avg3(D, E, F));
      set(0, 3, avg3(D, E, F));
      set(3, 1, avg3(E, F, G));
      set(2, 2, avg3(E, F, G));
      set(1, 3, avg3(E, F, G));
      set(3, 2, avg3(F, G, H));
      set(2, 3, avg3(F, G, H));
      set(3, 3, avg3(G, H, H));
      break;
    case 7: // vertical-left
      set(0, 0, avg2(A, B));
      set(1, 0, avg2(B, C));
      set(0, 2, avg2(B, C));
      set(2, 0, avg2(C, D));
      set(1, 2, avg2(C, D));
      set(3, 0, avg2(D, E));
      set(2, 2, avg2(D, E));
      set(0, 1, avg3(A, B, C));
      set(1, 1, avg3(B, C, D));
      set(0, 3, avg3(B, C, D));
      set(2, 1, avg3(C, D, E));
      set(1, 3, avg3(C, D, E));
      set(3, 1, avg3(D, E, F));
      set(2, 3, avg3(D, E, F));
      set(3, 2, avg3(E, F, G));
      set(3, 3, avg3(F, G, H));
      break;
    case 8: // horizontal-down
      set(0, 0, avg2(I, X));
      set(2, 1, avg2(I, X));
      set(0, 1, avg2(J, I));
      set(2, 2, avg2(J, I));
      set(0, 2, avg2(K, J));
      set(2, 3, avg2(K, J));
      set(0, 3, avg2(L, K));
      set(3, 0, avg3(A, B, C));
      set(2, 0, avg3(X, A, B));
      set(1, 0, avg3(I, X, A));
      set(3, 1, avg3(I, X, A));
      set(1, 1, avg3(J, I, X));
      set(3, 2, avg3(J, I, X));
      set(1, 2, avg3(K, J, I));
      set(3, 3, avg3(K, J, I));
      set(1, 3, avg3(L, K, J));
      break;
    default: // 9: horizontal-up
      set(0, 0, avg2(I, J));
      set(2, 0, avg2(J, K));
      set(0, 1, avg2(J, K));
      set(2, 1, avg2(K, L));
      set(0, 2, avg2(K, L));
      set(1, 0, avg3(I, J, K));
      set(3, 0, avg3(J, K, L));
      set(1, 1, avg3(J, K, L));
      set(3, 1, avg3(K, L, L));
      set(1, 2, avg3(K, L, L));
      set(3, 2, L);
      set(2, 2, L);
      for (let x = 0; x < 4; x++) set(x, 3, L);
  }
}

function inverseWht(input: Int16Array, out: Int16Array): void {
  const tmp = new Int32Array(16);
  for (let i = 0; i < 4; i++) {
    const a0 = input[i]! + input[12 + i]!;
    const a1 = input[4 + i]! + input[8 + i]!;
    const a2 = input[4 + i]! - input[8 + i]!;
    const a3 = input[i]! - input[12 + i]!;
    tmp[i] = a0 + a1;
    tmp[8 + i] = a0 - a1;
    tmp[4 + i] = a3 + a2;
    tmp[12 + i] = a3 - a2;
  }
  for (let i = 0; i < 4; i++) {
    const dc = tmp[i * 4]! + 3;
    const a0 = dc + tmp[3 + i * 4]!;
    const a1 = tmp[1 + i * 4]! + tmp[2 + i * 4]!;
    const a2 = tmp[1 + i * 4]! - tmp[2 + i * 4]!;
    const a3 = dc - tmp[3 + i * 4]!;
    out[i * 64] = (a0 + a1) >> 3;
    out[i * 64 + 16] = (a3 + a2) >> 3;
    out[i * 64 + 32] = (a0 - a1) >> 3;
    out[i * 64 + 48] = (a3 - a2) >> 3;
  }
}

const mul1 = (a: number) => ((a * 20091) >> 16) + a;
const mul2 = (a: number) => (a * 35468) >> 16;
const idctTmp = new Int32Array(16);

/** Inverse DCT of one 4×4 block added to the prediction (skipped when every coefficient is zero). */
function addResidual(c: Int16Array, off: number, b: Uint8Array, o: number): void {
  let any = 0;
  for (let i = 0; i < 16; i++) any |= c[off + i]!;
  if (!any) return;
  const tmp = idctTmp;
  for (let i = 0; i < 4; i++) {
    const i0 = c[off + i]!;
    const i4 = c[off + 4 + i]!;
    const i8 = c[off + 8 + i]!;
    const i12 = c[off + 12 + i]!;
    const a = i0 + i8;
    const bb = i0 - i8;
    const cc = mul2(i4) - mul1(i12);
    const d = mul1(i4) + mul2(i12);
    tmp[i * 4] = a + d;
    tmp[i * 4 + 1] = bb + cc;
    tmp[i * 4 + 2] = bb - cc;
    tmp[i * 4 + 3] = a - d;
  }
  for (let i = 0; i < 4; i++) {
    const dc = tmp[i]! + 4;
    const a = dc + tmp[8 + i]!;
    const bb = dc - tmp[8 + i]!;
    const cc = mul2(tmp[4 + i]!) - mul1(tmp[12 + i]!);
    const d = mul1(tmp[4 + i]!) + mul2(tmp[12 + i]!);
    const row = o + i * BPS;
    b[row] = clip8(b[row]! + ((a + d) >> 3));
    b[row + 1] = clip8(b[row + 1]! + ((bb + cc) >> 3));
    b[row + 2] = clip8(b[row + 2]! + ((bb - cc) >> 3));
    b[row + 3] = clip8(b[row + 3]! + ((a - d) >> 3));
  }
}

const sclip1 = (v: number) => (v < -128 ? -128 : Math.min(v, 127));
const sclip2 = (v: number) => (v < -16 ? -16 : Math.min(v, 15));

/** Filters one edge across `count` lines; `step` crosses the edge, `along` moves along it. */
function doFilter2(p: Uint8Array, i: number, step: number): void {
  const p1 = p[i - 2 * step]!;
  const p0 = p[i - step]!;
  const q0 = p[i]!;
  const q1 = p[i + step]!;
  const a = 3 * (q0 - p0) + sclip1(p1 - q1);
  const a1 = sclip2((a + 4) >> 3);
  const a2 = sclip2((a + 3) >> 3);
  p[i - step] = clip8(p0 + a2);
  p[i] = clip8(q0 - a1);
}

function simpleFilter(p: Uint8Array, o: number, step: number, along: number, thresh: number): void {
  const t2 = 2 * thresh + 1;
  for (let k = 0; k < 16; k++) {
    const i = o + k * along;
    if (4 * Math.abs(p[i - step]! - p[i]!) + Math.abs(p[i - 2 * step]! - p[i + step]!) <= t2)
      doFilter2(p, i, step);
  }
}

function filterLoop(
  p: Uint8Array,
  o: number,
  step: number,
  along: number,
  count: number,
  thresh: number,
  ithresh: number,
  hevThresh: number,
  edge: boolean,
): void {
  const t2 = 2 * thresh + 1;
  for (let k = 0; k < count; k++) {
    const i = o + k * along;
    const p3 = p[i - 4 * step]!;
    const p2 = p[i - 3 * step]!;
    const p1 = p[i - 2 * step]!;
    const p0 = p[i - step]!;
    const q0 = p[i]!;
    const q1 = p[i + step]!;
    const q2 = p[i + 2 * step]!;
    const q3 = p[i + 3 * step]!;
    if (4 * Math.abs(p0 - q0) + Math.abs(p1 - q1) > t2) continue;
    if (
      Math.abs(p3 - p2) > ithresh ||
      Math.abs(p2 - p1) > ithresh ||
      Math.abs(p1 - p0) > ithresh ||
      Math.abs(q3 - q2) > ithresh ||
      Math.abs(q2 - q1) > ithresh ||
      Math.abs(q1 - q0) > ithresh
    ) {
      continue;
    }
    if (Math.abs(p1 - p0) > hevThresh || Math.abs(q1 - q0) > hevThresh) {
      doFilter2(p, i, step);
    } else if (edge) {
      const a = sclip1(3 * (q0 - p0) + sclip1(p1 - q1));
      const a1 = (27 * a + 63) >> 7;
      const a2 = (18 * a + 63) >> 7;
      const a3 = (9 * a + 63) >> 7;
      p[i - 3 * step] = clip8(p2 + a3);
      p[i - 2 * step] = clip8(p1 + a2);
      p[i - step] = clip8(p0 + a1);
      p[i] = clip8(q0 - a1);
      p[i + step] = clip8(q1 - a2);
      p[i + 2 * step] = clip8(q2 - a3);
    } else {
      const a = 3 * (q0 - p0);
      const a1 = sclip2((a + 4) >> 3);
      const a2 = sclip2((a + 3) >> 3);
      const a3 = (a1 + 1) >> 1;
      p[i - 2 * step] = clip8(p1 + a3);
      p[i - step] = clip8(p0 + a2);
      p[i] = clip8(q0 - a1);
      p[i + step] = clip8(q1 - a3);
    }
  }
}

const mulHi = (v: number, c: number) => (v * c) >> 8;
const clipYuv = (v: number) => ((v & ~16383) === 0 ? v >> 6 : v < 0 ? 0 : 255);

/** YUV 4:2:0 to RGBA with libwebp's "fancy" upsampling (bilinear chroma, 9-3-3-1 weights). */
function yuvToRgba(
  Y: Uint8Array,
  U: Uint8Array,
  V: Uint8Array,
  ys: number,
  uvs: number,
  width: number,
  height: number,
  out: Uint8Array,
): void {
  const put = (yRow: number, x: number, u: number, v: number, dstRow: number) => {
    const y = mulHi(Y[yRow * ys + x]!, 19077);
    const o = (dstRow * width + x) * 4;
    out[o] = clipYuv(y + mulHi(v, 26149) - 14234);
    out[o + 1] = clipYuv(y - mulHi(u, 6419) - mulHi(v, 13320) + 8708);
    out[o + 2] = clipYuv(y + mulHi(u, 33050) - 17685);
  };
  const last = (width - 1) >> 1;
  /** Rows `top` and `bottom` (bottom < 0: none) between chroma rows `tc` (above) and `cc` (current). */
  const pair = (top: number, bottom: number, tc: number, cc: number) => {
    const t = tc * uvs;
    const c = cc * uvs;
    let tlu = U[t]!;
    let tlv = V[t]!;
    let lu = U[c]!;
    let lv = V[c]!;
    put(top, 0, (3 * tlu + lu + 2) >> 2, (3 * tlv + lv + 2) >> 2, top);
    if (bottom >= 0) put(bottom, 0, (3 * lu + tlu + 2) >> 2, (3 * lv + tlv + 2) >> 2, bottom);
    for (let x = 1; x <= last; x++) {
      const tu = U[t + x]!;
      const tv = V[t + x]!;
      const u = U[c + x]!;
      const v = V[c + x]!;
      const au = tlu + tu + lu + u + 8;
      const av = tlv + tv + lv + v + 8;
      const d12u = (au + 2 * (tu + lu)) >> 3;
      const d12v = (av + 2 * (tv + lv)) >> 3;
      const d03u = (au + 2 * (tlu + u)) >> 3;
      const d03v = (av + 2 * (tlv + v)) >> 3;
      put(top, 2 * x - 1, (d12u + tlu) >> 1, (d12v + tlv) >> 1, top);
      put(top, 2 * x, (d03u + tu) >> 1, (d03v + tv) >> 1, top);
      if (bottom >= 0) {
        put(bottom, 2 * x - 1, (d03u + lu) >> 1, (d03v + lv) >> 1, bottom);
        put(bottom, 2 * x, (d12u + u) >> 1, (d12v + v) >> 1, bottom);
      }
      tlu = tu;
      tlv = tv;
      lu = u;
      lv = v;
    }
    if (!(width & 1)) {
      put(top, width - 1, (3 * tlu + lu + 2) >> 2, (3 * tlv + lv + 2) >> 2, top);
      if (bottom >= 0) put(bottom, width - 1, (3 * lu + tlu + 2) >> 2, (3 * lv + tlv + 2) >> 2, bottom);
    }
  };
  pair(0, -1, 0, 0);
  let k = 1;
  for (; 2 * k < height; k++) pair(2 * k - 1, 2 * k, k - 1, k);
  if (!(height & 1)) pair(height - 1, -1, (height >> 1) - 1, (height >> 1) - 1);
}

// Constants of RFC 6386: quantizer steps (section 14.1), default and update probabilities of the DCT tokens
// (section 13.4/13.5) and the 4×4 intra-mode probabilities of key frames (section 11.5).
const DC = [
  4, 5, 6, 7, 8, 9, 10, 10, 11, 12, 13, 14, 15, 16, 17, 17, 18, 19, 20, 20, 21, 21, 22, 22, 23, 23, 24, 25,
  25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 46, 47, 48, 49,
  50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76,
  76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 93, 95, 96, 98, 100, 101, 102, 104, 106, 108,
  110, 112, 114, 116, 118, 122, 124, 126, 128, 130, 132, 134, 136, 138, 140, 143, 145, 148, 151, 154, 157,
];
const AC = [
  4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
  32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58,
  60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98, 100, 102, 104, 106, 108,
  110, 112, 114, 116, 119, 122, 125, 128, 131, 134, 137, 140, 143, 146, 149, 152, 155, 158, 161, 164, 167,
  170, 173, 177, 181, 185, 189, 193, 197, 201, 205, 209, 213, 217, 221, 225, 229, 234, 239, 245, 249, 254,
  259, 264, 269, 274, 279, 284,
];
const UPDATE = [
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 176, 246, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 223, 241, 252, 255, 255, 255, 255, 255, 255, 255, 255, 249, 253, 253, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 244, 252, 255, 255, 255, 255, 255, 255, 255, 255, 234, 254, 254, 255, 255, 255, 255,
  255, 255, 255, 255, 253, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 246, 254, 255, 255, 255,
  255, 255, 255, 255, 255, 239, 253, 254, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 254, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 248, 254, 255, 255, 255, 255, 255, 255, 255, 255, 251, 255, 254, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 253, 254,
  255, 255, 255, 255, 255, 255, 255, 255, 251, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255,
  254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 253, 255, 254, 255, 255, 255, 255, 255, 255, 250,
  255, 254, 255, 254, 255, 255, 255, 255, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 217, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 225, 252, 241, 253, 255, 255, 254, 255, 255, 255, 255, 234, 250, 241, 250, 253, 255, 253, 254,
  255, 255, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 223, 254, 254, 255, 255, 255, 255,
  255, 255, 255, 255, 238, 253, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 248, 254, 255, 255, 255,
  255, 255, 255, 255, 255, 249, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 253, 255, 255, 255, 255, 255, 255, 255, 255, 255, 247, 254, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 253, 254,
  255, 255, 255, 255, 255, 255, 255, 255, 252, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 253,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 254, 253, 255, 255, 255, 255, 255, 255, 255, 255, 250, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 186, 251, 250, 255, 255, 255, 255, 255, 255, 255, 255, 234, 251, 244, 254, 255, 255, 255,
  255, 255, 255, 255, 251, 251, 243, 253, 254, 255, 254, 255, 255, 255, 255, 255, 253, 254, 255, 255, 255,
  255, 255, 255, 255, 255, 236, 253, 254, 255, 255, 255, 255, 255, 255, 255, 255, 251, 253, 253, 254, 254,
  255, 255, 255, 255, 255, 255, 255, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 254, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 248, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 250, 254, 252, 254, 255, 255, 255, 255, 255, 255, 255, 248, 254, 249, 253, 255,
  255, 255, 255, 255, 255, 255, 255, 253, 253, 255, 255, 255, 255, 255, 255, 255, 255, 246, 253, 253, 255,
  255, 255, 255, 255, 255, 255, 255, 252, 254, 251, 254, 254, 255, 255, 255, 255, 255, 255, 255, 254, 252,
  255, 255, 255, 255, 255, 255, 255, 255, 248, 254, 253, 255, 255, 255, 255, 255, 255, 255, 255, 253, 255,
  254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 251, 254, 255, 255, 255, 255, 255, 255, 255, 255, 245,
  251, 254, 255, 255, 255, 255, 255, 255, 255, 255, 253, 253, 254, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 251, 253, 255, 255, 255, 255, 255, 255, 255, 255, 252, 253, 254, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 252, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 249, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 253, 255, 255, 255, 255, 255, 255, 255, 255, 250, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  255, 255, 255, 255, 255, 255,
];
const DEFAULT = [
  128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128,
  128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 253, 136, 254, 255, 228, 219, 128, 128, 128,
  128, 128, 189, 129, 242, 255, 227, 213, 255, 219, 128, 128, 128, 106, 126, 227, 252, 214, 209, 255, 255,
  128, 128, 128, 1, 98, 248, 255, 236, 226, 255, 255, 128, 128, 128, 181, 133, 238, 254, 221, 234, 255, 154,
  128, 128, 128, 78, 134, 202, 247, 198, 180, 255, 219, 128, 128, 128, 1, 185, 249, 255, 243, 255, 128, 128,
  128, 128, 128, 184, 150, 247, 255, 236, 224, 128, 128, 128, 128, 128, 77, 110, 216, 255, 236, 230, 128, 128,
  128, 128, 128, 1, 101, 251, 255, 241, 255, 128, 128, 128, 128, 128, 170, 139, 241, 252, 236, 209, 255, 255,
  128, 128, 128, 37, 116, 196, 243, 228, 255, 255, 255, 128, 128, 128, 1, 204, 254, 255, 245, 255, 128, 128,
  128, 128, 128, 207, 160, 250, 255, 238, 128, 128, 128, 128, 128, 128, 102, 103, 231, 255, 211, 171, 128,
  128, 128, 128, 128, 1, 152, 252, 255, 240, 255, 128, 128, 128, 128, 128, 177, 135, 243, 255, 234, 225, 128,
  128, 128, 128, 128, 80, 129, 211, 255, 194, 224, 128, 128, 128, 128, 128, 1, 1, 255, 128, 128, 128, 128,
  128, 128, 128, 128, 246, 1, 255, 128, 128, 128, 128, 128, 128, 128, 128, 255, 128, 128, 128, 128, 128, 128,
  128, 128, 128, 128, 198, 35, 237, 223, 193, 187, 162, 160, 145, 155, 62, 131, 45, 198, 221, 172, 176, 220,
  157, 252, 221, 1, 68, 47, 146, 208, 149, 167, 221, 162, 255, 223, 128, 1, 149, 241, 255, 221, 224, 255, 255,
  128, 128, 128, 184, 141, 234, 253, 222, 220, 255, 199, 128, 128, 128, 81, 99, 181, 242, 176, 190, 249, 202,
  255, 255, 128, 1, 129, 232, 253, 214, 197, 242, 196, 255, 255, 128, 99, 121, 210, 250, 201, 198, 255, 202,
  128, 128, 128, 23, 91, 163, 242, 170, 187, 247, 210, 255, 255, 128, 1, 200, 246, 255, 234, 255, 128, 128,
  128, 128, 128, 109, 178, 241, 255, 231, 245, 255, 255, 128, 128, 128, 44, 130, 201, 253, 205, 192, 255, 255,
  128, 128, 128, 1, 132, 239, 251, 219, 209, 255, 165, 128, 128, 128, 94, 136, 225, 251, 218, 190, 255, 255,
  128, 128, 128, 22, 100, 174, 245, 186, 161, 255, 199, 128, 128, 128, 1, 182, 249, 255, 232, 235, 128, 128,
  128, 128, 128, 124, 143, 241, 255, 227, 234, 128, 128, 128, 128, 128, 35, 77, 181, 251, 193, 211, 255, 205,
  128, 128, 128, 1, 157, 247, 255, 236, 231, 255, 255, 128, 128, 128, 121, 141, 235, 255, 225, 227, 255, 255,
  128, 128, 128, 45, 99, 188, 251, 195, 217, 255, 224, 128, 128, 128, 1, 1, 251, 255, 213, 255, 128, 128, 128,
  128, 128, 203, 1, 248, 255, 255, 128, 128, 128, 128, 128, 128, 137, 1, 177, 255, 224, 255, 128, 128, 128,
  128, 128, 253, 9, 248, 251, 207, 208, 255, 192, 128, 128, 128, 175, 13, 224, 243, 193, 185, 249, 198, 255,
  255, 128, 73, 17, 171, 221, 161, 179, 236, 167, 255, 234, 128, 1, 95, 247, 253, 212, 183, 255, 255, 128,
  128, 128, 239, 90, 244, 250, 211, 209, 255, 255, 128, 128, 128, 155, 77, 195, 248, 188, 195, 255, 255, 128,
  128, 128, 1, 24, 239, 251, 218, 219, 255, 205, 128, 128, 128, 201, 51, 219, 255, 196, 186, 128, 128, 128,
  128, 128, 69, 46, 190, 239, 201, 218, 255, 228, 128, 128, 128, 1, 191, 251, 255, 255, 128, 128, 128, 128,
  128, 128, 223, 165, 249, 255, 213, 255, 128, 128, 128, 128, 128, 141, 124, 248, 255, 255, 128, 128, 128,
  128, 128, 128, 1, 16, 248, 255, 255, 128, 128, 128, 128, 128, 128, 190, 36, 230, 255, 236, 255, 128, 128,
  128, 128, 128, 149, 1, 255, 128, 128, 128, 128, 128, 128, 128, 128, 1, 226, 255, 128, 128, 128, 128, 128,
  128, 128, 128, 247, 192, 255, 128, 128, 128, 128, 128, 128, 128, 128, 240, 128, 255, 128, 128, 128, 128,
  128, 128, 128, 128, 1, 134, 252, 255, 255, 128, 128, 128, 128, 128, 128, 213, 62, 250, 255, 255, 128, 128,
  128, 128, 128, 128, 55, 93, 255, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128,
  128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128, 128,
  128, 128, 128, 128, 128, 202, 24, 213, 235, 186, 191, 220, 160, 240, 175, 255, 126, 38, 182, 232, 169, 184,
  228, 174, 255, 187, 128, 61, 46, 138, 219, 151, 178, 240, 170, 255, 216, 128, 1, 112, 230, 250, 199, 191,
  247, 159, 255, 255, 128, 166, 109, 228, 252, 211, 215, 255, 174, 128, 128, 128, 39, 77, 162, 232, 172, 180,
  245, 178, 255, 255, 128, 1, 52, 220, 246, 198, 199, 249, 220, 255, 255, 128, 124, 74, 191, 243, 183, 193,
  250, 221, 255, 255, 128, 24, 71, 130, 219, 154, 170, 243, 182, 255, 255, 128, 1, 182, 225, 249, 219, 240,
  255, 224, 128, 128, 128, 149, 150, 226, 252, 216, 205, 255, 171, 128, 128, 128, 28, 108, 170, 242, 183, 194,
  254, 223, 255, 255, 128, 1, 81, 230, 252, 204, 203, 255, 192, 128, 128, 128, 123, 102, 209, 247, 188, 196,
  255, 233, 128, 128, 128, 20, 95, 153, 243, 164, 173, 255, 203, 128, 128, 128, 1, 222, 248, 255, 216, 213,
  128, 128, 128, 128, 128, 168, 175, 246, 252, 235, 205, 255, 255, 128, 128, 128, 47, 116, 215, 255, 211, 212,
  255, 255, 128, 128, 128, 1, 121, 236, 253, 212, 214, 255, 255, 128, 128, 128, 141, 84, 213, 252, 201, 202,
  255, 219, 128, 128, 128, 42, 80, 160, 240, 162, 185, 255, 205, 128, 128, 128, 1, 1, 255, 128, 128, 128, 128,
  128, 128, 128, 128, 244, 1, 255, 128, 128, 128, 128, 128, 128, 128, 128, 238, 1, 255, 128, 128, 128, 128,
  128, 128, 128, 128,
];
const BMODES = [
  231, 120, 48, 89, 115, 113, 120, 152, 112, 152, 179, 64, 126, 170, 118, 46, 70, 95, 175, 69, 143, 80, 85,
  82, 72, 155, 103, 56, 58, 10, 171, 218, 189, 17, 13, 152, 114, 26, 17, 163, 44, 195, 21, 10, 173, 121, 24,
  80, 195, 26, 62, 44, 64, 85, 144, 71, 10, 38, 171, 213, 144, 34, 26, 170, 46, 55, 19, 136, 160, 33, 206, 71,
  63, 20, 8, 114, 114, 208, 12, 9, 226, 81, 40, 11, 96, 182, 84, 29, 16, 36, 134, 183, 89, 137, 98, 101, 106,
  165, 148, 72, 187, 100, 130, 157, 111, 32, 75, 80, 66, 102, 167, 99, 74, 62, 40, 234, 128, 41, 53, 9, 178,
  241, 141, 26, 8, 107, 74, 43, 26, 146, 73, 166, 49, 23, 157, 65, 38, 105, 160, 51, 52, 31, 115, 128, 104,
  79, 12, 27, 217, 255, 87, 17, 7, 87, 68, 71, 44, 114, 51, 15, 186, 23, 47, 41, 14, 110, 182, 183, 21, 17,
  194, 66, 45, 25, 102, 197, 189, 23, 18, 22, 88, 88, 147, 150, 42, 46, 45, 196, 205, 43, 97, 183, 117, 85,
  38, 35, 179, 61, 39, 53, 200, 87, 26, 21, 43, 232, 171, 56, 34, 51, 104, 114, 102, 29, 93, 77, 39, 28, 85,
  171, 58, 165, 90, 98, 64, 34, 22, 116, 206, 23, 34, 43, 166, 73, 107, 54, 32, 26, 51, 1, 81, 43, 31, 68, 25,
  106, 22, 64, 171, 36, 225, 114, 34, 19, 21, 102, 132, 188, 16, 76, 124, 62, 18, 78, 95, 85, 57, 50, 48, 51,
  193, 101, 35, 159, 215, 111, 89, 46, 111, 60, 148, 31, 172, 219, 228, 21, 18, 111, 112, 113, 77, 85, 179,
  255, 38, 120, 114, 40, 42, 1, 196, 245, 209, 10, 25, 109, 88, 43, 29, 140, 166, 213, 37, 43, 154, 61, 63,
  30, 155, 67, 45, 68, 1, 209, 100, 80, 8, 43, 154, 1, 51, 26, 71, 142, 78, 78, 16, 255, 128, 34, 197, 171,
  41, 40, 5, 102, 211, 183, 4, 1, 221, 51, 50, 17, 168, 209, 192, 23, 25, 82, 138, 31, 36, 171, 27, 166, 38,
  44, 229, 67, 87, 58, 169, 82, 115, 26, 59, 179, 63, 59, 90, 180, 59, 166, 93, 73, 154, 40, 40, 21, 116, 143,
  209, 34, 39, 175, 47, 15, 16, 183, 34, 223, 49, 45, 183, 46, 17, 33, 183, 6, 98, 15, 32, 183, 57, 46, 22,
  24, 128, 1, 54, 17, 37, 65, 32, 73, 115, 28, 128, 23, 128, 205, 40, 3, 9, 115, 51, 192, 18, 6, 223, 87, 37,
  9, 115, 59, 77, 64, 21, 47, 104, 55, 44, 218, 9, 54, 53, 130, 226, 64, 90, 70, 205, 40, 41, 23, 26, 57, 54,
  57, 112, 184, 5, 41, 38, 166, 213, 30, 34, 26, 133, 152, 116, 10, 32, 134, 39, 19, 53, 221, 26, 114, 32, 73,
  255, 31, 9, 65, 234, 2, 15, 1, 118, 73, 75, 32, 12, 51, 192, 255, 160, 43, 51, 88, 31, 35, 67, 102, 85, 55,
  186, 85, 56, 21, 23, 111, 59, 205, 45, 37, 192, 55, 38, 70, 124, 73, 102, 1, 34, 98, 125, 98, 42, 88, 104,
  85, 117, 175, 82, 95, 84, 53, 89, 128, 100, 113, 101, 45, 75, 79, 123, 47, 51, 128, 81, 171, 1, 57, 17, 5,
  71, 102, 57, 53, 41, 49, 38, 33, 13, 121, 57, 73, 26, 1, 85, 41, 10, 67, 138, 77, 110, 90, 47, 114, 115, 21,
  2, 10, 102, 255, 166, 23, 6, 101, 29, 16, 10, 85, 128, 101, 196, 26, 57, 18, 10, 102, 102, 213, 34, 20, 43,
  117, 20, 15, 36, 163, 128, 68, 1, 26, 102, 61, 71, 37, 34, 53, 31, 243, 192, 69, 60, 71, 38, 73, 119, 28,
  222, 37, 68, 45, 128, 34, 1, 47, 11, 245, 171, 62, 17, 19, 70, 146, 85, 55, 62, 70, 37, 43, 37, 154, 100,
  163, 85, 160, 1, 63, 9, 92, 136, 28, 64, 32, 201, 85, 75, 15, 9, 9, 64, 255, 184, 119, 16, 86, 6, 28, 5, 64,
  255, 25, 248, 1, 56, 8, 17, 132, 137, 255, 55, 116, 128, 58, 15, 20, 82, 135, 57, 26, 121, 40, 164, 50, 31,
  137, 154, 133, 25, 35, 218, 51, 103, 44, 131, 131, 123, 31, 6, 158, 86, 40, 64, 135, 148, 224, 45, 183, 128,
  22, 26, 17, 131, 240, 154, 14, 1, 209, 45, 16, 21, 91, 64, 222, 7, 1, 197, 56, 21, 39, 155, 60, 138, 23,
  102, 213, 83, 12, 13, 54, 192, 255, 68, 47, 28, 85, 26, 85, 85, 128, 128, 32, 146, 171, 18, 11, 7, 63, 144,
  171, 4, 4, 246, 35, 27, 10, 146, 174, 171, 12, 26, 128, 190, 80, 35, 99, 180, 80, 126, 54, 45, 85, 126, 47,
  87, 176, 51, 41, 20, 32, 101, 75, 128, 139, 118, 146, 116, 128, 85, 56, 41, 15, 176, 236, 85, 37, 9, 62, 71,
  30, 17, 119, 118, 255, 17, 18, 138, 101, 38, 60, 138, 55, 70, 43, 26, 142, 146, 36, 19, 30, 171, 255, 97,
  27, 20, 138, 45, 61, 62, 219, 1, 81, 188, 64, 32, 41, 20, 117, 151, 142, 20, 21, 163, 112, 19, 12, 61, 195,
  128, 48, 4, 24,
];
