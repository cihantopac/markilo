import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tmp } from './helpers.js';

const bin = join(__dirname, '..', 'plugin', 'dist', 'markilo.mjs');
const run = (args: string[], cwd: string) =>
  spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });

// One construction, several products: members are parameter sets of the master's spec.
const spec = {
  idea: 'an open ring — the opening turns for each product',
  params: { from: 30, w: 150 },
  layers: [
    {
      fill: 'primary',
      shape: { arc: { c: [512, 512], r: 340, from: 'from', to: 'from+290', width: 'w', cap: 'round' } },
    },
    { fill: 'accent', shape: { circle: { c: [512, 512], r: 'w*0.75' } } },
  ],
  members: {
    docs: { label: 'Docs', set: { w: 110 }, palette: { accent: '#d9822b' } },
    copy: { label: 'Copy', set: { from: 30, w: 150 } },
  },
};

describe('family sketches', () => {
  it('draws master and members together and flags members that cannot be told apart', () => {
    const cwd = tmp();
    run(['init', '--family', 'Fam'], cwd);
    run(['brand', 'add', 'Fam', '--role', 'master'], cwd);
    run(['brand', 'add', 'Fam Docs', '--role', 'product', '--parent', 'fam'], cwd);
    const made = run(
      [
        'concept',
        'new',
        '--brand',
        'fam',
        '--id',
        'ring',
        '--title',
        'Ring',
        '--direction',
        'd',
        '--rationale',
        'r',
        '--semantics',
        'x',
        '--primary',
        '#1d4e89',
        '--accent',
        '#2a9d8f',
      ],
      cwd,
    );
    expect(made.status, made.stderr).toBe(0);
    const dir = join(cwd, 'brand', 'brands', 'fam', 'concepts', 'ring', 'sketches');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 's1.json'), JSON.stringify(spec));
    const b = run(['sketches', '--brand', 'fam', '--concept', 'ring'], cwd);
    expect(b.status, b.stderr).toBe(0);
    const out = JSON.parse(b.stdout);
    expect(out.family).toMatch(/family\.png$/);
    expect(existsSync(join(dir, 'family.png'))).toBe(true);
    const s1 = out.sketches[0];
    expect(s1.members.map((m: { name: string }) => m.name)).toEqual(['docs', 'copy']);
    // "copy" is the master with the same parameters: the family cannot tell them apart.
    expect(s1.ready).toBe(false);
    expect(s1.fix.join(' ')).toMatch(/copy.*master|master.*copy/);
    expect(readFileSync(join(dir, 's1-docs.svg'), 'utf8')).toContain('#d9822b');

    // A product's concept is built from the same spec with its member's parameters and colours.
    run(
      [
        'concept',
        'new',
        '--brand',
        'fam-docs',
        '--id',
        'ring',
        '--title',
        'Ring',
        '--direction',
        'd',
        '--rationale',
        'r',
        '--semantics',
        'x',
        '--primary',
        '#1d4e89',
        '--accent',
        '#2a9d8f',
      ],
      cwd,
    );
    const c = run(
      ['construct', join(dir, 's1.json'), '--brand', 'fam-docs', '--concept', 'ring', '--member', 'docs'],
      cwd,
    );
    expect(c.status, c.stderr).toBe(0);
    const symbol = readFileSync(
      join(cwd, 'brand', 'brands', 'fam-docs', 'concepts', 'ring', 'symbol.svg'),
      'utf8',
    );
    expect(symbol).toContain('#d9822b');
    expect(run(['construct', join(dir, 's1.json'), '-o', 'x.svg', '--member', 'nope'], cwd).status).toBe(64);
  }, 60_000);
});
