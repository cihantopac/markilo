import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MarkiloError } from '../src/core/errors.js';
import { Workspace } from '../src/core/workspace.js';
import { addFinding, mergeRepoScan } from '../src/research/profile.js';
import { scanRepo } from '../src/research/repo.js';
import { robotsAllows, scanSite } from '../src/research/site.js';
import { fixture, tmp } from './helpers.js';

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
