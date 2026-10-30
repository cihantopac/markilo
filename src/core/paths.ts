import { isAbsolute, normalize, relative, resolve, sep } from 'node:path';
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

/** Forward-slash relative path for manifests and reports, identical on every OS. */
export function portableRelative(from: string, to: string): string {
  return relative(from, to).split(sep).join('/');
}
