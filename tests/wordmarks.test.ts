import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tmp } from './helpers.js';

const bin = join(__dirname, '..', 'plugin', 'dist', 'markilo.mjs');
const run = (args: string[], cwd: string) =>
  spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });

describe('wordmark exploration', () => {
  it('sets the name in several faces next to the symbol and commits the pick', () => {
    const cwd = tmp();
    run(['init'], cwd);
    run(['brand', 'add', 'Kestrel'], cwd);
    const made = run(
      [
        'concept',
        'new',
        '--brand',
        'kestrel',
        '--id',
        'k',
        '--title',
        'K',
        '--direction',
        'd',
        '--rationale',
        'r',
        '--semantics',
        'x',
        '--primary',
        '#1d4e89',
        '--font',
        'inter',
        '--weight',
        '600',
        '--lead',
        'wordmark',
      ],
      cwd,
    );
    expect(made.status, made.stderr).toBe(0);
    writeFileSync(
      join(cwd, 'spec.json'),
      JSON.stringify({
        layers: [
          { fill: 'primary', shape: { arc: { c: [512, 512], r: 330, from: 30, to: 320, width: 150 } } },
        ],
      }),
    );
    expect(run(['construct', 'spec.json', '--brand', 'kestrel', '--concept', 'k'], cwd).status).toBe(0);
    const r = run(
      ['wordmarks', '--brand', 'kestrel', '--concept', 'k', '--fonts', 'inter,fraunces', '--weights', '600'],
      cwd,
    );
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.candidates.map((x: { id: string; font: string }) => `${x.id}:${x.font}`)).toEqual([
      'w1:inter',
      'w2:fraunces',
    ]);
    const dir = join(cwd, 'brand', 'brands', 'kestrel', 'concepts', 'k');
    expect(existsSync(join(dir, 'review', 'wordmarks.png'))).toBe(true);
    const pick = run(['wordmarks', '--brand', 'kestrel', '--concept', 'k', '--pick', 'w2'], cwd);
    expect(pick.status, pick.stderr).toBe(0);
    const concept = JSON.parse(readFileSync(join(dir, 'concept.json'), 'utf8'));
    expect(concept.files.wordmark).toBe('wordmark.svg');
    expect(concept.typography).toMatchObject({ fontId: 'fraunces', weight: 600 });
    expect(readFileSync(join(dir, 'wordmark.svg'), 'utf8')).toContain('data-cap-height');
    expect(run(['wordmarks', '--brand', 'kestrel', '--concept', 'k', '--pick', 'w9'], cwd).status).toBe(1);
    // A wordmark-led concept: the word is the identity, so verify renders it at the heights it is read at.
    expect(JSON.parse(run(['concept', 'list', '--brand', 'kestrel'], cwd).stdout)[0].lead).toBe('wordmark');
    const v = run(['verify', '--brand', 'kestrel', '--concept', 'k'], cwd);
    expect(v.status, v.stderr).toBe(0);
    expect(existsSync(join(dir, 'review', 'wordmark-sheet.png'))).toBe(true);
    const bad = run(
      [
        ...['concept', 'new', '--brand', 'kestrel', '--id', 'z', '--title', 'Z', '--direction', 'd'],
        ...['--rationale', 'r', '--semantics', 'x', '--primary', '#1d4e89', '--lead', 'banner'],
      ],
      cwd,
    );
    expect(JSON.parse(bad.stderr).error.message).toMatch(/--lead must be symbol or wordmark/);
  }, 60_000);
});

describe('faces for the wordmark board', () => {
  it('starts from the concept face and picks contrasting faces that fit the brief', async () => {
    const { defaultFonts } = await import('../src/design/wordmarks.js');
    const { fontInfo } = await import('../src/design/fonts.js');
    const warm = defaultFonts('inter', 4, ['warm', 'crafted', 'quietly confident'], 'emberwick');
    expect(warm[0]).toBe('inter');
    expect(new Set(warm).size).toBe(4);
    expect(warm.some((f) => ['fraunces', 'young-serif', 'alegreya-sans'].includes(f))).toBe(true);
    expect(warm.some((f) => fontInfo(f).category === 'monospace')).toBe(false);
    const dev = defaultFonts(undefined, 4, ['precise', 'developer'], 'searvex');
    expect(fontInfo(dev[0]!).category).not.toBe('monospace');
    // Same words, different brands: not one fixed board for everyone.
    expect(defaultFonts(undefined, 4, [], 'alpha')).not.toEqual(defaultFonts(undefined, 4, [], 'beta'));
  });
});
