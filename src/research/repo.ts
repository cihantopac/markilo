import { lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { normalizeColor } from '../analyze/color.js';
import { MarkiloError } from '../core/errors.js';
import { isDir, isFile } from '../core/fsx.js';
import { portableRelative } from '../core/paths.js';
import {
  emptyUnderstanding,
  finishUnderstanding,
  fromDependencies,
  fromReadme,
  laravelRoutes,
  localeOf,
  type ProductUnderstanding,
  surfaceOf,
} from './product.js';

export interface RepoScan {
  root: string;
  scannedFiles: number;
  /** True when the file budget ran out before the whole tree was walked. */
  truncated: boolean;
  skippedSensitive: number;
  logoCount: number;
  project: { name?: string; description?: string; keywords?: string[]; homepage?: string };
  readme?: { title?: string; summary?: string; path: string };
  frameworks: string[];
  logos: { path: string; kind: string; bytes: number }[];
  manifests: { path: string; name?: string; themeColor?: string; backgroundColor?: string; icons: number }[];
  colors: { hex: string; count: number; files: number }[];
  fonts: { family: string; source: string }[];
  html: { path: string; title?: string; description?: string; themeColor?: string }[];
  /** Folders holding a set of small SVG icons (app icon families, icon libraries). */
  iconSets: { dir: string; count: number; examples: string[] }[];
  /** Design-system / brand documentation found in the tree, with the colors they mention. */
  designDocs: { path: string; title?: string; colors: string[] }[];
  /** What the product does, for whom and where it runs, with sources; unknowns listed, never guessed. */
  product: ProductUnderstanding;
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
  '__screenshots__',
  '__snapshots__',
  'storage',
  '.turbo',
  '.cache',
  '.parcel-cache',
  'tmp',
  'brand',
  'markilo-workspace',
]);
/** Files that may hold secrets are never opened. */
const SENSITIVE =
  /(^\.env(\..*)?$)|(\.(pem|key|p8|p12|pfx|keystore|jks|mobileprovision|kdbx|ppk|asc|gpg|tfvars|tfstate)$)|(^id_(rsa|dsa|ecdsa|ed25519))|(credentials?)|(secrets?[._-])|(\.npmrc$)|(\.netrc$)|(\.pypirc$)|(\.git-credentials$)|(^service-account.*\.json$)|(^google-services\.json$)|(^GoogleService-Info\.plist$)|(^\.htpasswd$)|(\.sqlite3?$)|(\.db$)/i;

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
  /(logo|brand|wordmark|logomark|favicon|apple-touch|app-?icon|ic_launcher|mark|icon-\d+|android-chrome|mstile|safari-pinned|(^|[-_./])icon([-_.]|$))/i;
const ICON_DIR = /(^|\/)(icons?|logos?|brand|branding|brands|app-?icons)(\/|$)/i;
const DESIGN_DOC =
  /(design-?system|brand|style-?guide|identity|visual-language|tokens|colou?rs?|typography)/i;
export const DEFAULT_MAX_FILES = 25_000;
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
      // lstat: symbolic links are never followed (no escaping the tree, no loops).
      st = lstatSync(full);
      if (st.isSymbolicLink()) continue;
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
export function scanRepo(rootInput: string, opts: { maxFiles?: number } = {}): RepoScan {
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;
  const root = resolve(rootInput);
  if (!isDir(root)) throw new MarkiloError('NOT_FOUND', `Not a directory: ${rootInput}`);
  const scan: RepoScan = {
    root: rootInput,
    scannedFiles: 0,
    truncated: false,
    skippedSensitive: 0,
    logoCount: 0,
    project: {},
    frameworks: [],
    logos: [],
    manifests: [],
    colors: [],
    fonts: [],
    html: [],
    iconSets: [],
    designDocs: [],
    product: emptyUnderstanding(),
  };
  const u = scan.product;
  const deps: { name: string; source: string }[] = [];
  const platforms = new Map<string, string>();
  const locales = new Map<string, string>();
  const svgDirs = new Map<string, { count: number; small: number; examples: string[] }>();
  const colorCount = new Map<string, { count: number; files: Set<string> }>();
  const fonts = new Map<string, string>();
  const frameworks = new Set<string>();

  for (const file of walkFiles(root)) {
    if (scan.scannedFiles >= maxFiles) {
      scan.truncated = true;
      break;
    }
    const name = basename(file);
    const rel = portableRelative(root, file);
    if (SENSITIVE.test(name)) {
      scan.skippedSensitive++;
      continue;
    }
    scan.scannedFiles++;
    const ext = extname(name).toLowerCase();
    const surface = surfaceOf(rel);
    if (surface) u.surfaces.push({ text: surface, source: rel, basis: 'stated' });
    const loc = localeOf(rel);
    if (loc && !locales.has(loc)) locales.set(loc, rel);
    if (/(^|\/)ios\/Runner\/|\.xcodeproj\//.test(rel)) platforms.set('iOS', platforms.get('iOS') ?? rel);
    if (/(^|\/)android\/app\//.test(rel)) platforms.set('Android', platforms.get('Android') ?? rel);
    if (/(^|\/)(web\/index\.html|index\.html|public\/index\.html)$/.test(rel))
      platforms.set('web', platforms.get('web') ?? rel);
    let size = 0;
    try {
      size = statSync(file).size;
    } catch {
      continue;
    }

    if (
      IMG_EXT.has(ext) &&
      (LOGO_NAME.test(rel) || ICON_DIR.test(rel) || /appiconset|mipmap-|imageset/i.test(rel))
    ) {
      scan.logoCount++;
      if (scan.logos.length < 60) scan.logos.push({ path: rel, kind: ext.slice(1), bytes: size });
    }
    if (ext === '.svg') {
      const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '.';
      const e = svgDirs.get(dir) ?? { count: 0, small: 0, examples: [] };
      e.count++;
      if (size < 25_000) e.small++;
      if (e.examples.length < 6) e.examples.push(name);
      svgDirs.set(dir, e);
    }
    if (
      (ext === '.md' || ext === '.mdx') &&
      DESIGN_DOC.test(rel) &&
      scan.designDocs.length < 40 &&
      size <= MAX_BYTES
    ) {
      try {
        const text = readFileSync(file, 'utf8');
        const colors = [...new Set(extractCssSignals(text).colors)].slice(0, 12);
        const title = firstMatch(/^#\s+(.+)$/m, text);
        scan.designDocs.push({ path: rel, ...(title ? { title } : {}), colors });
      } catch {
        // Unreadable doc; skip.
      }
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
        const allDeps = { ...(pkg.dependencies as object), ...(pkg.devDependencies as object) } as Record<
          string,
          string
        >;
        for (const d of Object.keys(pkg.dependencies ?? {})) deps.push({ name: d, source: rel });
        if (pkg.bin) platforms.set('command line', rel);
        for (const d of Object.keys(allDeps)) {
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
    } else if (name === 'package.json' && rel.split('/').length <= 4) {
      // Packages of a monorepo: their dependencies say what the product family does and where it runs.
      try {
        const pkg = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
        for (const d of Object.keys((pkg.dependencies as object) ?? {})) {
          deps.push({ name: d, source: rel });
          if (d === 'next') frameworks.add('Next.js');
          if (d === 'react-native') frameworks.add('React Native');
          if (d === 'electron') frameworks.add('Electron');
        }
      } catch {
        // Malformed package.json; skip.
      }
    } else if (/^readme(\.md|\.markdown)?$/i.test(name) && !scan.readme && rel.split('/').length <= 2) {
      const text = readFileSync(file, 'utf8');
      scan.readme = { path: rel, ...readmeSummary(text) };
      fromReadme(text, rel, u);
    } else if (name === 'pubspec.yaml' && !rel.includes('/')) {
      const text = readFileSync(file, 'utf8');
      const desc = /^description:\s*(.+)$/m.exec(text)?.[1]?.replace(/^['"]|['"]$/g, '');
      if (desc && !scan.project.description) scan.project.description = desc;
      const block = /^dependencies:\n((?:[ \t]+.*\n?)+)/m.exec(text)?.[1] ?? '';
      for (const m of block.matchAll(/^[ \t]{2}([a-z0-9_]+):/gm)) deps.push({ name: m[1]!, source: rel });
      platforms.set('iOS', platforms.get('iOS') ?? rel);
      platforms.set('Android', platforms.get('Android') ?? rel);
      frameworks.add('Flutter');
    } else if (name === 'composer.json' && !rel.includes('/')) {
      try {
        const c = JSON.parse(readFileSync(file, 'utf8')) as {
          description?: string;
          require?: Record<string, string>;
        };
        if (c.description && !scan.project.description) scan.project.description = c.description;
        for (const d of Object.keys(c.require ?? {})) {
          deps.push({ name: d, source: rel });
          if (d === 'laravel/framework') frameworks.add('Laravel');
        }
        platforms.set('web', platforms.get('web') ?? rel);
      } catch {
        // Malformed composer.json; skip.
      }
    } else if (name === 'web.php' && /(^|\/)routes\/web\.php$/.test(rel)) {
      for (const r of laravelRoutes(readFileSync(file, 'utf8')))
        u.surfaces.push({ text: r, source: rel, basis: 'stated' });
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
  scan.iconSets = [...svgDirs.entries()]
    .filter(([, e]) => e.count >= 5 && e.small >= e.count * 0.8)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([dir, e]) => ({ dir, count: e.count, examples: e.examples }));
  scan.html = scan.html.slice(0, 10);
  if (!u.valueProposition && scan.project.description)
    u.valueProposition = { text: scan.project.description, source: 'package manifest', basis: 'stated' };
  for (const fw of scan.frameworks) {
    if (/Next\.js|Nuxt|Astro|Remix|Svelte|Vue|Angular|React$/.test(fw))
      platforms.set('web', platforms.get('web') ?? 'package.json');
    if (/Electron/.test(fw)) platforms.set('desktop', 'package.json');
    if (/React Native|Expo/.test(fw)) {
      platforms.set('iOS', platforms.get('iOS') ?? 'package.json');
      platforms.set('Android', platforms.get('Android') ?? 'package.json');
    }
  }
  if (scan.manifests.length) platforms.set('installable web app (PWA)', scan.manifests[0]!.path);
  for (const [text, source] of platforms) u.platforms.push({ text, source, basis: 'stated' });
  for (const [text, source] of locales) u.languages.push({ text, source, basis: 'stated' });
  for (const d of deps) fromDependencies([d.name], d.source, u);
  finishUnderstanding(u);
  return scan;
}

export function isReadableImage(path: string): boolean {
  return isFile(path) && ['.svg', '.png', '.jpg', '.jpeg'].includes(extname(path).toLowerCase());
}

/** Token-friendly digest of a scan; the full scan is written to the workspace cache. */
export function summarizeScan(scan: RepoScan) {
  return {
    root: scan.root,
    scannedFiles: scan.scannedFiles,
    ...(scan.truncated ? { truncated: true } : {}),
    project: scan.project.name || scan.project.description ? scan.project : undefined,
    readme: scan.readme?.title,
    frameworks: scan.frameworks,
    logos: { count: scan.logoCount, examples: scan.logos.slice(0, 6).map((l) => l.path) },
    iconSets: scan.iconSets.slice(0, 5).map((s) => `${s.dir} (${s.count})`),
    designDocs: scan.designDocs.slice(0, 8).map((d) => d.path),
    colors: scan.colors.slice(0, 6).map((c) => c.hex),
    fonts: scan.fonts.slice(0, 6).map((f) => f.family),
    product: scan.product,
  };
}
