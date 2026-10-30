import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { normalizeColor } from '../analyze/color.js';
import { MarkiloError } from '../core/errors.js';
import { isDir, isFile } from '../core/fsx.js';
import { portableRelative } from '../core/paths.js';

export interface RepoScan {
  root: string;
  scannedFiles: number;
  skippedSensitive: number;
  project: { name?: string; description?: string; keywords?: string[]; homepage?: string };
  readme?: { title?: string; summary?: string; path: string };
  frameworks: string[];
  logos: { path: string; kind: string; bytes: number }[];
  manifests: { path: string; name?: string; themeColor?: string; backgroundColor?: string; icons: number }[];
  colors: { hex: string; count: number; files: number }[];
  fonts: { family: string; source: string }[];
  html: { path: string; title?: string; description?: string; themeColor?: string }[];
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.output',
  '.svelte-kit',
  'coverage',
  'vendor',
  'Pods',
  'DerivedData',
  '.gradle',
  '.idea',
  '.vscode',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  '.turbo',
  '.cache',
  '.parcel-cache',
  'tmp',
  'brand',
  'markilo-workspace',
]);
/** Files that may hold secrets are never opened. */
const SENSITIVE =
  /(^\.env(\..*)?$)|(\.(pem|key|p12|pfx|keystore|jks|mobileprovision)$)|(^id_[rd]sa)|(credentials?)|(secrets?\.)|(\.npmrc$)|(\.netrc$)/i;
const STYLE_EXT = new Set(['.css', '.scss', '.sass', '.less', '.styl', '.pcss']);
const CODE_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.astro',
  '.json',
  '.swift',
  '.kt',
  '.xml',
  '.dart',
]);
const IMG_EXT = new Set(['.svg', '.png', '.ico', '.jpg', '.jpeg', '.webp', '.icns']);
const LOGO_NAME =
  /(logo|brand|wordmark|logomark|favicon|apple-touch|app-?icon|ic_launcher|mark|icon-\d+|android-chrome|mstile|safari-pinned)/i;
const MAX_FILES = 6000;
const MAX_BYTES = 1_500_000;

function* walkFiles(root: string, depth = 0): Generator<string> {
  if (depth > 7) return;
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const name of entries.sort()) {
    const full = join(root, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name) || (name.startsWith('.') && name !== '.github')) continue;
      yield* walkFiles(full, depth + 1);
    } else if (st.isFile()) yield full;
  }
}

const firstMatch = (re: RegExp, s: string) => re.exec(s)?.[1]?.trim();

function readmeSummary(text: string): { title?: string; summary?: string } {
  const title = firstMatch(/^#\s+(.+)$/m, text);
  const paras = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p && !p.startsWith('#') && !p.startsWith('[![') && !/^!\[/.test(p) && p.length > 40);
  const summary = paras.slice(0, 2).join(' ').slice(0, 700);
  return { ...(title ? { title } : {}), ...(summary ? { summary } : {}) };
}

export function extractCssSignals(css: string): { colors: string[]; fonts: string[] } {
  const colors: string[] = [];
  for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)) {
    const c = normalizeColor(m[0]);
    if (c) colors.push(c);
  }
  const fonts: string[] = [];
  for (const m of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const first = m[1]!
      .split(',')[0]!
      .trim()
      .replace(/^['"]|['"]$/g, '');
    if (first && !/^(var\(|inherit|initial|sans-serif|serif|monospace|system-ui|-apple-system)/i.test(first))
      fonts.push(first);
  }
  for (const m of css.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"')&\s]+)/g)) {
    for (const fam of m[1]!.split('&family='))
      fonts.push(decodeURIComponent(fam.split(':')[0]!).replace(/\+/g, ' '));
  }
  return { colors, fonts };
}

export function extractHtmlSignals(html: string) {
  const meta = (name: string) =>
    firstMatch(
      new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'),
      html,
    ) ??
    firstMatch(
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i'),
      html,
    );
  return {
    title: firstMatch(/<title[^>]*>([^<]*)<\/title>/i, html),
    description: meta('description') ?? meta('og:description'),
    themeColor: meta('theme-color'),
    siteName: meta('og:site_name'),
    ogImage: meta('og:image'),
  };
}

/** Scans a local repository for product and identity signals. Read-only; never opens secret-like files. */
export function scanRepo(rootInput: string): RepoScan {
  const root = resolve(rootInput);
  if (!isDir(root)) throw new MarkiloError('NOT_FOUND', `Not a directory: ${rootInput}`);
  const scan: RepoScan = {
    root: rootInput,
    scannedFiles: 0,
    skippedSensitive: 0,
    project: {},
    frameworks: [],
    logos: [],
    manifests: [],
    colors: [],
    fonts: [],
    html: [],
  };
  const colorCount = new Map<string, { count: number; files: Set<string> }>();
  const fonts = new Map<string, string>();
  const frameworks = new Set<string>();

  for (const file of walkFiles(root)) {
    if (scan.scannedFiles >= MAX_FILES) break;
    const name = basename(file);
    const rel = portableRelative(root, file);
    if (SENSITIVE.test(name)) {
      scan.skippedSensitive++;
      continue;
    }
    scan.scannedFiles++;
    const ext = extname(name).toLowerCase();
    let size = 0;
    try {
      size = statSync(file).size;
    } catch {
      continue;
    }

    if (IMG_EXT.has(ext) && (LOGO_NAME.test(rel) || /appiconset|mipmap-|imageset/i.test(rel))) {
      scan.logos.push({ path: rel, kind: ext.slice(1), bytes: size });
    }
    if (size > MAX_BYTES) continue;

    if (name === 'package.json' && !rel.includes('/')) {
      try {
        const pkg = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
        scan.project = {
          ...(typeof pkg.name === 'string' ? { name: pkg.name } : {}),
          ...(typeof pkg.description === 'string' ? { description: pkg.description } : {}),
          ...(Array.isArray(pkg.keywords)
            ? { keywords: pkg.keywords.filter((k): k is string => typeof k === 'string') }
            : {}),
          ...(typeof pkg.homepage === 'string' ? { homepage: pkg.homepage } : {}),
        };
        const deps = { ...(pkg.dependencies as object), ...(pkg.devDependencies as object) } as Record<
          string,
          string
        >;
        for (const d of Object.keys(deps)) {
          if (d.startsWith('@fontsource'))
            fonts.set(d.replace(/^@fontsource(-variable)?\//, ''), 'package.json');
          for (const [fw, re] of [
            ['React', /^react$/],
            ['Next.js', /^next$/],
            ['Vue', /^vue$/],
            ['Svelte', /^svelte$/],
            ['Angular', /^@angular\/core$/],
            ['Tailwind CSS', /^tailwindcss$/],
            ['Astro', /^astro$/],
            ['React Native', /^react-native$/],
            ['Electron', /^electron$/],
            ['Expo', /^expo$/],
            ['Remix', /^@remix-run\//],
            ['Nuxt', /^nuxt$/],
          ] as const)
            if (re.test(d)) frameworks.add(fw);
        }
      } catch {
        // Malformed package.json is reported by its own tooling; ignore here.
      }
    } else if (/^readme(\.md|\.markdown)?$/i.test(name) && !scan.readme && rel.split('/').length <= 2) {
      scan.readme = { path: rel, ...readmeSummary(readFileSync(file, 'utf8')) };
    } else if (
      /^(site\.webmanifest|manifest\.(webmanifest|json))$/i.test(name) &&
      !rel.includes('node_modules')
    ) {
      try {
        const m = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
        if (m.icons || m.theme_color || m.short_name) {
          scan.manifests.push({
            path: rel,
            ...(typeof m.name === 'string' ? { name: m.name } : {}),
            ...(typeof m.theme_color === 'string' ? { themeColor: m.theme_color } : {}),
            ...(typeof m.background_color === 'string' ? { backgroundColor: m.background_color } : {}),
            icons: Array.isArray(m.icons) ? m.icons.length : 0,
          });
        }
      } catch {
        // Not JSON; skip.
      }
    }

    if (STYLE_EXT.has(ext) || CODE_EXT.has(ext) || ext === '.html' || ext === '.htm') {
      let text: string;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const isStyleLike =
        STYLE_EXT.has(ext) ||
        /tailwind\.config|theme|tokens|colors?\./i.test(name) ||
        ext === '.html' ||
        ext === '.vue' ||
        ext === '.svelte' ||
        ext === '.astro';
      if (isStyleLike) {
        const sig = extractCssSignals(text);
        for (const c of sig.colors) {
          const e = colorCount.get(c) ?? { count: 0, files: new Set<string>() };
          e.count++;
          e.files.add(rel);
          colorCount.set(c, e);
        }
        for (const f of sig.fonts) if (!fonts.has(f)) fonts.set(f, rel);
      }
      for (const m of text.matchAll(/from\s+['"]next\/font\/google['"]/g)) {
        void m;
        for (const f of text.matchAll(/import\s*\{([^}]+)\}\s*from\s+['"]next\/font\/google['"]/g))
          for (const fam of f[1]!.split(',')) fonts.set(fam.trim().replace(/_/g, ' '), rel);
      }
      if (ext === '.html' || ext === '.htm') {
        const h = extractHtmlSignals(text);
        if (h.title || h.description || h.themeColor)
          scan.html.push({
            path: rel,
            ...(h.title ? { title: h.title } : {}),
            ...(h.description ? { description: h.description } : {}),
            ...(h.themeColor ? { themeColor: h.themeColor } : {}),
          });
      }
    }
  }

  scan.colors = [...colorCount.entries()]
    .map(([hex, e]) => ({ hex, count: e.count, files: e.files.size }))
    .filter((c) => c.hex !== '#ffffff' && c.hex !== '#000000')
    .sort((a, b) => b.files - a.files || b.count - a.count)
    .slice(0, 16);
  scan.fonts = [...fonts.entries()].map(([family, source]) => ({ family, source })).slice(0, 12);
  scan.frameworks = [...frameworks];
  scan.logos = scan.logos.slice(0, 60);
  scan.html = scan.html.slice(0, 10);
  return scan;
}

export function isReadableImage(path: string): boolean {
  return isFile(path) && ['.svg', '.png', '.jpg', '.jpeg'].includes(extname(path).toLowerCase());
}
