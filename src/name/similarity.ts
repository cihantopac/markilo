import { foldAscii } from '../core/paths.js';

export const normalizeName = (s: string): string =>
  foldAscii(s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

export const editSimilarity = (a: string, b: string): number =>
  a.length || b.length ? 1 - levenshtein(a, b) / Math.max(a.length, b.length) : 1;

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false);
  const bm = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Language-neutral sound key. Not a full Metaphone: it folds the spellings that most often sound alike
 * across English, Turkish, German, Spanish and French (c/k/q, ph/f, v/w, s/z, doubled letters, vowels).
 */
export function phoneticKey(name: string): string {
  let s = normalizeName(name).replace(/[0-9]/g, '');
  s = s
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/qu/g, 'kv')
    .replace(/x/g, 'ks')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/sch|sh|ch/g, 'S')
    .replace(/th/g, 't')
    .replace(/gh/g, 'g')
    .replace(/[cq]/g, 'k')
    .replace(/w/g, 'v')
    .replace(/z/g, 's')
    .replace(/y/g, 'i')
    .replace(/(.)\1+/g, '$1');
  // Keep the first vowel (onsets matter), collapse the rest to a vowel marker.
  return s.replace(/(?<=.)[aeiou]+/g, 'a').replace(/^[aeiou]+/, 'A');
}

export const consonantSkeleton = (name: string): string => phoneticKey(name).replace(/[aA]/g, '');

export function longestCommonSubstring(a: string, b: string): string {
  let best = '';
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) {
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      if (k > best.length) best = a.slice(i, i + k);
    }
  return best;
}

/** Common words that are descriptive in many categories and cannot carry confusion on their own. */
export const GENERIC_WORDS = new Set([
  'app',
  'apps',
  'play',
  'player',
  'pay',
  'cloud',
  'labs',
  'lab',
  'tech',
  'soft',
  'data',
  'mail',
  'site',
  'sites',
  'web',
  'online',
  'digital',
  'studio',
  'hub',
  'box',
  'shop',
  'store',
  'smart',
  'pro',
  'plus',
  'max',
  'tv',
  'iptv',
  'media',
  'stream',
  'music',
  'video',
  'link',
  'net',
  'group',
  'global',
  'solutions',
  'systems',
  'software',
  'platform',
  'service',
  'services',
  'one',
  'go',
  'my',
  'get',
  'the',
  'and',
  'for',
  'inc',
  'ltd',
  'llc',
  'co',
]);

function tokens(name: string): string[] {
  return foldAscii(name)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Longest substring shared between any word of `a` and any word of `b`, ignoring generic words. */
export function sharedStem(a: string, b: string): string {
  let best = '';
  for (const x of tokens(a))
    for (const y of tokens(b)) {
      const s = longestCommonSubstring(x, y);
      if (
        s.length > best.length &&
        !GENERIC_WORDS.has(s) &&
        ![...GENERIC_WORDS].some((g) => g.length >= s.length && g.includes(s))
      )
        best = s;
    }
  return best;
}

export interface NameComparison {
  candidate: string;
  other: string;
  score: number;
  risk: 'low' | 'review' | 'high';
  signals: { spelling: number; jaroWinkler: number; sound: number; skeleton: number; sharedStem: string };
  reasons: string[];
}

export function compareNames(candidate: string, other: string, sameCategory = true): NameComparison {
  const a = normalizeName(candidate);
  const b = normalizeName(other);
  const spelling = editSimilarity(a, b);
  const jw = jaroWinkler(a, b);
  const sound = editSimilarity(phoneticKey(candidate), phoneticKey(other));
  const skeleton = editSimilarity(consonantSkeleton(candidate), consonantSkeleton(other));
  // Shared stems are found word by word ("Google Play" never yields "eplay"), and generic category words
  // ("play", "app", "cloud"…) do not count: everyone in a category uses them.
  const stem = sharedStem(candidate, other);
  const stemShare = stem.length / Math.max(1, Math.min(a.length, b.length));
  let score = Math.max(0.5 * spelling + 0.5 * jw, sound * 0.95, 0.6 * skeleton + 0.4 * jw);
  if (stem.length >= 4 && stemShare >= 0.6) score = Math.max(score, 0.75 + 0.2 * stemShare - 0.15);
  if (a === b) score = 1;
  if (!sameCategory) score *= 0.8;
  const risk = score >= 0.85 ? 'high' : score >= 0.7 ? 'review' : 'low';
  const reasons: string[] = [];
  if (a === b) reasons.push('Identical after normalizing case, accents and punctuation.');
  else {
    if (sound >= 0.85) reasons.push(`Sounds alike (${phoneticKey(candidate)} ≈ ${phoneticKey(other)}).`);
    if (spelling >= 0.75)
      reasons.push(`Spelled alike (${levenshtein(a, b)} edit${levenshtein(a, b) === 1 ? '' : 's'} apart).`);
    if (stem.length >= 4) reasons.push(`Shares the stem "${stem}".`);
  }
  if (!sameCategory) reasons.push('Different product category lowers, but does not remove, confusion risk.');
  if (!reasons.length) reasons.push('No strong spelling, sound or stem overlap.');
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return {
    candidate,
    other,
    score: r(score),
    risk,
    signals: {
      spelling: r(spelling),
      jaroWinkler: r(jw),
      sound: r(sound),
      skeleton: r(skeleton),
      sharedStem: stem,
    },
    reasons,
  };
}

/** Pronounceability hints: patterns that are hard in common markets. */
export function pronunciationNotes(name: string): string[] {
  const n = normalizeName(name);
  const notes: string[] = [];
  if (/[bcdfghjklmnpqrstvwxz]{4,}/.test(n))
    notes.push('Four or more consonants in a row; hard to say in many languages.');
  if (/^[^aeiou]*$/.test(n)) notes.push('No vowels; pronunciation will vary by market.');
  if (n.length > 12)
    notes.push('Long name (> 12 letters); consider a shorter mark or a short form for icons.');
  if (/[ıiİI]/.test(name) && /[İı]/.test(name))
    notes.push('Uses dotted/dotless i: casing differs between Turkish and other locales.');
  if (/[qxw]/.test(n))
    notes.push(
      'Contains q, x or w, which are absent or pronounced differently in Turkish and some other alphabets.',
    );
  if (/(.)\1\1/.test(n)) notes.push('Triple letters are easy to misspell.');
  return notes;
}
