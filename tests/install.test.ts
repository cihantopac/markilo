import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { planFrameworkInstall } from '../src/cli/frameworks.js';
import { applyInstall, rollbackInstall } from '../src/cli/install.js';
import { installAssets } from '../src/cli/system.js';
import type { Workspace } from '../src/core/workspace.js';
import { exportBrand } from '../src/export/exporter.js';
import { finalizeConcept } from '../src/export/kit.js';
import { verifyConcept } from '../src/report/quality.js';
import { synthBrand, tmp } from './helpers.js';

let ws: Workspace;

beforeAll(async () => {
  ({ ws } = synthBrand());
  await verifyConcept(ws, 'nimbra', 'fold');
  await finalizeConcept(ws, 'nimbra', 'fold', { acceptRisk: true, userChoice: 'Chosen in a test.' });
  await exportBrand(ws, 'nimbra', { groups: ['web', 'social'] });
}, 120_000);

const backups = (project: string) =>
  existsSync(join(project, '.markilo-backup')) ? readdirSync(join(project, '.markilo-backup')) : [];

describe('install-assets keeps the user’s files safe', () => {
  it('backs up a file it replaces with --group --force', () => {
    const project = tmp();
    mkdirSync(join(project, 'public'));
    writeFileSync(join(project, 'public', 'favicon.svg'), 'mine');
    const r = installAssets(ws, 'nimbra', 'web', 'public', project, { apply: true, force: true });
    expect(r.backup).toBeDefined();
    expect(readFileSync(join(project, r.backup!, 'public', 'favicon.svg'), 'utf8')).toBe('mine');
    expect(readFileSync(join(project, 'public', 'favicon.svg'), 'utf8')).not.toBe('mine');
  });

  it('leaves identical files alone instead of backing them up again', () => {
    const project = tmp();
    installAssets(ws, 'nimbra', 'web', 'public', project, { apply: true, force: false });
    const again = installAssets(ws, 'nimbra', 'web', 'public', project, { apply: false, force: true });
    expect(again.files.every((f) => f.action === 'unchanged')).toBe(true);
    expect(again.overwrite).toBe(0);
  });

  it('refuses to apply a plan when the project changed after the dry run', () => {
    const project = tmp();
    const dry = installAssets(ws, 'nimbra', 'web', 'public', project, { apply: false, force: false });
    mkdirSync(join(project, 'public'));
    writeFileSync(join(project, 'public', 'favicon.svg'), 'written after the dry run');
    expect(() =>
      installAssets(ws, 'nimbra', 'web', 'public', project, { apply: true, force: true, expect: dry.planId }),
    ).toThrow(/changed since the dry run/);
    expect(readFileSync(join(project, 'public', 'favicon.svg'), 'utf8')).toBe('written after the dry run');
    expect(backups(project)).toEqual([]);
  });

  it('puts every file back when a copy fails halfway', () => {
    const project = tmp();
    mkdirSync(join(project, 'public'));
    writeFileSync(join(project, 'public', 'favicon.svg'), 'mine');
    const plan = planFrameworkInstall(ws, 'nimbra', project, { framework: 'static', force: true });
    const writes = plan.steps.filter((s) => s.action === 'create' || s.action === 'overwrite');
    expect(writes.length).toBeGreaterThan(3);
    let n = 0;
    expect(() =>
      applyInstall(
        project,
        writes.map((s) => ({ source: join(ws.exportsDir('nimbra'), s.from), to: s.to })),
        {
          beforeWrite: () => {
            if (++n === 3) throw new Error('disk full');
          },
        },
      ),
    ).toThrow(/disk full.*rolled back/s);
    expect(readFileSync(join(project, 'public', 'favicon.svg'), 'utf8')).toBe('mine');
    const left = readdirSync(join(project, 'public'));
    expect(left).toEqual(['favicon.svg']);
  });

  it('undoes the last installation, keeping files the user edited since', () => {
    const project = tmp();
    mkdirSync(join(project, 'public'));
    writeFileSync(join(project, 'public', 'favicon.svg'), 'mine');
    const r = installAssets(ws, 'nimbra', 'web', 'public', project, { apply: true, force: true });
    writeFileSync(join(project, 'public', 'site.webmanifest'), '{"edited":"by the user"}');
    const undo = rollbackInstall(project, { apply: true });
    expect(undo.restored).toContain('public/favicon.svg');
    expect(undo.kept).toContain('public/site.webmanifest');
    expect(readFileSync(join(project, 'public', 'favicon.svg'), 'utf8')).toBe('mine');
    expect(readFileSync(join(project, 'public', 'site.webmanifest'), 'utf8')).toBe(
      '{"edited":"by the user"}',
    );
    expect(existsSync(join(project, 'public', 'favicon.ico'))).toBe(false);
    expect(r.backup).toBeDefined();
    expect(() => rollbackInstall(project, { apply: true })).toThrow(/Nothing to undo/);
  });

  it('applies framework plans through the same journal', () => {
    const project = tmp();
    const plan = planFrameworkInstall(ws, 'nimbra', project, { framework: 'static', apply: true });
    expect(plan.applied).toBe(true);
    const undo = rollbackInstall(project, { apply: true });
    expect(undo.removed.length).toBe(plan.steps.filter((s) => s.action === 'create').length);
    expect(readdirSync(project).filter((f) => f !== '.markilo-backup')).toEqual([]);
  });
});
