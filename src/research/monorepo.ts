import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { MarkiloError } from '../core/errors.js';
import { isRealDir as isDir } from '../core/fsx.js';
import { portableRelative, slugify } from '../core/paths.js';

export type PackageKind = 'site' | 'app' | 'library' | 'client' | 'service' | 'unknown';

export interface PackageCandidate {
  slug: string;
  name: string;
  path: string;
  group: string;
  kind: PackageKind;
  /** Worth its own identity: user-facing (has a UI, public assets or a domain) rather than an internal library. */
  brandable: boolean;
  reason: string;
  title?: string;
  homepage?: string;
  logoFiles: number;
  /** Existing icons for this package found in shared icon folders elsewhere in the repo (e.g. public/apps/crm.svg). */
  sharedIcons?: string[];
}

export interface MonorepoScan {
  root: string;
  isMonorepo: boolean;
  workspaceGlobs: string[];
  groups: Record<string, number>;
  candidates: PackageCandidate[];
}

/** Folder names that conventionally hold deployable units in monorepos. */
const CONVENTIONAL = [
  'products',
  'apps',
  'sites',
  'websites',
  'web',
  'services',
  'clients',
  'packages',
  'libs',
  'modules',
];
const MANIFESTS = [
  'package.json',
  'composer.json',
  'pubspec.yaml',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'index.html',
  'Gemfile',
];
const KIND_BY_GROUP: Record<string, PackageKind> = {
  products: 'site',
  sites: 'site',
  websites: 'site',
  web: 'site',
  apps: 'app',
  clients: 'client',
  services: 'service',
  packages: 'library',
  libs: 'library',
  modules: 'library',
};
const UI_HINT =
  /(^|\/)(public|static|www|resources\/views|resources\/js|src\/(pages|app|routes|components)|pages|views|templates)(\/|$)/;
const LOGO_HINT = /(logo|brand|favicon|wordmark|apple-touch|(^|[-_.])icon([-_.]|$))/i;

function readJsonSafe(path: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Expands simple workspace globs: "dir/*", "dir/**" (one level) and literal paths. */
function expandGlob(root: string, pattern: string): string[] {
  const clean = pattern.replace(/^\.\//, '').replace(/\/$/, '');
  if (clean.startsWith('!')) return [];
  const star = clean.indexOf('*');
  if (star === -1) return isDir(join(root, clean)) ? [clean] : [];
  const base = clean.slice(0, star).replace(/\/$/, '');
  if (!isDir(join(root, base))) return [];
  return readdirSync(join(root, base))
    .filter((d) => !d.startsWith('.') && isDir(join(root, base, d)))
    .map((d) => (base ? `${base}/${d}` : d));
}

function workspaceGlobs(root: string): string[] {
  const globs: string[] = [];
  const pkg = readJsonSafe(join(root, 'package.json'));
  const ws = pkg?.workspaces;
  if (Array.isArray(ws)) globs.push(...ws.filter((x): x is string => typeof x === 'string'));
  else if (ws && typeof ws === 'object' && Array.isArray((ws as { packages?: unknown }).packages))
    globs.push(...(ws as { packages: unknown[] }).packages.filter((x): x is string => typeof x === 'string'));
  const pnpm = join(root, 'pnpm-workspace.yaml');
  if (existsSync(pnpm)) {
    for (const m of readFileSync(pnpm, 'utf8').matchAll(/^\s*-\s*['"]?([^'"#\n]+?)['"]?\s*$/gm))
      globs.push(m[1]!.trim());
  }
  const lerna = readJsonSafe(join(root, 'lerna.json'));
  if (Array.isArray(lerna?.packages))
    globs.push(...(lerna.packages as unknown[]).filter((x): x is string => typeof x === 'string'));
  return [...new Set(globs)];
}

/** Shallow walk (≤ 4 levels, ≤ 4000 entries) to learn what a package contains without a full scan. */
function probe(dir: string): {
  ui: boolean;
  logos: number;
  title?: string;
  homepage?: string;
  name?: string;
} {
  let ui = false;
  let logos = 0;
  let seen = 0;
  const walk = (d: string, depth: number, rel: string) => {
    if (depth > 4 || seen > 4000) return;
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e === 'node_modules' || e === 'vendor' || e.startsWith('.') || e === 'dist' || e === 'build')
        continue;
      seen++;
      const full = join(d, e);
      const r = rel ? `${rel}/${e}` : e;
      let st: ReturnType<typeof statSync>;
      try {
        st = lstatSync(full);
        if (st.isSymbolicLink()) continue;
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (UI_HINT.test(`${r}/`)) ui = true;
        walk(full, depth + 1, r);
      } else if (/\.(svg|png|ico|webp)$/i.test(e) && LOGO_HINT.test(r)) logos++;
      else if (/\.(html|vue|svelte|tsx|jsx|blade\.php|astro)$/i.test(e)) ui = true;
    }
  };
  walk(dir, 0, '');
  const pkg = readJsonSafe(join(dir, 'package.json')) ?? readJsonSafe(join(dir, 'composer.json'));
  let title: string | undefined;
  for (const f of ['README.md', 'readme.md', 'README']) {
    if (existsSync(join(dir, f))) {
      const text = readFileSync(join(dir, f), 'utf8').replace(/```[\s\S]*?```/g, '');
      const t = /^#\s+(.+)$/m.exec(text)?.[1]?.trim();
      if (t && t.length >= 3) title = t;
      break;
    }
  }
  return {
    ui,
    logos,
    ...(title ? { title } : {}),
    ...(typeof pkg?.homepage === 'string' ? { homepage: pkg.homepage } : {}),
    ...(typeof pkg?.name === 'string' ? { name: pkg.name } : {}),
  };
}

/**
 * Indexes icon folders shared across the repo (≥ 5 small SVGs in public/, resources/, assets/, static/), keyed by the
 * file name without theme/size suffixes, so "crm-icon-dark.svg" and "crm.svg" both map to "crm".
 */
function sharedIconIndex(root: string): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const visit = (dir: string, rel: string, depth: number) => {
    if (depth > 4) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    const svgs = entries.filter((e) => e.toLowerCase().endsWith('.svg'));
    const small = svgs.filter((e) => {
      try {
        return statSync(join(dir, e)).size < 25_000;
      } catch {
        return false;
      }
    });
    if (small.length >= 5) {
      for (const f of small) {
        const key = f
          .toLowerCase()
          .replace(/\.svg$/, '')
          .replace(/[-_](icon|logo|mark|symbol)?[-_]?(dark|light|mono|color|filled|outline|\d+)$/, '')
          .replace(/[-_](icon|logo|mark|symbol)$/, '');
        index.set(key, [...(index.get(key) ?? []), `${rel}/${f}`]);
      }
    }
    for (const e of entries) {
      if (e.startsWith('.') || e === 'node_modules' || e === 'vendor' || e === 'dist' || e === 'build')
        continue;
      if (isDir(join(dir, e))) visit(join(dir, e), `${rel}/${e}`, depth + 1);
    }
  };
  for (const top of ['public', 'resources', 'assets', 'static'])
    if (isDir(join(root, top))) visit(join(root, top), top, 0);
  return index;
}

/** Exact name match first; otherwise a ≥ 4-letter prefix/suffix match ("market" → "marketplace"), skipping icons that
 * already belong to another package by exact name (so "mailbox" does not take the "mail" app's icons). */
function sharedIconsFor(index: Map<string, string[]>, slug: string, claimed: Set<string>): string[] {
  const exact = index.get(slug);
  if (exact) return exact;
  for (const [key, files] of index) {
    if (claimed.has(key)) continue;
    if (key.length >= 4 && (slug.startsWith(key) || slug.endsWith(key))) return files;
  }
  return [];
}

const prettyName = (dir: string) =>
  basename(dir)
    .split(/[-_]/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');

/**
 * Finds the deployable units of a monorepo (workspace globs plus conventional folders such as products/, apps/,
 * sites/) and classifies which are user-facing and deserve an identity. Read-only and shallow.
 */
export function scanMonorepo(rootInput: string): MonorepoScan {
  const root = resolve(rootInput);
  if (!isDir(root)) throw new MarkiloError('NOT_FOUND', `Not a directory: ${rootInput}`);
  const globs = workspaceGlobs(root);
  const dirs = new Set<string>();
  for (const g of globs) for (const d of expandGlob(root, g)) dirs.add(d);
  for (const group of CONVENTIONAL) {
    if (!isDir(join(root, group))) continue;
    for (const d of readdirSync(join(root, group))) {
      const full = join(root, group, d);
      if (d.startsWith('.') || !isDir(full)) continue;
      if (
        MANIFESTS.some((m) => existsSync(join(full, m))) ||
        isDir(join(full, 'public')) ||
        isDir(join(full, 'src'))
      )
        dirs.add(`${group}/${d}`);
    }
  }
  const iconIndex = sharedIconIndex(root);
  const claimed = new Set([...dirs].map((d) => slugify(basename(d))).filter((k) => iconIndex.has(k)));
  const candidates: PackageCandidate[] = [];
  const usedSlugs = new Set<string>();
  for (const rel of [...dirs].sort()) {
    const group = rel.includes('/') ? rel.slice(0, rel.indexOf('/')) : '.';
    const p = probe(join(root, rel));
    let kind: PackageKind = KIND_BY_GROUP[group] ?? 'unknown';
    if (kind === 'library' && p.ui && p.logos > 0) kind = 'app';
    // Sites and apps are user-facing by convention even when their UI is rendered by a host application.
    const shared = sharedIconsFor(iconIndex, slugify(basename(rel)), claimed);
    const brandable =
      kind === 'site' ||
      kind === 'app' ||
      (kind !== 'library' && kind !== 'service' && (p.ui || p.logos > 0 || shared.length > 0));
    const name = prettyName(rel);
    let slug = slugify(basename(rel));
    if (usedSlugs.has(slug)) slug = slugify(`${group}-${basename(rel)}`);
    usedSlugs.add(slug);
    candidates.push({
      slug,
      name,
      path: portableRelative(root, join(root, rel)),
      group,
      kind,
      brandable,
      reason: brandable
        ? `${kind}${p.ui ? ', has a UI' : kind === 'app' ? ', UI served by the host application' : ''}${p.logos ? `, ${p.logos} logo/icon files` : ''}${shared.length ? `, ${shared.length} existing icons in shared folders` : ''}`
        : `${kind === 'library' ? 'internal library' : kind}${p.ui ? '' : ', no UI found'}`,
      ...(p.title ? { title: p.title } : {}),
      ...(p.homepage ? { homepage: p.homepage } : {}),
      logoFiles: p.logos,
      ...(shared.length ? { sharedIcons: shared } : {}),
    });
  }
  const groups: Record<string, number> = {};
  for (const c of candidates) groups[c.group] = (groups[c.group] ?? 0) + 1;
  return { root: rootInput, isMonorepo: candidates.length >= 2, workspaceGlobs: globs, groups, candidates };
}
