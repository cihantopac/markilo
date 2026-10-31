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
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([round, cs]) => ({ round, concepts: cs }));
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
