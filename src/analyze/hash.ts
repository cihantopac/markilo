import { type Mask, resizeMask } from '../render/image.js';

/** 64-bit perceptual hashes as 16-char hex strings. */
export interface Hashes {
  aHash: string;
  dHash: string;
  pHash: string;
}

const toHex = (bits: number[]): string => {
  let s = '';
  for (let i = 0; i < bits.length; i += 4)
    s += ((bits[i]! << 3) | (bits[i + 1]! << 2) | (bits[i + 2]! << 1) | bits[i + 3]!).toString(16);
  return s;
};

export function aHash(m: Mask): string {
  const s = resizeMask(m, 8, 8).data;
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return toHex([...s].map((v) => (v > mean ? 1 : 0)));
}

export function dHash(m: Mask): string {
  const s = resizeMask(m, 9, 8).data;
  const bits: number[] = [];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) bits.push(s[y * 9 + x]! > s[y * 9 + x + 1]! ? 1 : 0);
  return toHex(bits);
}

const COS = (() => {
  const N = 32;
  const t = new Float64Array(N * N);
  for (let u = 0; u < N; u++)
    for (let x = 0; x < N; x++) t[u * N + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
  return t;
})();

/** DCT-based pHash: 32×32 → low-frequency 8×8 block (DC excluded) thresholded at the median. */
export function pHash(m: Mask): string {
  const N = 32;
  const s = resizeMask(m, N, N).data;
  const coeffs: number[] = [];
  for (let u = 0; u < 8; u++)
    for (let v = 0; v < 8; v++) {
      let sum = 0;
      for (let y = 0; y < N; y++) {
        const cy = COS[u * N + y]!;
        for (let x = 0; x < N; x++) sum += s[y * N + x]! * cy * COS[v * N + x]!;
      }
      coeffs.push(sum);
    }
  const ac = coeffs.slice(1);
  const median = [...ac].sort((a, b) => a - b)[Math.floor(ac.length / 2)]!;
  return toHex(coeffs.map((c, i) => (i === 0 ? 0 : c > median ? 1 : 0)));
}

export function hashes(m: Mask): Hashes {
  return { aHash: aHash(m), dHash: dHash(m), pHash: pHash(m) };
}

export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = Number.parseInt(a[i]!, 16) ^ Number.parseInt(b[i]!, 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/** 1 = identical hashes, 0 = maximally different. */
export const hashSimilarity = (a: string, b: string): number => 1 - hamming(a, b) / (a.length * 4);
