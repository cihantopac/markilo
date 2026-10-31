#!/usr/bin/env node
// Smoke test of a Markilo toolchain as users get it: a whole identity, from an empty folder to installed assets,
// with nothing but the given CLI (default: this repository's plugin/dist). CI runs it against the copy that
// `claude plugin install` puts in the plugin cache.
//
//   node scripts/smoke.mjs [path/to/markilo.mjs]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = resolve(
  process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'dist', 'markilo.mjs'),
);
const dir = mkdtempSync(join(tmpdir(), 'markilo-smoke-'));
const ws = join(dir, 'brand');
const concept = join(ws, 'brands', 'smoke-test', 'concepts', 'ring');

function step(name, args, check) {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`✗ ${name}\n${r.stderr || r.stdout}`);
    process.exit(1);
  }
  const out =
    r.stdout.trim().startsWith('{') || r.stdout.trim().startsWith('[') ? JSON.parse(r.stdout) : r.stdout;
  if (check && !check(out)) {
    console.error(`✗ ${name}: unexpected output\n${r.stdout.slice(0, 2000)}`);
    process.exit(1);
  }
  console.log(`✓ ${name}`);
  return out;
}

try {
  step('doctor', ['doctor'], (o) => o.ok !== false);
  step('init', ['init', '--name', 'Smoke']);
  step('brand add', ['brand', 'add', 'Smoke Test']);
  step('concept new', [
    'concept',
    'new',
    '--brand',
    'smoke-test',
    '--id',
    'ring',
    '--title',
    'Ring',
    '--direction',
    'A broken ring',
    '--rationale',
    'A loop that opens toward the next step.',
    '--semantics',
    'loop,progress,opening',
    '--primary',
    '#1f4fd1',
    '--accent',
    '#f2a33a',
    '--font',
    'manrope',
    '--weight',
    '700',
  ]);
  const spec = join(dir, 'ring.json');
  writeFileSync(
    spec,
    JSON.stringify({
      params: { r: 360, w: 120, gap: 32 },
      layers: [
        {
          fill: 'primary',
          shape: {
            gap: {
              shape: { arc: { c: [512, 512], r: 'r', from: 30, to: 330, width: 'w', cap: 'round' } },
              cut: { rect: { c: [760, 512], w: 300, h: 'w', r: 'w/2' } },
              width: 'gap',
            },
          },
        },
        { fill: 'accent', shape: { rect: { c: [760, 512], w: 300, h: 'w', r: 'w/2' } } },
      ],
    }),
  );
  step('construct', ['construct', spec, '--brand', 'smoke-test', '--concept', 'ring']);
  mkdirSync(concept, { recursive: true });
  step('wordmark', [
    'wordmark',
    '--text',
    'Smoke Test',
    '--font',
    'manrope',
    '--weight',
    '700',
    '-o',
    join(concept, 'wordmark.svg'),
  ]);
  step('concept update', [
    'concept',
    'update',
    '--brand',
    'smoke-test',
    '--concept',
    'ring',
    '--wordmark',
    join(concept, 'wordmark.svg'),
  ]);
  step('verify', ['verify', '--brand', 'smoke-test', '--concept', 'ring'], () =>
    existsSync(join(concept, 'review', 'symbol-sheet.png')),
  );
  step('finalize', ['finalize', '--brand', 'smoke-test', '--concept', 'ring', '--accept-risk']);
  step('deliverables', [
    'deliverables',
    '--brand',
    'smoke-test',
    '--set',
    'logos,web,social,tokens,guidelines',
  ]);
  step('export', ['export', '--brand', 'smoke-test'], () =>
    ['web/favicon.ico', 'web/site.webmanifest', 'guidelines/index.html', 'asset-manifest.json'].every((f) =>
      existsSync(join(ws, 'brands', 'smoke-test', 'exports', f)),
    ),
  );
  step('gallery', ['gallery'], () => existsSync(join(ws, 'gallery', 'index.html')));
  const site = join(dir, 'site');
  mkdirSync(site);
  writeFileSync(
    join(site, 'package.json'),
    JSON.stringify({ name: 'site', dependencies: { next: '15.0.0' } }),
  );
  mkdirSync(join(site, 'app'));
  let planId = '';
  step(
    'install-assets (plan)',
    ['install-assets', '--brand', 'smoke-test', '--framework', 'auto', '--project', site],
    (o) => {
      planId = o.planId;
      return o.framework === 'next' && !o.applied && typeof planId === 'string';
    },
  );
  step(
    'install-assets (apply)',
    [
      'install-assets',
      '--brand',
      'smoke-test',
      '--framework',
      'auto',
      '--project',
      site,
      '--apply',
      '--expect',
      planId,
    ],
    () =>
      ['app/favicon.ico', 'app/icon.svg', 'app/opengraph-image.png'].every((f) => existsSync(join(site, f))),
  );
  step(
    'install-assets (undo)',
    ['install-assets', '--undo', '--project', site, '--apply'],
    (o) => o.applied && o.removed.length > 0 && !existsSync(join(site, 'app', 'icon.svg')),
  );
  console.log(`Smoke test passed with ${cli}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
