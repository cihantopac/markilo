#!/usr/bin/env node
// Copies a curated set of SIL OFL 1.1 fonts from @fontsource packages into ./fonts.
// Only the latin + latin-ext subsets (normal style) are vendored to keep the plugin small.
// The generated fonts/fonts.json is the registry the wordmark engine reads at runtime.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'plugin', 'fonts');

const FAMILIES = [
  {
    id: 'inter',
    role: 'neutral grotesque sans; UI-grade, highly legible',
    weights: [400, 500, 600, 700, 800],
  },
  { id: 'manrope', role: 'geometric-humanist sans; friendly, modern', weights: [400, 500, 600, 700, 800] },
  { id: 'space-grotesk', role: 'technical grotesque with quirky details', weights: [400, 500, 600, 700] },
  { id: 'sora', role: 'wide geometric sans; tech / fintech', weights: [400, 500, 600, 700, 800] },
  { id: 'dm-sans', role: 'low-contrast geometric sans; compact', weights: [400, 500, 600, 700, 800] },
  { id: 'outfit', role: 'rounded geometric sans; approachable', weights: [400, 500, 600, 700, 800] },
  {
    id: 'plus-jakarta-sans',
    role: 'contemporary sans with open apertures',
    weights: [400, 500, 600, 700, 800],
  },
  { id: 'fraunces', role: 'soft "wonky" display serif; editorial, warm', weights: [400, 500, 600, 700, 800] },
  {
    id: 'ibm-plex-serif',
    role: 'rational text serif; institutional, trustworthy',
    weights: [400, 500, 600, 700],
  },
  { id: 'jetbrains-mono', role: 'monospace; developer tools', weights: [400, 500, 600, 700, 800] },
];
const SUBSETS = ['latin', 'latin-ext'];

if (existsSync(out)) rmSync(out, { recursive: true });
mkdirSync(out, { recursive: true });

const registry = { generatedBy: 'scripts/vendor-fonts.mjs', license: 'OFL-1.1', families: [] };
for (const fam of FAMILIES) {
  const pkg = join(root, 'node_modules', '@fontsource', fam.id);
  const meta = JSON.parse(readFileSync(join(pkg, 'metadata.json'), 'utf8'));
  const pkgJson = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
  const dir = join(out, fam.id);
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(pkg, 'LICENSE'), join(dir, 'OFL.txt'));
  const files = {};
  for (const w of fam.weights) {
    files[w] = [];
    for (const s of SUBSETS) {
      const name = `${fam.id}-${s}-${w}-normal.woff`;
      copyFileSync(join(pkg, 'files', name), join(dir, name));
      files[w].push(`${fam.id}/${name}`);
    }
  }
  registry.families.push({
    id: fam.id,
    family: meta.family,
    category: meta.category,
    role: fam.role,
    license: 'OFL-1.1',
    licenseFile: `${fam.id}/OFL.txt`,
    commercialUse:
      'Allowed under SIL OFL 1.1 (fonts may not be sold by themselves; outlined logos are unrestricted).',
    source: `@fontsource/${fam.id}@${pkgJson.version} (Google Fonts ${meta.version})`,
    weights: fam.weights,
    files,
  });
}
writeFileSync(join(out, 'fonts.json'), `${JSON.stringify(registry, null, 2)}\n`);
console.log(`Vendored ${registry.families.length} font families into plugin/fonts/`);
