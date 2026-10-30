import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildOriginalityReport } from '../src/report/originality.js';
import { brandKeyOf, brandsOf, sourceQualityOf } from '../src/report/references.js';
import { addReference } from '../src/research/competitors.js';
import { addSource } from '../src/research/profile.js';
import { fixture, synthBrand } from './helpers.js';

const ref = (
  ws: Parameters<typeof addReference>[0],
  name: string,
  file: string,
  category: 'direct' | 'category' = 'direct',
) =>
  addReference(ws, 'nimbra', {
    name,
    source: `https://cdn.simpleicons.org/${name.toLowerCase()}`,
    bytes: readFileSync(fixture(`marks/${file}.svg`)),
    ext: '.svg',
    category,
  });

const logRegistry = (ws: ReturnType<typeof synthBrand>['ws'], id: string, conflicts?: string[]) => {
  const p = ws.profile('nimbra');
  addSource(p, {
    type: 'registry',
    ref: `https://registry.example/${id}`,
    registry: { id, query: 'Nimbra', classes: [9, 42], resultCount: 4, ...(conflicts ? { conflicts } : {}) },
  });
  ws.saveProfile('nimbra', p);
};

describe('originality verdicts are only as strong as their evidence', () => {
  it('says insufficient-evidence (not "clear") when nothing was researched', async () => {
    const { ws } = synthBrand();
    const { report } = await buildOriginalityReport(ws, 'nimbra', 'fold');
    expect(report.verdict).toBe('insufficient-evidence');
    expect(report.confidence).toBe('low');
    expect(report.visual.risk).toBe('unknown');
    expect(report.name.risk).toBe('unknown');
    expect(report.evidence.missing.join(' ')).toMatch(/direct competitor.*WIPO|WIPO/s);
  });

  it('reaches no-conflicts-found with medium confidence on minimal evidence', async () => {
    const { ws } = synthBrand();
    await ref(ws, 'Boltly', 'bolt');
    await ref(ws, 'Barchart', 'bars');
    await ref(ws, 'Leafy', 'leaf-letter');
    logRegistry(ws, 'wipo-gbd');
    const { report, mdPath } = await buildOriginalityReport(ws, 'nimbra', 'fold', {
      competitorNames: ['Zentrix'],
    });
    expect(report.verdict).toBe('no-conflicts-found');
    expect(report.confidence).toBe('medium');
    expect(readFileSync(mdPath, 'utf8')).toContain('## Evidence behind this verdict');
  });

  it('reaches high confidence only with adequate visual, registry and name coverage', async () => {
    const { ws } = synthBrand();
    for (const [n, f] of [
      ['A', 'bolt'],
      ['B', 'bars'],
      ['C', 'leaf-letter'],
    ] as const)
      await ref(ws, n, f);
    for (const [n, f] of [
      ['D', 'plain-circle'],
      ['E', 'fine-lines'],
    ] as const)
      await ref(ws, n, f, 'category');
    for (const [n, f] of [
      ['F', 'orbit'],
      ['G', 'orbit-tweaked'],
      ['H', 'orbit-mirrored'],
    ] as const)
      await ref(ws, n, f, 'category');
    logRegistry(ws, 'wipo-gbd');
    logRegistry(ws, 'uspto');
    const { report } = await buildOriginalityReport(ws, 'nimbra', 'fold', {
      competitorNames: ['Zentrix', 'Quorly', 'Lumio'],
    });
    expect(report.evidence.visual.coverage).toBe('adequate');
    expect(report.evidence.registry.coverage).toBe('adequate');
    expect(report.confidence).toBe('high');
    expect(report.verdict).toBe('no-conflicts-found');
  });

  it('turns logged registry conflicts into needs-review', async () => {
    const { ws } = synthBrand();
    await ref(ws, 'Boltly', 'bolt');
    await ref(ws, 'Barchart', 'bars');
    await ref(ws, 'Leafy', 'leaf-letter');
    logRegistry(ws, 'tmview', ['NIMBRAA']);
    const { report } = await buildOriginalityReport(ws, 'nimbra', 'fold');
    expect(report.verdict).toBe('needs-review');
    expect(report.name.registryConflicts[0]?.marks).toEqual(['NIMBRAA']);
  });

  it('a copy is redesign regardless of how little else was researched', async () => {
    const { ws } = synthBrand();
    await ref(ws, 'Original', 'fold-n');
    const { report } = await buildOriginalityReport(ws, 'nimbra', 'fold');
    expect(report.verdict).toBe('redesign');
    expect(report.visual.risk).toBe('high');
  });
});

describe('reference evidence counts brands, not files', () => {
  it('groups files of one brand and rates their sources', () => {
    expect(brandKeyOf('GitHub Copilot icon')).toBe('github copilot');
    expect(brandKeyOf('github-copilot (2)')).toBe('github copilot');
    expect(brandKeyOf('Adobe Express logo dark')).toBe('adobe express');
    expect(sourceQualityOf('https://github.com/features/copilot', 'github copilot')).toBe('official');
    expect(sourceQualityOf('https://cdn.simpleicons.org/githubcopilot', 'github copilot')).toBe('catalog');
    expect(sourceQualityOf('https://is1-ssl.mzstatic.com/image/x.png', 'tallyline')).toBe('store');
    expect(sourceQualityOf('https://random-mirror.example/logo.svg', 'tallyline')).toBe('unknown');
    expect(sourceQualityOf('https://competitor.io/', 'acme', ['competitor.io'])).toBe('official');
    const brands = brandsOf([
      { id: '1', name: 'Rival icon', source: 'https://random.example/a.png', category: 'category' },
      { id: '2', name: 'Rival logo', source: 'https://rival.com/logo.svg', category: 'direct' },
      { id: '3', name: 'Rival', source: 'https://random.example/b.png' },
    ]);
    expect(brands).toEqual([
      { brand: 'rival', files: ['1', '2', '3'], category: 'direct', quality: 'official' },
    ]);
  });
  it('does not reach adequate visual coverage with many files of few brands or unverified sources', async () => {
    const { ws } = synthBrand();
    for (const [i, f] of ['bolt', 'bars', 'leaf-letter', 'orbit', 'orbit-tweaked', 'fine-lines'].entries())
      await addReference(ws, 'nimbra', {
        name: `Same Brand ${i % 2 ? 'icon' : 'logo'}`,
        source: 'https://cdn.simpleicons.org/x',
        bytes: readFileSync(fixture(`marks/${f}.svg`)),
        ext: '.svg',
      });
    const { report } = await buildOriginalityReport(ws, 'nimbra', 'fold');
    expect(report.evidence.visual.have).toMatch(/^1 brand\(s\) from 6 reference file/);
    expect(report.evidence.visual.coverage).toBe('none');
    expect(report.scope.brandsCompared).toBe(1);
  });
});
