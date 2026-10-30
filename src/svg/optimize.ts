import { optimize } from 'svgo';
import { MarkiloError } from '../core/errors.js';

/**
 * Conservative SVGO pass for brand masters (SVGO 4 keeps viewBox and <title> by default): keeps ids that are referenced,
 * keeps titles/desc for accessibility, and limits precision to 3 decimals.
 */
export function optimizeSvg(source: string, opts: { precision?: number } = {}): string {
  try {
    const result = optimize(source, {
      multipass: true,
      floatPrecision: opts.precision ?? 3,
      plugins: [
        {
          name: 'preset-default',
          params: {
            overrides: {
              removeDesc: false,
              cleanupIds: { minify: false, preserve: [] },
              convertShapeToPath: false,
              mergePaths: false,
            },
          },
        },
        {
          name: 'removeAttrs',
          params: { attrs: ['data-name', 'sketch:type', 'inkscape:.*', 'sodipodi:.*'] },
        },
      ],
    } as Parameters<typeof optimize>[1]);
    return result.data;
  } catch (err) {
    throw new MarkiloError('INVALID_SVG', `SVGO failed: ${(err as Error).message}`);
  }
}
