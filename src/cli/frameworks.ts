import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { MarkiloError } from '../core/errors.js';
import { nowIso } from '../core/fsx.js';
import { portableRelative, resolveInsideReal } from '../core/paths.js';
import type { Workspace } from '../core/workspace.js';

/**
 * Installs exported assets where each framework expects them (Next.js metadata files, Laravel's public/, Flutter's
 * Android, iOS and web folders). Always a plan first; files are written only with apply, never overwritten without
 * force, and overwritten files are backed up under .markilo-backup/ first.
 */

export const FRAMEWORKS = ['next', 'laravel', 'flutter', 'static'] as const;
export type Framework = (typeof FRAMEWORKS)[number];

export interface InstallStep {
  from: string;
  to: string;
  action: 'create' | 'overwrite' | 'skip-existing' | 'missing-export';
}

export interface FrameworkPlan {
  framework: Framework;
  detectedBy: string;
  steps: InstallStep[];
  /** Code to add by hand (head tags, metadata), shown, never written into the user's source files. */
  snippet?: string;
  notes: string[];
  applied: boolean;
  backup?: string;
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

export function planFrameworkInstall(
  ws: Workspace,
  brand: string,
  project: string,
  opts: { framework?: Framework; into?: string; apply?: boolean; force?: boolean } = {},
): FrameworkPlan {
  const exportsDir = ws.exportsDir(brand);
  if (!existsSync(exportsDir))
    throw new MarkiloError(
      'NOT_FOUND',
      `No exports for ${brand}.`,
      `Run "markilo export --brand ${brand}" first.`,
    );
  const detected = opts.framework ? { framework: opts.framework, by: 'chosen' } : detectFramework(project);
  const { map, notes, snippet } = mapping(detected.framework, exportsDir, project, opts.into);
  const steps: InstallStep[] = map.map(([from, to]) => {
    const target = resolveInsideReal(project, to);
    const action: InstallStep['action'] = !existsSync(join(exportsDir, from))
      ? 'missing-export'
      : existsSync(target)
        ? opts.force
          ? 'overwrite'
          : 'skip-existing'
        : 'create';
    return { from, to, action };
  });
  const plan: FrameworkPlan = {
    framework: detected.framework,
    detectedBy: detected.by,
    steps,
    ...(snippet ? { snippet } : {}),
    notes,
    applied: false,
  };
  if (steps.some((s) => s.action === 'skip-existing'))
    notes.push('Existing files are kept. Re-run with --force to replace them (they are backed up first).');
  if (!opts.apply) return plan;

  const stamp = nowIso().replace(/[:.]/g, '-');
  const backupRoot = join(project, '.markilo-backup', stamp);
  for (const s of steps) {
    if (s.action !== 'create' && s.action !== 'overwrite') continue;
    const target = resolveInsideReal(project, s.to);
    if (existsSync(target)) {
      if (lstatSync(target).isSymbolicLink())
        throw new MarkiloError('UNSAFE_PATH', `Refusing to overwrite a symbolic link: ${s.to}`);
      const backup = join(backupRoot, s.to);
      mkdirSync(dirname(backup), { recursive: true });
      copyFileSync(target, backup);
      plan.backup = portableRelative(project, backupRoot);
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(exportsDir, s.from), target);
  }
  plan.applied = true;
  if (plan.backup)
    notes.push(`Replaced files were backed up to ${plan.backup}/ (add .markilo-backup/ to .gitignore).`);
  return plan;
}
