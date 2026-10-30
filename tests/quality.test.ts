import { describe, expect, it } from 'vitest';
import { assessQuality } from '../src/analyze/quality.js';
import { mark } from './helpers.js';

const status = async (svg: string, id: string) =>
  (await assessQuality(svg, 't')).checks.find((c) => c.id === id)?.status;

describe('quality checks', () => {
  it('passes a sturdy mark at small sizes', async () => {
    expect(await status(mark('fold-n'), 'fidelity-16')).toBe('pass');
    expect(await status(mark('bolt'), 'svg-integrity')).toBe('pass');
  });
  it('fails hairline detail at 16 px', async () => {
    expect(await status(mark('fine-lines'), 'fidelity-16')).toBe('fail');
  });
  it('fails stock shapes on genericity', async () => {
    expect(await status(mark('plain-circle'), 'genericity')).toBe('fail');
  });
  it('fails embedded raster images', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#111"/><image href="data:image/png;base64,iVBORw0KGgo=" width="5" height="5"/></svg>';
    expect(await status(svg, 'svg-integrity')).toBe('fail');
  });
  it('warns when shapes are separated only by color', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="40" height="80" fill="#1d4ed8"/><rect x="50" y="10" width="40" height="80" fill="#f97316"/></svg>';
    expect(await status(svg, 'monochrome')).not.toBe('pass');
  });
});
