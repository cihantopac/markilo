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

describe('family lettering', () => {
  it('family lettering skips typeset', () => {
    const cwd = tmp();
    const ok = (args: string[]) => {
      const r = run(args, cwd);
      expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
      return JSON.parse(r.stdout);
    };
    ok(['init', '--name', 'Demo']);
    ok(['brand', 'add', 'Tidepool']);
    // biome-ignore format: one flag per pair reads better
    ok(['concept', 'new', '--brand', 'tidepool', '--id', 'p1', '--title', 'One', '--direction', 'd', '--rationale', 'r',
      '--semantics', 'a', '--primary', '#1d4e89', '--font', 'outfit', '--weight', '600']);
    const dir = join(cwd, 'brand', 'brands', 'tidepool', 'concepts', 'p1');
    ok([
      'wordmark',
      '--text',
      'tidepool',
      '--font',
      'outfit',
      '--weight',
      '600',
      '-o',
      join(dir, 'wordmark.svg'),
    ]);
    const set = ['concept', 'update', '--brand', 'tidepool', '--concept', 'p1'];
    ok([...set, '--wordmark', 'wordmark.svg']);
    // Set as is: measured against Outfit.
    const plain = ok(['proposals', '--brand', 'tidepool', '--concepts', 'p1']);
    expect(plain.typeset.p1).toBeGreaterThan(0.9);
    for (const [kind, label] of [
      ['family', 'family lettering'],
      ['custom', 'custom lettering'],
    ]) {
      ok([...set, '--lettering', kind!]);
      const r = ok(['proposals', '--brand', 'tidepool', '--concepts', 'p1']);
      expect(r.typeset.p1).toBeNull();
      expect(r.typesetBase.p1).toEqual({ skipped: label });
      expect(r.missing.join(' ')).not.toMatch(/as set/);
    }
    const json = () => JSON.parse(readFileSync(join(dir, 'concept.json'), 'utf8'));
    ok([...set, '--supporting-font', 'inter', '--supporting-weight', '400']);
    expect(json().typography).toMatchObject({
      fontId: 'outfit',
      lettering: 'custom',
      supporting: { fontId: 'inter', weight: 400 },
    });
    // A new stand-in font keeps the lettering and the supporting face.
    ok([...set, '--font', 'sora', '--weight', '600']);
    expect(json().typography).toMatchObject({
      fontId: 'sora',
      lettering: 'custom',
      supporting: { fontId: 'inter' },
    });
    for (const bad of [
      ['--lettering', 'drawn'],
      ['--supporting-font', 'inter', '--supporting-weight', '950'],
      ['--supporting-font', 'inter', '--supporting-weight', 'bold'],
    ]) {
      const r = run([...set, ...bad], cwd);
      expect(r.status, bad.join(' ')).not.toBe(0);
      expect(JSON.parse(r.stderr).error.code).toBe('INVALID_INPUT');
    }
    ok([...set, '--lettering', 'font', '--supporting-font', 'none']);
    expect(json().typography.supporting).toBeUndefined();
    expect(ok(['proposals', '--brand', 'tidepool', '--concepts', 'p1']).typeset.p1).toBeTypeOf('number');
  }, 60_000);
});
