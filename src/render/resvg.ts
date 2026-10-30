import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { MarkiloError } from '../core/errors.js';
import { type Raster, unpremultiply } from './image.js';
import { encodePng } from './png.js';

let ready: Promise<void> | undefined;

function wasmPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, 'resvg.wasm')];
  try {
    candidates.push(createRequire(import.meta.url).resolve('@resvg/resvg-wasm/index_bg.wasm'));
  } catch {
    // Not running from a checkout with node_modules; the bundled copy must exist.
  }
  const found = candidates.find((p) => existsSync(p));
  if (!found)
    throw new MarkiloError('INTERNAL', `resvg.wasm not found (looked in ${candidates.join(', ')}).`);
  return found;
}

export function ensureRenderer(): Promise<void> {
  ready ??= initWasm(readFileSync(wasmPath()));
  return ready;
}

export interface RenderOptions {
  /** Output width in pixels; height follows the aspect ratio unless `height` is given. */
  width: number;
  height?: number;
  background?: string;
}

/**
 * Renders SVG markup to a straight-alpha RGBA raster. Text is not rendered with system fonts on purpose:
 * brand masters must use outlines, and this keeps output identical across machines.
 */
export const MAX_RENDER_SIDE = 8192;

export async function renderSvg(svg: string, opts: RenderOptions): Promise<Raster> {
  if (!(opts.width > 0) || opts.width > MAX_RENDER_SIDE || (opts.height ?? 0) > MAX_RENDER_SIDE) {
    throw new MarkiloError('INVALID_INPUT', `Render size must be between 1 and ${MAX_RENDER_SIDE} px.`);
  }
  await ensureRenderer();
  let resvg: InstanceType<typeof Resvg>;
  try {
    resvg = new Resvg(svg, {
      fitTo:
        opts.height && !opts.width
          ? { mode: 'height', value: opts.height }
          : { mode: 'width', value: opts.width },
      ...(opts.background ? { background: opts.background } : {}),
      font: { fontBuffers: [], defaultFontFamily: 'sans-serif' },
      shapeRendering: 2,
    });
  } catch (err) {
    throw new MarkiloError('INVALID_SVG', `Renderer rejected the SVG: ${String(err)}`);
  }
  const outH = resvg.width > 0 ? (opts.width * resvg.height) / resvg.width : 0;
  if (!opts.height && outH > MAX_RENDER_SIDE) {
    resvg.free();
    throw new MarkiloError(
      'INVALID_SVG',
      `The SVG's aspect ratio would render ${Math.round(outH)} px tall (limit ${MAX_RENDER_SIDE}).`,
    );
  }
  const img = resvg.render();
  const raster: Raster = { width: img.width, height: img.height, data: unpremultiply(img.pixels) };
  img.free();
  resvg.free();
  return raster;
}

export async function renderPng(svg: string, opts: RenderOptions): Promise<Buffer> {
  return encodePng(await renderSvg(svg, opts));
}
