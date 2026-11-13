import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { MarkiloError } from '../core/errors.js';
import type { Concept } from '../core/types.js';
import type { Workspace } from '../core/workspace.js';

/** Proposals shown together in one exploration round: enough to choose between, few enough to develop well. */
export const ROUND_SIZE = 3;
/** Rounds Markilo explores on its own; after that it asks the user for direction instead of trying again. */
export const AUTONOMOUS_ROUNDS = 2;

/** The concepts proposed in each round, in round order. Concepts made outside a round (refinements) are left out. */
export function rounds(concepts: Concept[]): { round: number; concepts: Concept[] }[] {
  const by = new Map<number, Concept[]>();
  for (const c of concepts) if (c.round !== undefined) by.set(c.round, [...(by.get(c.round) ?? []), c]);
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, cs]) => ({ round, concepts: roundOrder(cs) }));
}

/** Lettered concepts first, then by letter, creation time and id: the order letters are handed out in. */
function assignmentOrder(concepts: Concept[]): Concept[] {
  const lettered = (c: Concept) => (c.letter === undefined ? 1 : 0);
  return [...concepts].sort(
    (a, b) =>
      lettered(a) - lettered(b) ||
      (a.letter ?? '').length - (b.letter ?? '').length ||
      (a.letter ?? '').localeCompare(b.letter ?? '', 'en', { sensitivity: 'variant' }) ||
      (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/**
 * Concepts in the order of the letter each one shows (A, B, C…), then creation time and id. A round written by 1.3.0
 * (no letters) and extended in 1.4 therefore reads A, B, C everywhere: proposals, board and gallery.
 */
export function roundOrder(concepts: Concept[]): Concept[] {
  const letters = roundLetters(concepts);
  return [...concepts].sort(
    (a, b) =>
      (letters.get(a.id) ?? '').length - (letters.get(b.id) ?? '').length ||
      (letters.get(a.id) ?? '').localeCompare(letters.get(b.id) ?? '', 'en', { sensitivity: 'variant' }) ||
      (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** The letter for position `i` in a round: A… Z, then AA… */
export function letterAt(i: number): string {
  return i < 26 ? String.fromCharCode(65 + i) : `${letterAt(Math.floor(i / 26) - 1)}${letterAt(i % 26)}`;
}

/**
 * The letter each concept of ONE round shows: its own, or for a concept written by 1.3.0 (no letter) the next free
 * letter, in assignment order. Board, captions, gallery and `concept new` all use this, so a letter never repeats.
 */
export function roundLetters(inRound: Concept[]): Map<string, string> {
  const out = new Map<string, string>();
  const missing: Concept[] = [];
  // A stored letter an earlier-created concept already holds counts as missing: it is shown once, as the next free one.
  for (const c of assignmentOrder(inRound)) {
    if (c.letter && ![...out.values()].includes(c.letter)) out.set(c.id, c.letter);
    else missing.push(c);
  }
  const used = new Set(out.values());
  let i = 0;
  for (const c of missing) {
    while (used.has(letterAt(i))) i++;
    used.add(letterAt(i));
    out.set(c.id, letterAt(i));
  }
  return out;
}

/** Concepts whose stored letter is not the one they show, because an earlier-created concept holds it. */
export function letterConflicts(inRound: Concept[]): { id: string; stored: string; shown: string }[] {
  const shown = roundLetters(inRound);
  return roundOrder(inRound).flatMap((c) =>
    c.letter && shown.get(c.id) !== c.letter ? [{ id: c.id, stored: c.letter, shown: shown.get(c.id)! }] : [],
  );
}

/** The next letter not yet shown inside a round's concepts. */
export function nextLetter(inRound: Concept[]): string {
  const used = new Set(roundLetters(inRound).values());
  let i = 0;
  while (used.has(letterAt(i))) i++;
  return letterAt(i);
}

/**
 * Refuses a proposal that would break the round rules: a positive whole round number, at most ROUND_SIZE proposals per
 * round, no skipped rounds, and a round beyond AUTONOMOUS_ROUNDS only on the user's own direction.
 */
export function checkRound(ws: Workspace, slug: string, round: number, directed?: string): void {
  if (!Number.isInteger(round) || round < 1)
    throw new MarkiloError('USAGE', '--round must be a whole number from 1.');
  const all = rounds(ws.concepts(slug));
  const last = all.at(-1)?.round ?? 0;
  if (round > last + 1)
    throw new MarkiloError(
      'USAGE',
      `Round ${round} would skip round ${last + 1}.`,
      `Use --round ${Math.max(1, last)} or --round ${last + 1}.`,
    );
  const same = all.find((r) => r.round === round)?.concepts ?? [];
  if (same.length >= ROUND_SIZE)
    throw new MarkiloError(
      'USAGE',
      `Round ${round} already has ${ROUND_SIZE} proposals (${same.map((c) => c.id).join(', ')}).`,
      'Show them to the user first; a new round starts only after the user rejected all three or gave a new direction.',
    );
  if (round > AUTONOMOUS_ROUNDS && !directed?.trim())
    throw new MarkiloError(
      'USAGE',
      `Markilo explores at most ${AUTONOMOUS_ROUNDS} rounds on its own.`,
      `Ask the user what they want instead, and start round ${round} with --directed "<their direction>".`,
    );
}

/** Where the drawing the user chose is kept, so development can be compared with it. */
export const CHOSEN_DIR = 'chosen';

/**
 * Keeps a copy of a concept's files as the user chose them (the first time they select or ask to change it). In
 * Markilo 1.1's validation, development twice lost what the user had picked — a word narrowed, round stones flattened
 * into pills — and only a side-by-side made that visible. `repin` replaces an earlier copy.
 */
export function keepChosen(
  ws: Workspace,
  slug: string,
  concept: Concept,
  opts: { repin?: boolean } = {},
): string[] {
  const dir = ws.conceptFile(slug, concept.id, CHOSEN_DIR);
  // repin: the user's choice moved to another drawing (`concept adopt`): what they chose is that drawing now.
  if (opts.repin) {
    rmSync(dir, { recursive: true, force: true });
    rmSync(ws.conceptFile(slug, concept.id, join('review', 'chosen-vs-now.png')), { force: true });
  }
  if (existsSync(dir)) return [];
  const kept: string[] = [];
  for (const rel of Object.values(concept.files)) {
    if (!rel || !existsSync(ws.conceptFile(slug, concept.id, rel))) continue;
    mkdirSync(dir, { recursive: true });
    copyFileSync(ws.conceptFile(slug, concept.id, rel), join(dir, rel.split('/').pop()!));
    kept.push(rel);
  }
  return kept;
}
