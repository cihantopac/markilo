import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tmp } from './helpers.js';

const bin = join(__dirname, '..', 'plugin', 'dist', 'markilo.mjs');
const run = (args: string[], cwd: string) =>
  spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });

describe('cli (bundled)', () => {
  it('prints help and version', () => {
    const cwd = tmp();
    expect(run(['help'], cwd).stdout).toContain('Usage: markilo');
    expect(run(['--version'], cwd).stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
  it('returns structured errors with stable codes', () => {
    const cwd = tmp();
    const r = run(['brand', 'list'], cwd);
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stderr).error.code).toBe('NO_WORKSPACE');
    const u = run(['frobnicate'], cwd);
    expect(u.status).toBe(64);
    expect(JSON.parse(u.stderr).error.code).toBe('USAGE');
  });
  it('runs a workspace flow from any directory', () => {
    const cwd = tmp();
    expect(run(['init', '--name', 'Demo'], cwd).status).toBe(0);
    expect(JSON.parse(run(['brand', 'add', 'Örnek Marka'], cwd).stdout).brand.slug).toBe('ornek-marka');
    const wm = run(
      ['wordmark', '--text', 'Örnek', '--font', 'inter', '--weight', '700', '--tracking=-20', '-o', 'wm.svg'],
      cwd,
    );
    expect(wm.status, wm.stderr).toBe(0);
    expect(readFileSync(join(cwd, 'wm.svg'), 'utf8')).toContain('data-cap-height');
    expect(run(['wordmark', '--text', 'x', '--font', 'inter', '-o', 'wm.svg'], cwd).status).toBe(1);
    const net = run(['research', 'site', 'https://example.com', '--brand', 'ornek-marka'], cwd);
    expect(JSON.parse(net.stderr).error.code).toBe('NETWORK_DISABLED');
  });
  // Regression: the installed plugin has no node_modules; everything must be inside plugin/dist.
  it('runs from a copy of dist with no node_modules anywhere above it', () => {
    const dir = tmp();
    for (const f of readdirSync(dirname(bin))) copyFileSync(join(dirname(bin), f), join(dir, f));
    writeFileSync(
      join(dir, 'spec.json'),
      JSON.stringify({ layers: [{ fill: '#123456', shape: { circle: { c: [512, 512], r: 400 } } }] }),
    );
    const r = spawnSync(
      process.execPath,
      [join(dir, 'markilo.mjs'), 'construct', 'spec.json', '-o', 'o.svg'],
      {
        cwd: dir,
        encoding: 'utf8',
      },
    );
    expect(r.status, r.stderr).toBe(0);
    const v = spawnSync(process.execPath, [join(dir, 'markilo.mjs'), 'render', 'o.svg', '-o', 'o.png'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(v.status, v.stderr).toBe(0);
  });
  it('builds a mark from a construction spec with the bundled PathKit', () => {
    const cwd = tmp();
    writeFileSync(
      join(cwd, 'spec.json'),
      JSON.stringify({
        params: { w: 120 },
        vary: { w: [100, 140] },
        layers: [
          {
            fill: '#123456',
            shape: { arc: { c: [512, 512], r: 380, from: 40, to: 320, width: 'w', cap: 'round' } },
          },
        ],
      }),
    );
    const r = run(['construct', 'spec.json', '-o', 'mark.svg', '--guides', 'c.png'], cwd);
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(join(cwd, 'mark.svg'), 'utf8')).toMatch(/<path[^>]+fill="#123456"/);
    expect(existsSync(join(cwd, 'c.png'))).toBe(true);
    const v = run(['construct', 'spec.json', '--vary', '--out-dir', 'v'], cwd);
    expect(v.status, v.stderr).toBe(0);
    expect(JSON.parse(v.stdout).built).toBe(2);
    expect(existsSync(join(cwd, 'v', 'variants.png'))).toBe(true);
  });
  it('builds a sketch board and records the critic pick', () => {
    const cwd = tmp();
    run(['init'], cwd);
    run(['brand', 'add', 'Nimbra'], cwd);
    const made = run(
      [
        'concept',
        'new',
        '--brand',
        'nimbra',
        '--id',
        'a',
        '--title',
        'A',
        '--direction',
        'd',
        '--rationale',
        'r',
        '--semantics',
        'x',
        '--primary',
        '#225577',
      ],
      cwd,
    );
    expect(made.status, made.stderr).toBe(0);
    const dir = join(cwd, 'brand', 'brands', 'nimbra', 'concepts', 'a', 'sketches');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 's1.json'),
      JSON.stringify({
        idea: 'a door left ajar',
        layers: [{ fill: 'primary', shape: { rect: { x: 200, y: 100, w: 600, h: 820, r: 40 } } }],
      }),
    );
    writeFileSync(
      join(dir, 's2.json'),
      JSON.stringify({
        idea: 'one gesture',
        layers: [
          {
            fill: 'primary',
            shape: { arc: { c: [512, 512], r: 380, from: 20, to: 300, width: 120, cap: 'round' } },
          },
        ],
      }),
    );
    // A hairline gap: the idea may be fine, but it disappears at 16 px, so the sketch is not ready for review.
    writeFileSync(
      join(dir, 's3.json'),
      JSON.stringify({
        idea: 'a split block',
        layers: [
          {
            fill: 'primary',
            shape: {
              gap: {
                shape: { rect: { x: 150, y: 150, w: 724, h: 724 } },
                cut: { rect: { x: 0, y: 506, w: 1024, h: 12 } },
                width: 0,
              },
            },
          },
        ],
      }),
    );
    const b = run(['sketches', '--brand', 'nimbra', '--concept', 'a'], cwd);
    expect(b.status, b.stderr).toBe(0);
    const out = JSON.parse(b.stdout);
    expect(out.sketches.map((x: { idea: string }) => x.idea)).toEqual([
      'a door left ajar',
      'one gesture',
      'a split block',
    ]);
    const split = out.sketches[2];
    expect(split.ready).toBe(false);
    expect(split.fix.join(' ')).toMatch(/≥ 80 units/);
    expect(out.sketches[1].ready).toBe(true);
    expect(out.notReady).toEqual(['s3']);
    expect(readFileSync(join(dir, 's1.svg'), 'utf8')).toContain('fill="#225577"');
    expect(existsSync(join(dir, 'board.png'))).toBe(true);
    const pick = run(
      [
        'concept',
        'update',
        '--brand',
        'nimbra',
        '--concept',
        'a',
        '--sketch-pick',
        's2',
        '--sketch-notes',
        'keep the gesture',
      ],
      cwd,
    );
    expect(JSON.parse(pick.stdout).sketchReview.pick).toBe('s2');
    expect(
      run(['concept', 'update', '--brand', 'nimbra', '--concept', 'a', '--sketch-pick', 's9'], cwd).status,
    ).toBe(1);
  });
  it('compares colors by CIEDE2000 and contrast', () => {
    const r = run(['color', 'compare', '#d12c12', '#ffffff'], tmp());
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).pairs[0]).toMatchObject({ deltaE00: 49.4, contrast: 5.15 });
  });
  it('shortcut install is a dry run without --yes and refuses foreign files', () => {
    const dir = tmp();
    const dry = JSON.parse(run(['shortcut', 'install', '--dir', dir], dir).stdout);
    expect(dry.applied).toBe(false);
    expect(existsSync(join(dir, 'markilo', 'SKILL.md'))).toBe(false);
    expect(JSON.parse(run(['shortcut', 'install', '--dir', dir, '--yes'], dir).stdout).applied).toBe(true);
    expect(JSON.parse(run(['shortcut', 'status', '--dir', dir], dir).stdout).managedByMarkilo).toBe(true);
    expect(JSON.parse(run(['shortcut', 'uninstall', '--dir', dir, '--yes'], dir).stdout).applied).toBe(true);
  });
});
