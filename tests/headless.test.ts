import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture, tmp } from './helpers.js';

const bin = join(__dirname, '..', 'plugin', 'dist', 'markilo.mjs');
const run = (args: string[], cwd: string) =>
  spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });

describe('headless use (bundled cli)', () => {
  it('svg lint exits 1 when a file is not ok and keeps the JSON; a clean file exits 0', () => {
    const cwd = tmp();
    writeFileSync(
      join(cwd, 'bad.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>1</script><rect width="5" height="5"/></svg>',
    );
    writeFileSync(
      join(cwd, 'good.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5" fill="#111"/></svg>',
    );
    const bad = run(['svg', 'lint', 'bad.svg'], cwd);
    expect(bad.status).toBe(1);
    const j = JSON.parse(bad.stdout);
    expect(j.ok).toBe(false);
    expect(j).not.toHaveProperty('exitCode');
    const good = run(['svg', 'lint', 'good.svg'], cwd);
    expect(good.status).toBe(0);
    expect(JSON.parse(good.stdout).ok).toBe(true);
  });

  it('lock takes --secondary and --accent and builds lockups from a symbol and a wordmark', () => {
    const cwd = tmp();
    run(['init', '--name', 'Demo'], cwd);
    run(['brand', 'add', 'Nimbra', '--locked'], cwd);
    const r = run(
      [
        'lock',
        '--brand',
        'nimbra',
        '--primary',
        '#3b5bdb',
        '--secondary',
        '#112233',
        '--accent',
        '#ff8a3d',
        '--symbol',
        fixture('marks/fold-n.svg'),
        '--wordmark',
        fixture('glyphs/nimbra-word.svg'),
      ],
      cwd,
    );
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.kit.palette.secondary).toBe('#112233');
    expect(j.kit.palette.accent).toBe('#ff8a3d');
    expect(j.composedLockups).toEqual(['lockup-horizontal.svg', 'lockup-stacked.svg']);
    expect(j.kit.files.lockupHorizontal).toBe('lockup-horizontal.svg');
    const finalDir = join(cwd, 'brand', 'brands', 'nimbra', 'final');
    expect(readFileSync(join(finalDir, j.kit.files.symbol), 'utf8')).toBe(
      readFileSync(fixture('marks/fold-n.svg'), 'utf8'),
    );
    expect(readFileSync(join(finalDir, j.kit.files.wordmark), 'utf8')).toBe(
      readFileSync(fixture('glyphs/nimbra-word.svg'), 'utf8'),
    );
  });

  it('brand add gives a name without Latin letters a hash slug and says so; --slug overrides', () => {
    const cwd = tmp();
    run(['init', '--name', 'Demo'], cwd);
    const b = JSON.parse(run(['brand', 'add', '日本語'], cwd).stdout);
    expect(b.brand.slug).toMatch(/^brand-[0-9a-f]{6}$/);
    expect(b.slugNote).toMatch(/--slug/);
    const b2 = JSON.parse(run(['brand', 'add', '東京', '--slug', 'tokyo'], cwd).stdout);
    expect(b2.brand.slug).toBe('tokyo');
    expect(b2.slugNote).toBeUndefined();
  });
});
