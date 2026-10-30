import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { installAssets } from '../src/cli/system.js';
import { sha256 } from '../src/core/fsx.js';
import type { Workspace } from '../src/core/workspace.js';
import { readIcnsTypes, readIcoSizes } from '../src/export/encoders.js';
import { type ExportResult, exportBrand } from '../src/export/exporter.js';
import { finalizeConcept, lockIdentity } from '../src/export/kit.js';
import { buildGallery } from '../src/gallery/gallery.js';
import { pngSize } from '../src/render/png.js';
import { verifyConcept } from '../src/report/quality.js';
import { mark, synthBrand, tmp } from './helpers.js';

let ws: Workspace;
let dir: string;
let result: ExportResult;

beforeAll(async () => {
  ({ ws, dir } = synthBrand());
  const v = await verifyConcept(ws, 'nimbra', 'fold');
  expect(v.status).toBe('verified');
  expect(v.originality.verdict).toBe('insufficient-evidence');
  await expect(finalizeConcept(ws, 'nimbra', 'fold')).rejects.toThrow(/insufficient-evidence/);
  // A concept whose artwork fails a technical check (e.g. invisible on its own paper) is not approved silently.
  const c = ws.concept('nimbra', 'fold');
  ws.saveConcept({ ...c, palette: { ...c.palette, paper: '#1b2140' } });
  await verifyConcept(ws, 'nimbra', 'fold');
  await expect(finalizeConcept(ws, 'nimbra', 'fold')).rejects.toThrow(/failing technical checks/);
  ws.saveConcept({ ...ws.concept('nimbra', 'fold'), palette: { ...c.palette } });
  await verifyConcept(ws, 'nimbra', 'fold');
  await finalizeConcept(ws, 'nimbra', 'fold', {
    tagline: 'Notes that fold into structure',
    acceptRisk: true,
    notes: ['Never use the accent as an error color.'],
  });
  result = await exportBrand(ws, 'nimbra');
}, 120_000);

const out = (p: string) => join(ws.exportsDir('nimbra'), p);

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
    expect(readFileSync(out('logos/README.md'), 'utf8')).toContain('*-white');
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
  it('builds a self-contained gallery', async () => {
    const g = await buildGallery(ws);
    const html = readFileSync(g.path, 'utf8');
    expect(html).toContain('Nimbra');
    expect(html).not.toMatch(/<(script|img|link)[^>]+(src|href)="https?:/);
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
    expect(again.skippedExisting).toContain(join('public', 'favicon.svg'));
    expect(readFileSync(join(project, 'public', 'favicon.svg'), 'utf8')).toBe('mine');
    expect(() =>
      installAssets(ws, 'nimbra', 'web', '../outside', project, { apply: false, force: false }),
    ).toThrow(/outside/);
  });
});
