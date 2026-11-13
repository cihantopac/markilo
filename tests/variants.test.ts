import { describe, expect, it } from 'vitest';
import { adaptToGround } from '../src/export/variants.js';

const art = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M20 20h60v60H20z" fill="${fill}"/></svg>`;
const brand = { primary: '#e0a22a', onLight: '#a86f00', onDark: '#ffd166' };

describe('adaptToGround maps ground colours both ways', () => {
  it('an onLight master shows onDark on dark', () => {
    const out = adaptToGround(art('#a86f00'), '#111318', {}, brand);
    expect(out).toContain('#ffd166');
    expect(out).not.toContain('#a86f00');
  });
  it('an onLight master shows the primary on dark when no onDark is set and the primary passes 3:1', () => {
    const out = adaptToGround(art('#a86f00'), '#111318', {}, { primary: '#e0a22a', onLight: '#a86f00' });
    expect(out).toContain('#e0a22a');
  });
  it('an onDark master shows onLight on light', () => {
    const out = adaptToGround(art('#ffd166'), '#ffffff', {}, brand);
    expect(out).toContain('#a86f00');
    expect(out).not.toContain('#ffd166');
  });
});
