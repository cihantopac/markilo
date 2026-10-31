#!/usr/bin/env node
// Copies a curated set of SIL OFL 1.1 fonts from @fontsource packages into ./fonts.
// Only the latin + latin-ext subsets (normal style) are vendored to keep the plugin small.
// The generated fonts/fonts.json is the registry the wordmark engine reads at runtime.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'plugin', 'fonts');

// Traits describe each family's character in the words briefs use (personality, values); `wordmarks` picks the
// contrasting faces for a board by them, so every brand's board starts from its own character, not one fixed list.
const FAMILIES = [
  {
    id: 'inter',
    role: 'neutral grotesque sans; UI-grade, highly legible',
    weights: [400, 500, 600, 700, 800],
    traits: ['neutral', 'precise', 'modern', 'calm', 'technical'],
  },
  {
    id: 'manrope',
    role: 'geometric-humanist sans; friendly, modern',
    weights: [400, 500, 600, 700, 800],
    traits: ['friendly', 'modern', 'clean', 'approachable'],
  },
  {
    id: 'space-grotesk',
    role: 'technical grotesque with quirky details',
    weights: [400, 500, 600, 700],
    traits: ['technical', 'quirky', 'developer', 'modern'],
  },
  {
    id: 'sora',
    role: 'wide geometric sans; tech / fintech',
    weights: [400, 500, 600, 700, 800],
    traits: ['wide', 'technical', 'confident', 'modern'],
  },
  {
    id: 'dm-sans',
    role: 'low-contrast geometric sans; compact',
    weights: [400, 500, 600, 700, 800],
    traits: ['clean', 'compact', 'neutral', 'modern'],
  },
  {
    id: 'outfit',
    role: 'rounded geometric sans; approachable',
    weights: [400, 500, 600, 700, 800],
    traits: ['rounded', 'friendly', 'approachable', 'playful'],
  },
  {
    id: 'plus-jakarta-sans',
    role: 'contemporary sans with open apertures',
    weights: [400, 500, 600, 700, 800],
    traits: ['contemporary', 'open', 'friendly', 'clean'],
  },
  {
    id: 'fraunces',
    role: 'soft "wonky" display serif; editorial, warm',
    weights: [400, 500, 600, 700, 800],
    traits: ['warm', 'editorial', 'crafted', 'characterful', 'soft'],
  },
  {
    id: 'ibm-plex-serif',
    role: 'rational text serif; institutional, trustworthy',
    weights: [400, 500, 600, 700],
    traits: ['institutional', 'trustworthy', 'rational', 'calm'],
  },
  {
    id: 'jetbrains-mono',
    role: 'monospace; developer tools',
    weights: [400, 500, 600, 700, 800],
    traits: ['developer', 'technical', 'precise', 'code'],
  },
  {
    id: 'bricolage-grotesque',
    role: 'expressive grotesque with ink traps and lively joins; contemporary, bold',
    weights: [400, 500, 600, 700, 800],
    traits: ['bold', 'expressive', 'contemporary', 'energetic', 'characterful'],
  },
  {
    id: 'instrument-serif',
    role: 'condensed display serif; elegant, editorial, quiet confidence',
    weights: [400],
    traits: ['elegant', 'editorial', 'condensed', 'refined', 'quiet'],
  },
  {
    id: 'young-serif',
    role: 'sturdy old-style display serif; warm, crafted, friendly',
    weights: [400],
    traits: ['warm', 'crafted', 'friendly', 'sturdy', 'human'],
  },
  {
    id: 'dm-serif-display',
    role: 'high-contrast display serif; premium, classic',
    weights: [400],
    traits: ['premium', 'classic', 'elegant', 'contrast'],
  },
  {
    id: 'syne',
    role: 'eccentric display sans that widens with weight; artistic, bold',
    weights: [400, 500, 600, 700, 800],
    traits: ['artistic', 'eccentric', 'bold', 'wide', 'expressive'],
  },
  {
    id: 'unbounded',
    role: 'wide rounded display sans; confident, futuristic',
    weights: [400, 500, 600, 700, 800, 900],
    traits: ['wide', 'rounded', 'confident', 'futuristic', 'bold'],
  },
  {
    id: 'archivo',
    role: 'grotesque with an industrial build; sturdy, no-nonsense',
    weights: [400, 500, 600, 700, 800, 900],
    traits: ['industrial', 'sturdy', 'rugged', 'durable', 'no-nonsense'],
  },
  {
    id: 'schibsted-grotesk',
    role: 'editorial grotesque; newsy, credible, direct',
    weights: [400, 500, 600, 700, 800, 900],
    traits: ['editorial', 'credible', 'direct', 'precise', 'trustworthy'],
  },
  {
    id: 'newsreader',
    role: 'text serif with optical character; thoughtful, literary',
    weights: [400, 500, 600, 700, 800],
    traits: ['literary', 'thoughtful', 'trustworthy', 'calm', 'human'],
  },
  {
    id: 'zilla-slab',
    role: 'slab serif with flat brackets; dependable, straightforward',
    weights: [400, 500, 600, 700],
    traits: ['dependable', 'sturdy', 'straightforward', 'rugged', 'grounded'],
  },
  {
    id: 'space-mono',
    role: 'geometric monospace with retro character',
    weights: [400, 700],
    traits: ['retro', 'technical', 'quirky', 'developer'],
  },
  {
    id: 'atkinson-hyperlegible-next',
    role: 'humanist sans designed for low-vision legibility; clear, caring',
    weights: [400, 500, 600, 700, 800],
    traits: ['accessible', 'clear', 'caring', 'human', 'reassuring'],
  },
  {
    id: 'alegreya-sans',
    role: 'humanist sans with calligraphic rhythm; organic, warm',
    weights: [400, 500, 700, 800],
    traits: ['humanist', 'organic', 'warm', 'crafted', 'calm'],
  },
  {
    id: 'familjen-grotesk',
    role: 'grotesque with sharp, idiosyncratic details; confident, distinctive',
    weights: [400, 500, 600, 700],
    traits: ['distinctive', 'confident', 'sharp', 'characterful'],
  },
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
    traits: fam.traits,
    files,
  });
}
writeFileSync(join(out, 'fonts.json'), `${JSON.stringify(registry, null, 2)}\n`);
console.log(`Vendored ${registry.families.length} font families into plugin/fonts/`);
