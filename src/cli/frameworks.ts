import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MarkiloError } from '../core/errors.js';
import { portableRelative, resolveInsideReal } from '../core/paths.js';
import type { Workspace } from '../core/workspace.js';
import { pngSize } from '../render/png.js';
import { renderPng } from '../render/resvg.js';
import {
  findAndroidRoot,
  fitWrapper,
  matchAndroid,
  mimeOf,
  readAndroidProject,
  type UnmatchedResource,
} from './android.js';
import { applyInstall, checkPlanId, type InstallAction, installAction, installPlanId } from './install.js';

/**
 * Installs exported assets where each framework expects them (Next.js metadata files, Laravel's public/, Flutter's
 * Android, iOS and web folders, an Android project's own resource names and densities). Always a plan first; files are written only with apply, never overwritten without
 * force, as one transaction with backups and a journal (see install.ts).
 */

export const FRAMEWORKS = ['next', 'laravel', 'flutter', 'android', 'static'] as const;
export type Framework = (typeof FRAMEWORKS)[number];

export interface InstallStep {
  from: string;
  to: string;
  action: InstallAction | 'missing-export';
  /** Android: the pixel size the file has in the project (from its density and the file it replaces). */
  size?: string;
}

export interface FrameworkPlan {
  framework: Framework;
  detectedBy: string;
  steps: InstallStep[];
  /** Code to add by hand (head tags, metadata), shown, never written into the user's source files. */
  snippet?: string;
  notes: string[];
  /** Android: project drawables with no exported counterpart, with their current pixel size (map them with --map). */
  unmatched?: UnmatchedResource[];
  /** Pass back with --expect so the apply refuses if the project changed after this plan. */
  planId: string;
  applied: boolean;
  backup?: string;
  journal?: string;
}

const readJsonSafe = (p: string): Record<string, unknown> | undefined => {
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
};

/** Which framework a project uses, from its manifest files. */
export function detectFramework(project: string): { framework: Framework; by: string } {
  if (existsSync(join(project, 'pubspec.yaml'))) return { framework: 'flutter', by: 'pubspec.yaml' };
  const composer = readJsonSafe(join(project, 'composer.json'));
  if (composer && JSON.stringify(composer.require ?? {}).includes('laravel/framework'))
    return { framework: 'laravel', by: 'composer.json (laravel/framework)' };
  const pkg = readJsonSafe(join(project, 'package.json'));
  const deps = { ...(pkg?.dependencies as object), ...(pkg?.devDependencies as object) } as Record<
    string,
    string
  >;
  if (deps.next) return { framework: 'next', by: 'package.json (next)' };
  const android = findAndroidRoot(project);
  if (android)
    return {
      framework: 'android',
      by: android.manifest ? android.manifest : `${android.res} (no AndroidManifest.xml)`,
    };
  return { framework: 'static', by: pkg ? 'package.json (no known framework)' : 'no manifest found' };
}

/** Every file below an export folder, as [export-relative path] pairs. */
function filesUnder(exportsDir: string, folder: string): string[] {
  const root = join(exportsDir, folder);
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const full = join(d, f);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(portableRelative(exportsDir, full));
    }
  };
  walk(root);
  return out;
}

function mapping(framework: Framework, exportsDir: string, project: string, into?: string) {
  const map: [string, string][] = [];
  const notes: string[] = [];
  let snippet: string | undefined;
  const webIcons = [
    'icon-192.png',
    'icon-384.png',
    'icon-512.png',
    'icon-maskable-192.png',
    'icon-maskable-512.png',
  ];
  const headSnippet = () => {
    const p = join(exportsDir, 'web', 'head-snippet.html');
    return existsSync(p) ? readFileSync(p, 'utf8') : undefined;
  };
  if (framework === 'next') {
    const app = existsSync(join(project, 'src', 'app'))
      ? 'src/app'
      : existsSync(join(project, 'app'))
        ? 'app'
        : undefined;
    if (app) {
      // App Router metadata files: Next.js writes the <head> tags itself.
      map.push(
        ['web/favicon.ico', `${app}/favicon.ico`],
        ['web/favicon.svg', `${app}/icon.svg`],
        ['web/apple-touch-icon.png', `${app}/apple-icon.png`],
        ['social/og-image.png', `${app}/opengraph-image.png`],
        ['web/site.webmanifest', `${app}/manifest.webmanifest`],
      );
      for (const f of webIcons) map.push([`web/${f}`, `public/${f}`]);
      notes.push(
        `App Router (${app}/): Next.js adds the icon, apple-icon, Open Graph and manifest tags itself; remove older favicon files from public/ and any metadata.icons override in layout so they do not compete.`,
      );
    } else {
      for (const f of filesUnder(exportsDir, 'web'))
        if (!f.endsWith('.html')) map.push([f, `public/${f.slice(4)}`]);
      map.push(['social/og-image.png', 'public/og-image.png']);
      snippet = headSnippet();
      notes.push('Pages Router: add the snippet to pages/_document (inside <Head>).');
    }
  } else if (framework === 'laravel') {
    for (const f of filesUnder(exportsDir, 'web'))
      if (!f.endsWith('.html')) map.push([f, `public/${f.slice(4)}`]);
    map.push(['social/og-image.png', 'public/og-image.png']);
    const head = headSnippet();
    if (head)
      snippet = head
        .replace(/<!--[\s\S]*?-->\n?/, '')
        .replace(/(href|content)="\/([^"]+)"/g, (_m, attr, path) => `${attr}="{{ asset('${path}') }}"`);
    notes.push(
      'Add the snippet to the <head> of your main Blade layout (e.g. resources/views/layouts/app.blade.php).',
    );
  } else if (framework === 'flutter') {
    for (const f of filesUnder(exportsDir, 'android/res'))
      map.push([f, `android/app/src/main/res/${f.slice('android/res/'.length)}`]);
    for (const f of filesUnder(exportsDir, 'ios/AppIcon.appiconset'))
      map.push([
        f,
        `ios/Runner/Assets.xcassets/AppIcon.appiconset/${f.slice('ios/AppIcon.appiconset/'.length)}`,
      ]);
    map.push(
      ['web/favicon-32.png', 'web/favicon.png'],
      ['web/icon-192.png', 'web/icons/Icon-192.png'],
      ['web/icon-512.png', 'web/icons/Icon-512.png'],
      ['web/icon-maskable-192.png', 'web/icons/Icon-maskable-192.png'],
      ['web/icon-maskable-512.png', 'web/icons/Icon-maskable-512.png'],
    );
    notes.push(
      'Android keeps android:icon="@mipmap/ic_launcher" in AndroidManifest.xml; the adaptive icon (mipmap-anydpi-v26) and its background color (values/ic_launcher_colors.xml) are included.',
      "iOS: the AppIcon set's Contents.json is replaced, so old placeholder images it no longer lists can be deleted in Xcode.",
      'Web keeps its manifest.json; only the icon files it already references are replaced.',
    );
    if (
      !filesUnder(exportsDir, 'android/res').length ||
      !filesUnder(exportsDir, 'ios/AppIcon.appiconset').length
    )
      notes.push(
        'Mobile icons are missing from the export: run `markilo deliverables --add ios,android` and `markilo export` first.',
      );
  } else {
    const dest = into ?? 'public';
    for (const f of filesUnder(exportsDir, 'web'))
      if (!f.endsWith('.html')) map.push([f, `${dest}/${f.slice(4)}`]);
    map.push(['social/og-image.png', `${dest}/og-image.png`]);
    snippet = headSnippet();
    notes.push(`Copy the snippet into your HTML <head>; files go to ${dest}/ (served at the site root).`);
  }
  return { map, notes, snippet };
}

export async function planFrameworkInstall(
  ws: Workspace,
  brand: string,
  project: string,
  opts: {
    framework?: Framework;
    into?: string;
    apply?: boolean;
    force?: boolean;
    expect?: string;
    /** Android: project drawable name → export path to render at that file's size. */
    map?: Record<string, string>;
  } = {},
): Promise<FrameworkPlan> {
  const exportsDir = ws.exportsDir(brand);
  if (!existsSync(exportsDir))
    throw new MarkiloError(
      'NOT_FOUND',
      `No exports for ${brand}.`,
      `Run "markilo export --brand ${brand}" first.`,
    );
  const detected = opts.framework ? { framework: opts.framework, by: 'chosen' } : detectFramework(project);
  if (detected.framework === 'android') {
    const scratch = mkdtempSync(join(tmpdir(), 'markilo-android-'));
    try {
      return await planAndroid(ws, exportsDir, project, detected.by, scratch, opts);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  const { map, notes, snippet } = mapping(detected.framework, exportsDir, project, opts.into);
  const steps: InstallStep[] = map.map(([from, to]) => {
    const source = join(exportsDir, from);
    const action: InstallStep['action'] = !existsSync(source)
      ? 'missing-export'
      : installAction(project, { source, to }, !!opts.force);
    return { from, to, action };
  });
  const plan: FrameworkPlan = {
    framework: detected.framework,
    detectedBy: detected.by,
    steps,
    ...(snippet ? { snippet } : {}),
    notes,
    planId: installPlanId(project, steps),
    applied: false,
  };
  return finishPlan(plan, project, opts, (s) => join(exportsDir, s.from));
}

/** Adds the shared notes, and with --apply writes the planned files as one transaction. */
function finishPlan(
  plan: FrameworkPlan,
  project: string,
  opts: { apply?: boolean; expect?: string },
  sourceOf: (s: InstallStep) => string,
): FrameworkPlan {
  const { steps, notes } = plan;
  if (steps.some((s) => s.action === 'skip-existing'))
    notes.push('Existing files are kept. Re-run with --force to replace them (they are backed up first).');
  if (!opts.apply) return plan;

  checkPlanId(project, steps, opts.expect);
  const writes = steps
    .filter((s) => s.action === 'create' || s.action === 'overwrite')
    .map((s) => ({ source: sourceOf(s), to: s.to }));
  const r = applyInstall(project, writes);
  plan.applied = true;
  plan.journal = r.journal;
  if (r.backup) {
    plan.backup = r.backup;
    notes.push(`Replaced files were backed up to ${r.backup}/ (add .markilo-backup/ to .gitignore).`);
  }
  notes.push('Undo this installation with `markilo install-assets --undo --apply`.');
  return plan;
}

/**
 * Android: every file keeps the name, folder and pixel size it has in the project. Files that match an exported file
 * (the manifest's icon, roundIcon and banner, and ic_launcher*) are replaced; everything else is listed as unmatched.
 */
async function planAndroid(
  _ws: Workspace,
  exportsDir: string,
  project: string,
  detectedBy: string,
  scratch: string,
  opts: { apply?: boolean; force?: boolean; expect?: string; map?: Record<string, string> },
): Promise<FrameworkPlan> {
  const profile = readAndroidProject(project);
  const sizes = new Map<string, { width: number; height: number } | undefined>();
  const exportSize = (rel: string) => {
    if (!sizes.has(rel)) {
      let size: { width: number; height: number } | undefined;
      try {
        const b = readFileSync(join(exportsDir, rel));
        if (rel.endsWith('.png')) size = pngSize(b);
      } catch {
        /* not there: no size */
      }
      sizes.set(rel, size);
    }
    return sizes.get(rel);
  };
  for (const rel of Object.values(opts.map ?? {})) resolveInsideReal(exportsDir, rel);
  const maps = opts.map ?? {};
  for (const [name, rel] of Object.entries(maps))
    if (!existsSync(join(exportsDir, rel)))
      throw new MarkiloError(
        'NOT_FOUND',
        `--map ${name}: no exported file ${rel}.`,
        'Use a path inside the exports folder, e.g. logos/primary/primary-color.svg.',
      );
  const m = matchAndroid(profile, exportsDir, maps, exportSize);
  const notes = [...m.notes];
  const sources = new Map<string, string>();
  const steps: InstallStep[] = [];
  let n = 0;
  for (const w of m.work) {
    const src = join(exportsDir, w.from);
    let source = src;
    if (!existsSync(src)) {
      steps.push({ from: w.from, to: w.to, action: 'missing-export', size: `${w.width}×${w.height}` });
      continue;
    }
    if (!w.exact) {
      const mime = mimeOf(src);
      if (!mime) throw new MarkiloError('INVALID_INPUT', `${w.from} is not a PNG, JPEG or SVG image.`);
      const svg = fitWrapper(readFileSync(src), mime, w.width, w.height);
      mkdirSync(scratch, { recursive: true });
      source = join(scratch, `${n++}.png`);
      writeFileSync(source, await renderPng(svg, { width: w.width, height: w.height }));
    }
    const action = installAction(project, { source, to: w.to }, !!opts.force);
    sources.set(w.to, source);
    steps.push({ from: w.from, to: w.to, action, size: `${w.width}×${w.height}` });
  }
  if (!profile.resDir)
    notes.push('No res/ folder found (looked in app/src/main, src/main and the project root).');
  else if (!m.work.length && !m.unmatched.length)
    notes.push(`${profile.resDir}/ has no mipmap-*dpi or drawable-*dpi image files to replace.`);
  if (!profile.manifest)
    notes.push('No AndroidManifest.xml found: only ic_launcher* files are matched by name.');
  for (const [name, attr] of Object.entries(profile.references))
    if (!profile.resources.some((r) => r.name === name))
      notes.push(
        `AndroidManifest.xml references ${name} (android:${attr}), but no ${name} image exists in ${profile.resDir ?? 'res'}/; nothing was planned for it.`,
      );
  notes.push(
    'Only files the project already has are replaced, in the density folders it already has; names and pixel sizes stay as they are. The adaptive icon XML (mipmap-anydpi-v26) and your manifest are not touched.',
  );
  if (m.unmatched.length)
    notes.push(
      'Unmatched images keep their current look. To refresh one, run again with --map <name>=<export path> (e.g. --map brand_lockup_wide=logos/primary/primary-color.svg): that export is rendered at the size of each file with that name.',
    );
  const plan: FrameworkPlan = {
    framework: 'android',
    detectedBy,
    steps,
    notes,
    ...(m.unmatched.length ? { unmatched: m.unmatched } : {}),
    planId: installPlanId(project, steps),
    applied: false,
  };
  return finishPlan(plan, project, opts, (s) => sources.get(s.to) ?? join(exportsDir, s.from));
}
