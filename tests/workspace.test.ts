import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeFileSafe } from '../src/core/fsx.js';
import { resolveInside, slugify } from '../src/core/paths.js';
import { Workspace } from '../src/core/workspace.js';
import { tmp } from './helpers.js';

describe('paths', () => {
  it('slugifies with diacritic folding', () => {
    expect(slugify('Şirket Ürün İkon')).toBe('sirket-urun-ikon');
    expect(() => slugify('!!!')).toThrow();
  });
  it('refuses paths that escape the root', () => {
    const root = tmp();
    expect(() => resolveInside(root, '../x')).toThrow(/outside/);
    expect(() => resolveInside(root, '/etc/passwd')).toThrow(/outside/);
    expect(resolveInside(root, 'a/b')).toBe(join(root, 'a', 'b'));
  });
  it('never silently overwrites', () => {
    const f = join(tmp(), 'f.txt');
    writeFileSafe(f, 'a');
    expect(() => writeFileSafe(f, 'b')).toThrow(/already exists/);
    writeFileSafe(f, 'b', { force: true });
  });
});

describe('workspace', () => {
  it('creates, locates and registers brands', () => {
    const dir = tmp();
    Workspace.init(join(dir, 'brand'), 'Fam', { name: 'Family' });
    const ws = Workspace.locate(join(dir));
    expect(ws.manifest.family?.slug).toBe('family');
    expect(existsSync(join(ws.root, 'shared', 'system.json'))).toBe(true);
    const b = ws.addBrand({ name: 'Alpha App' });
    expect(b).toMatchObject({ slug: 'alpha-app', role: 'product' });
    expect(() => ws.addBrand({ name: 'Alpha App' })).toThrow(/already exists/);
    expect(ws.brief('alpha-app').mode).toBe('new');
    expect(() => ws.brand('nope')).toThrow(/Unknown brand/);
  });
  it('locked brands cannot be redesigned', () => {
    const ws = Workspace.init(join(tmp(), 'brand'), 'T');
    ws.addBrand({ name: 'Keep', locked: true });
    expect(ws.brief('keep').mode).toBe('evaluate');
    expect(() => ws.assertNotLocked('keep')).toThrow(/locked/);
  });
  it('finds a relative --workspace from a folder inside it', () => {
    const dir = tmp();
    const ws = Workspace.init(join(dir, 'branding-next'), 'T');
    ws.addBrand({ name: 'Deep' });
    const inside = join(ws.root, 'brands', 'deep');
    expect(Workspace.locate(inside, 'branding-next').root).toBe(ws.root);
    expect(Workspace.locate(dir, 'branding-next').root).toBe(ws.root);
    expect(() => Workspace.locate(dir, 'elsewhere')).toThrow(/No markilo.json/);
  });
  it('keeps raw research out of git, also in workspaces made by older versions', () => {
    const dir = tmp();
    Workspace.init(join(dir, 'brand'), 'T');
    writeFileSync(join(dir, 'brand', '.gitignore'), 'brands/*/research/cache/\n');
    Workspace.locate(dir);
    const rules = readFileSync(join(dir, 'brand', '.gitignore'), 'utf8').split('\n');
    expect(rules).toEqual(
      expect.arrayContaining(['brands/*/research/cache/', 'brands/*/research/references/', '/research/']),
    );
  });
  it('reports a helpful error when there is no workspace', () => {
    expect(() => Workspace.locate(tmp())).toThrow(/No Markilo workspace/);
  });
});
