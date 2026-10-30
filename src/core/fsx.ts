import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { MarkiloError } from './errors.js';

export interface WriteOptions {
  /** Replace an existing file. Without it an existing file raises EXISTS. */
  force?: boolean;
}

/** Atomic write (temp file + rename) that never silently overwrites. */
export function writeFileSafe(path: string, data: string | Uint8Array, opts: WriteOptions = {}): void {
  // Never write through a symbolic link: it could point anywhere on the machine.
  try {
    if (lstatSync(path).isSymbolicLink()) {
      throw new MarkiloError('UNSAFE_PATH', `Refusing to write through a symbolic link: ${path}`);
    }
  } catch (err) {
    if (err instanceof MarkiloError) throw err;
  }
  if (!opts.force && existsSync(path)) {
    throw new MarkiloError('EXISTS', `File already exists: ${path}`, 'Pass --force to overwrite it.');
  }
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, path);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

/** Write that is allowed to replace files Markilo itself owns (generated renders, exports, reports). */
export function writeGenerated(path: string, data: string | Uint8Array): void {
  writeFileSafe(path, data, { force: true });
}

export function readText(path: string): string {
  if (!existsSync(path)) throw new MarkiloError('NOT_FOUND', `File not found: ${path}`);
  return readFileSync(path, 'utf8');
}

export function readJson<T>(path: string): T {
  const text = readText(path);
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new MarkiloError('INVALID_INPUT', `Invalid JSON in ${path}: ${(err as Error).message}`);
  }
}

export function writeJson(path: string, value: unknown, opts: WriteOptions = { force: true }): void {
  writeFileSafe(path, `${JSON.stringify(value, null, 2)}\n`, opts);
}

export function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** A real directory, not a symbolic link to one. */
export function isRealDir(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export const nowIso = (): string => new Date().toISOString();
export const today = (): string => nowIso().slice(0, 10);
