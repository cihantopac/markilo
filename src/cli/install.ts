import { createHash, randomBytes } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { MarkiloError } from '../core/errors.js';
import { nowIso } from '../core/fsx.js';
import { portableRelative, resolveInsideReal } from '../core/paths.js';

/**
 * Copies files into a user's project as one transaction. Every replaced file is backed up first, each file is written
 * through a temp file and a rename, and a journal records what was created and replaced, so a failure halfway puts
 * every file back and `install-assets --undo` can reverse the last installation later. Files the user edited after
 * the installation are never deleted or restored over.
 */

export const BACKUP_DIR = '.markilo-backup';

export type InstallAction = 'create' | 'overwrite' | 'skip-existing' | 'unchanged';

export interface InstallWrite {
  /** Absolute path of the exported file. */
  source: string;
  /** Destination relative to the project, forward slashes. */
  to: string;
}

interface JournalEntry {
  to: string;
  action: 'create' | 'overwrite';
  /** sha256 of what Markilo wrote, to tell later user edits apart. */
  sha256: string;
}

interface Journal {
  schema: 'markilo/install@1';
  id: string;
  createdAt: string;
  files: JournalEntry[];
  /** Folders the installation created, deepest first, removed on undo when empty. */
  dirs: string[];
  undoneAt?: string;
}

const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** What applying would do to one destination: a plan never writes anything. */
export function installAction(project: string, w: InstallWrite, force: boolean): InstallAction {
  const target = resolveInsideReal(project, w.to);
  if (!existsSync(target)) return 'create';
  if (lstatSync(target).isFile() && sha(target) === sha(w.source)) return 'unchanged';
  return force ? 'overwrite' : 'skip-existing';
}

/**
 * A fingerprint of the planned changes and of the destinations as they are now. A dry run returns it; passing it back
 * with --expect makes the apply refuse if anything in the project changed in between.
 */
export function installPlanId(project: string, steps: { to: string; action: string }[]): string {
  const h = createHash('sha256');
  for (const s of [...steps].sort((a, b) => a.to.localeCompare(b.to))) {
    const target = resolveInsideReal(project, s.to);
    const state = !existsSync(target) ? '-' : lstatSync(target).isFile() ? sha(target) : 'not-a-file';
    h.update(`${s.to}\0${s.action}\0${state}\n`);
  }
  return h.digest('hex').slice(0, 16);
}

export function checkPlanId(project: string, steps: { to: string; action: string }[], expected?: string) {
  if (expected === undefined) return;
  if (installPlanId(project, steps) !== expected)
    throw new MarkiloError(
      'STALE_PLAN',
      'The project changed since the dry run, so this plan is stale; nothing was written.',
      'Run the dry run again, show the user the new plan, and apply with its planId.',
    );
}

export interface ApplyResult {
  /** Project-relative backup folder, when files were replaced. */
  backup?: string;
  journal: string;
  written: number;
}

/** Writes `writes` (each to be a create or an overwrite) or nothing at all. */
export function applyInstall(
  project: string,
  writes: InstallWrite[],
  opts: { beforeWrite?: (w: InstallWrite) => void } = {},
): ApplyResult {
  // Preflight: every check that can fail does so before the first byte is written.
  const targets = writes.map((w) => {
    const target = resolveInsideReal(project, w.to);
    if (!existsSync(w.source)) throw new MarkiloError('NOT_FOUND', `Exported file missing: ${w.source}`);
    if (existsSync(target)) {
      const st = lstatSync(target);
      if (st.isSymbolicLink())
        throw new MarkiloError('UNSAFE_PATH', `Refusing to overwrite a symbolic link: ${w.to}`);
      if (!st.isFile())
        throw new MarkiloError('UNSAFE_PATH', `Refusing to replace a folder with a file: ${w.to}`);
    }
    return target;
  });

  const id = `${nowIso().replace(/[:.]/g, '-')}-${randomBytes(2).toString('hex')}`;
  const backupRoot = join(project, BACKUP_DIR, id);
  const journalPath = join(project, BACKUP_DIR, `${id}.json`);
  const journal: Journal = { schema: 'markilo/install@1', id, createdAt: nowIso(), files: [], dirs: [] };
  const saveJournal = () => {
    mkdirSync(dirname(journalPath), { recursive: true });
    writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  };
  const ensureDir = (dir: string) => {
    const missing: string[] = [];
    for (let d = dir; !existsSync(d); d = dirname(d)) missing.push(d);
    for (const d of missing.reverse()) {
      mkdirSync(d);
      journal.dirs.unshift(portableRelative(project, d));
    }
  };

  saveJournal();
  try {
    writes.forEach((w, i) => {
      const target = targets[i]!;
      opts.beforeWrite?.(w);
      const replacing = existsSync(target);
      if (replacing) {
        const backup = join(backupRoot, w.to);
        mkdirSync(dirname(backup), { recursive: true });
        copyFileSync(target, backup);
      }
      ensureDir(dirname(target));
      const tmp = `${target}.${randomBytes(4).toString('hex')}.markilo-tmp`;
      try {
        copyFileSync(w.source, tmp);
        renameSync(tmp, target);
      } finally {
        rmSync(tmp, { force: true });
      }
      journal.files.push({ to: w.to, action: replacing ? 'overwrite' : 'create', sha256: sha(target) });
      saveJournal();
    });
  } catch (err) {
    undo(project, journal, backupRoot);
    rmSync(journalPath, { force: true });
    rmSync(backupRoot, { recursive: true, force: true });
    removeIfEmpty(join(project, BACKUP_DIR));
    const e = err instanceof MarkiloError ? err : new MarkiloError('IO', (err as Error).message);
    e.message = `${e.message} — the installation was rolled back; the project is as it was.`;
    throw e;
  }
  const replaced = journal.files.some((f) => f.action === 'overwrite');
  return {
    ...(replaced ? { backup: portableRelative(project, backupRoot) } : {}),
    journal: portableRelative(project, journalPath),
    written: journal.files.length,
  };
}

function removeIfEmpty(dir: string) {
  try {
    if (statSync(dir).isDirectory() && readdirSync(dir).length === 0) rmdirSync(dir);
  } catch {
    // already gone
  }
}

interface UndoResult {
  restored: string[];
  removed: string[];
  /** Files changed since the installation: left exactly as they are. */
  kept: string[];
}

function undo(project: string, journal: Journal, backupRoot: string): UndoResult {
  const r: UndoResult = { restored: [], removed: [], kept: [] };
  for (const f of [...journal.files].reverse()) {
    const target = join(project, f.to);
    if (!existsSync(target) || !lstatSync(target).isFile() || sha(target) !== f.sha256) {
      r.kept.push(f.to);
      continue;
    }
    if (f.action === 'overwrite') {
      copyFileSync(join(backupRoot, f.to), target);
      r.restored.push(f.to);
    } else {
      rmSync(target);
      r.removed.push(f.to);
    }
  }
  for (const d of journal.dirs) removeIfEmpty(join(project, d));
  return r;
}

function journals(project: string): Journal[] {
  const dir = join(project, BACKUP_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Journal)
    .filter((j) => j.schema === 'markilo/install@1');
}

/** Reverses the most recent installation that was not undone yet (dry run unless apply). */
export function rollbackInstall(project: string, opts: { apply: boolean }) {
  const journal = journals(project)
    .filter((j) => !j.undoneAt)
    .pop();
  if (!journal)
    throw new MarkiloError(
      'NOT_FOUND',
      'Nothing to undo: no installation by Markilo is recorded in this project.',
    );
  const backupRoot = join(project, BACKUP_DIR, journal.id);
  if (!opts.apply) {
    const planned: UndoResult = { restored: [], removed: [], kept: [] };
    for (const f of journal.files) {
      const target = join(project, f.to);
      const intact = existsSync(target) && lstatSync(target).isFile() && sha(target) === f.sha256;
      (intact ? (f.action === 'overwrite' ? planned.restored : planned.removed) : planned.kept).push(f.to);
    }
    return {
      installation: journal.id,
      applied: false,
      ...planned,
      note: 'Dry run: nothing was changed. Re-run with --apply after the user approves.',
    };
  }
  const r = undo(project, journal, backupRoot);
  journal.undoneAt = nowIso();
  writeFileSync(join(project, BACKUP_DIR, `${journal.id}.json`), `${JSON.stringify(journal, null, 2)}\n`);
  return {
    installation: journal.id,
    applied: true,
    ...r,
    ...(r.kept.length
      ? { note: 'Files changed since the installation were left as they are; their backups stay in place.' }
      : {}),
  };
}
