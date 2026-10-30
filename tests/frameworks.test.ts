import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { detectFramework, planFrameworkInstall } from '../src/cli/frameworks.js';
import type { Workspace } from '../src/core/workspace.js';
import { exportBrand } from '../src/export/exporter.js';
import { finalizeConcept } from '../src/export/kit.js';
import { verifyConcept } from '../src/report/quality.js';
import { synthBrand, tmp } from './helpers.js';

let ws: Workspace;
const project = (fixture: string) => {
  const dir = tmp();
  cpSync(join('bench/scenarios', fixture, 'project'), dir, { recursive: true });
  return dir;
};

beforeAll(async () => {
  ({ ws } = synthBrand());
  await verifyConcept(ws, 'nimbra', 'fold');
  await finalizeConcept(ws, 'nimbra', 'fold', { acceptRisk: true });
  await exportBrand(ws, 'nimbra');
}, 120_000);

describe('framework-aware asset installation', () => {
  it('detects the framework from the project', () => {
    expect(detectFramework(project('saas-invoicing')).framework).toBe('next');
    expect(detectFramework(project('mobile-sleep')).framework).toBe('flutter');
    const lara = tmp();
    writeFileSync(join(lara, 'composer.json'), JSON.stringify({ require: { 'laravel/framework': '^11.0' } }));
    expect(detectFramework(lara)).toEqual({ framework: 'laravel', by: 'composer.json (laravel/framework)' });
    expect(detectFramework(tmp()).framework).toBe('static');
  });

  it('puts Next.js App Router metadata files in app/ and only plans without --apply', () => {
    const dir = project('saas-invoicing');
    const plan = planFrameworkInstall(ws, 'nimbra', dir);
    const to = plan.steps.map((s) => s.to);
    expect(to).toEqual(
      expect.arrayContaining([
        'app/favicon.ico',
        'app/icon.svg',
        'app/apple-icon.png',
        'app/opengraph-image.png',
        'app/manifest.webmanifest',
        'public/icon-192.png',
      ]),
    );
    expect(plan.steps.every((s) => s.action === 'create')).toBe(true);
    expect(existsSync(join(dir, 'app', 'favicon.ico'))).toBe(false);
    expect(planFrameworkInstall(ws, 'nimbra', dir, { apply: true }).applied).toBe(true);
    expect(existsSync(join(dir, 'app', 'icon.svg'))).toBe(true);
  });

  it('installs Flutter launcher icons, keeps existing files unless forced, and backs them up', () => {
    const dir = project('mobile-sleep');
    mkdirSync(join(dir, 'android/app/src/main/res/mipmap-mdpi'), { recursive: true });
    writeFileSync(join(dir, 'android/app/src/main/res/mipmap-mdpi/ic_launcher.png'), 'old');
    const plan = planFrameworkInstall(ws, 'nimbra', dir);
    expect(plan.framework).toBe('flutter');
    const by = Object.fromEntries(plan.steps.map((s) => [s.to, s.action]));
    expect(by['android/app/src/main/res/mipmap-mdpi/ic_launcher.png']).toBe('skip-existing');
    expect(by['ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json']).toBe('create');
    expect(by['web/icons/Icon-maskable-512.png']).toBe('create');
    expect(by['web/favicon.png']).toBe('create');
    planFrameworkInstall(ws, 'nimbra', dir, { apply: true });
    expect(readFileSync(join(dir, 'android/app/src/main/res/mipmap-mdpi/ic_launcher.png'), 'utf8')).toBe(
      'old',
    );
    const forced = planFrameworkInstall(ws, 'nimbra', dir, { apply: true, force: true });
    expect(readFileSync(join(dir, 'android/app/src/main/res/mipmap-mdpi/ic_launcher.png'))[0]).toBe(0x89);
    expect(
      readFileSync(join(dir, forced.backup!, 'android/app/src/main/res/mipmap-mdpi/ic_launcher.png'), 'utf8'),
    ).toBe('old');
  });

  it('gives Laravel a Blade head snippet with asset() URLs', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'composer.json'), JSON.stringify({ require: { 'laravel/framework': '^11.0' } }));
    const plan = planFrameworkInstall(ws, 'nimbra', dir);
    expect(plan.steps.map((s) => s.to)).toEqual(
      expect.arrayContaining(['public/favicon.ico', 'public/site.webmanifest', 'public/og-image.png']),
    );
    expect(plan.snippet).toContain(`href="{{ asset('favicon.ico') }}"`);
  });
});

describe('setup for other coding agents', () => {
  it('adds a marked AGENTS.md section for Codex without touching the rest, and updates it in place', async () => {
    const { agentSetup } = await import('../src/cli/agents.js');
    const dir = tmp();
    writeFileSync(join(dir, 'AGENTS.md'), '# Project rules\n\nUse pnpm.\n');
    const dry = agentSetup(dir, 'codex');
    expect(dry.action).toBe('append-section');
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toBe('# Project rules\n\nUse pnpm.\n');
    agentSetup(dir, 'codex', { apply: true });
    const once = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
    expect(once).toMatch(/^# Project rules\n\nUse pnpm.\n\n<!-- markilo:start -->/);
    expect(once).toContain('markilo.mjs" verify');
    expect(agentSetup(dir, 'codex', { apply: true }).action).toBe('unchanged');
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8').match(/markilo:start/g)).toHaveLength(1);
  });
  it('writes a Cursor rule and refuses to replace a file it did not write', async () => {
    const { agentSetup } = await import('../src/cli/agents.js');
    const dir = tmp();
    const r = agentSetup(dir, 'cursor', { apply: true });
    expect(r.file).toBe('.cursor/rules/markilo.mdc');
    expect(readFileSync(join(dir, '.cursor/rules/markilo.mdc'), 'utf8')).toMatch(
      /^---\ndescription: Markilo/,
    );
    writeFileSync(join(dir, 'MARKILO.md'), 'my own notes');
    expect(() => agentSetup(dir, 'generic', { apply: true })).toThrow(/not written by Markilo/);
  });
});
