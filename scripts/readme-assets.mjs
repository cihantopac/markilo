#!/usr/bin/env node
// Rebuilds the README / repository images from Markilo's own exported identity (branding/).
// Run after: node plugin/dist/markilo.mjs export -w branding --brand markilo
import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const E = join(root, 'branding/brands/markilo/exports');
const A = join(root, 'assets');

copyFileSync(join(E, 'logos/primary/primary-color.svg'), join(A, 'logo-light.svg'));
copyFileSync(join(E, 'logos/primary/primary-reversed.svg'), join(A, 'logo-dark.svg'));
copyFileSync(join(E, 'logos/symbol/symbol-color.svg'), join(A, 'symbol.svg'));
copyFileSync(join(E, 'social/github-social-preview.png'), join(A, 'social-preview.png'));
copyFileSync(join(E, 'logos/appmark/appmark.png'), join(root, 'plugin/.claude-plugin/icon.png'));

let n = 0;
function place(file, x, y, w, h) {
  const src = readFileSync(join(E, file), 'utf8');
  const vb = /viewBox="([^"]+)"/.exec(src)[1];
  const p = `k${n++}-`;
  const body = src
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replaceAll('id="', `id="${p}`)
    .replaceAll('url(#', `url(#${p}`)
    .replaceAll('href="#', `href="#${p}`);
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vb}">${body}</svg>`;
}
const card = (x, y, w, h, fill) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="${fill}"/>`;
const parts = [`<rect width="1600" height="900" fill="#eceef2"/>`];
parts.push(card(40, 40, 980, 400, '#ffffff'), place('logos/primary/primary-color.svg', 140, 170, 780, 140));
parts.push(
  card(1060, 40, 500, 400, '#14161f'),
  place('logos/secondary/secondary-reversed.svg', 1160, 100, 300, 280),
);
parts.push(card(40, 480, 740, 380, '#ffffff'));
parts.push(
  place('logos/appmark/appmark.svg', 90, 540, 180, 180),
  place('macos/AppIcon-1024-legacy.svg', 300, 540, 180, 180),
);
let x = 520;
for (const s of [64, 32, 16]) {
  parts.push(place('web/favicon.svg', x, 540 + (64 - s), s, s));
  x += s + 28;
}
parts.push(
  place('logos/symbol/symbol-black.svg', 90, 762, 60, 60),
  place('logos/compact/compact-color.svg', 190, 766, 300, 52),
);
parts.push(card(820, 480, 740, 380, '#ffffff'));
['#f45d2c', '#14161f', '#ffffff'].forEach((c, i) => {
  parts.push(
    `<rect x="${870 + i * 230}" y="530" width="200" height="200" rx="18" fill="${c}" stroke="#d9dce3"/>`,
  );
});
parts.push(place('logos/wordmark/wordmark-ink.svg', 870, 770, 300, 60));
const tmp = join(A, '.kit-overview.svg');
writeFileSync(
  tmp,
  `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">${parts.join('')}</svg>`,
);
execFileSync(
  process.execPath,
  [
    join(root, 'plugin/dist/markilo.mjs'),
    'render',
    tmp,
    '-o',
    join(A, 'kit-overview.png'),
    '--width',
    '1600',
  ],
  { stdio: 'ignore' },
);
rmSync(tmp);
console.log('README assets updated in assets/');
