import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { detectFramework, planFrameworkInstall } from '../src/cli/frameworks.js';
import type { Workspace } from '../src/core/workspace.js';
import { exportBrand } from '../src/export/exporter.js';
import { finalizeConcept } from '../src/export/kit.js';
import { createRaster } from '../src/render/image.js';
import { decodeImage, encodePng, pngSize } from '../src/render/png.js';
import { verifyConcept } from '../src/report/quality.js';
import { fixture, synthBrand, tmp } from './helpers.js';

let ws: Workspace;
const project = (fixture: string) => {
  const dir = tmp();
  cpSync(join('bench/scenarios', fixture, 'project'), dir, { recursive: true });
  return dir;
};

beforeAll(async () => {
  ({ ws } = synthBrand());
  await verifyConcept(ws, 'nimbra', 'fold');
  await finalizeConcept(ws, 'nimbra', 'fold', { acceptRisk: true, userChoice: 'Chosen in a test.' });
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

  it('puts Next.js App Router metadata files in app/ and only plans without --apply', async () => {
    const dir = project('saas-invoicing');
    const plan = await planFrameworkInstall(ws, 'nimbra', dir);
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
    expect((await planFrameworkInstall(ws, 'nimbra', dir, { apply: true })).applied).toBe(true);
    expect(existsSync(join(dir, 'app', 'icon.svg'))).toBe(true);
  });

  it('installs Flutter launcher icons, keeps existing files unless forced, and backs them up', async () => {
    const dir = project('mobile-sleep');
    mkdirSync(join(dir, 'android/app/src/main/res/mipmap-mdpi'), { recursive: true });
    writeFileSync(join(dir, 'android/app/src/main/res/mipmap-mdpi/ic_launcher.png'), 'old');
    const plan = await planFrameworkInstall(ws, 'nimbra', dir);
    expect(plan.framework).toBe('flutter');
    const by = Object.fromEntries(plan.steps.map((s) => [s.to, s.action]));
    expect(by['android/app/src/main/res/mipmap-mdpi/ic_launcher.png']).toBe('skip-existing');
    expect(by['ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json']).toBe('create');
    expect(by['web/icons/Icon-maskable-512.png']).toBe('create');
    expect(by['web/favicon.png']).toBe('create');
    await planFrameworkInstall(ws, 'nimbra', dir, { apply: true });
    expect(readFileSync(join(dir, 'android/app/src/main/res/mipmap-mdpi/ic_launcher.png'), 'utf8')).toBe(
      'old',
    );
    const forced = await planFrameworkInstall(ws, 'nimbra', dir, { apply: true, force: true });
    expect(readFileSync(join(dir, 'android/app/src/main/res/mipmap-mdpi/ic_launcher.png'))[0]).toBe(0x89);
    expect(
      readFileSync(join(dir, forced.backup!, 'android/app/src/main/res/mipmap-mdpi/ic_launcher.png'), 'utf8'),
    ).toBe('old');
  });

  it('gives Laravel a Blade head snippet with asset() URLs', async () => {
    const dir = tmp();
    writeFileSync(join(dir, 'composer.json'), JSON.stringify({ require: { 'laravel/framework': '^11.0' } }));
    const plan = await planFrameworkInstall(ws, 'nimbra', dir);
    expect(plan.steps.map((s) => s.to)).toEqual(
      expect.arrayContaining(['public/favicon.ico', 'public/site.webmanifest', 'public/og-image.png']),
    );
    expect(plan.snippet).toContain(`href="{{ asset('favicon.ico') }}"`);
  });
});

describe('Android profile', () => {
  const res = 'app/src/main/res';
  const androidProject = () => {
    const dir = tmp();
    cpSync(fixture('android-project'), dir, { recursive: true });
    return dir;
  };
  const size = (dir: string, rel: string) => {
    const { width, height } = pngSize(readFileSync(join(dir, rel)));
    return `${width}×${height}`;
  };

  it('detects an Android project from its manifest', () => {
    expect(detectFramework(androidProject())).toEqual({
      framework: 'android',
      by: 'app/src/main/AndroidManifest.xml',
    });
    const resOnly = tmp();
    mkdirSync(join(resOnly, 'app/src/main/res/mipmap-mdpi'), { recursive: true });
    expect(detectFramework(resOnly).framework).toBe('android');
    mkdirSync(join(tmp(), 'res'));
    expect(detectFramework(tmp()).framework).toBe('static');
  });

  it('keeps the project names, folders and sizes, and lists unknown drawables as unmatched', async () => {
    const dir = androidProject();
    const plan = await planFrameworkInstall(ws, 'nimbra', dir);
    expect(plan.framework).toBe('android');
    const by = Object.fromEntries(plan.steps.map((s) => [s.to, s]));
    // Only files the project has, in the folders it has (no hdpi, no xxxhdpi, nothing created).
    expect(Object.keys(by).sort()).toEqual(
      [
        'mipmap-mdpi/ic_launcher.png',
        'mipmap-mdpi/ic_launcher_foreground.png',
        'mipmap-mdpi/ic_launcher_round.png',
        'mipmap-xhdpi/ic_launcher.png',
        'mipmap-xhdpi/ic_launcher_foreground.png',
        'mipmap-xhdpi/ic_launcher_round.png',
        'mipmap-xxhdpi/ic_launcher.png',
        'mipmap-xxhdpi/ic_launcher_foreground.png',
        'mipmap-xxhdpi/ic_launcher_round.png',
        'drawable-xhdpi/tv_banner.png',
      ]
        .map((p) => `${res}/${p}`)
        .sort(),
    );
    expect(by[`${res}/mipmap-xxhdpi/ic_launcher.png`]).toMatchObject({
      from: 'android/res/mipmap-xxhdpi/ic_launcher.png',
      size: '144×144',
      action: 'skip-existing',
    });
    expect(by[`${res}/mipmap-xhdpi/ic_launcher_foreground.png`]).toMatchObject({
      from: 'android/res/mipmap-xhdpi/ic_launcher_foreground.png',
      size: '216×216',
    });
    // android:banner="@drawable/tv_banner" takes the exported banner.
    expect(by[`${res}/drawable-xhdpi/tv_banner.png`]).toMatchObject({
      from: 'android/res/drawable-xhdpi/banner.png',
      size: '320×180',
    });
    expect(plan.unmatched).toEqual([
      {
        name: 'brand_lockup_wide',
        files: [
          { path: `${res}/drawable-mdpi/brand_lockup_wide.png`, density: 'mdpi', width: 240, height: 87 },
          {
            path: `${res}/drawable-xxhdpi/brand_lockup_wide.png`,
            density: 'xxhdpi',
            width: 720,
            height: 261,
          },
        ],
      },
      {
        name: 'ic_splash',
        files: [{ path: `${res}/drawable-xxhdpi/ic_splash.png`, density: 'xxhdpi', width: 192, height: 192 }],
      },
    ]);
    expect(plan.notes.join(' ')).toMatch(/--map <name>=<export path>/);
  });

  it('writes nothing in a dry run, and replaces existing files only with --force', async () => {
    const dir = androidProject();
    const before = readFileSync(join(dir, res, 'mipmap-xhdpi/ic_launcher.png'));
    const dry = await planFrameworkInstall(ws, 'nimbra', dir, { framework: 'android', force: true });
    expect(dry.applied).toBe(false);
    expect(readFileSync(join(dir, res, 'mipmap-xhdpi/ic_launcher.png')).equals(before)).toBe(true);

    const kept = await planFrameworkInstall(ws, 'nimbra', dir, { apply: true });
    expect(kept.applied).toBe(true);
    expect(readFileSync(join(dir, res, 'mipmap-xhdpi/ic_launcher.png')).equals(before)).toBe(true);

    const forced = await planFrameworkInstall(ws, 'nimbra', dir, { apply: true, force: true });
    const exported = (rel: string) => readFileSync(join(ws.exportsDir('nimbra'), rel));
    expect(
      readFileSync(join(dir, res, 'mipmap-xhdpi/ic_launcher.png')).equals(
        exported('android/res/mipmap-xhdpi/ic_launcher.png'),
      ),
    ).toBe(true);
    expect(size(dir, `${res}/mipmap-mdpi/ic_launcher_foreground.png`)).toBe('108×108');
    expect(size(dir, `${res}/mipmap-xxhdpi/ic_launcher_round.png`)).toBe('144×144');
    expect(size(dir, `${res}/drawable-xhdpi/tv_banner.png`)).toBe('320×180');
    // Unmatched drawables and the manifest are not touched; no folder was added.
    expect(size(dir, `${res}/drawable-xxhdpi/ic_splash.png`)).toBe('192×192');
    expect(readdirSync(join(dir, res)).sort()).toEqual([
      'drawable-mdpi',
      'drawable-xhdpi',
      'drawable-xxhdpi',
      'mipmap-anydpi-v26',
      'mipmap-mdpi',
      'mipmap-xhdpi',
      'mipmap-xxhdpi',
    ]);
    expect(readFileSync(join(dir, 'app/src/main/AndroidManifest.xml'), 'utf8')).toBe(
      readFileSync(join(fixture('android-project'), 'app/src/main/AndroidManifest.xml'), 'utf8'),
    );
    expect(forced.backup).toBeTruthy();
  });

  it('scales an export to the size the project file has at its density', async () => {
    const dir = androidProject();
    // A project that ships its xxhdpi banner too: 480×270 is rendered from the export, not copied.
    mkdirSync(join(dir, res, 'drawable-xxhdpi'), { recursive: true });
    writeFileSync(join(dir, res, 'drawable-xxhdpi/tv_banner.png'), encodePng(createRaster(480, 270)));
    const plan = await planFrameworkInstall(ws, 'nimbra', dir, {
      framework: 'android',
      force: true,
      apply: true,
    });
    expect(plan.steps.find((s) => s.to.endsWith('drawable-xxhdpi/tv_banner.png'))?.size).toBe('480×270');
    expect(size(dir, `${res}/drawable-xxhdpi/tv_banner.png`)).toBe('480×270');
    expect(size(dir, `${res}/drawable-xhdpi/tv_banner.png`)).toBe('320×180');
  });

  it('refuses a project file whose header claims a size beyond 4096 px a side', async () => {
    /** A PNG whose IHDR says width × height while the file holds 2 × 2 pixels. */
    const crafted = (width: number, height: number) => {
      const b = Buffer.from(encodePng(createRaster(2, 2)));
      b.writeUInt32BE(width, 16);
      b.writeUInt32BE(height, 20);
      return b;
    };
    const huge = androidProject();
    writeFileSync(join(huge, res, 'drawable-xxhdpi/ic_splash.png'), crafted(60000, 60000));
    const source = readdirSync(join(ws.exportsDir('nimbra'), 'logos'), { recursive: true })
      .map(String)
      .find((f) => f.endsWith('.svg'))!;
    await expect(
      planFrameworkInstall(ws, 'nimbra', huge, {
        framework: 'android',
        map: { ic_splash: `logos/${source}` },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT', message: expect.stringMatching(/60000×60000/) });
    const banner = androidProject();
    mkdirSync(join(banner, res, 'drawable-xxhdpi'), { recursive: true });
    writeFileSync(join(banner, res, 'drawable-xxhdpi/tv_banner.png'), crafted(480, 5000));
    await expect(planFrameworkInstall(ws, 'nimbra', banner, { framework: 'android' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: expect.stringMatching(/4096/),
    });
  });

  it('refuses --map outside an Android installation', async () => {
    await expect(
      planFrameworkInstall(ws, 'nimbra', project('saas-invoicing'), {
        framework: 'next',
        map: { ic_splash: 'logos/x.svg' },
      }),
    ).rejects.toMatchObject({ code: 'USAGE', message: expect.stringMatching(/--map/) });
    const { parseCommand } = await import('../src/cli/args.js');
    const { findCommand } = await import('../src/cli/commands.js');
    const f = findCommand(['install-assets'])!;
    const dir = tmp();
    const argv = [
      '--brand',
      'nimbra',
      '--group',
      'web',
      '--into',
      'public',
      '--map',
      'ic_splash=logos/x.svg',
    ];
    await expect(
      f.spec.run(parseCommand(f.spec, [...argv, '--workspace', ws.root], dir)),
    ).rejects.toMatchObject({ code: 'USAGE', message: expect.stringMatching(/--map/) });
  });

  it('--map renders an export at the size of each project file with that name', async () => {
    const dir = androidProject();
    const source = readdirSync(join(ws.exportsDir('nimbra'), 'logos'), { recursive: true })
      .map(String)
      .find((f) => f.endsWith('.svg'))!;
    const map = { brand_lockup_wide: `logos/${source}` };
    const plan = await planFrameworkInstall(ws, 'nimbra', dir, {
      framework: 'android',
      map,
      force: true,
      apply: true,
    });
    expect(size(dir, `${res}/drawable-mdpi/brand_lockup_wide.png`)).toBe('240×87');
    expect(size(dir, `${res}/drawable-xxhdpi/brand_lockup_wide.png`)).toBe('720×261');
    // The picture is really there (opaque pixels), not an empty canvas.
    const drawn = decodeImage(readFileSync(join(dir, res, 'drawable-mdpi/brand_lockup_wide.png')));
    expect(drawn.data.some((v, i) => i % 4 === 3 && v > 200)).toBe(true);
    expect(plan.unmatched?.find((u) => u.name === 'brand_lockup_wide')?.mappedTo).toBe(`logos/${source}`);
    expect(plan.unmatched?.map((u) => u.name)).toEqual(['brand_lockup_wide', 'ic_splash']);
    // Still unchanged without --map.
    await expect(
      planFrameworkInstall(ws, 'nimbra', androidProject(), {
        framework: 'android',
        map: { nope: `logos/${source}` },
      }),
    ).rejects.toThrow(/no drawable or mipmap named "nope"/);
    await expect(
      planFrameworkInstall(ws, 'nimbra', androidProject(), {
        framework: 'android',
        map: { ic_launcher: `logos/${source}` },
      }),
    ).rejects.toThrow(/already matched/);
    await expect(
      planFrameworkInstall(ws, 'nimbra', androidProject(), {
        framework: 'android',
        map: { ic_splash: 'logos/missing.svg' },
      }),
    ).rejects.toThrow(/no exported file/);
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
    // The other agents get the same process as the plugin: three proposals, the user's choice, then finalize.
    expect(once).toContain('proposals --brand <slug>');
    expect(once).toContain('--user-choice');
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
    // Cursor runs the three roles as sub-agents; without a model they run on the chat's model.
    expect(r.agents.map((a) => a.file)).toEqual([
      '.cursor/agents/markilo-researcher.md',
      '.cursor/agents/markilo-designer.md',
      '.cursor/agents/markilo-critic.md',
    ]);
    expect(readFileSync(join(dir, '.cursor/agents/markilo-critic.md'), 'utf8')).toMatch(
      /^---\nname: markilo-critic\n[\s\S]*model: inherit\n---/,
    );
    expect(r.models.critic.model).toBe('inherits the chat model');
  });
  it('writes the roles as sub-agents with their own model for Codex and VS Code, without Claude specifics', async () => {
    const { agentSetup } = await import('../src/cli/agents.js');
    const dir = tmp();
    const codex = agentSetup(dir, 'codex', { apply: true, models: { critic: ['gpt-5.5'] } });
    const toml = readFileSync(join(dir, '.codex/agents/markilo-critic.toml'), 'utf8');
    expect(toml).toMatch(/^# Generated by markilo agent-setup --target codex/);
    expect(toml).toContain('name = "markilo_critic"\n');
    expect(toml).toContain('model = "gpt-5.5"\nmodel_reasoning_effort = "high"\n');
    expect(toml).toMatch(
      /developer_instructions = '''\nYou are an experienced, demanding identity design critic/,
    );
    expect(codex.models.critic.model).toBe('gpt-5.5');
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toContain('the final critique in `markilo_critic`');
    const models = {
      critic: ['GPT-5.5 (copilot)', 'Claude Opus 5.5 (copilot)'],
      designer: ['GPT-5 mini (copilot)'],
    };
    const vs = agentSetup(dir, 'vscode', { apply: true, models });
    expect(vs.file).toBe('.github/agents/markilo.agent.md');
    const critic = readFileSync(join(dir, '.github/agents/markilo-critic.agent.md'), 'utf8');
    expect(critic).toContain(
      'model: ["GPT-5.5 (copilot)", "Claude Opus 5.5 (copilot)"]\nuser-invocable: false\n',
    );
    const designer = readFileSync(join(dir, '.github/agents/markilo-designer.agent.md'), 'utf8');
    expect(designer).toContain('model: "GPT-5 mini (copilot)"');
    for (const f of [toml, critic, designer]) {
      expect(f).not.toMatch(/CLAUDE_PLUGIN_ROOT|pre-approves|`Read`/);
      expect(f).toMatch(/Toolchain: `node ".*markilo\.mjs" <command>`/);
    }
    expect(agentSetup(dir, 'vscode', { apply: true, models }).applied).toBe(false);
    writeFileSync(join(dir, '.github/agents/markilo-researcher.agent.md'), 'mine');
    expect(() => agentSetup(dir, 'vscode', { apply: true })).toThrow(/not written by Markilo/);
  });
});
