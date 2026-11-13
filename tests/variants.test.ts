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
  it('art that also carries the primary keeps an accent equal to the other ground colour', () => {
    const b = { primary: '#e0a22a', onLight: '#3584e4', onDark: '#ffd166' };
    const two = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0h50v50H0z" fill="#e0a22a"/><path d="M50 50h50v50H50z" fill="#3584e4"/></svg>`;
    const out = adaptToGround(two, '#111318', {}, b);
    expect(out).toContain('#3584e4');
    expect(out).toContain('#ffd166');
  });
});
