/** Straight (non-premultiplied) RGBA8 raster. */
export interface Raster {
  width: number;
  height: number;
  data: Uint8Array;
}

export function createRaster(width: number, height: number, fill?: [number, number, number, number]): Raster {
  const data = new Uint8Array(width * height * 4);
  if (fill) for (let i = 0; i < data.length; i += 4) data.set(fill, i);
  return { width, height, data };
}

/** resvg returns premultiplied pixels; convert to straight alpha. */
export function unpremultiply(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!;
    if (a === 0) continue;
    if (a === 255) {
      out[i] = data[i]!;
      out[i + 1] = data[i + 1]!;
      out[i + 2] = data[i + 2]!;
    } else {
      out[i] = Math.min(255, Math.round((data[i]! * 255) / a));
      out[i + 1] = Math.min(255, Math.round((data[i + 1]! * 255) / a));
      out[i + 2] = Math.min(255, Math.round((data[i + 2]! * 255) / a));
    }
    out[i + 3] = a;
  }
  return out;
}

/** Float mask in [0,1]: alpha for transparent images, darkness-against-background otherwise. */
export function inkMask(img: Raster): Float32Array {
  const n = img.width * img.height;
  const mask = new Float32Array(n);
  let transparent = 0;
  for (let i = 0; i < n; i++) if (img.data[i * 4 + 3]! < 250) transparent++;
  const useAlpha = transparent > n * 0.02;
  // For opaque images, estimate the background from the border and measure distance from it.
  let bg = [255, 255, 255];
  if (!useAlpha) {
    const acc = [0, 0, 0];
    let cnt = 0;
    const sample = (x: number, y: number) => {
      const o = (y * img.width + x) * 4;
      acc[0]! += img.data[o]!;
      acc[1]! += img.data[o + 1]!;
      acc[2]! += img.data[o + 2]!;
      cnt++;
    };
    for (let x = 0; x < img.width; x++) {
      sample(x, 0);
      sample(x, img.height - 1);
    }
    for (let y = 0; y < img.height; y++) {
      sample(0, y);
      sample(img.width - 1, y);
    }
    bg = acc.map((v) => v / cnt);
  }
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (useAlpha) mask[i] = img.data[o + 3]! / 255;
    else {
      const d =
        Math.abs(img.data[o]! - bg[0]!) +
        Math.abs(img.data[o + 1]! - bg[1]!) +
        Math.abs(img.data[o + 2]! - bg[2]!);
      mask[i] = Math.min(1, d / 255);
    }
  }
  return mask;
}

export interface Mask {
  width: number;
  height: number;
  data: Float32Array;
}

export function maskOf(img: Raster): Mask {
  return { width: img.width, height: img.height, data: inkMask(img) };
}

export function maskBBox(
  m: Mask,
  threshold = 0.5,
): { x: number; y: number; w: number; h: number } | undefined {
  let x0 = m.width;
  let y0 = m.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < m.height; y++)
    for (let x = 0; x < m.width; x++)
      if (m.data[y * m.width + x]! >= threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return undefined;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Bilinear sample of a mask. */
function sample(m: Mask, fx: number, fy: number): number {
  const x = Math.max(0, Math.min(m.width - 1, fx));
  const y = Math.max(0, Math.min(m.height - 1, fy));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(m.width - 1, x0 + 1);
  const y1 = Math.min(m.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const v = (xx: number, yy: number) => m.data[yy * m.width + xx]!;
  return (v(x0, y0) * (1 - tx) + v(x1, y0) * tx) * (1 - ty) + (v(x0, y1) * (1 - tx) + v(x1, y1) * tx) * ty;
}

/** Area-averaging resize for masks (good for downscaling, acceptable for upscaling). */
export function resizeMask(m: Mask, w: number, h: number): Mask {
  const out = new Float32Array(w * h);
  const sx = m.width / w;
  const sy = m.height / h;
  if (sx <= 1 && sy <= 1) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) out[y * w + x] = sample(m, (x + 0.5) * sx - 0.5, (y + 0.5) * sy - 0.5);
    return { width: w, height: h, data: out };
  }
  for (let y = 0; y < h; y++) {
    const ya = y * sy;
    const yb = (y + 1) * sy;
    for (let x = 0; x < w; x++) {
      const xa = x * sx;
      const xb = (x + 1) * sx;
      let sum = 0;
      let area = 0;
      for (let yy = Math.floor(ya); yy < Math.ceil(yb) && yy < m.height; yy++) {
        const wy = Math.min(yb, yy + 1) - Math.max(ya, yy);
        for (let xx = Math.floor(xa); xx < Math.ceil(xb) && xx < m.width; xx++) {
          const wx = Math.min(xb, xx + 1) - Math.max(xa, xx);
          sum += m.data[yy * m.width + xx]! * wx * wy;
          area += wx * wy;
        }
      }
      out[y * w + x] = area ? sum / area : 0;
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Crops a mask to its ink bounding box and fits it, aspect preserved and centered, into a size×size square.
 * This makes comparisons independent of position, padding and scale.
 */
export function normalizeMask(m: Mask, size = 64): Mask {
  const box = maskBBox(m, 0.2);
  const out = new Float32Array(size * size);
  if (!box) return { width: size, height: size, data: out };
  const scale = Math.max(box.w, box.h) / size;
  const offX = (size - box.w / scale) / 2;
  const offY = (size - box.h / scale) / 2;
  // Supersample 3×3 per output pixel for a stable result at any input resolution.
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let s = 0;
      for (let j = 0; j < 3; j++)
        for (let i = 0; i < 3; i++) {
          const fx = (x + (i + 0.5) / 3 - offX) * scale + box.x - 0.5;
          const fy = (y + (j + 0.5) / 3 - offY) * scale + box.y - 0.5;
          if (fx < box.x - 1 || fy < box.y - 1 || fx > box.x + box.w || fy > box.y + box.h) continue;
          s += sample(m, fx, fy);
        }
      out[y * size + x] = s / 9;
    }
  return { width: size, height: size, data: out };
}

/** The 8 symmetries of the square (rotations and reflections), used for flip/rotation-invariant matching. */
export function dihedral(m: Mask, k: number): Mask {
  const n = m.width;
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let sx = x;
      let sy = y;
      if (k & 4) sx = n - 1 - sx; // mirror
      const r = k & 3;
      for (let t = 0; t < r; t++) {
        const nx = sy;
        sy = n - 1 - sx;
        sx = nx;
      }
      out[y * n + x] = m.data[sy * n + sx]!;
    }
  return { width: n, height: n, data: out };
}
