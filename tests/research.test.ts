import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCommand } from '../src/cli/args.js';
import { findCommand } from '../src/cli/commands.js';
import { MarkiloError } from '../src/core/errors.js';
import { Workspace } from '../src/core/workspace.js';
import { renderPng } from '../src/render/resvg.js';
import { readReferences } from '../src/report/originality.js';
import { addFinding, mergeRepoScan } from '../src/research/profile.js';
import { scanRepo } from '../src/research/repo.js';
import { robotsAllows, scanSite } from '../src/research/site.js';
import { fixture, mark, tmp } from './helpers.js';

describe('repository scan', () => {
  const scan = scanRepo(fixture('repo'));
  it('extracts product, identity and platform signals', () => {
    expect(scan.project.description).toMatch(/uptime monitoring/);
    expect(scan.readme?.summary).toMatch(/watches your websites/);
    expect(scan.logos.map((l) => l.path)).toContain('public/logo.svg');
    expect(scan.colors.map((c) => c.hex)).toContain('#0e9f6e');
    expect(scan.fonts.map((f) => f.family)).toEqual(expect.arrayContaining(['Inter', 'inter']));
    expect(scan.frameworks).toContain('React');
    expect(scan.manifests[0]?.themeColor).toBe('#0e9f6e');
  });
  it('never reads secret-like files', () => {
    expect(scan.skippedSensitive).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(scan)).not.toContain('SUPER_SECRET');
  });
  it('merges into a profile with sources and observed findings', () => {
    const ws = Workspace.init(join(tmp(), 'brand'), 'T');
    ws.addBrand({ name: 'Zentrix' });
    const p = ws.profile('zentrix');
    const r = mergeRepoScan(p, { ...scan, root: 'fixture-repo' });
    expect(r.added).toBeGreaterThan(4);
    expect(p.findings.every((f) => f.status === 'observed' && f.sourceIds.includes(r.source.id))).toBe(true);
    expect(p.sources[0]?.ref).toBe('fixture-repo');
    expect(() =>
      addFinding(p, { topic: 'market', status: 'observed', statement: 'x', sourceIds: [] }),
    ).toThrow(/need at least one source/);
    expect(
      addFinding(p, {
        topic: 'market',
        status: 'inferred',
        statement: 'Likely developer audience',
        sourceIds: [],
      }).confidence,
    ).toBe('medium');
  });
});

describe('site research', () => {
  it('refuses network access unless explicitly allowed', async () => {
    await expect(scanSite('https://example.com', { allowNetwork: false })).rejects.toMatchObject({
      code: 'NETWORK_DISABLED',
    });
    await expect(scanSite('file:///etc/passwd', { allowNetwork: true })).rejects.toBeInstanceOf(MarkiloError);
  });
  it('evaluates robots.txt', () => {
    const robots = 'User-agent: *\nDisallow: /private\nAllow: /private/ok\n\nUser-agent: BadBot\nDisallow: /';
    expect(robotsAllows(robots, '/')).toBe(true);
    expect(robotsAllows(robots, '/private/x')).toBe(false);
    expect(robotsAllows(robots, '/private/ok/page')).toBe(true);
    expect(robotsAllows('User-agent: MarkiloBot\nDisallow: /', '/')).toBe(false);
  });
});

describe('reference marks', () => {
  const ico = (png: Uint8Array) => {
    const head = new Uint8Array(22);
    const v = new DataView(head.buffer);
    v.setUint16(2, 1, true); // type: icon
    v.setUint16(4, 1, true); // one image
    v.setUint32(6 + 8, png.length, true);
    v.setUint32(6 + 12, 22, true);
    return new Uint8Array([...head, ...png]);
  };
  it('accepts PNG-in-ICO favicons and removes references by id', async () => {
    const { renderPng } = await import('../src/render/resvg.js');
    const { addReference, removeReferences } = await import('../src/research/competitors.js');
    const { readReferences } = await import('../src/report/originality.js');
    const ws = Workspace.init(join(tmp(), 'brand'), 'T');
    ws.addBrand({ name: 'Ico Co' });
    const png = await renderPng(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M8 8h48v48H8z" fill="#123456"/></svg>',
      { width: 64 },
    );
    const r = await addReference(ws, 'ico-co', {
      name: 'Rival',
      source: 'test',
      bytes: ico(png),
      ext: '.ico',
    });
    expect(readReferences(ws, 'ico-co').references[0]!.file).toMatch(/\.png$/);
    expect(removeReferences(ws, 'ico-co', [r.id, 'nope'])).toEqual({ removed: [r.id], missing: ['nope'] });
    expect(readReferences(ws, 'ico-co').references).toHaveLength(0);
    await expect(
      addReference(ws, 'ico-co', {
        name: 'Bmp',
        source: 'test',
        bytes: ico(new Uint8Array(40)),
        ext: '.ico',
      }),
    ).rejects.toThrow(/BMP/);
  });
});

describe('source references', () => {
  it('never stores absolute local paths', async () => {
    const { portableRef } = await import('../src/research/profile.js');
    expect(portableRef('/home/ana/project/src/a.ts', '/home/ana/project')).toBe('src/a.ts');
    expect(portableRef('/home/ana/project', '/home/ana/project')).toBe('.');
    expect(portableRef('/home/ana/other/logo.svg', '/home/ana/project')).toBe('…/logo.svg');
    expect(portableRef('https://example.com/a', '/home/ana/project')).toBe('https://example.com/a');
  });
});

describe('in-situ references', () => {
  it('are stored and listed but never compared for originality', async () => {
    const { buildOriginalityReport, readReferences } = await import('../src/report/originality.js');
    const { addReference, REFERENCE_CATEGORIES } = await import('../src/research/competitors.js');
    const { mark, synthBrand } = await import('./helpers.js');
    expect(REFERENCE_CATEGORIES).toContain('in-situ');
    const { ws } = synthBrand();
    const before = (await buildOriginalityReport(ws, 'nimbra', 'fold')).report;
    // A photo of the real mark on a screen: near-identical to the concept, and expected to be.
    await addReference(ws, 'nimbra', {
      name: 'Home screen photo',
      source: 'photo taken by the user',
      bytes: new TextEncoder().encode(mark('fold-n')),
      ext: '.svg',
      category: 'in-situ',
    });
    expect(readReferences(ws, 'nimbra').references.map((r) => r.category)).toEqual(['in-situ']);
    const after = (await buildOriginalityReport(ws, 'nimbra', 'fold')).report;
    expect(after.scope.referencesCompared).toBe(before.scope.referencesCompared);
    expect(after.visual.matches.map((m) => m.name)).not.toContain('Home screen photo');
    expect(after.visual.risk).toBe(before.visual.risk);
  }, 60_000);
});

describe('reference dedupe and list', () => {
  async function refCmd(name: string, argv: string[], cwd: string) {
    const f = findCommand([name])!;
    return (await f.spec.run(parseCommand(f.spec, argv, cwd))) as Record<string, unknown>;
  }
  /** Lumen with a competitor logo, the same artwork under two more names: an in-situ photo and a family mark. */
  async function lumen() {
    const dir = tmp();
    const ws = Workspace.init(join(dir, 'brand'), 'T');
    ws.addBrand({ name: 'Lumen' });
    writeFileSync(join(dir, 'orbit.svg'), mark('orbit'));
    writeFileSync(join(dir, 'orbit.png'), await renderPng(mark('orbit'), { width: 256 }));
    writeFileSync(join(dir, 'orbit-big.png'), await renderPng(mark('orbit'), { width: 300 }));
    const add = (file: string, name: string, category: string) =>
      refCmd(
        'reference add',
        ['--brand', 'lumen', '--file', file, '--name', name, '--source', 'note', '--category', category],
        dir,
      );
    await add('orbit.svg', 'Acme', 'direct');
    await add('orbit.png', 'Shop front', 'in-situ');
    await add('orbit-big.png', 'Nimbra', 'family');
    return { dir, ws };
  }

  it('never offers an in-situ photo or a family mark as a duplicate, so --apply keeps them', async () => {
    const { dir, ws } = await lumen();
    const r = (await refCmd('reference dedupe', ['--brand', 'lumen', '--apply'], dir)) as {
      duplicates: number;
      total: number;
    };
    expect(r.duplicates).toBe(0);
    expect(
      readReferences(ws, 'lumen')
        .references.map((x) => x.category)
        .sort(),
    ).toEqual(['direct', 'family', 'in-situ']);
  });

  it('lists in-situ photos apart from the brands', async () => {
    const { dir } = await lumen();
    const r = (await refCmd('reference list', ['--brand', 'lumen'], dir)) as {
      brands: number;
      byBrand: { brand: string }[];
      photos: { id: string; name: string }[];
    };
    expect(r.byBrand.map((b) => b.brand)).not.toContain('shop front');
    expect(r.photos.map((p) => p.name)).toEqual(['Shop front']);
  });
});
