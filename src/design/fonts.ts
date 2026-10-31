import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fontkit from 'fontkit';
import { MarkiloError } from '../core/errors.js';

export interface FontFamilyInfo {
  id: string;
  family: string;
  category: string;
  role: string;
  license: string;
  licenseFile: string;
  commercialUse: string;
  source: string;
  weights: number[];
  /** Character words (warm, technical, editorial…) matched against a brief's personality to pick faces. */
  traits?: string[];
  files: Record<string, string[]>;
  /** Where the font came from: the plugin bundle or a workspace's fonts/ folder (added with `markilo fonts add`). */
  origin?: 'bundled' | 'workspace';
}

interface Registry {
  families: FontFamilyInfo[];
}

let registryCache: { dir: string; registry: Registry } | undefined;
const extraRegistries: { dir: string; registry: Registry }[] = [];

/** Makes fonts added to a workspace (brand/fonts/fonts.json) available to wordmarks and exports. */
export function registerFontDir(dir: string): void {
  const file = join(dir, 'fonts.json');
  if (!existsSync(file) || extraRegistries.some((r) => r.dir === dir)) return;
  try {
    extraRegistries.push({ dir, registry: JSON.parse(readFileSync(file, 'utf8')) as Registry });
  } catch {
    // A broken workspace registry should not break bundled fonts.
  }
}

function allFamilies(): { dir: string; info: FontFamilyInfo }[] {
  const bundled = registry();
  return [
    ...bundled.registry.families.map((info) => ({
      dir: bundled.dir,
      info: { ...info, origin: 'bundled' as const },
    })),
    ...extraRegistries.flatMap((r) =>
      r.registry.families.map((info) => ({ dir: r.dir, info: { ...info, origin: 'workspace' as const } })),
    ),
  ];
}

/** Locates the bundled fonts/ directory from either src/ (dev) or dist/ (bundled plugin). */
export function fontsDir(): string {
  if (process.env.MARKILO_FONTS_DIR) return resolve(process.env.MARKILO_FONTS_DIR);
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, 'fonts', 'fonts.json'))) return join(dir, 'fonts');
    if (existsSync(join(dir, 'plugin', 'fonts', 'fonts.json'))) return join(dir, 'plugin', 'fonts');
    dir = dirname(dir);
  }
  throw new MarkiloError('INTERNAL', 'Bundled fonts/fonts.json not found.');
}

function registry(): { dir: string; registry: Registry } {
  if (!registryCache) {
    const dir = fontsDir();
    registryCache = { dir, registry: JSON.parse(readFileSync(join(dir, 'fonts.json'), 'utf8')) as Registry };
  }
  return registryCache;
}

export const listFonts = (): FontFamilyInfo[] => allFamilies().map((f) => f.info);

export function fontInfo(id: string): FontFamilyInfo {
  const f = allFamilies().find((x) => x.info.id === id)?.info;
  if (!f) {
    throw new MarkiloError(
      'NOT_FOUND',
      `Unknown font "${id}". Available: ${listFonts()
        .map((x) => x.id)
        .join(', ')}.`,
    );
  }
  return f;
}

/** A font face made of one or more subset files, tried in order for each character. */
export interface FontFace {
  label: string;
  family: string;
  license: string;
  faces: fontkit.Font[];
}

const faceCache = new Map<string, FontFace>();

export function loadBundledFace(id: string, weight: number): FontFace {
  const key = `${id}@${weight}`;
  const hit = faceCache.get(key);
  if (hit) return hit;
  const info = fontInfo(id);
  const dir = allFamilies().find((x) => x.info.id === id)!.dir;
  const files = info.files[String(weight)];
  if (!files) {
    throw new MarkiloError(
      'INVALID_INPUT',
      `${info.family} has no weight ${weight}. Available: ${info.weights.join(', ')}.`,
    );
  }
  const face: FontFace = {
    label: `${info.family} ${weight}`,
    family: info.family,
    license: info.license,
    faces: files.map((f) => fontkit.create(readFileSync(join(dir, f)))),
  };
  faceCache.set(key, face);
  return face;
}

/** User-supplied font (TTF, OTF, WOFF, WOFF2). The caller is responsible for its license. */
export function loadFontFile(path: string, license = 'user-supplied'): FontFace {
  if (!existsSync(path)) throw new MarkiloError('NOT_FOUND', `Font file not found: ${path}`);
  if (!['.ttf', '.otf', '.woff', '.woff2'].includes(extname(path).toLowerCase())) {
    throw new MarkiloError('INVALID_INPUT', 'Font files must be .ttf, .otf, .woff or .woff2.');
  }
  const font = fontkit.create(readFileSync(path));
  return {
    label: `${font.familyName} ${font.subfamilyName}`,
    family: font.familyName,
    license,
    faces: [font],
  };
}
