import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { MarkiloError } from './errors.js';

/** Lowercase ASCII slug; folds Turkish and other Latin diacritics so "Şirket Ürün" → "sirket-urun". */
export function slugify(input: string): string {
  const folded = foldAscii(input).toLowerCase();
  const slug = folded
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  if (!slug) throw new MarkiloError('INVALID_INPUT', `Cannot derive a slug from "${input}".`);
  return slug;
}

/**
 * A slug for a name that may have no Latin letters or digits ("日本語"): the plain slug, else `brand-` and the first six
 * hex digits of the name's sha1. `derived` says the hash form was used.
 */
export function slugifyOrHash(name: string): { slug: string; hashed: boolean } {
  try {
    return { slug: slugify(name), hashed: false };
  } catch {
    return { slug: `brand-${createHash('sha1').update(name).digest('hex').slice(0, 6)}`, hashed: true };
  }
}

const FOLD: Record<string, string> = {
  ı: 'i',
  İ: 'I',
  ş: 's',
  Ş: 'S',
  ğ: 'g',
  Ğ: 'G',
  ß: 'ss',
  æ: 'ae',
  ø: 'o',
  œ: 'oe',
  ł: 'l',
};

export function foldAscii(input: string): string {
  return input
    .replace(/[ıİşŞğĞßæøœł]/g, (c) => FOLD[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
}

export function isSlug(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(value);
}

/**
 * Resolves `target` against `root` and refuses anything that escapes `root`
 * (`..`, absolute paths elsewhere, other drive letters on Windows).
 */
export function resolveInside(root: string, target: string): string {
  const base = resolve(root);
  const full = isAbsolute(target) ? normalize(target) : resolve(base, target);
  if (isWithin(base, full)) return full;
  // One folder can have two names (macOS /var and /private/var, a symlinked home): compare the real locations and
  // hand back the path under the root's own name.
  if (isAbsolute(target)) {
    const realBase = realExisting(base);
    const realFull = realExisting(full);
    if (isWithin(realBase, realFull)) return join(base, relative(realBase, realFull));
  }
  throw new MarkiloError('UNSAFE_PATH', `Refusing to access "${target}" because it is outside ${base}.`);
}

/** True when `full` is `base` or lies inside it (separator-aware, so /a/b does not contain /a/bc). */
export function isWithin(base: string, full: string): boolean {
  const rel = relative(base, full);
  return !(rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel));
}

/** realpath of the deepest existing ancestor, with the missing tail re-appended. */
export function realExisting(path: string): string {
  let probe = path;
  const tail: string[] = [];
  while (!existsSync(probe)) {
    const parent = dirname(probe);
    if (parent === probe) return path;
    tail.unshift(probe.slice(parent.length).replace(/^[\\/]/, ''));
    probe = parent;
  }
  // .native returns the on-disk case, so FINAL and final are one folder on case-insensitive filesystems.
  return [realpathSync.native(probe), ...tail].join(sep);
}

/**
 * Like resolveInside, and also follows symbolic links on the existing part of the path: the real location must stay
 * inside the real root. Stops a symlinked folder from redirecting writes or reads elsewhere.
 */
export function resolveInsideReal(root: string, target: string): string {
  const full = resolveInside(root, target);
  const realRoot = realExisting(resolve(root));
  if (!isWithin(realRoot, realExisting(full))) {
    throw new MarkiloError(
      'UNSAFE_PATH',
      `Refusing to access "${target}": it resolves outside ${realRoot} through a symbolic link.`,
    );
  }
  return full;
}

/** Forward-slash relative path for manifests and reports, identical on every OS. */
export function portableRelative(from: string, to: string): string {
  return relative(from, to).split(sep).join('/');
}

/**
 * Local file paths are stored relative to the project folder (the current directory), never as absolute paths:
 * profiles are often committed, and an absolute path leaks the user's name and folder layout. Paths outside the
 * project keep only their file name.
 */
export function portableRef(ref: string, base = process.cwd()): string {
  if (!isAbsolute(ref) || /^[a-z][a-z0-9+.-]*:\/\//i.test(ref)) return ref;
  const rel = relative(base, ref);
  if (!rel) return '.';
  if (rel.startsWith('..') || isAbsolute(rel)) return `…/${basename(ref)}`;
  return rel.split(sep).join('/');
}
