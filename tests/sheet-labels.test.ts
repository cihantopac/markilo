import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adaptToGround, groundsFor, markOnGround } from '../src/export/variants.js';
import { ensurePathKit } from '../src/geom/pathkit.js';
import { decodeImage } from '../src/render/png.js';
import { renderPng } from '../src/render/resvg.js';
import {
  compareSheetSvg,
  familySheetSvg,
  label,
  paletteSheetSvg,
  reviewSheetRows,
  SMALL_COMPARE_SIZES,
  sheetSvg,
  smallCompareSheetSvg,
  zoomRowsSvg,
} from '../src/render/sheet.js';
import { boardText, briefBoardLang, parseBoardLang } from '../src/ui/board-text.js';
import { TR } from '../src/ui/tr.js';
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

describe('zoom rows', () => {
  const before = mark('fold-n');
  const after = before.replace('<svg', '<svg data-after="1"');
  const vb = /viewBox="([^"]+)"/.exec(before)![1]!.split(/[ ,]+/).map(Number);

  it('adds one labelled row per zoom and leaves the plain sheet untouched', () => {
    const items = [
      { label: 'A', svg: before },
      { label: 'B', svg: after },
    ];
    const plain = compareSheetSvg(items);
    const zoomed = compareSheetSvg(items, '#ffffff', 'Options', undefined, {
      zooms: [{ x: vb[0]!, y: vb[1]!, w: vb[2]! / 4, h: vb[3]! / 4, label: 'Corner' }],
    });
    expect(compareSheetSvg(items, '#ffffff', 'Options', undefined, { zooms: [] })).toBe(plain);
    const h = (s: string) => Number(/ height="([\d.]+)"/.exec(s)![1]);
    expect(h(zoomed)).toBeGreaterThan(h(plain));
    // The row carries the label (drawn as outlines, so a different label draws a different sheet) and two crops.
    const other = compareSheetSvg(items, '#ffffff', 'Options', undefined, {
      zooms: [{ x: vb[0]!, y: vb[1]!, w: vb[2]! / 4, h: vb[3]! / 4, label: 'Other' }],
    });
    expect(other).not.toBe(zoomed);
    expect(zoomed).toContain('data-zoom="0"');
    expect(zoomed.match(/data-zoom-side="/g)).toHaveLength(2);
  });

  it('draws each crop at 4x', () => {
    const svg = zoomRowsSvg(before, after, [{ x: vb[0]!, y: vb[1]!, w: 10, h: 5, label: 'z' }], 400).svg;
    expect(svg).toContain('width="40" height="20" viewBox="');
  });

  it('maps the after art into the before viewBox, so a crop covers the same part of both', async () => {
    const mk = (viewBox: string, inner: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${inner}</svg>`;
    const shape = (dx: number, w: number) =>
      `<rect x="${20 + dx}" y="${20 + dx}" width="${w}" height="30" fill="#c2255c"/>`;
    const b = mk('0 0 100 100', shape(0, 40));
    const zoom = [{ x: 10, y: 10, w: 60, h: 60, label: 'z' }];
    const crops = async (a: string) => {
      const { svg } = zoomRowsSvg(b, a, zoom, 400);
      const side = (n: string) => {
        const m = new RegExp(`<svg data-zoom-side="${n}"[^>]*>[\\s\\S]*?</svg>(?=<svg|</g>)`).exec(svg)!;
        return m[0];
      };
      const doc = (inner: string) =>
        `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><rect width="240" height="240" fill="#fff"/>${inner.replace(/x="[\d.]+" y="[\d.]+" width/, 'x="0" y="0" width')}</svg>`;
      const [l, r] = await Promise.all([
        renderPng(doc(side('before')), { width: 240 }),
        renderPng(doc(side('after')), { width: 240 }),
      ]);
      return [decodeImage(l), decodeImage(r)] as const;
    };
    const diff = (x: ReturnType<typeof decodeImage>, y: ReturnType<typeof decodeImage>) => {
      let n = 0;
      for (let i = 0; i < x.data.length; i += 4)
        if (Math.abs(x.data[i]! - y.data[i]!) + Math.abs(x.data[i + 1]! - y.data[i + 1]!) > 24) n++;
      return n / (x.width * x.height);
    };
    // The same drawing in another coordinate frame: shifted origin, and doubled units. Fitted into the before
    // viewBox, both land where the before art is, so the crops match.
    const moved = mk('100 100 100 100', shape(100, 40));
    const doubled = mk('0 0 200 200', '<rect x="40" y="40" width="80" height="60" fill="#c2255c"/>');
    expect(diff(...(await crops(moved)))).toBeLessThan(0.02);
    expect(diff(...(await crops(doubled)))).toBeLessThan(0.02);
    const wider = mk('0 0 100 100', shape(0, 60));
    expect(diff(...(await crops(wider)))).toBeGreaterThan(0.05);
  });

  it('has Turkish entries for the new labels', () => {
    expect(TR.Before).toBeTruthy();
    expect(TR.After).toBeTruthy();
  });
});

describe('small compare board', () => {
  const main = mark('fold-n');
  const small = mark('plain-circle');
  it('has a main and a small row at 16 / 24 / 32 / 48 on light and dark, with the sheets labels', () => {
    expect(SMALL_COMPARE_SIZES).toEqual([16, 24, 32, 48]);
    const got = smallCompareSheetSvg(main, small);
    const rows = (a: string, b: string) => [
      ['Main symbol · on light', '#ffffff', a],
      ['Main symbol · on dark', '#111318', a],
      ['Small version · on light', '#ffffff', b],
      ['Small version · on dark', '#111318', b],
    ];
    const expected = sheetSvg(
      rows(main, small).map(([l, bg, svg]) => ({
        label: l!,
        background: bg!,
        svg: markOnGround(svg!, bg!, undefined),
      })),
      [16, 24, 32, 48],
    );
    expect(got).toBe(expected);
    // Swapping the small version changes only its rows.
    expect(smallCompareSheetSvg(main, main)).not.toBe(got);
  });
  it('has Turkish entries for the new labels', () => {
    expect(TR['Main symbol']).toBeTruthy();
    expect(TR['Small version']).toBeTruthy();
  });
});

describe('board language', () => {
  const svg = mark('fold-n');
  const g = groundsFor('#ffffff');
  const dark = adaptToGround(svg, g.opposite);

  it('draws the sheet labels in Turkish with --lang tr and keeps English byte-identical', () => {
    const en = compareSheetSvg([{ label: 'A · x.svg', svg }], '#ffffff');
    expect(
      compareSheetSvg([{ label: 'A · x.svg', svg }], '#ffffff', 'Options', undefined, { lang: 'en' }),
    ).toBe(en);
    const tr = compareSheetSvg([{ label: 'A · x.svg', svg }], '#ffffff', 'Options', undefined, {
      lang: 'tr',
    });
    expect(tr).not.toBe(en);
    const expected = sheetSvg(
      [
        { label: 'A · x.svg', background: g.native, svg },
        { label: `A · x.svg · ${TR['on dark']}`, background: g.opposite, svg: dark },
      ],
      [16, 32, 64, 128, 256],
      TR.Options,
    );
    expect(tr).toBe(expected);
  });

  it('translates the review rows, the small-compare rows and the zoom captions', () => {
    const rows = reviewSheetRows(svg, { lang: 'tr' }).map((r) => r.label);
    expect(rows).toEqual([
      TR['Color on light'],
      TR['Color on dark (adapted)'],
      TR.Black,
      TR['White (reversed)'],
    ]);
    expect(reviewSheetRows(svg).map((r) => r.label)[0]).toBe('Color on light');
    const small = smallCompareSheetSvg(svg, svg, { lang: 'tr' });
    expect(small).toBe(
      sheetSvg(
        [
          ...[TR['Main symbol'], TR['Small version']].flatMap((n) => [
            {
              label: `${n} · ${TR['on light']}`,
              background: '#ffffff',
              svg: markOnGround(svg, '#ffffff', undefined),
            },
            {
              label: `${n} · ${TR['on dark']}`,
              background: '#111318',
              svg: markOnGround(svg, '#111318', undefined),
            },
          ]),
        ],
        SMALL_COMPARE_SIZES,
        undefined,
        1,
        undefined,
        'tr',
      ),
    );
    const zoom = { before: svg, after: svg, zooms: [{ x: 0, y: 0, w: 20, h: 20, label: 'Z' }] };
    const z = (lang?: 'tr') => zoomRowsSvg(svg, svg, zoom.zooms, 800, '#ffffff', lang).svg;
    expect(z('tr')).not.toBe(z());
    expect(z()).toBe(zoomRowsSvg(svg, svg, zoom.zooms, 800, '#ffffff').svg);
  });

  it('keeps a label without a Turkish entry in English', () => {
    expect(boardText('No such label here', 'tr')).toBe('No such label here');
    expect(boardText('Before', 'en')).toBe('Before');
    expect(boardText('Before', 'tr')).toBe('Önce');
  });

  it('defaults to Turkish only when the first audience language of the brief is Turkish', () => {
    for (const l of ['tr', 'TR', 'tr-TR', 'Turkish', 'Türkçe', 'turkce'])
      expect(briefBoardLang({ audience: { languages: [l, 'en'] } }), l).toBe('tr');
    expect(briefBoardLang({ audience: { languages: ['en', 'tr'] } })).toBe('en');
    expect(briefBoardLang({ audience: { languages: ['Turkmen'] } })).toBe('en');
    expect(briefBoardLang({})).toBe('en');
    expect(parseBoardLang('TR')).toBe('tr');
    expect(parseBoardLang('de')).toBeUndefined();
  });

  it('proposal boards and sketch sheets take the language too', async () => {
    const { proposalSvg } = await import('../src/render/proposal.js');
    const base = {
      title: 'T',
      caption: 'c',
      lead: 'wordmark' as const,
      wordmark: mark('fold-n'),
      paper: '#ffffff',
      primary: '#3b5bdb',
    };
    const noIcon = async (lang?: 'tr') => (await proposalSvg({ ...base, ...(lang ? { lang } : {}) })).svg;
    expect(await noIcon('tr')).not.toBe(await noIcon());
    expect(await noIcon()).toBe((await proposalSvg(base)).svg);
  });
});
