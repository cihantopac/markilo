import { pngSize } from '../render/png.js';

/** ICO container with PNG-compressed images (supported by Windows Vista+ and all current browsers). */
export function encodeIco(pngs: Buffer[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach((png, i) => {
    const { width, height } = pngSize(png);
    const o = i * 16;
    dir[o] = width >= 256 ? 0 : width;
    dir[o + 1] = height >= 256 ? 0 : height;
    dir[o + 2] = 0;
    dir[o + 3] = 0;
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...pngs]);
}

/** OSType codes for PNG payloads in .icns, keyed by pixel size and scale. */
export const ICNS_TYPES: { type: string; px: number; label: string }[] = [
  { type: 'icp4', px: 16, label: '16' },
  { type: 'ic11', px: 32, label: '16@2x' },
  { type: 'icp5', px: 32, label: '32' },
  { type: 'ic12', px: 64, label: '32@2x' },
  { type: 'ic07', px: 128, label: '128' },
  { type: 'ic13', px: 256, label: '128@2x' },
  { type: 'ic08', px: 256, label: '256' },
  { type: 'ic14', px: 512, label: '256@2x' },
  { type: 'ic09', px: 512, label: '512' },
  { type: 'ic10', px: 1024, label: '512@2x' },
];

export function encodeIcns(byPx: Map<number, Buffer>): Buffer {
  const parts: Buffer[] = [];
  for (const { type, px } of ICNS_TYPES) {
    const png = byPx.get(px);
    if (!png) continue;
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(png.length + 8, 4);
    parts.push(head, png);
  }
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

/** Reads back an ICO directory (used by tests and `markilo inspect`). */
export function readIcoSizes(buf: Buffer): number[] {
  const n = buf.readUInt16LE(4);
  return Array.from({ length: n }, (_, i) => buf[6 + i * 16] || 256);
}

export function readIcnsTypes(buf: Buffer): string[] {
  const out: string[] = [];
  let o = 8;
  while (o < buf.length) {
    out.push(buf.toString('ascii', o, o + 4));
    o += buf.readUInt32BE(o + 4);
  }
  return out;
}
