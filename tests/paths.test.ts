import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { slugify, slugifyOrHash } from '../src/core/paths.js';

describe('slugifyOrHash', () => {
  it('keeps the plain slug when the name has Latin letters or digits', () => {
    expect(slugifyOrHash('Şirket Ürün')).toEqual({ slug: 'sirket-urun', hashed: false });
  });
  it('falls back to brand-<6 hex of sha1> for a name with no Latin letters or digits', () => {
    expect(() => slugify('日本語')).toThrow();
    const hex = createHash('sha1').update('日本語').digest('hex').slice(0, 6);
    expect(slugifyOrHash('日本語')).toEqual({ slug: `brand-${hex}`, hashed: true });
  });
});
