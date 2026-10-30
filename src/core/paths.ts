import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, normalize, relative, resolve, sep } from 'node:path';
import { MarkiloError } from './errors.js';

/** Lowercase ASCII slug; folds Turkish and other Latin diacritics so "Şirket Ürün" → "sirket-urun". */
export function slugify(input: string): string {
  const folded = foldAscii(input).toLowerCase();
  const slug = folded
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (!slug) throw new MarkiloError('INVALID_INPUT', `Cannot derive a slug from "${input}".`);
  return slug;
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
  const rel = relative(base, full);
  if (rel === '') return full;
  if (rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) {
    throw new MarkiloError('UNSAFE_PATH', `Refusing to access "${target}" because it is outside ${base}.`);
  }
  return full;
}

/** realpath of the deepest existing ancestor, with the missing tail re-appended. */
function realExisting(path: string): string {
  let probe = path;
  const tail: string[] = [];
  while (!existsSync(probe)) {
    const parent = dirname(probe);
    if (parent === probe) return path;
    tail.unshift(probe.slice(parent.length).replace(/^[\\/]/, ''));
    probe = parent;
  }
  return [realpathSync(probe), ...tail].join(sep);
}

/**
 * Like resolveInside, and also follows symbolic links on the existing part of the path: the real location must stay
 * inside the real root. Stops a symlinked folder from redirecting writes or reads elsewhere.
 */
export function resolveInsideReal(root: string, target: string): string {
  const full = resolveInside(root, target);
  const realRoot = realExisting(resolve(root));
  const rel = relative(realRoot, realExisting(full));
  if (rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) {
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
