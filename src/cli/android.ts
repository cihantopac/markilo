import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { MarkiloError } from '../core/errors.js';
import { portableRelative } from '../core/paths.js';
import { SPECS } from '../export/specs.js';
import { pngSize } from '../render/png.js';

/**
 * The Android profile of `install-assets`: reads the project's own resources (AndroidManifest.xml and every
 * res/{mipmap,drawable}-<density>/ file) and keeps their names, folders and pixel sizes, so the project never has to
 * be renamed to match the export. It only plans work in resource folders it read; see frameworks.ts for the rest.
 */

const DENSITY = SPECS.android.densities;
const FOLDER = /^(mipmap|drawable)-(mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi)$/;
const RASTER = /\.(png|webp|jpe?g)$/i;

/** The exported file each manifest attribute and launcher name stands for. */
const EXPORT_NAME = {
  icon: 'ic_launcher',
  roundIcon: 'ic_launcher_round',
  banner: 'banner',
} as const;
const LAUNCHER_EXPORTS = [
  'ic_launcher',
  'ic_launcher_round',
  'ic_launcher_foreground',
  'ic_launcher_background',
  'ic_launcher_monochrome',
];

export interface ProjectResource {
  /** Project-relative path with forward slashes. */
  path: string;
  kind: 'mipmap' | 'drawable';
  density: string;
  name: string;
  ext: string;
  width?: number;
  height?: number;
  /** Why the file cannot be replaced (a format the exports do not come in). */
  skip?: string;
}

export interface AndroidWork {
  /** Export-relative source, project-relative destination, and the pixel size it must have there. */
  from: string;
  to: string;
  width: number;
  height: number;
  /** An export file of exactly this size can be copied as it is. */
  exact?: string;
}

export interface UnmatchedResource {
  name: string;
  files: { path: string; density: string; width?: number; height?: number; note?: string }[];
  mappedTo?: string;
}

export interface AndroidProfile {
  resDir?: string;
  manifest?: string;
  /** Resource names the manifest points at: name → the manifest attribute. */
  references: Record<string, string>;
  resources: ProjectResource[];
}

/** Where the project keeps its manifest and res/ folder, or nothing. */
export function findAndroidRoot(
  project: string,
): { dir: string; manifest?: string; res?: string } | undefined {
  for (const rel of ['app/src/main', 'src/main', '.']) {
    const dir = join(project, rel);
    const manifest = existsSync(join(dir, 'AndroidManifest.xml')) ? `${rel}/AndroidManifest.xml` : undefined;
    const res = existsSync(join(dir, 'res')) ? `${rel}/res` : undefined;
    // A bare res/ at the project root alone is too common to claim; it needs the manifest next to it.
    if (manifest || (res && rel !== '.'))
      return {
        dir,
        ...(manifest ? { manifest: manifest.replace(/^\.\//, '') } : {}),
        ...(res ? { res: res.replace(/^\.\//, '') } : {}),
      };
  }
  return undefined;
}

function webpSize(b: Buffer): { width: number; height: number } | undefined {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP')
    return undefined;
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') {
    const v = b.readUInt32LE(21);
    return { width: (v & 0x3fff) + 1, height: ((v >>> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  return undefined;
}

function sizeOf(file: string, ext: string): { width: number; height: number } | undefined {
  try {
    const b = readFileSync(file);
    if (ext === 'png') {
      if (b.length < 24 || b[0] !== 0x89 || b.toString('ascii', 12, 16) !== 'IHDR') return undefined;
      return pngSize(b);
    }
    if (ext === 'webp') return webpSize(b);
  } catch {
    /* unreadable: the size stays unknown */
  }
  return undefined;
}

export function readAndroidProject(project: string): AndroidProfile {
  const root = findAndroidRoot(project);
  const profile: AndroidProfile = {
    references: {},
    resources: [],
    ...(root?.res ? { resDir: root.res } : {}),
    ...(root?.manifest ? { manifest: root.manifest } : {}),
  };
  if (root?.manifest) {
    const xml = readFileSync(join(project, root.manifest), 'utf8');
    for (const attr of Object.keys(EXPORT_NAME)) {
      const re = new RegExp(`android:${attr}\\s*=\\s*"@(?:mipmap|drawable)/([A-Za-z0-9_]+)"`, 'g');
      for (const m of xml.matchAll(re)) profile.references[m[1]!] ??= attr;
    }
  }
  if (!root?.res) return profile;
  const resAbs = join(project, root.res);
  for (const folder of readdirSync(resAbs).sort()) {
    const m = FOLDER.exec(folder);
    if (!m) continue;
    for (const f of readdirSync(join(resAbs, folder)).sort()) {
      if (!RASTER.test(f)) continue;
      const nine = /\.9\.png$/i.test(f);
      const name = f.replace(/(\.9)?\.[^.]+$/i, '');
      const ext = (f.split('.').pop() ?? '').toLowerCase().replace('jpeg', 'jpg');
      const abs = join(resAbs, folder, f);
      const size = nine ? undefined : sizeOf(abs, ext);
      profile.resources.push({
        path: portableRelative(project, abs),
        kind: m[1] as 'mipmap' | 'drawable',
        density: m[2]!,
        name,
        ext,
        ...(size ?? {}),
        ...(nine
          ? { skip: 'nine-patch images are left alone' }
          : ext !== 'png'
            ? { skip: `${ext.toUpperCase()} files are not replaced (the exports are PNG)` }
            : {}),
      });
    }
  }
  return profile;
}

/** Pixel size a launcher or banner file has at a density when the project's own file cannot tell. */
function tableSize(exportName: string, density: string): { width: number; height: number } {
  const k = DENSITY[density]!;
  if (exportName === 'banner') return { width: Math.round(160 * k), height: Math.round(90 * k) };
  const dp =
    exportName === 'ic_launcher' || exportName === 'ic_launcher_round'
      ? SPECS.android.legacyDp
      : SPECS.android.adaptiveDp;
  return { width: Math.round(dp * k), height: Math.round(dp * k) };
}

/** Exported android raster files by name: name → density → export-relative path. */
function exportedRasters(exportsDir: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  const res = join(exportsDir, 'android', 'res');
  if (!existsSync(res)) return out;
  for (const folder of readdirSync(res).sort()) {
    const m = FOLDER.exec(folder);
    if (!m) continue;
    for (const f of readdirSync(join(res, folder)).sort()) {
      if (!f.endsWith('.png')) continue;
      const byDensity = out[f.slice(0, -4)] ?? {};
      byDensity[m[2]!] = `android/res/${folder}/${f}`;
      out[f.slice(0, -4)] = byDensity;
    }
  }
  return out;
}

export interface AndroidMatch {
  work: AndroidWork[];
  unmatched: UnmatchedResource[];
  notes: string[];
}

/**
 * Matches the project's files to exported files by name and density, and lists everything else as unmatched.
 * `maps` (name → export path) renders that export at the size of each project file with that name.
 */
export function matchAndroid(
  profile: AndroidProfile,
  exportsDir: string,
  maps: Record<string, string> = {},
  exportSize: (rel: string) => { width: number; height: number } | undefined,
): AndroidMatch {
  const notes: string[] = [];
  const work: AndroidWork[] = [];
  const exported = exportedRasters(exportsDir);
  const unmatchedBy = new Map<string, UnmatchedResource>();
  const exportNameOf = (name: string): string | undefined => {
    const role = profile.references[name] as keyof typeof EXPORT_NAME | undefined;
    if (role) return EXPORT_NAME[role];
    return LAUNCHER_EXPORTS.includes(name) ? name : undefined;
  };
  const addUnmatched = (r: ProjectResource, note?: string) => {
    const u = unmatchedBy.get(r.name) ?? { name: r.name, files: [] };
    u.files.push({
      path: r.path,
      density: r.density,
      ...(r.width && r.height ? { width: r.width, height: r.height } : {}),
      ...(note ? { note } : {}),
    });
    unmatchedBy.set(r.name, u);
  };

  for (const r of profile.resources) {
    const target = exportNameOf(r.name);
    if (!target || r.skip) {
      addUnmatched(r, r.skip);
      continue;
    }
    const byDensity = exported[target];
    if (!byDensity) {
      notes.push(
        `${r.path}: the export has no ${target}.png; run \`markilo export\` with the android group first.`,
      );
      continue;
    }
    const expected = tableSize(target, r.density);
    const size = r.width && r.height ? { width: r.width, height: r.height } : expected;
    if (
      target !== 'banner' &&
      r.width &&
      r.height &&
      (r.width !== expected.width || r.height !== expected.height)
    )
      notes.push(
        `${r.path} is ${r.width}×${r.height}px; the ${r.density} table size is ${expected.width}×${expected.height}px. The project's size is kept.`,
      );
    const exact = byDensity[r.density];
    // The best source is the export file of this very density when it has the size; otherwise the largest one is scaled.
    const sourceRel =
      exact && sameSize(exportSize(exact), size)
        ? exact
        : Object.values(byDensity).sort(
            (a, b) => (exportSize(b)?.width ?? 0) - (exportSize(a)?.width ?? 0),
          )[0]!;
    work.push({
      from: sourceRel,
      to: r.path,
      ...size,
      ...(sameSize(exportSize(sourceRel), size) ? { exact: sourceRel } : {}),
    });
  }

  for (const [name, exportPath] of Object.entries(maps)) {
    const files = unmatchedBy.get(name)?.files;
    if (!files) {
      const matched = profile.resources.some((r) => r.name === name);
      throw new MarkiloError(
        matched ? 'USAGE' : 'NOT_FOUND',
        matched
          ? `--map ${name}: this file is already matched to an exported launcher or banner file.`
          : `--map ${name}: no drawable or mipmap named "${name}" in the resource folders of this project.`,
        matched
          ? 'Only the files listed under "unmatched" can be mapped.'
          : 'Names come from the "unmatched" list of the dry run.',
      );
    }
    for (const f of files) {
      if (!f.width || !f.height)
        throw new MarkiloError(
          'INVALID_INPUT',
          `--map ${name}: the pixel size of ${f.path} cannot be read (${f.note ?? 'not a PNG or WebP image'}).`,
          'Mapping renders the export at the size of the existing file. Replace that file by hand.',
        );
      if (f.note)
        throw new MarkiloError('INVALID_INPUT', `--map ${name}: ${f.path} cannot be replaced: ${f.note}.`);
      const size = { width: f.width, height: f.height };
      work.push({
        from: exportPath,
        to: f.path,
        ...size,
        ...(sameSize(exportSize(exportPath), size) ? { exact: exportPath } : {}),
      });
    }
    unmatchedBy.get(name)!.mappedTo = exportPath;
  }
  return { work, unmatched: [...unmatchedBy.values()], notes };
}

const sameSize = (a: { width: number; height: number } | undefined, b: { width: number; height: number }) =>
  !!a && a.width === b.width && a.height === b.height;

/** An SVG that shows `data` (PNG or SVG) fitted inside a width × height canvas, to be rendered at that size. */
export function fitWrapper(data: Buffer, mime: string, width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" xlink:href="data:${mime};base64,${data.toString('base64')}"/></svg>`;
}

export const mimeOf = (file: string): string | undefined => {
  const e = basename(file).split('.').pop()?.toLowerCase();
  return e === 'png'
    ? 'image/png'
    : e === 'svg'
      ? 'image/svg+xml'
      : e === 'jpg' || e === 'jpeg'
        ? 'image/jpeg'
        : undefined;
};
