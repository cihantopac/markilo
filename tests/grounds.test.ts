import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../src/analyze/color.js';
import { assessQuality } from '../src/analyze/quality.js';
import { adaptToGround, groundsFor } from '../src/export/variants.js';
import { lintSvg } from '../src/svg/lint.js';

const darkFirstWordmark =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20"><rect width="60" height="20" fill="#f5f1ea"/><rect x="70" width="30" height="20" fill="#efc27f"/></svg>';

describe('dark-first brands', () => {
  it('knows which ground is native and which is opposite', () => {
    expect(groundsFor('#0a0a0a')).toMatchObject({ darkFirst: true, opposite: '#ffffff' });
    expect(groundsFor('#ffffff')).toMatchObject({ darkFirst: false });
    expect(groundsFor(undefined).native).toBe('#ffffff');
  });
  it('adapts light inks and pale brand colors for light grounds, keeping hue', () => {
    const onWhite = lintSvg(adaptToGround(darkFirstWordmark, '#ffffff')).stats.colors;
    for (const c of onWhite) expect(contrastRatio(c, '#ffffff'), c).toBeGreaterThanOrEqual(3);
    expect(adaptToGround(darkFirstWordmark, '#0a0a0a')).toContain('#f5f1ea');
    // Passing the brand's own (light) ink as the "dark" neutral must not leave the art invisible on white.
    const withLightInk = lintSvg(adaptToGround(darkFirstWordmark, '#ffffff', { dark: '#f5f1ea' })).stats
      .colors;
    for (const c of withLightInk) expect(contrastRatio(c, '#ffffff'), c).toBeGreaterThanOrEqual(3);
  });
  it('flags artwork that disappears on its own paper', async () => {
    const onLight = await assessQuality(darkFirstWordmark, 't', 'wordmark', { paper: '#ffffff' });
    expect(onLight.checks.find((c) => c.id === 'ground-contrast')?.status).toBe('fail');
    const onDark = await assessQuality(darkFirstWordmark, 't', 'wordmark', { paper: '#0a0a0a' });
    expect(onDark.checks.find((c) => c.id === 'ground-contrast')?.status).toBe('pass');
  });
});

describe('marks on a brand fill', () => {
  it('keeps the accent when the fill is the dark primary (appmarks)', async () => {
    const { onFillVariant } = await import('../src/export/variants.js');
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#101218" d="M0 0h4v10H0z"/><path fill="#d12c12" d="M6 0h4v10H6z"/></svg>';
    const r = onFillVariant(svg, '#101218');
    expect(r.color).toBeNull();
    expect(r.svg).toMatch(/fill="#ffffff"/);
    expect(r.svg).not.toMatch(/fill="#101218"/);
    expect(r.svg.match(/fill="(#[0-9a-f]{6})"/g)).toHaveLength(2);
  });
});

describe('square fit', () => {
  const svg = (w: number, h: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect x="${512 - w / 2}" y="${512 - h / 2}" width="${w}" height="${h}" rx="40" fill="#224466"/></svg>`;
  it('warns when a symbol is too wide to fill a square icon', async () => {
    const wide = await assessQuality(svg(900, 380), 'wide', 'symbol', { paper: '#ffffff' });
    const check = wide.checks.find((c) => c.id === 'square-fit');
    expect(check?.status).toBe('warn');
    expect(check?.message).toMatch(/fills only 4\d% of the height/);
    const square = await assessQuality(svg(800, 700), 'square', 'symbol', { paper: '#ffffff' });
    expect(square.checks.find((c) => c.id === 'square-fit')?.status).toBe('pass');
  });
});

describe('one ground resolver for previews and export', () => {
  const rose =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M20 20h60v60H20z" fill="#c2255c"/></svg>';
  const base = {
    title: 'Lumen',
    caption: 'Round 1 · A',
    lead: 'symbol' as const,
    symbol: rose,
    paper: '#ffffff',
    primary: '#c2255c',
  };
  const colorsOf = (svg: string) => lintSvg(svg).stats.colors;

  it('previews use onDark on the dark panel', async () => {
    const { markOnGround } = await import('../src/export/variants.js');
    const { proposalSvg } = await import('../src/render/proposal.js');
    const { compareSheetSvg, reviewSheetRows } = await import('../src/render/sheet.js');
    const palette = { primary: '#c2255c', onDark: '#f783ac' };
    const onDark = markOnGround(rose, '#111318', palette);
    expect(onDark).toContain('#f783ac');
    expect(onDark).not.toContain('#c2255c');
    expect((await proposalSvg({ ...base, onDark: '#f783ac' })).svg).toContain('#f783ac');
    expect((await proposalSvg(base)).svg).not.toContain('#f783ac');
    const items = [{ label: 'A', svg: rose }];
    expect(compareSheetSvg(items, '#ffffff', 'Options', palette)).toContain('#f783ac');
    // Without a palette the sheet is what it was.
    expect(compareSheetSvg(items, '#ffffff', 'Options', { primary: '#c2255c' })).toBe(
      compareSheetSvg(items, '#ffffff', 'Options'),
    );
    const rows = reviewSheetRows(rose, { palette });
    expect(rows[1]).toMatchObject({ label: 'Color on dark' });
    expect(rows[1]!.svg).toContain('#f783ac');
    expect(reviewSheetRows(rose)[1]!.label).toBe('Color on dark (adapted)');
  });

  it('onBrand puts a one-colour mark on the brand tile; auto picks the higher contrast', async () => {
    const { markOnGround, onBrandColor, onFillVariant, tileGround } = await import(
      '../src/export/variants.js'
    );
    const { proposalSvg } = await import('../src/render/proposal.js');
    const tint = colorsOf(onFillVariant(rose, '#c2255c').svg)[0]!;
    expect(tint).not.toBe('#ffffff');
    const palette = { primary: '#c2255c', onBrand: '#ffffff' };
    expect(colorsOf(markOnGround(rose, tileGround(palette), palette, { tile: true }))).toEqual(['#ffffff']);
    // Locked: today's path.
    expect(markOnGround(rose, '#c2255c', palette, { tile: true, locked: true })).toBe(
      onFillVariant(rose, '#c2255c').svg,
    );
    const withWhite = (await proposalSvg({ ...base, onBrand: '#ffffff' })).svg;
    expect(withWhite).not.toContain(tint);
    expect((await proposalSvg(base)).svg).toContain(tint);
    expect(onBrandColor({ primary: '#c2255c', onBrand: 'auto' })).toBe('#ffffff');
    expect(onBrandColor({ primary: '#c2255c', tile: '#f0f0f0', onBrand: 'auto' })).toBe('#0b0d12');
    expect(onBrandColor({ primary: '#c2255c' })).toBeUndefined();
  });

  it('tile sets the tile ground in the proposal', async () => {
    const { proposalSvg } = await import('../src/render/proposal.js');
    expect((await proposalSvg({ ...base, tile: '#1a1a1a' })).svg).toContain('fill="#1a1a1a"');
    expect((await proposalSvg(base)).svg).not.toContain('#1a1a1a');
  });
});
