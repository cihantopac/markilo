import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanMonorepo } from '../src/research/monorepo.js';
import { scanRepo, summarizeScan } from '../src/research/repo.js';
import { fixture, tmp } from './helpers.js';

const bin = join(__dirname, '..', 'plugin', 'dist', 'markilo.mjs');
const run = (args: string[], cwd: string) =>
  spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });

describe('monorepo detection', () => {
  const mono = scanMonorepo(fixture('monorepo'));
  const bySlug = Object.fromEntries(mono.candidates.map((c) => [c.slug, c]));
  it('finds workspace and conventional packages', () => {
    expect(mono.isMonorepo).toBe(true);
    expect(mono.workspaceGlobs).toEqual(['products/*', 'packages/*']);
    expect(Object.keys(bySlug).sort()).toEqual([
      'alpha-site',
      'beta-site',
      'crm',
      'keeper',
      'kernel',
      'mail',
      'mailroom',
    ]);
  });
  it('classifies what deserves an identity', () => {
    expect(bySlug['alpha-site']).toMatchObject({
      kind: 'site',
      brandable: true,
      title: 'Alpha',
      homepage: 'https://alpha.example',
    });
    expect(bySlug.crm).toMatchObject({ kind: 'app', brandable: true });
    expect(bySlug.keeper?.logoFiles).toBe(1);
    expect(bySlug.kernel).toMatchObject({ kind: 'library', brandable: false });
    expect(bySlug.mailroom).toMatchObject({ kind: 'app', brandable: true });
  });
  it("links existing icons from shared folders without stealing other packages' icons", () => {
    expect(bySlug.crm?.sharedIcons?.sort()).toEqual(['public/apps/crm-icon-dark.svg', 'public/apps/crm.svg']);
    expect(bySlug.mail?.sharedIcons).toEqual(['public/apps/mail.svg']);
    expect(bySlug.mailroom?.sharedIcons).toBeUndefined();
  });
});

describe('repository scan extras', () => {
  const scan = scanRepo(fixture('monorepo'));
  it('detects icon sets, "-icon" files and design docs', () => {
    expect(scan.iconSets[0]).toMatchObject({ dir: 'public/apps', count: 7 });
    expect(scan.logos.map((l) => l.path)).toContain('apps/keeper/public/keeper-icon.svg');
    expect(scan.designDocs[0]).toMatchObject({
      path: 'docs/design-system/color.md',
      title: 'Color',
      colors: ['#f45d2c', '#14161f'],
    });
  });
  it('reports truncation honestly and summarizes compactly', () => {
    const small = scanRepo(fixture('monorepo'), { maxFiles: 3 });
    expect(small.truncated).toBe(true);
    const sum = summarizeScan(scan);
    expect(sum.iconSets[0]).toBe('public/apps (7)');
    expect(JSON.stringify(sum).length).toBeLessThan(JSON.stringify(scan).length);
  });
});

describe('cli: research monorepo --register --scan', () => {
  it('registers brandable packages with code paths, locks requested ones, and scans them', () => {
    const cwd = tmp();
    expect(run(['init', '--family', 'Acme'], cwd).status).toBe(0);
    expect(run(['brand', 'add', 'Acme', '--role', 'master'], cwd).status).toBe(0);
    const list = JSON.parse(run(['research', 'monorepo', fixture('monorepo')], cwd).stdout);
    expect(list.candidates.filter((c: { brandable: boolean }) => c.brandable)).toHaveLength(6);
    const r = run(
      [
        'research',
        'monorepo',
        fixture('monorepo'),
        '--register',
        '--groups',
        'products,apps',
        '--parent',
        'acme',
        '--lock',
        'keeper',
        '--scan',
      ],
      cwd,
    );
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.registered.map((x: { slug: string }) => x.slug).sort()).toEqual([
      'alpha-site',
      'beta-site',
      'crm',
      'keeper',
      'mail',
      'mailroom',
    ]);
    const brands = JSON.parse(run(['brand', 'list'], cwd).stdout).brands;
    expect(brands.find((b: { slug: string }) => b.slug === 'keeper')).toMatchObject({
      locked: true,
      role: 'sub-brand',
      parent: 'acme',
    });
    expect(brands.find((b: { slug: string }) => b.slug === 'alpha-site')).toMatchObject({ role: 'product' });
    const brief = JSON.parse(readFileSync(join(cwd, 'brand/brands/alpha-site/brief.json'), 'utf8'));
    expect(brief.codePaths[0]).toContain('alpha-site');
    const again = JSON.parse(run(['research', 'repo', '--brand', 'alpha-site'], cwd).stdout);
    expect(again.logos.count).toBe(1);
    expect(existsSync(join(cwd, 'brand/brands/alpha-site/research/cache'))).toBe(true);
  });
  it('install-assets --project targets another folder but stays a dry run', () => {
    const cwd = tmp();
    run(['init'], cwd);
    run(['brand', 'add', 'X'], cwd);
    mkdirSync(join(cwd, 'brand/brands/x/exports/web'), { recursive: true });
    const other = tmp();
    const r = JSON.parse(
      run(['install-assets', '--brand', 'x', '--group', 'web', '--into', 'public', '--project', other], cwd)
        .stdout,
    );
    expect(r.applied).toBe(false);
    expect(existsSync(join(other, 'public'))).toBe(false);
    const bad = run(
      ['install-assets', '--brand', 'x', '--group', 'web', '--into', '../escape', '--project', other],
      cwd,
    );
    expect(JSON.parse(bad.stderr).error.code).toBe('UNSAFE_PATH');
  });
  it('prints compact JSON when piped', () => {
    const out = run(['fonts'], tmp()).stdout;
    expect(out.trim().split('\n')).toHaveLength(1);
  });
});
