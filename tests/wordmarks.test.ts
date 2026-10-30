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
  }, 60_000);
});
