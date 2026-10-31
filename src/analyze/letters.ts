import type { SourceLetter } from '../construct/compile.js';
import { loadBundledFace } from '../design/fonts.js';
import { outlineText } from '../design/wordmark.js';
import { boundsOf } from '../geom/pathkit.js';
import { type Mask, maskOf } from '../render/image.js';
import { renderSvg } from '../render/resvg.js';
import { topology } from './features.js';

/**
 * Letter legibility of a built wordmark: which letters were changed, and whether each changed letter still looks more
 * like itself than like any other letter of the same font. A word whose changed letter reads as another letter
 * ("portwise" read as "partwise", an "ll" read as a "4") fails in front of a stranger however good the idea is, and
 * the critic only finds out after the concept was developed. Measured on rendered outlines; no model involved.
 */

export interface LetterReading {
  index: number;
  char: string;
  /** How much the letter's neighbourhood differs from the untouched word (0 = identical). */
  change: number;
  /** Likeness of the changed letter to its own original (soft IoU, 0–1). */
  self: number;
  /** The other letter it most resembles, when that is closer than itself. */
  readsAs?: { char: string; likeness: number };
  /** The closest letters, best first (for changed letters). */
  closest?: { char: string; likeness: number }[];
  /** Enclosed counters (the eye of an e, the bowl of a b) before and after the change. */
  counters?: { before: number; after: number };
  verdict: 'unchanged' | 'changed' | 'reads-as-other' | 'unrecognisable' | 'lost-counter';
}

/** Two neighbouring changed letters that merged into what reads as one letter (ll → n, rn → m). */
export interface PairReading {
  index: number;
  chars: string;
  /** Likeness of the built pair to the untouched pair. */
  self: number;
  readsAs: { char: string; likeness: number };
}

export interface LetterCheck {
  letters: LetterReading[];
  pairs: PairReading[];
  /** Plain-language problems, in construction terms; empty when every letter reads as itself. */
  problems: string[];
}

const PX = 64;
/** A letter counts as changed when its neighbourhood differs from the untouched word by more than this. */
const CHANGED = 0.08;
/** Another letter must beat the intended one by this margin… */
const MARGIN = 0.04;
/** …and must not already look like it in the untouched font (l/I/1 are ambiguous by design). */
const NATIVE_AMBIGUITY = 0.8;
/** Below this, the changed letter no longer resembles itself at all. */
const UNRECOGNISABLE = 0.45;

const CANDIDATES = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'];
/** A dotted and a dotless letter are one letter to a reader when the dot is what was changed. */
const SAME: Record<string, string[]> = { i: ['ı'], ı: ['i'], j: ['ȷ'], ȷ: ['j'] };
const sameLetter = (a: string, b: string) => a === b || (SAME[a] ?? []).includes(b);

function iou(a: Mask, b: Mask): number {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.data.length; i++) {
    const x = a.data[i]!;
    const y = b.data[i]!;
    inter += Math.min(x, y);
    union += Math.max(x, y);
  }
  return union > 0 ? inter / union : 1;
}

const minus = (a: Mask, b: Mask): Mask => ({
  ...a,
  data: a.data.map((v, i) => Math.max(0, v - b.data[i]!)),
});

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

async function crop(paths: string[], r: Region): Promise<Mask> {
  const width = Math.max(8, Math.round((PX * r.w) / r.h));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r.x} ${r.y} ${r.w} ${r.h}">${paths
    .filter(Boolean)
    .map((d) => `<path fill="#000" fill-rule="nonzero" d="${d}"/>`)
    .join('')}</svg>`;
  return maskOf(await renderSvg(svg, { width, height: PX }));
}

/** The candidate letter drawn alone, centred on the same point and sitting on the same baseline. */
function candidatePath(l: SourceLetter, char: string, centreX: number): string | undefined {
  const face = loadBundledFace(l.font, l.weight);
  const g = outlineText(face, char, { size: l.size }).glyphs[0];
  if (!g?.d) return undefined;
  const b = boundsOf(g.d);
  const dx = centreX - (b.x + b.w / 2);
  return `<g transform="translate(${dx} ${l.baseline})"><path d="${g.d}"/></g>`;
}

async function cropMarkup(markup: string[], r: Region): Promise<Mask> {
  const width = Math.max(8, Math.round((PX * r.w) / r.h));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r.x} ${r.y} ${r.w} ${r.h}"><g fill="#000">${markup.join('')}</g></svg>`;
  return maskOf(await renderSvg(svg, { width, height: PX }));
}

/**
 * `drawing` is the final wordmark (every layer's path); `letters` the untouched letters from the same compile
 * (`Compiled.letters`). Returns undefined when the letters cannot be lined up with the drawing (most of them moved),
 * so a check never reports on a word it did not understand.
 */
export async function checkLetters(
  drawing: string[],
  source: SourceLetter[],
): Promise<LetterCheck | undefined> {
  // A glyph used twice (in a layer and again as a cut, or through a ref) is still one word.
  const seen = new Set<string>();
  const letters = source.filter((l) => !seen.has(l.d) && seen.add(l.d));
  if (letters.length < 2) return undefined;
  // Several different words in one spec (the word and a part of it as a cutter) cannot be read as one word.
  for (let i = 1; i < letters.length; i++)
    if (boundsOf(letters[i]!.d).x + 1 < boundsOf(letters[i - 1]!.d).x) return undefined;
  const readings: LetterReading[] = [];
  for (let i = 0; i < letters.length; i++) {
    const l = letters[i]!;
    const b = boundsOf(l.d);
    const pad = 0.12 * l.size;
    const r: Region = { x: b.x - pad, y: l.baseline - 1.0 * l.size, w: b.w + 2 * pad, h: 1.32 * l.size };
    const neighbours = letters.filter((_, k) => k !== i).map((n) => n.d);
    const built = await crop(drawing, r);
    const original = await crop(
      letters.map((n) => n.d),
      r,
    );
    const change = 1 - iou(built, original);
    if (change < CHANGED) {
      readings.push({ index: i, char: l.char, change: round(change), self: 1, verdict: 'unchanged' });
      continue;
    }
    // Compare the letter on its own: neighbours' untouched ink is taken out, a bridge to a neighbour stays.
    const others = await crop(neighbours, r);
    const mine = minus(built, others);
    const alone = minus(original, others);
    const centre = b.x + b.w / 2;
    const scores = new Map<string, { built: number; native: number }>();
    for (const c of new Set([...CANDIDATES, l.char])) {
      const m = candidatePath(l, c, centre);
      if (!m) continue;
      const cand = await cropMarkup([m], r);
      scores.set(c, { built: iou(mine, cand), native: iou(alone, cand) });
    }
    const self = scores.get(l.char)?.built ?? 0;
    const selfBest = Math.max(...[...scores].filter(([c]) => sameLetter(l.char, c)).map(([, s]) => s.built));
    let best: { char: string; likeness: number } | undefined;
    for (const [c, s] of scores) {
      if (sameLetter(l.char, c) || s.native >= NATIVE_AMBIGUITY) continue;
      if (s.built > selfBest + MARGIN && (!best || s.built > best.likeness))
        best = { char: c, likeness: s.built };
    }
    const closest = [...scores]
      .sort((a, b) => b[1].built - a[1].built)
      .slice(0, 3)
      .map(([c, s]) => ({ char: c, likeness: round(s.built) }));
    const before = topology(alone).holes;
    const after = topology(mine).holes;
    readings.push({
      index: i,
      char: l.char,
      change: round(change),
      self: round(self),
      ...(best ? { readsAs: { char: best.char, likeness: round(best.likeness) } } : {}),
      closest,
      ...(before !== after ? { counters: { before, after } } : {}),
      verdict: best
        ? 'reads-as-other'
        : after < before
          ? 'lost-counter'
          : self < UNRECOGNISABLE
            ? 'unrecognisable'
            : 'changed',
    });
  }
  // A whole word that moved (a transform on the glyph shape) is not a word with many changed letters.
  if (readings.filter((x) => x.verdict !== 'unchanged').length > Math.max(2, letters.length * 0.6))
    return undefined;
  const pairs: PairReading[] = [];
  for (let i = 0; i + 1 < letters.length; i++) {
    if (readings[i]!.verdict === 'unchanged' || readings[i + 1]!.verdict === 'unchanged') continue;
    const a = letters[i]!;
    const z = letters[i + 1]!;
    const ba = boundsOf(a.d);
    const bz = boundsOf(z.d);
    const pad = 0.12 * a.size;
    const x0 = Math.min(ba.x, bz.x);
    const x1 = Math.max(ba.x + ba.w, bz.x + bz.w);
    const r: Region = { x: x0 - pad, y: a.baseline - 1.0 * a.size, w: x1 - x0 + 2 * pad, h: 1.32 * a.size };
    const others = await crop(
      letters.filter((_, k) => k !== i && k !== i + 1).map((n) => n.d),
      r,
    );
    const mine = minus(await crop(drawing, r), others);
    const self = iou(mine, minus(await crop([a.d, z.d], r), others));
    const centre = (x0 + x1) / 2;
    let best: { char: string; likeness: number } | undefined;
    for (const c of CANDIDATES) {
      const m = candidatePath(a, c, centre);
      if (!m) continue;
      const v = iou(mine, await cropMarkup([m], r));
      if (v > self + MARGIN && (!best || v > best.likeness)) best = { char: c, likeness: v };
    }
    if (best)
      pairs.push({
        index: i,
        chars: a.char + z.char,
        self: round(self),
        readsAs: { char: best.char, likeness: round(best.likeness) },
      });
  }
  const word = letters.map((l) => l.char).join('');
  const problems = readings.flatMap((x) => {
    if (x.verdict === 'reads-as-other')
      return [
        `Letter ${x.index + 1} of "${word}" ("${x.char}") now looks more like "${x.readsAs!.char}" (${pct(x.readsAs!.likeness)} vs ${pct(x.self)} like itself): a stranger reads "${misread(word, x.index, x.readsAs!.char)}". Keep the letter's defining stroke (its bowl, stem or crossbar) and move the change elsewhere.`,
      ];
    if (x.verdict === 'lost-counter')
      return [
        `Letter ${x.index + 1} of "${word}" ("${x.char}") lost an enclosed counter (${x.counters!.before} → ${x.counters!.after}): the eye or bowl that tells "${x.char}" apart is open now (an e without its eye reads as c). Close it again, or make the change elsewhere.`,
      ];
    if (x.verdict === 'unrecognisable')
      return [
        `Letter ${x.index + 1} of "${word}" ("${x.char}") is only ${pct(x.self)} like itself: the change replaced the letter instead of inflecting it.`,
      ];
    return [];
  });
  for (const p of pairs)
    problems.push(
      `Letters ${p.index + 1}–${p.index + 2} of "${word}" ("${p.chars}") have merged into what looks like one "${p.readsAs.char}" (${pct(p.readsAs.likeness)} vs ${pct(p.self)} like "${p.chars}"): a stranger reads "${[...word].slice(0, p.index).join('')}${p.readsAs.char}${[...word].slice(p.index + 2).join('')}". Keep a visible break or the two stems apart.`,
    );
  return { letters: readings, pairs, problems };
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const pct = (n: number) => `${Math.round(n * 100)} %`;
const misread = (word: string, i: number, c: string) => [...word].map((ch, k) => (k === i ? c : ch)).join('');

/**
 * Splits the problems by weight. A letter that reads as another letter is a drafting error to fix before review. A
 * lost counter or two merged letters is sometimes the idea itself (an o opened into a doorway), so it is a measured
 * note for the designer and the critic, not a block: in 46 wordmarks from earlier benchmark runs, three of six
 * letters that lost a counter were read wrongly by the critic, one belonged to a mark that passed.
 */
export function letterAdvice(check: LetterCheck | undefined): { fix: string[]; notes: string[] } {
  if (!check) return { fix: [], notes: [] };
  const fix: string[] = [];
  const notes: string[] = [];
  for (const p of check.problems)
    (/now looks more like|only \d+ % like itself/.test(p) ? fix : notes).push(p);
  return { fix, notes };
}
