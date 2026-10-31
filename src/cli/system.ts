import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { MarkiloError } from '../core/errors.js';
import { isDir, writeFileSafe } from '../core/fsx.js';
import { portableRelative, resolveInsideReal } from '../core/paths.js';
import type { Workspace } from '../core/workspace.js';
import { fontsDir, listFonts } from '../design/fonts.js';
import { ensureRenderer } from '../render/resvg.js';
import { applyInstall, checkPlanId, type InstallAction, installAction, installPlanId } from './install.js';

const SHORTCUT_MARKER = '<!-- managed-by: markilo shortcut -->';

export function shortcutContent(): string {
  return `---
name: markilo
description: Shortcut for the Markilo brand identity studio plugin. Use when the user types /markilo or asks Markilo to research, design, verify or export a brand identity.
argument-hint: "[what you want: a URL, a repo path, a brand name, or a task]"
---
${SHORTCUT_MARKER}

This is a personal shortcut installed by \`markilo shortcut install\`. It forwards to the Markilo plugin.

Invoke the \`markilo:design\` skill with the user's request: $ARGUMENTS

If that skill is not available, tell the user the Markilo plugin is not installed or enabled
(\`/plugin install markilo@markilo\`) and stop.
`;
}

export function shortcutPath(dir?: string): string {
  return join(dir ?? join(homedir(), '.claude', 'skills'), 'markilo', 'SKILL.md');
}

/** Personal skill that gives a bare /markilo. Never overwrites a file it did not create. */
export function shortcut(action: 'install' | 'uninstall' | 'status', opts: { yes: boolean; dir?: string }) {
  const path = shortcutPath(opts.dir);
  const exists = existsSync(path);
  const ours = exists && readFileSync(path, 'utf8').includes(SHORTCUT_MARKER);
  if (action === 'status') return { path, installed: exists, managedByMarkilo: ours };
  if (action === 'install') {
    if (exists && !ours) {
      throw new MarkiloError(
        'EXISTS',
        `${path} exists and was not created by Markilo.`,
        'Remove or rename it yourself if you want the Markilo shortcut.',
      );
    }
    if (!opts.yes)
      return {
        path,
        wouldWrite: true,
        applied: false,
        note: 'Dry run. Re-run with --yes to create this personal skill.',
        content: shortcutContent(),
      };
    writeFileSafe(path, shortcutContent(), { force: ours });
    return {
      path,
      applied: true,
      note: 'Start a new Claude Code session (or run /reload-plugins) to use /markilo.',
    };
  }
  if (!exists) return { path, applied: false, note: 'Not installed.' };
  if (!ours) throw new MarkiloError('EXISTS', `${path} was not created by Markilo; leaving it alone.`);
  if (!opts.yes)
    return { path, wouldRemove: true, applied: false, note: 'Dry run. Re-run with --yes to remove it.' };
  rmSync(dirname(path), { recursive: true, force: true });
  return { path, applied: true };
}

/**
 * Copies one export group (e.g. web/) into a project folder. Dry run by default; never overwrites
 * existing files unless --force; refuses destinations outside the current project.
 */
export function installAssets(
  ws: Workspace,
  brand: string,
  group: string,
  into: string,
  cwd: string,
  opts: { apply: boolean; force: boolean; expect?: string },
) {
  const src = join(ws.exportsDir(brand), group);
  if (!isDir(src))
    throw new MarkiloError(
      'NOT_FOUND',
      `No exported "${group}" assets for ${brand}.`,
      `Run "markilo export --brand ${brand} --only ${group}" first.`,
    );
  const dest = resolveInsideReal(cwd, into);
  const plan: { from: string; to: string; action: InstallAction }[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const to = portableRelative(cwd, join(dest, relative(src, full)));
        plan.push({
          from: portableRelative(ws.root, full),
          to,
          action: installAction(cwd, { source: full, to }, opts.force),
        });
      }
    }
  };
  walk(src);
  const planId = installPlanId(cwd, plan);
  let applied: ReturnType<typeof applyInstall> | undefined;
  if (opts.apply) {
    checkPlanId(cwd, plan, opts.expect);
    applied = applyInstall(
      cwd,
      plan
        .filter((p) => p.action === 'create' || p.action === 'overwrite')
        .map((p) => ({ source: resolve(ws.root, p.from), to: p.to })),
    );
  }
  return {
    applied: opts.apply,
    destination: portableRelative(cwd, dest) || '.',
    planId,
    create: plan.filter((p) => p.action === 'create').length,
    overwrite: plan.filter((p) => p.action === 'overwrite').length,
    unchanged: plan.filter((p) => p.action === 'unchanged').length,
    skippedExisting: plan.filter((p) => p.action === 'skip-existing').map((p) => p.to),
    files: plan,
    ...(applied?.backup ? { backup: applied.backup } : {}),
    ...(applied
      ? {
          journal: applied.journal,
          note: 'Undo this installation with `markilo install-assets --undo --apply`.',
        }
      : {
          note: `Dry run: nothing was copied. Re-run with --apply --expect ${planId} after the user approves.`,
        }),
  };
}

export async function doctor(version: string) {
  const checks: { check: string; ok: boolean; detail: string }[] = [];
  const [major, minor] = process.versions.node.split('.').map(Number);
  checks.push({
    check: 'node',
    ok: major! > 20 || (major === 20 && minor! >= 10),
    detail: `Node ${process.versions.node} (need >= 20.10)`,
  });
  try {
    await ensureRenderer();
    checks.push({ check: 'renderer', ok: true, detail: 'resvg WASM loaded' });
  } catch (err) {
    checks.push({ check: 'renderer', ok: false, detail: (err as Error).message });
  }
  try {
    checks.push({
      check: 'fonts',
      ok: true,
      detail: `${listFonts().length} bundled families in ${fontsDir()}`,
    });
  } catch (err) {
    checks.push({ check: 'fonts', ok: false, detail: (err as Error).message });
  }
  checks.push({ check: 'platform', ok: true, detail: `${process.platform} ${process.arch}` });
  return { version, ok: checks.every((c) => c.ok), checks };
}
