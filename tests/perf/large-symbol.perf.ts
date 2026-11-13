// Not part of the default run (the name does not match tests/**/*.test.ts).
// Run: npm run build && npx vitest run --config tests/perf/vitest.perf.config.ts
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { tmp } from '../helpers.js';

const bin = join(__dirname, '..', '..', 'plugin', 'dist', 'markilo.mjs');

it('exports every group for a ~250 KB locked symbol within a generous budget', () => {
  const cwd = tmp();
  let p = '';
  for (let i = 0; i < 3500; i++) {
    const x = (i % 70) * 14 + 5;
    const y = Math.floor(i / 70) * 14 + 5;
    p += `<path d="M${x} ${y}h${(i % 7) + 4}v${(i % 5) + 4}h-${(i % 7) + 4}z M${x + 1.5} ${y + 1.5}l2.3 1.1 1.7 2.9z" fill="#1b2140"/>`;
  }
  writeFileSync(
    join(cwd, 'big.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 800">${p}</svg>`,
  );
  const run = (a: string[]) => spawnSync(process.execPath, [bin, ...a], { cwd, encoding: 'utf8' });
  run(['init', '--name', 'Perf']);
  run(['brand', 'add', 'Big', '--locked']);
  run(['lock', '--brand', 'big', '--primary', '#1b2140', '--symbol', 'big.svg']);
  const t = Date.now();
  expect(run(['export', '--brand', 'big', '--all']).status).toBe(0);
  expect(Date.now() - t).toBeLessThan(15_000);
}, 120_000);
