import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adaptToGround, groundsFor, markOnGround } from '../src/export/variants.js';
import { ensurePathKit } from '../src/geom/pathkit.js';
import { compareSheetSvg, familySheetSvg, label, paletteSheetSvg, sheetSvg } from '../src/render/sheet.js';
import { fixture, mark } from './helpers.js';

// Sheet text is drawn as outlines, so the sheet is compared against one built from the expected title and labels.
describe('compare sheet', () => {
  const svg = mark('fold-n');
  const g = groundsFor('#ffffff');
  const expected = (title: string, label: string) =>
    sheetSvg(
      [
        { label, background: g.native, svg },
        {
          label: `${label} · on ${g.darkFirst ? 'light' : 'dark'}`,
          background: g.opposite,
          svg: adaptToGround(svg, g.opposite),
        },
      ],
      [16, 32, 64, 128, 256],
      title,
    );

  it('uses the caller title and labels unchanged', () => {
    const sheet = compareSheetSvg([{ label: 'B · Lantern', svg }], '#ffffff', 'Icon options');
    expect(sheet).toBe(expected('Icon options', 'B · Lantern'));
    expect(sheet).not.toBe(expected('Sketch comparison', 'B · Lantern'));
    expect(sheet).not.toBe(expected('Icon options', 'A · B · Lantern'));
  });

  it('defaults the title to Options', () => {
    expect(compareSheetSvg([{ label: 'x', svg }])).toBe(expected('Options', 'x'));
  });
});

describe('family, palette and tile sheets', () => {
  const big =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 160" data-cap-height="100" data-baseline="130"><rect x="10" y="30" width="300" height="100" fill="#1b2140"/></svg>';
  const small = readFileSync(fixture('glyphs/nimbra-word.svg'), 'utf8');

  it('family sheet scales words to one cap height', async () => {
    await ensurePathKit();
    const sheet = await familySheetSvg([
      { label: 'parent', svg: big },
      { label: 'new', svg: small },
    ]);
    // Each word sits in a group scaled so cap height (100 and 50 source units) lands on the same pixel size.
    const scales = [
      ...sheet.matchAll(/<g[^>]*transform="matrix\(([\d.]+) [^"]*"[^>]*data-cap-px="([\d.]+)"/g),
    ].map((m) => ({ s: Number(m[1]), capPx: Number(m[2]) }));
    expect(scales).toHaveLength(2);
    expect(scales[0]!.s * 100).toBeCloseTo(scales[0]!.capPx, 1);
    expect(scales[1]!.s * 50).toBeCloseTo(scales[0]!.capPx, 1);
    // One cap and one baseline guide per row, the same distance apart in every row.
    const guides = [...sheet.matchAll(/data-guide="(cap|baseline)"[^>]*y1="([\d.]+)"/g)];
    expect(guides.map((g) => g[1])).toEqual(['cap', 'baseline', 'cap', 'baseline']);
    const gap = (i: number) => Number(guides[i + 1]![2]) - Number(guides[i]![2]);
    expect(gap(0)).toBeCloseTo(gap(2), 1);
    expect(sheet).not.toContain('<text');
  });

  it('palette sheet has one labelled column per palette', () => {
    const svg = mark('fold-n');
    const one = paletteSheetSvg({
      symbol: svg,
      lockup: svg,
      primary: '#3b5bdb',
      palette: {},
      candidates: ['#c2255c'],
    });
    const two = paletteSheetSvg({
      symbol: svg,
      lockup: svg,
      primary: '#3b5bdb',
      palette: {},
      candidates: ['#c2255c', '#0b7285'],
    });
    expect(one).not.toContain('<text');
    expect(two).not.toContain('<text');
    expect(two.match(/rx="/g)).toHaveLength(2);
    expect(two).toContain(label('2 · #0b7285', 300, 24, 16, '#30343c'));
    expect(one).toContain(label('1 · #c2255c', 20, 24, 16, '#30343c'));
    expect(Number(/width="(\d+)"/.exec(two)![1])).toBeGreaterThan(Number(/width="(\d+)"/.exec(one)![1]));
  });

  it('compare --tile labels tiles by option', () => {
    const svg = mark('fold-n');
    const items = [{ label: 'A · icon', svg }];
    const plain = compareSheetSvg(items);
    const tiled = compareSheetSvg(items, '#ffffff', 'Options', { primary: '#3b5bdb' }, { tile: true });
    expect(tiled).not.toBe(plain);
    const g = groundsFor('#ffffff');
    const expected = sheetSvg(
      [
        { label: 'A · icon', background: g.native, svg },
        { label: 'A · icon · on dark', background: g.opposite, svg: adaptToGround(svg, g.opposite) },
        {
          label: 'A · icon · tile',
          background: '#3b5bdb',
          svg: markOnGround(svg, '#3b5bdb', { primary: '#3b5bdb' }, { tile: true }),
        },
      ],
      [16, 32, 64, 128, 256],
      'Options',
    );
    expect(tiled).toBe(expected);
  });
});
