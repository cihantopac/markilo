import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { installAssets } from '../src/cli/system.js';
import { sha256 } from '../src/core/fsx.js';
import type { Workspace } from '../src/core/workspace.js';
import { readIcnsTypes, readIcoSizes } from '../src/export/encoders.js';
import { cssFontFamily, type ExportResult, exportBrand } from '../src/export/exporter.js';
import { finalizeConcept, kitPath, lockIdentity } from '../src/export/kit.js';
import { isDarkGround, onFillVariant } from '../src/export/variants.js';
import { buildGallery } from '../src/gallery/gallery.js';
import { decodeImage, pngSize } from '../src/render/png.js';
import { verifyConcept } from '../src/report/quality.js';
import { lintSvg } from '../src/svg/lint.js';
import { mark, synthBrand, tmp } from './helpers.js';

let ws: Workspace;
let dir: string;
let result: ExportResult;

beforeAll(async () => {
  ({ ws, dir } = synthBrand());
  const v = await verifyConcept(ws, 'nimbra', 'fold');
  expect(v.status).toBe('verified');
  expect(v.originality.verdict).toBe('insufficient-evidence');
  await expect(finalizeConcept(ws, 'nimbra', 'fold', { userChoice: 'Chosen in a test.' })).rejects.toThrow(
    /insufficient-evidence/,
  );
  // A concept whose artwork fails a technical check (e.g. invisible on its own paper) is not approved silently.
  const c = ws.concept('nimbra', 'fold');
  ws.saveConcept({ ...c, palette: { ...c.palette, paper: '#1b2140' } });
  await verifyConcept(ws, 'nimbra', 'fold');
  await expect(finalizeConcept(ws, 'nimbra', 'fold', { userChoice: 'Chosen in a test.' })).rejects.toThrow(
    /failing technical checks/,
  );
  ws.saveConcept({ ...ws.concept('nimbra', 'fold'), palette: { ...c.palette } });
  await verifyConcept(ws, 'nimbra', 'fold');
  await finalizeConcept(ws, 'nimbra', 'fold', {
    tagline: 'Notes that fold into structure',
    acceptRisk: true,
    userChoice: 'Chosen in a test.',
    notes: ['Never use the accent as an error color.'],
  });
  result = await exportBrand(ws, 'nimbra');
}, 120_000);

const out = (p: string) => join(ws.exportsDir('nimbra'), p);
const kitDarkFirst = () =>
  isDarkGround(JSON.parse(readFileSync(out('tokens/tokens.json'), 'utf8')).color.paper.$value);

describe('export kit', () => {
  it('covers every group without skipping', () => {
    expect(result.skipped).toEqual([]);
    const groups = new Set(result.assets.map((a) => a.group));
    for (const g of [
      'logos',
      'web',
      'ios',
      'macos',
      'android',
      'windows',
      'social',
      'marketing',
      'tokens',
      'guidelines',
    ])
      expect(groups).toContain(g);
    expect(result.assets.length).toBeGreaterThan(150);
  });
  it('records accurate sizes and hashes in the manifest', () => {
    const manifest = JSON.parse(readFileSync(out('asset-manifest.json'), 'utf8'));
    for (const a of manifest.assets.slice(0, 60)) {
      const buf = readFileSync(out(a.path));
      expect(sha256(buf)).toBe(a.sha256);
      if (a.format === 'png') expect(pngSize(buf)).toEqual({ width: a.width, height: a.height });
    }
  });
  it('meets platform sizes', () => {
    expect(pngSize(readFileSync(out('web/apple-touch-icon.png')))).toEqual({ width: 180, height: 180 });
    expect(pngSize(readFileSync(out('ios/AppIcon.appiconset/AppIcon-1024.png')))).toEqual({
      width: 1024,
      height: 1024,
    });
    expect(pngSize(readFileSync(out('android/res/mipmap-xxxhdpi/ic_launcher_foreground.png')))).toEqual({
      width: 432,
      height: 432,
    });
    expect(pngSize(readFileSync(out('android/res/mipmap-mdpi/ic_launcher.png')))).toEqual({
      width: 48,
      height: 48,
    });
    expect(pngSize(readFileSync(out('social/og-image.png')))).toEqual({ width: 1200, height: 630 });
    expect(pngSize(readFileSync(out('logos/overview.png'))).width).toBeGreaterThan(600);
    // The kit opens with a preview of every file and a short "start here".
    const index = readFileSync(out('index.html'), 'utf8');
    expect(index).toContain('src="logos/symbol/symbol-white.svg"');
    expect(index).toContain('src="android/res/mipmap-mdpi/ic_launcher.png"');
    expect(readFileSync(out('README.md'), 'utf8')).toContain('*-white');
    expect(existsSync(out('logos/primary/primary-ink.svg'))).toBe(false);
    // No registry search was logged in this workspace, so the guidelines must say so in both formats.
    for (const f of ['guidelines/index.html', 'guidelines/brand-guidelines.md'])
      expect(readFileSync(out(f), 'utf8')).toContain('No trademark registry search was done');
    expect(readFileSync(out('guidelines/index.html'), 'utf8')).toContain(
      'Never use the accent as an error color.',
    );
    expect(pngSize(readFileSync(out('windows/Assets/Square150x150Logo.scale-200.png')))).toEqual({
      width: 300,
      height: 300,
    });
    expect(readIcoSizes(readFileSync(out('web/favicon.ico')))).toEqual([16, 32, 48]);
    expect(readIcoSizes(readFileSync(out('windows/app.ico')))).toEqual([16, 24, 32, 48, 64, 256]);
    expect(readIcnsTypes(readFileSync(out('macos/AppIcon.icns')))).toEqual([
      'icp4',
      'ic11',
      'icp5',
      'ic12',
      'ic07',
      'ic13',
      'ic08',
      'ic14',
      'ic09',
      'ic10',
    ]);
  });
  it('opaque icons have no transparent pixels', async () => {
    const { decodeImage } = await import('../src/render/png.js');
    for (const p of [
      'ios/AppIcon.appiconset/AppIcon-1024.png',
      'web/apple-touch-icon.png',
      'android/play-store-icon-512.png',
    ]) {
      const img = decodeImage(readFileSync(out(p)));
      let transparent = 0;
      for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! < 255) transparent++;
      expect(transparent, p).toBe(0);
    }
  });
  it('writes valid platform metadata', () => {
    const wm = JSON.parse(readFileSync(out('web/site.webmanifest'), 'utf8'));
    expect(wm.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
    const contents = JSON.parse(readFileSync(out('ios/AppIcon.appiconset/Contents.json'), 'utf8'));
    expect(contents.images).toHaveLength(3);
    expect(readFileSync(out('android/res/mipmap-anydpi-v26/ic_launcher.xml'), 'utf8')).toContain(
      '<monochrome',
    );
    expect(readFileSync(out('web/head-snippet.html'), 'utf8')).toContain('sizes="any" type="image/svg+xml"');
    const tokens = JSON.parse(readFileSync(out('tokens/tokens.json'), 'utf8'));
    expect(tokens.color.brand.primary['500'].$type).toBe('color');
  });
  it('emits a Tailwind v4 theme with the brand colours and font', () => {
    const slug = 'nimbra';
    const css = readFileSync(out('tokens/tailwind.css'), 'utf8');
    expect(css).toMatch(/^@theme \{/m);
    expect(css).toContain(`--color-${slug}-primary-500:`);
    expect(css).toContain(`--color-${slug}-neutral-500:`);
    expect(css).toContain(`--color-${slug}-ink:`);
    expect(css).toContain(`--color-${slug}-paper:`);
    expect(css).toContain(`--font-${slug}:`);
  });
  it('tokens.css carries everything tokens.json has', () => {
    const slug = 'nimbra';
    const css = readFileSync(out('tokens/tokens.css'), 'utf8');
    expect(css).toContain(`--${slug}-success:`);
    expect(css).toContain(`--${slug}-space-4: 16px;`);
    expect(css).toContain(`--${slug}-font-brand:`);
    expect(css).toMatch(/@media \(prefers-color-scheme: (dark|light)\)/);
    expect(css).toContain(`--${slug}-surface:`);
    expect(css).toContain(`--${slug}-text:`);
  });
  it('old kits export unchanged apart from the new files', () => {
    // The synthetic brand has no 1.2.0 field in its brand.json. Every logo, icon and social file keeps the sha256 it
    // had in 1.1.3 (fixture made from a b8b9567 export); only the files below may differ.
    const fx = JSON.parse(
      readFileSync(join(import.meta.dirname, 'fixtures/kit-1.1.3-hashes.json'), 'utf8'),
    ) as {
      files: Record<string, string>;
    };
    const darkFirst = kitDarkFirst();
    const expectedToDiffer = (path: string) =>
      path.startsWith('tokens/') ||
      // 1.2.0 adds the TV banner as an Android drawable resource (not in the 1.1.3 fixture).
      path === 'android/res/drawable-xhdpi/banner.png' ||
      // The manifest lists every file with its hash and a timestamp, so it changes whenever a file is added.
      path === 'asset-manifest.json' ||
      // README.md and index.html (the kit overview) list the exported files, now including tailwind.css and the TV banner.
      path === 'README.md' ||
      path === 'index.html' ||
      // The guidelines carry the export date ("Generated by Markilo on …"), so they differ on any other day.
      path.startsWith('guidelines/') ||
      (darkFirst && path.startsWith('web/'));
    const changed: string[] = [];
    for (const [path, hash] of Object.entries(fx.files)) {
      if (expectedToDiffer(path)) continue;
      if (!existsSync(out(path)) || sha256(readFileSync(out(path))) !== hash) changed.push(path);
    }
    expect(changed).toEqual([]);
  });
  it('emits an Android TV banner at 320×180 as a drawable resource', () => {
    const manifest = JSON.parse(readFileSync(out('asset-manifest.json'), 'utf8'));
    const path = 'android/res/drawable-xhdpi/banner.png';
    expect(pngSize(readFileSync(out(path)))).toEqual({ width: 320, height: 180 });
    const entry = manifest.assets.find((f: { path: string }) => f.path === path);
    expect(entry.purpose).toContain('android:banner="@drawable/banner"');
    expect(existsSync(out('android/tv-banner.png'))).toBe(false);
  });
  it('builds a self-contained gallery', async () => {
    const g = await buildGallery(ws);
    const html = readFileSync(g.path, 'utf8');
    expect(html).toContain('Nimbra');
    expect(html).not.toMatch(/<(script|img|link)[^>]+(src|href)="https?:/);
  });
});

describe('theme-color', () => {
  const metaOf = (b: string) => readFileSync(join(ws.exportsDir(b), 'web/head-snippet.html'), 'utf8');
  const manifestOf = (b: string) =>
    JSON.parse(readFileSync(join(ws.exportsDir(b), 'web/site.webmanifest'), 'utf8'));
  const lock = (name: string, paper: string) => {
    const slug = name.toLowerCase();
    const symbolPath = join(tmp(), 'symbol.svg');
    writeFileSync(symbolPath, mark('bars'));
    ws.addBrand({ name, locked: true });
    lockIdentity(ws, slug, { symbol: symbolPath, primary: '#7a3cf0', paper });
    return slug;
  };
  it('follows the paper colour of a dark-first brand', async () => {
    const b = lock('Duskly', '#0b1220');
    await exportBrand(ws, b, { groups: ['web', 'tokens'] });
    expect(metaOf(b)).toContain('<meta name="theme-color" content="#0b1220">');
    expect(manifestOf(b).theme_color).toBe('#0b1220');
    // The scheme swap of a dark-first brand targets the light scheme.
    expect(readFileSync(join(ws.exportsDir(b), 'tokens/tokens.css'), 'utf8')).toContain(
      '@media (prefers-color-scheme: light)',
    );
  });
  it('keeps the primary for a light brand', () => {
    expect(readFileSync(out('web/head-snippet.html'), 'utf8')).toContain(
      '<meta name="theme-color" content="#3b5bdb">',
    );
    expect(JSON.parse(readFileSync(out('web/site.webmanifest'), 'utf8')).theme_color).toBe('#3b5bdb');
  });
  it('lets --theme-color override the default', async () => {
    const b = lock('Brightly', '#ffffff');
    await exportBrand(ws, b, { groups: ['web'], themeColor: '#123456' });
    expect(metaOf(b)).toContain('content="#123456"');
    expect(manifestOf(b).theme_color).toBe('#123456');
    await exportBrand(ws, b, { groups: ['web'], themeColor: 'paper' });
    expect(manifestOf(b).theme_color).toBe('#ffffff');
  });
  it('rejects a colour name with USAGE', async () => {
    await expect(exportBrand(ws, 'nimbra', { groups: ['web'], themeColor: 'blue' })).rejects.toMatchObject({
      code: 'USAGE',
    });
  });
});

describe('locked identities', () => {
  it('are exported without altering the artwork', async () => {
    const lockedDir = tmp();
    const symbolPath = join(lockedDir, 'legacy-symbol.svg');
    writeFileSync(symbolPath, mark('bars'));
    ws.addBrand({ name: 'Keeper', locked: true });
    lockIdentity(ws, 'keeper', { symbol: symbolPath, primary: '#7a3cf0' });
    const r = await exportBrand(ws, 'keeper', { groups: ['logos', 'web'] });
    const logos = r.assets.filter((a) => a.group === 'logos' && a.format === 'svg');
    expect(logos).toHaveLength(1);
    expect(readFileSync(join(ws.exportsDir('keeper'), logos[0]!.path), 'utf8')).toBe(mark('bars'));
    expect(r.warnings.join(' ')).toMatch(/Locked identity/);
    await expect(verifyConcept(ws, 'keeper', 'x')).rejects.toThrow(/locked/);
  });
});

describe('install-assets', () => {
  it('is a dry run by default and never overwrites without --force', () => {
    const project = join(dir, 'app');
    const dry = installAssets(ws, 'nimbra', 'web', 'public', project, { apply: false, force: false });
    expect(dry.applied).toBe(false);
    expect(existsSync(join(project, 'public'))).toBe(false);
    installAssets(ws, 'nimbra', 'web', 'public', project, { apply: true, force: false });
    writeFileSync(join(project, 'public', 'favicon.svg'), 'mine');
    const again = installAssets(ws, 'nimbra', 'web', 'public', project, { apply: true, force: false });
    expect(again.skippedExisting).toContain('public/favicon.svg');
    expect(readFileSync(join(project, 'public', 'favicon.svg'), 'utf8')).toBe('mine');
    expect(() =>
      installAssets(ws, 'nimbra', 'web', '../outside', project, { apply: false, force: false }),
    ).toThrow(/outside/);
  });
});

describe('wordmark-only identities', () => {
  let wws: Workspace;
  const wout = (p: string) => join(wws.exportsDir('nimbra'), p);
  beforeAll(async () => {
    ({ ws: wws } = synthBrand());
    await verifyConcept(wws, 'nimbra', 'fold');
    const kit = await finalizeConcept(wws, 'nimbra', 'fold', {
      acceptRisk: true,
      userChoice: 'Chosen in a test.',
      wordmarkOnly: true,
    });
    expect(kit.wordmarkOnly).toBe(true);
    await exportBrand(wws, 'nimbra');
  }, 120_000);

  it('has no symbol lockups and no symbol behind social images', () => {
    expect(existsSync(wout('logos/secondary'))).toBe(false);
    expect(existsSync(wout('logos/compact'))).toBe(false);
    for (const f of ['social/og-image.svg', 'social/og-image-dark.svg'])
      expect(readFileSync(wout(f), 'utf8')).not.toMatch(/<g opacity="0\.(08|16)">/);
    expect(existsSync(wout('web/favicon.svg'))).toBe(true); // the symbol still makes the icons
    expect(readFileSync(wout('guidelines/brand-guidelines.md'), 'utf8')).toContain(
      'never set next to the wordmark',
    );
  });
  it('leads with the wordmark and uses it for the watermarks', () => {
    const kit = JSON.parse(readFileSync(join(wws.finalDir('nimbra'), 'brand.json'), 'utf8'));
    expect(kit.files.lockupHorizontal).toBeUndefined();
    // The kit with lockups watermarks with the symbol; the wordmark-only kit watermarks with the word.
    expect(readFileSync(wout('marketing/watermark-white.svg'), 'utf8')).not.toEqual(
      readFileSync(out('marketing/watermark-white.svg'), 'utf8'),
    );
  });
  it('does not state the rule for kits with lockups', () => {
    expect(readFileSync(out('guidelines/brand-guidelines.md'), 'utf8')).not.toContain(
      'never set next to the wordmark',
    );
  });
  it('keeps the rearrange rule out of wordmark-only guidelines only', () => {
    const rule = 'Do not rearrange the symbol and wordmark';
    expect(readFileSync(wout('guidelines/brand-guidelines.md'), 'utf8')).not.toContain(rule);
    expect(readFileSync(out('guidelines/brand-guidelines.md'), 'utf8')).toContain(rule);
  });
  it('derives the email signature from the lead logo', () => {
    const sig = (dir: (p: string) => string) =>
      JSON.parse(readFileSync(dir('asset-manifest.json'), 'utf8')).assets.find(
        (a: { path: string }) => a.path === 'marketing/email-signature.png',
      ).derivedFrom;
    expect(sig(wout)).toBe('wordmark.svg');
    expect(sig(out)).toBe('lockup-horizontal.svg');
  });
  it('refuses a locked brand with LOCKED and a concept without a wordmark with USAGE', async () => {
    const symbolPath = join(tmp(), 'symbol.svg');
    writeFileSync(symbolPath, mark('bars'));
    wws.addBrand({ name: 'Fixed', locked: true });
    lockIdentity(wws, 'fixed', { symbol: symbolPath, primary: '#7a3cf0' });
    await expect(
      finalizeConcept(wws, 'fixed', 'x', { userChoice: 'u', wordmarkOnly: true }),
    ).rejects.toMatchObject({ code: 'LOCKED' });
    const c = wws.concept('nimbra', 'fold');
    const { wordmark: _w, ...files } = c.files;
    wws.saveConcept({ ...c, files });
    await expect(
      finalizeConcept(wws, 'nimbra', 'fold', { userChoice: 'u', wordmarkOnly: true, force: true }),
    ).rejects.toMatchObject({ code: 'USAGE' });
  });
});

describe('cssFontFamily', () => {
  it('quotes a family that is not a valid CSS identifier', () => {
    expect(cssFontFamily('Inter')).toBe('Inter');
    expect(cssFontFamily('Alegreya-Sans')).toBe('Alegreya-Sans');
    expect(cssFontFamily('Source Sans 3')).toBe('"Source Sans 3"');
    expect(cssFontFamily('3Dumb')).toBe('"3Dumb"');
  });
});

describe('a colour for each ground', () => {
  const svgsUnder = (root: string, sub: string): string[] => {
    const dir = join(root, sub);
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('.svg'))
      .map((f) => readFileSync(join(dir, f), 'utf8'));
  };
  it('uses onLight on light grounds and onDark on dark grounds', async () => {
    const { ws } = synthBrand();
    const cdir = ws.conceptDir('nimbra', 'fold');
    writeFileSync(
      join(cdir, 'symbol.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M20 20h30v60H20zM60 20l20 30-20 30z" fill="#3ddc97"/></svg>',
    );
    const c = ws.concept('nimbra', 'fold');
    ws.saveConcept({
      ...c,
      palette: { primary: '#3ddc97', paper: '#0b1220', ink: '#e8f0ec', onLight: '#007044' },
    });
    await verifyConcept(ws, 'nimbra', 'fold');
    await finalizeConcept(ws, 'nimbra', 'fold', { acceptRisk: true, userChoice: 'Chosen in a test.' });
    await exportBrand(ws, 'nimbra', { groups: ['logos', 'social', 'tokens', 'guidelines'] });
    const out = ws.exportsDir('nimbra');
    // Dark-first: the reversed artwork sits on white, so it takes the green chosen for light grounds.
    const reversed = svgsUnder(out, 'logos').filter((x) => x.includes('#007044'));
    expect(reversed.length).toBeGreaterThan(0);
    // Where the light-ground colour is used, the dark-ground primary is gone (not mixed with an adapted shade).
    for (const x of reversed) expect(x).not.toContain('#3ddc97');
    // The guidelines' reversed tile shows it too.
    expect(readFileSync(join(out, 'guidelines/index.html'), 'utf8')).toContain('#007044');
    expect(svgsUnder(out, 'social').some((x) => x.includes('#007044'))).toBe(true);
    const tokens = readFileSync(join(out, 'tokens/tokens.css'), 'utf8');
    expect(tokens).toContain('--nimbra-on-light: #007044;');
    expect(tokens).not.toContain('--nimbra-on-dark:');
  }, 120_000);

  it('does not recolour a locked brand', async () => {
    const { ws } = synthBrand();
    const symbolPath = join(tmp(), 'symbol.svg');
    writeFileSync(symbolPath, mark('bars'));
    ws.addBrand({ name: 'Duskmint', locked: true });
    lockIdentity(ws, 'duskmint', { symbol: symbolPath, primary: '#7a3cf0', paper: '#0b1220' });
    const hashes = () =>
      Object.fromEntries(
        readdirSync(join(ws.exportsDir('duskmint'), 'logos'), { recursive: true })
          .map(String)
          .filter((f) => /\.(svg|png)$/.test(f))
          .map((f) => [f, sha256(readFileSync(join(ws.exportsDir('duskmint'), 'logos', f)))]),
      );
    await exportBrand(ws, 'duskmint', { groups: ['logos'] });
    const before = hashes();
    const kit = JSON.parse(readFileSync(kitPath(ws, 'duskmint'), 'utf8'));
    writeFileSync(
      kitPath(ws, 'duskmint'),
      JSON.stringify({ ...kit, palette: { ...kit.palette, onDark: '#00ff99', onLight: '#004422' } }),
    );
    await exportBrand(ws, 'duskmint', { groups: ['logos'], clean: true });
    expect(hashes()).toEqual(before);
  }, 120_000);
});

describe('the brand tile', () => {
  const rose = mark('fold-n').replace(/fill="#[0-9a-f]{6}"/g, 'fill="#c2255c"');
  const tileFiles = [
    'web/apple-touch-icon.png',
    'android/res/mipmap-xxxhdpi/ic_launcher.png',
    'macos/AppIcon.iconset/icon_512x512.png',
  ];
  /** Opaque colours of a PNG, most frequent first, as #rrggbb. */
  const colours = (buf: Buffer): string[] => {
    const { data } = decodeImage(buf);
    const n = new Map<string, number>();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] !== 255) continue;
      const hex = `#${[data[i]!, data[i + 1]!, data[i + 2]!].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      n.set(hex, (n.get(hex) ?? 0) + 1);
    }
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  };
  // The tint the automatic path gives this mark on its own rose tile (what onBrand replaces).
  const onFillTint = lintSvg(onFillVariant(rose, '#c2255c').svg).stats.colors[0]!;
  const exportWith = async (extra: Record<string, string>) => {
    const { ws } = synthBrand();
    writeFileSync(join(ws.conceptDir('nimbra', 'fold'), 'symbol.svg'), rose);
    const c = ws.concept('nimbra', 'fold');
    ws.saveConcept({ ...c, palette: { primary: '#c2255c', ...extra } });
    await verifyConcept(ws, 'nimbra', 'fold');
    await finalizeConcept(ws, 'nimbra', 'fold', { acceptRisk: true, userChoice: 'Chosen in a test.' });
    await exportBrand(ws, 'nimbra', { groups: ['logos', 'web', 'android', 'macos', 'marketing', 'tokens'] });
    const read = (p: string) => readFileSync(join(ws.exportsDir('nimbra'), p));
    read.gallery = async () => readFileSync((await buildGallery(ws)).path, 'utf8');
    return read;
  };

  it('onBrand puts a white mark on every brand tile', async () => {
    const read = await exportWith({ onBrand: '#ffffff' });
    const app = read('logos/appmark/appmark.svg').toString();
    expect(app).toContain('fill="#ffffff"');
    expect(app).not.toMatch(/fill="#(?!ffffff|c2255c)[0-9a-f]{6}"/);
    for (const f of tileFiles) expect(colours(read(f)).slice(0, 2), f).toEqual(['#c2255c', '#ffffff']);
    const card = read('marketing/business-card-front.svg').toString();
    expect(card).toContain('fill="#ffffff"');
    expect(card).not.toMatch(/fill="#(?!ffffff|c2255c)[0-9a-f]{6}"/);
    expect(read('tokens/tokens.css').toString()).toContain('--nimbra-on-brand: #ffffff;');
    expect(read('tokens/tokens.css').toString()).not.toContain('--nimbra-tile:');
    expect(JSON.parse(read('tokens/tokens.json').toString()).color.onBrand.$value).toBe('#ffffff');
    // The gallery's tiles carry the same white mark, not the adapted tint.
    expect(onFillTint).not.toBe('#ffffff');
    expect(await read.gallery()).not.toContain(onFillTint);
  }, 120_000);

  it('tile sets the tile ground', async () => {
    const read = await exportWith({ tile: '#1a1a1a', onBrand: 'auto' });
    expect(read('logos/appmark/appmark.svg').toString()).toContain('fill="#1a1a1a"');
    for (const f of tileFiles) expect(colours(read(f))[0], f).toBe('#1a1a1a');
    expect(read('marketing/business-card-front.svg').toString()).toContain('fill="#1a1a1a"');
    expect(read('android/res/values/ic_launcher_colors.xml').toString()).toContain(
      '<color name="brand_primary">#1a1a1a</color>',
    );
    const css = read('tokens/tokens.css').toString();
    // auto is resolved to the colour it picks: white (the paper) on a near-black tile.
    expect(css).toContain('--nimbra-on-brand: #ffffff;');
    expect(css).toContain('--nimbra-tile: #1a1a1a;');
    expect(JSON.parse(read('tokens/tokens.json').toString()).color.tile.$value).toBe('#1a1a1a');
    expect(await read.gallery()).toContain('#1a1a1a');
  }, 120_000);

  it('a locked brand ignores onBrand and tile', async () => {
    const { ws } = synthBrand();
    const symbolPath = join(tmp(), 'symbol.svg');
    writeFileSync(symbolPath, mark('bars'));
    ws.addBrand({ name: 'Ledger', locked: true });
    lockIdentity(ws, 'ledger', { symbol: symbolPath, primary: '#7a3cf0' });
    const root = ws.exportsDir('ledger');
    const hashes = () =>
      Object.fromEntries(
        readdirSync(root, { recursive: true })
          .map(String)
          .filter((f) => /\.(svg|png|icns)$/.test(f))
          .map((f) => [f, sha256(readFileSync(join(root, f)))]),
      );
    const groups = ['logos', 'web', 'android', 'macos'] as const;
    await exportBrand(ws, 'ledger', { groups: [...groups] });
    const before = hashes();
    const kit = JSON.parse(readFileSync(kitPath(ws, 'ledger'), 'utf8'));
    writeFileSync(
      kitPath(ws, 'ledger'),
      JSON.stringify({ ...kit, palette: { ...kit.palette, onBrand: '#ffffff', tile: '#1a1a1a' } }),
    );
    await exportBrand(ws, 'ledger', { groups: [...groups], clean: true });
    expect(hashes()).toEqual(before);
  }, 120_000);
});

describe('originality band', () => {
  const BAND =
    'Originality not verified: no competitor marks were compared. Run research (with network access) before relying on this mark.';
  it('the guidelines open the originality section with a band when it was not verified', async () => {
    const { ws } = synthBrand();
    await verifyConcept(ws, 'nimbra', 'fold');
    const kit = await finalizeConcept(ws, 'nimbra', 'fold', {
      acceptRisk: true,
      userChoice: 'Chosen in a test.',
    });
    expect(kit.originality?.verdict).toBe('insufficient-evidence');
    await exportBrand(ws, 'nimbra', { groups: ['guidelines'] });
    const g = (f: string) => readFileSync(join(ws.exportsDir('nimbra'), 'guidelines', f), 'utf8');
    expect(g('brand-guidelines.md')).toContain(BAND);
    expect(g('index.html')).toContain('<p class="band warn"');
    expect(g('index.html')).toContain(BAND);

    // A verified mark gets no band.
    const saved = JSON.parse(readFileSync(kitPath(ws, 'nimbra'), 'utf8'));
    writeFileSync(
      kitPath(ws, 'nimbra'),
      JSON.stringify({ ...saved, originality: { ...saved.originality, verdict: 'no-conflicts-found' } }),
    );
    await exportBrand(ws, 'nimbra', { groups: ['guidelines'], clean: true });
    expect(g('brand-guidelines.md')).not.toContain(BAND);
    expect(g('index.html')).not.toContain(BAND);
  }, 120_000);
});

describe('custom lettering', () => {
  it('guidelines do not call a stand-in the brand typeface', async () => {
    const { ws } = synthBrand();
    const c = ws.concept('nimbra', 'fold');
    ws.saveConcept({
      ...c,
      typography: {
        fontId: 'outfit',
        weight: 600,
        family: 'Outfit',
        license: 'OFL-1.1',
        lettering: 'custom',
      },
    });
    await verifyConcept(ws, 'nimbra', 'fold');
    await finalizeConcept(ws, 'nimbra', 'fold', { acceptRisk: true, userChoice: 'Chosen in a test.' });
    await exportBrand(ws, 'nimbra', { groups: ['tokens', 'guidelines'] });
    const read = (f: string) => readFileSync(join(ws.exportsDir('nimbra'), f), 'utf8');
    const md = () => read('guidelines/brand-guidelines.md');
    expect(md()).not.toContain('Brand typeface: **Outfit**');
    expect(md()).toContain('Wordmark: custom lettering — do not retype it');
    expect(md()).not.toContain('Supporting typeface');
    expect(read('guidelines/index.html')).not.toMatch(/Outfit 600/);
    expect(read('tokens/tokens.css')).not.toContain('Outfit');
    expect(read('tokens/tokens.json')).not.toContain('Outfit');
    expect(read('tokens/tailwind.css')).not.toContain('Outfit');
    // A supporting typeface is named as such, in the guidelines and the tokens.
    const saved = JSON.parse(readFileSync(kitPath(ws, 'nimbra'), 'utf8'));
    writeFileSync(
      kitPath(ws, 'nimbra'),
      JSON.stringify({
        ...saved,
        typography: {
          ...saved.typography,
          lettering: 'family',
          supporting: { fontId: 'inter', weight: 400 },
        },
      }),
    );
    await exportBrand(ws, 'nimbra', { groups: ['tokens', 'guidelines'], clean: true });
    expect(md()).toContain('Wordmark: custom (family) lettering — do not retype it');
    expect(md()).toContain('Supporting typeface: **Inter**, weight 400');
    expect(md()).not.toContain('Brand typeface');
    expect(read('guidelines/index.html')).toContain('Supporting typeface');
    expect(read('tokens/tokens.css')).toContain('--nimbra-font-supporting: Inter, system-ui, sans-serif;');
    expect(read('tokens/tokens.css')).not.toContain('--nimbra-font-brand');
    expect(JSON.parse(read('tokens/tokens.json')).font.supporting.$value[0]).toBe('Inter');
  }, 120_000);
});
