import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture, tmp } from './helpers.js';

const bin = join(__dirname, '..', 'plugin', 'dist', 'markilo.mjs');
const run = (args: string[], cwd: string) =>
  spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });

describe('cli (bundled)', () => {
  it('prints help and version', () => {
    const cwd = tmp();
    expect(run(['help'], cwd).stdout).toContain('Usage: markilo');
    expect(run(['--version'], cwd).stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
  it('centers a mark and refuses to overwrite without --force', () => {
    const cwd = tmp();
    writeFileSync(
      join(cwd, 'in.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="40" y="40" width="40" height="40" fill="#111"/></svg>',
    );
    const r = run(['center', 'in.svg', '-o', 'out.svg'], cwd);
    const j = JSON.parse(r.stdout);
    expect(j.out).toBe('out.svg');
    expect(j.after).toBeLessThan(j.before);
    expect(readFileSync(join(cwd, 'out.svg'), 'utf8')).toContain('translate(');
    expect(run(['center', 'in.svg', '-o', 'out.svg'], cwd).status).not.toBe(0);
    expect(run(['center', 'in.svg', '-o', 'out.svg', '--force'], cwd).status).toBe(0);
  });
  it("center refuses to write into a brand's final/ folder", () => {
    const cwd = tmp();
    run(['init', '--name', 'Demo'], cwd);
    run(['brand', 'add', 'Acme', '--locked'], cwd);
    run(['brand', 'add', 'Tidepool'], cwd);
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="40" y="40" width="40" height="40" fill="#111"/></svg>';
    writeFileSync(join(cwd, 'in.svg'), svg);
    const code = (out: string, at = cwd) => {
      const r = run(['center', join(cwd, 'in.svg'), '-o', out], at);
      return r.status === 0 ? 'OK' : JSON.parse(r.stderr).error.code;
    };
    const finalOf = (slug: string) => join(cwd, 'brand', 'brands', slug, 'final');
    expect(code(join(finalOf('acme'), 'symbol.svg'))).toBe('LOCKED');
    expect(code(join(finalOf('tidepool'), 'symbol.svg'))).toBe('USAGE');
    expect(code(finalOf('tidepool'))).toBe('USAGE');
    // Found from the output path too, when the command runs outside the workspace.
    expect(code(join(finalOf('tidepool'), 'masters', 'symbol.svg'), tmp())).toBe('USAGE');
    expect(existsSync(finalOf('tidepool'))).toBe(false);
    expect(code(join(cwd, 'centered.svg'))).toBe('OK');
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
  it('reports the workspace status without failing when there is none', () => {
    const cwd = tmp();
    const none = run(['status'], cwd);
    expect(none.status, none.stderr).toBe(0);
    expect(JSON.parse(none.stdout)).toMatchObject({ found: false });
    run(['init', '--name', 'Demo'], cwd);
    run(['brand', 'add', 'Status Test'], cwd);
    const some = JSON.parse(run(['status'], cwd).stdout);
    expect(some).toMatchObject({ found: true, brands: [{ slug: 'status-test', stage: 'research' }] });
    expect(some.next).toMatch(/research repo/);
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
    // The user sees the boards in the gallery, with the critic's reading, and may pick another sketch there.
    expect(run(['gallery'], cwd).status).toBe(0);
    const html = readFileSync(join(cwd, 'brand', 'gallery', 'index.html'), 'utf8');
    expect(html).toContain('class="card sketchcard" data-key="nimbra/a"');
    expect(html).toMatch(/data-sketch="s2"[^>]*>[\s\S]*?critic’s pick/);
    const fb = join(cwd, 'fb.json');
    writeFileSync(
      fb,
      JSON.stringify({
        schema: 'markilo/feedback@1',
        decisions: [{ brand: 'nimbra', concept: 'a', decision: null, sketch: 's1', note: 'the door' }],
        preferred: null,
      }),
    );
    const applied = run(['feedback', '--import', fb, '--apply'], cwd);
    expect(applied.status, applied.stderr).toBe(0);
    expect(JSON.parse(applied.stdout).requests).toEqual(['develop sketch s1 of nimbra/a (the door)']);
    const user = JSON.parse(run(['concept', 'show', '--brand', 'nimbra', '--concept', 'a'], cwd).stdout);
    expect(user.concept?.sketchReview ?? user.sketchReview).toMatchObject({ pick: 's1', by: 'user' });
    expect(JSON.stringify(user)).toContain('Critic (picked s2): keep the gesture');
    expect(readFileSync(join(cwd, 'brand', 'brands', 'nimbra', 'decisions.md'), 'utf8')).toMatch(
      /\*\*Sketch pick \(user\)\*\* · a: develop s1 — the door/,
    );
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

describe('cli: idea longlist', () => {
  it('records ideas, the critic strikes or keeps them from the words, and says what is next', () => {
    const cwd = tmp();
    run(['init'], cwd);
    run(['brand', 'add', 'Lumen'], cwd);
    const add = (hook: string, source: string) =>
      run(['ideas', '--brand', 'lumen', '--add', hook, '--means', 'why it fits', '--source', source], cwd);
    const first = JSON.parse(add('an arch with a keystone', 'product').stdout);
    expect(first.summary.ideas).toBe(1);
    expect(first.next).toMatch(/at least 12/);
    for (let i = 0; i < 11; i++) add(`hook ${i}`, i % 2 ? 'audience' : 'name');
    const r = JSON.parse(
      run(['ideas', '--brand', 'lumen', '--idea', 'i1', '--strike', 'a generic architecture icon'], cwd)
        .stdout,
    );
    expect(r.ideas[0].review).toMatchObject({ verdict: 'strike', reading: 'a generic architecture icon' });
    expect(r.next).toMatch(/Critic: review i2/);
    const bad = run(['ideas', '--brand', 'lumen', '--add', 'x', '--means', 'y', '--source', 'vibes'], cwd);
    expect(bad.status).not.toBe(0);
    const kept = JSON.parse(
      run(
        ['ideas', '--brand', 'lumen', '--idea', 'i2', '--keep', 'a lamp seen from above', '--rank', '1'],
        cwd,
      ).stdout,
    );
    expect(kept.summary).toMatchObject({ kept: 1, struck: 1, unreviewed: 10 });
    expect(kept.summary.bySource).toMatchObject({ product: 1, name: 6, audience: 5 });
  });
});

describe('cli export --theme-color', () => {
  it('rejects a colour name with USAGE and lists the option in the usage', () => {
    const cwd = tmp();
    run(['init', '--name', 'Demo'], cwd);
    run(['brand', 'add', 'Nimbra'], cwd);
    const r = run(['export', '--brand', 'nimbra', '--theme-color', 'blue'], cwd);
    expect(r.status).toBe(64);
    expect(JSON.parse(r.stderr).error.code).toBe('USAGE');
  });
});

describe('finalize --wordmark-only (bundled)', () => {
  it('is refused on a locked brand with LOCKED', () => {
    const cwd = tmp();
    run(['init'], cwd);
    run(['brand', 'add', 'Fixed', '--locked'], cwd);
    const r = run(
      ['finalize', '--brand', 'fixed', '--concept', 'x', '--user-choice', 'u', '--wordmark-only'],
      cwd,
    );
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toContain('LOCKED');
  });
});

describe('cli export --out and --progress', () => {
  const setup = () => {
    const cwd = tmp();
    run(['init', '--name', 'Demo'], cwd);
    run(['brand', 'add', 'Acme', '--locked'], cwd);
    const r = run(
      [
        'lock',
        '--brand',
        'acme',
        '--symbol',
        join(__dirname, 'fixtures', 'marks', 'orbit.svg'),
        '--primary',
        '#7a3cf0',
      ],
      cwd,
    );
    expect(r.status, r.stderr).toBe(0);
    return { cwd, brandDir: join(cwd, 'brand', 'brands', 'acme') };
  };

  it('writes the kit to --out and leaves the default exports folder absent', () => {
    const { cwd, brandDir } = setup();
    const r = run(['export', '--brand', 'acme', '--only', 'tokens', '--out', 'kit'], cwd);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(cwd, 'kit', 'asset-manifest.json'))).toBe(true);
    expect(existsSync(join(brandDir, 'exports'))).toBe(false);
    expect(JSON.parse(r.stdout).outDir).toBe(join(realpathSync(cwd), 'kit'));
  });

  it('prints one progress line per group on stderr and a single JSON result on stdout', () => {
    const { cwd } = setup();
    const r = run(['export', '--brand', 'acme', '--only', 'tokens,guidelines', '--progress'], cwd);
    expect(r.status, r.stderr).toBe(0);
    const lines = r.stderr
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l).progress);
    expect(lines.map((p) => p.group)).toEqual(['tokens', 'guidelines']);
    expect(lines[0]).toMatchObject({ done: 1, total: 2 });
    expect(lines[0].files).toBeGreaterThan(0);
    expect(lines.at(-1).done).toBe(lines.at(-1).total);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  });

  it('refuses unsafe --out targets', () => {
    const { cwd, brandDir } = setup();
    const root = join(cwd, 'brand');
    const final = join(brandDir, 'final');
    const finalBefore = readdirSync(final).sort();
    const full = join(cwd, 'full');
    mkdirSync(full);
    writeFileSync(join(full, 'precious.txt'), 'keep');
    const plain = join(cwd, 'plain'); // non-empty, no manifest
    mkdirSync(plain);
    writeFileSync(join(plain, 'a.txt'), 'keep');
    symlinkSync(final, join(cwd, 'link-to-final'));
    const bad: string[][] = [
      [full],
      [final],
      [join(final, 'sub')],
      [join(brandDir)],
      [root],
      [cwd],
      [join(cwd, '..')],
      ['/'],
      [join(cwd, 'link-to-final')],
      [join(cwd, 'link-to-final', 'x')],
      [join(brandDir, 'FINAL', 'sub')],
      [''],
      [plain, '--clean'],
      [full, '--clean'],
      [`${root}/../brand`],
    ];
    for (const [out, ...extra] of bad) {
      const r = run(['export', '--brand', 'acme', '--only', 'tokens', '--out', out!, ...extra], cwd);
      expect(r.status, `${out} ${extra}`).toBe(64);
      expect(JSON.parse(r.stderr).error.code, `${out} ${extra}`).toBe('USAGE');
    }
    expect(readFileSync(join(full, 'precious.txt'), 'utf8')).toBe('keep');
    expect(readFileSync(join(plain, 'a.txt'), 'utf8')).toBe('keep');
    expect(readdirSync(final).sort()).toEqual(finalBefore);
    expect(existsSync(join(final, 'asset-manifest.json'))).toBe(false);
  });

  it('--clean with --out replaces only a folder Markilo made', () => {
    const { cwd } = setup();
    const out = join(cwd, 'kit');
    expect(run(['export', '--brand', 'acme', '--only', 'tokens', '--out', out], cwd).status).toBe(0);
    writeFileSync(join(out, 'stale.txt'), 'old');
    const again = run(['export', '--brand', 'acme', '--only', 'tokens', '--out', out], cwd);
    expect(JSON.parse(again.stderr).error.code).toBe('USAGE');
    const r = run(['export', '--brand', 'acme', '--only', 'tokens', '--out', out, '--clean'], cwd);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(out, 'stale.txt'))).toBe(false);
    expect(existsSync(join(out, 'asset-manifest.json'))).toBe(true);
  });

  it('validates before deleting: a bogus group with --clean leaves the folder intact', () => {
    const { cwd } = setup();
    const out = join(cwd, 'k2');
    expect(run(['export', '--brand', 'acme', '--only', 'tokens', '--out', out], cwd).status).toBe(0);
    const r = run(['export', '--brand', 'acme', '--only', 'bogus', '--out', out, '--clean'], cwd);
    expect(JSON.parse(r.stderr).error.code).toBe('USAGE');
    expect(existsSync(join(out, 'asset-manifest.json'))).toBe(true);
  });
});

describe('small fixes found in use (bundled)', () => {
  it('lists title, direction, rationale and the palette options in the concept update usage', () => {
    const cwd = tmp();
    const out = run(['concept', 'update', '--help'], cwd).stdout.split('\n')[0]!;
    for (const flag of ['--title', '--direction', '--rationale', '--primary', '--secondary', '--accent'])
      expect(out).toContain(flag);
  });

  it('says in finalize --accept-risk that no competitor marks were compared when there are no references', () => {
    const cwd = tmp();
    const ok = (args: string[]) => {
      const r = run(args, cwd);
      expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
      return JSON.parse(r.stdout);
    };
    ok(['init', '--name', 'Demo']);
    ok(['brand', 'add', 'Tidepool']);
    ok([
      'concept',
      'new',
      '--brand',
      'tidepool',
      '--id',
      'p1',
      '--title',
      'One',
      '--direction',
      'd',
      '--rationale',
      'r',
      '--semantics',
      'a',
      '--primary',
      '#1d4e89',
      '--round',
      '1',
    ]);
    const dir = join(cwd, 'brand', 'brands', 'tidepool', 'concepts', 'p1');
    writeFileSync(join(dir, 'symbol.svg'), readFileSync(fixture('marks/fold-n.svg')));
    ok(['concept', 'update', '--brand', 'tidepool', '--concept', 'p1', '--symbol', 'symbol.svg']);
    ok(['verify', '--brand', 'tidepool', '--concept', 'p1']);
    const r = ok([
      'finalize',
      '--brand',
      'tidepool',
      '--concept',
      'p1',
      '--user-choice',
      'This one',
      '--accept-risk',
    ]);
    expect(r.kit.originality.verdict).toBe('insufficient-evidence');
    expect(r.kit.originality.note).toBe(
      "No competitor marks were compared, so this verdict says nothing about similarity. Run research (with the user's OK to use the network) before relying on the mark.",
    );
  }, 60_000);
});
