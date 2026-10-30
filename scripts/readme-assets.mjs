#!/usr/bin/env node
// Copies Markilo's own exported identity (branding/) into the repository's README and plugin images.
// Nothing is drawn or composed here: every file is an output of `markilo export`.
// Run after: node plugin/dist/markilo.mjs export --workspace branding --brand markilo --clean
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const E = join(root, 'branding/brands/markilo/exports');
const A = join(root, 'assets');

const copies = [
  ['logos/primary/primary-color.svg', 'assets/logo-light.svg'],
  ['logos/primary/primary-reversed.svg', 'assets/logo-dark.svg'],
  ['logos/symbol/symbol-color.svg', 'assets/symbol.svg'],
  ['logos/overview.png', 'assets/kit-overview.png'],
  ['social/github-social-preview.png', 'assets/social-preview.png'],
  ['logos/appmark/appmark.png', 'plugin/.claude-plugin/icon.png'],
];
for (const [from, to] of copies) {
  const src = join(E, from);
  if (!existsSync(src)) throw new Error(`Missing export ${from}; run markilo export first.`);
  copyFileSync(src, join(root, to));
}
console.log(
  `README and plugin images updated from ${E} (${copies.length} files) into ${A} and plugin/.claude-plugin/`,
);
