import { deflateSync } from 'node:zlib';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { MarkiloError } from '../core/errors.js';
import type { Raster } from './image.js';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Deterministic RGBA8 PNG encoder (same pixels → same bytes on every OS). */
export function encodePng(img: Raster): Buffer {
  const { width, height, data } = img;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

export const MAX_IMAGE_PIXELS = 40_000_000;

export function decodeImage(buf: Uint8Array): Raster {
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    if (buf.length < 24) throw new MarkiloError('INVALID_INPUT', 'Truncated PNG.');
    const { width, height } = pngSize(buf);
    if (width * height > MAX_IMAGE_PIXELS || width > 16_384 || height > 16_384) {
      throw new MarkiloError('INVALID_INPUT', `PNG is too large to analyze (${width}×${height}).`);
    }
    const png = PNG.sync.read(Buffer.from(buf));
    return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    const j = jpeg.decode(buf, {
      useTArray: true,
      maxMemoryUsageInMB: 256,
      maxResolutionInMP: MAX_IMAGE_PIXELS / 1_000_000,
    });
    return { width: j.width, height: j.height, data: new Uint8Array(j.data) };
  }
  throw new MarkiloError(
    'INVALID_INPUT',
    'Unsupported raster format (PNG and JPEG are supported; use SVG for vectors).',
  );
}

export function pngSize(buf: Uint8Array): { width: number; height: number } {
  const b = Buffer.from(buf);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}
