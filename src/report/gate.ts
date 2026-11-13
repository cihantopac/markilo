import { existsSync } from 'node:fs';
import { MarkiloError } from '../core/errors.js';
import { readText, sha256 } from '../core/fsx.js';
import type { Concept } from '../core/types.js';
import type { Workspace } from '../core/workspace.js';

/** The judgment criteria the critic scores (design-critic agent), in its order. */
export const CRITERIA = [
  'brand-fit',
  'semantic-relevance',
  'distinctiveness',
  'memorability',
  'simplicity',
  'balance',
  'craft',
  'typography',
  'color',
  'cultural-fit',
  'timelessness',
  'premium-perception',
  'versatility',
] as const;

const ALIASES: Record<string, (typeof CRITERIA)[number]> = {
  fit: 'brand-fit',
  semantic: 'semantic-relevance',
  semantics: 'semantic-relevance',
  relevance: 'semantic-relevance',
  meaning: 'semantic-relevance',
  distinctive: 'distinctiveness',
  originality: 'distinctiveness',
  memorable: 'memorability',
  simple: 'simplicity',
  type: 'typography',
  colour: 'color',
  cultural: 'cultural-fit',
  culture: 'cultural-fit',
  timeless: 'timelessness',
  premium: 'premium-perception',
  versatile: 'versatility',
};

/** brandFit, Brand_Fit, "brand fit", premium → the criterion's canonical name; undefined if it is not one. */
export function criterionOf(name: string): (typeof CRITERIA)[number] | undefined {
  const k = name
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  const flat = k.replace(/-/g, '');
  return CRITERIA.find((c) => c.replace(/-/g, '') === flat) ?? ALIASES[k] ?? ALIASES[flat];
}

export function requireCriterion(name: string): (typeof CRITERIA)[number] {
  const k = criterionOf(name);
  if (!k)
    throw new MarkiloError(
      'USAGE',
      `Unknown judgment criterion "${name}".`,
      `Use one of: ${CRITERIA.join(', ')}. Record "would a senior designer present it as is?" with --present yes|no:<reason>.`,
    );
  return k;
}

/**
 * The critic's quality gate, computed from what the critic recorded (judgment scores and the "present as is" answer),
 * so the rule is applied the same way everywhere: concept list, the gallery and finalize.
 */
export const GATE = {
  required: ['brand-fit', 'distinctiveness', 'memorability'],
  minimum: 6,
  average: 6.5,
} as const;

/** What the critic scores blind, from the brief and the images only — the rubric of the benchmark's blind judge. */
export const BLIND_CRITERIA = [
  'distinctiveness',
  'memorability',
  'brand-fit',
  'craft',
  'versatility',
] as const;

export interface GateResult {
  /**
   * undecided: the first look landed on the edge of the bar; two more cold looks decide (`next: second-look`).
   * below-threshold: a score or the critic's answer is under the bar (advice; 1.5 and older kits call it `failed`).
   * stale: the symbol or wordmark changed after the critic scored it; the old result is under `previous`.
   */
  status: 'passed' | 'below-threshold' | 'not-reviewed' | 'undecided' | 'stale';
  /**
   * blind: the critic's scores from its first look, before reading the rationale (in the benchmark they predicted an
   * independent judge far better than the scores given after reading it); informed: older reviews without them.
   */
  basis?: 'blind' | 'informed';
  /** Average of every recorded judgment score. */
  average?: number;
  reasons: string[];
  /**
   * Missed only on the average, with every required criterion ≥ the minimum and a yes from the critic: worth one
   * targeted refinement round on its lowest criteria. The bar itself does not move.
   */
  nearMiss?: true;
  /**
   * Advice, never a verdict on the user's choice: present it; fix what the critic named (it would not present it as
   * is); or present it with the critic's notes (it would present it, but a score is under the bar). `second-look`: the
   * first look is on the edge of the bar and fresh critics decide.
   */
  next?: 'present' | 'fix' | 'present-with-notes' | 'second-look';
  /** The date of an earlier critique that is current again because the drawing returned to what it judged. */
  restored?: string;
  /** The result the critique gave before the drawing changed (status `stale`). */
  previous?: GateResult;
  /** Cold looks the verdict rests on, and how many of them passed (from the first look on; see SECOND_LOOK). */
  looks?: { passed: number; of: number };
  /** The model that gave the blind scores, when the critic recorded it. */
  reviewer?: string;
  /**
   * measured: the reviewer is the model family the gate was calibrated against (Opus); unmeasured: any other model —
   * the rule still applies, but how well it predicts an independent judge has not been measured.
   */
  calibration?: 'measured' | 'unmeasured';
}

/** Model families whose blind scores the gate was calibrated on (bench/results/calibration-rc.7, rc.8, rc.9). */
const MEASURED_REVIEWERS = /opus/i;

/**
 * When one cold look is not enough. Every concept that passed the gate in the benchmark through 0.5.0-rc.1 did so with
 * its lowest required score exactly at the bar, and an independent judge rejected two of those four; around 6.0–6.4 a
 * single look flips about half the time (rc.9 noise check). So a first look that passes with its lowest required
 * score at most `edge`, or says yes with one required score just under the bar (≥ `below`), asks for two more cold looks
 * by fresh critics, and the majority of the three decides. The bar itself does not move.
 */
export const SECOND_LOOK = { edge: 6.5, below: 5.5, looks: 3 } as const;

const lookPasses = (scores: Record<string, number>, present: boolean) =>
  present && GATE.required.every((k) => (scores[k] ?? 0) >= GATE.minimum);

/** The drawing a critique judged: sha256 over the symbol file, then the wordmark file (a missing file is empty). */
export const artHash = (symbol: string | undefined, wordmark: string | undefined): string =>
  sha256((symbol ?? '') + (wordmark ?? ''));

/** The artHash of a concept's current symbol and wordmark files. */
export function currentArt(ws: Workspace, brand: string, c: Pick<Concept, 'id' | 'files'>): string {
  const read = (rel?: string) => {
    if (!rel) return undefined;
    const f = ws.conceptFile(brand, c.id, rel);
    return existsSync(f) ? readText(f) : undefined;
  };
  return artHash(read(c.files.symbol), read(c.files.wordmark));
}

export const STALE_NOTE = 'the critique is older than the drawing';

/** What a failed critique advises: fix what the critic named, or present it with the critic's notes. */
const adviceOf = (critique?: { present: boolean }): 'fix' | 'present-with-notes' =>
  critique?.present === true ? 'present-with-notes' : 'fix';

/**
 * The critic's gate. With `art` (the concept's current artHash) and a critique that recorded the drawing it judged,
 * a changed drawing makes the result `stale`; a critique recorded without a hash (1.3.0) is read as before.
 */
export function gateOf(
  c: Pick<Concept, 'judgment' | 'critique' | 'blind' | 'reviews' | 'looks' | 'reviewedArt' | 'critiques'>,
  art?: string,
): GateResult {
  if (art !== undefined && c.reviewedArt && c.reviewedArt !== art) {
    const old = matchingCritique(c, art);
    if (old) return { ...gateOf({ ...c, ...fieldsOf(old), reviewedArt: art }, art), restored: old.at };
  }
  const result = c.blind ? blindGate(c) : informedGate(c);
  if (art === undefined || !c.reviewedArt || c.reviewedArt === art || result.status === 'not-reviewed')
    return result;
  return {
    status: 'stale',
    reasons: [
      `${STALE_NOTE}: the symbol or wordmark changed after the critic scored it; ask for a fresh look`,
    ],
    previous: result,
  };
}

type Snapshot = NonNullable<Concept['critiques']>[number];

const fieldsOf = (e: Snapshot) => ({
  judgment: e.judgment,
  critique: e.critique,
  blind: e.blind,
  reviews: e.reviews,
  looks: e.looks,
});

/** The latest earlier critique that judged exactly this drawing. */
function matchingCritique(c: Pick<Concept, 'critiques'>, art: string): Snapshot | undefined {
  return [...(c.critiques ?? [])].reverse().find((e) => e.reviewedArt === art);
}

/** What the concept's current critique is, as a history entry; undefined when it holds none or none is tied to a drawing. */
export function critiqueSnapshot(c: Concept): Snapshot | undefined {
  const has = c.critique || c.blind || Object.keys(c.judgment ?? {}).length;
  if (!has || !c.reviewedArt || c.reviewedArt === 'adopted') return undefined;
  const at = [c.critique?.at, c.blind?.at, ...(c.looks ?? []).map((l) => l.at)].filter(Boolean).sort().at(-1);
  return {
    reviewedArt: c.reviewedArt,
    at: at ?? new Date().toISOString(),
    ...(c.judgment ? { judgment: c.judgment } : {}),
    ...(c.critique ? { critique: c.critique } : {}),
    ...(c.blind ? { blind: c.blind } : {}),
    ...(c.reviews !== undefined ? { reviews: c.reviews } : {}),
    ...(c.looks ? { looks: c.looks } : {}),
  };
}

/** `next` with the current critique moved into `critiques` (kept only when it judged another drawing than `art`). */
export function archiveCritique(cur: Concept, next: Concept, art: string): void {
  const snap = critiqueSnapshot(cur);
  const kept = (cur.critiques ?? []).filter((e) => e.reviewedArt !== snap?.reviewedArt);
  next.critiques = snap && snap.reviewedArt !== art ? [...kept, snap] : (cur.critiques ?? []);
  if (!next.critiques.length) delete next.critiques;
}

/**
 * When the concept's drawing is byte-identical to one an earlier critique judged, make that critique current again
 * (the one it replaces goes to the history) and save. Returns what it restored, or undefined when nothing matched.
 */
export function restoreCritique(
  ws: Workspace,
  brand: string,
  concept: Concept,
): { at: string; reviewedArt: string } | undefined {
  const art = currentArt(ws, brand, concept);
  if (concept.reviewedArt === art) return undefined;
  const old = matchingCritique(concept, art);
  if (!old) return undefined;
  const next: Concept = { ...concept };
  for (const k of ['judgment', 'critique', 'blind', 'reviews', 'looks'] as const) delete next[k];
  Object.assign(next, fieldsOf(old), { reviewedArt: art });
  for (const k of ['judgment', 'critique', 'blind', 'reviews', 'looks'] as const)
    if (next[k] === undefined) delete next[k];
  const snap = critiqueSnapshot(concept);
  next.critiques = [...(concept.critiques ?? []).filter((e) => e !== old), ...(snap ? [snap] : [])];
  if (!next.critiques.length) delete next.critiques;
  ws.saveConcept(next);
  return { at: old.at, reviewedArt: art };
}

function informedGate(c: Pick<Concept, 'judgment' | 'critique' | 'reviews'>): GateResult {
  // Older concepts may hold criteria under other spellings (brandFit, premium); read them by their canonical name.
  const j: Record<string, { score: number }> = {};
  for (const [k, v] of Object.entries(c.judgment ?? {})) j[criterionOf(k) ?? k] = v;
  const scores = Object.values(j).map((v) => v.score);
  if (!scores.length && !c.critique)
    return { status: 'not-reviewed', reasons: ['No critique recorded yet.'] };
  const reasons: string[] = [];
  for (const k of GATE.required) {
    const s = j[k]?.score;
    if (s === undefined) reasons.push(`${k} not scored`);
    else if (s < GATE.minimum) reasons.push(`${k} ${s} < ${GATE.minimum}`);
  }
  const average = scores.length
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
    : undefined;
  if (average !== undefined && average < GATE.average) reasons.push(`average ${average} < ${GATE.average}`);
  if (!c.critique) reasons.push('no answer yet to "would a senior designer present it as is?"');
  else if (!c.critique.present)
    reasons.push(`a senior designer would not present it as is: ${c.critique.reason}`);
  const nearMiss = reasons.length === 1 && reasons[0]!.startsWith('average') && c.critique?.present === true;
  return {
    status: reasons.length ? 'below-threshold' : 'passed',
    basis: 'informed',
    ...(average !== undefined ? { average } : {}),
    reasons,
    ...(nearMiss ? { nearMiss: true as const } : {}),
    next: !reasons.length ? 'present' : adviceOf(c.critique),
  };
}

function blindGate(c: Pick<Concept, 'critique' | 'blind' | 'reviews' | 'looks'>): GateResult {
  const { edge, ...first } = firstLook(c);
  if (!c.critique || !edge) return first;
  const looks = [
    { scores: c.blind!.scores, present: c.critique.present },
    ...(c.looks ?? []).map((l) => ({ scores: l.scores, present: l.present })),
  ];
  const passed = looks.filter((l) => lookPasses(l.scores, l.present)).length;
  const need = Math.floor(SECOND_LOOK.looks / 2) + 1;
  const failedLooks = looks.length - passed;
  if (passed < need && failedLooks < need)
    return {
      ...first,
      status: 'undecided',
      next: 'second-look',
      looks: { passed, of: looks.length },
      reasons: [
        ...first.reasons,
        `the first look is on the edge of the bar: ${SECOND_LOOK.looks - looks.length} more cold look${SECOND_LOOK.looks - looks.length === 1 ? '' : 's'} by a fresh critic decide (majority of ${SECOND_LOOK.looks})`,
      ],
    };
  const ok = passed >= need;
  return {
    ...first,
    status: ok ? 'passed' : 'below-threshold',
    reasons: ok
      ? []
      : [
          ...first.reasons.filter((r) => !r.startsWith('the first look')),
          `${failedLooks} of ${looks.length} cold looks did not pass`,
        ],
    next: ok ? 'present' : adviceOf(c.critique),
    looks: { passed, of: looks.length },
  };
}

function firstLook(c: Pick<Concept, 'critique' | 'blind' | 'reviews'>): GateResult & { edge?: boolean } {
  const b = c.blind!.scores;
  const reasons: string[] = [];
  for (const k of GATE.required) {
    const s = b[k];
    if (s === undefined) reasons.push(`${k} not scored (blind)`);
    else if (s < GATE.minimum) reasons.push(`${k} ${s} < ${GATE.minimum} (blind)`);
  }
  const values = Object.values(b);
  const average = values.length
    ? Math.round((values.reduce((x, y) => x + y, 0) / values.length) * 100) / 100
    : undefined;
  const scoresClear = GATE.required.every((k) => (b[k] ?? 0) >= GATE.minimum);
  if (!c.critique) reasons.push('no answer yet to "would a senior designer present it as is?"');
  else if (!c.critique.present)
    reasons.push(`a senior designer would not present it as is: ${c.critique.reason}`);
  const reviewer = c.blind!.reviewer;
  const next: GateResult['next'] = !reasons.length ? 'present' : adviceOf(c.critique);
  const lowest = Math.min(...GATE.required.map((k) => b[k] ?? 0));
  const edge =
    !!c.critique &&
    ((!reasons.length && lowest <= SECOND_LOOK.edge) ||
      (c.critique.present && !scoresClear && lowest >= SECOND_LOOK.below));
  return {
    status: reasons.length ? 'below-threshold' : 'passed',
    basis: 'blind',
    ...(average !== undefined ? { average } : {}),
    reasons,
    ...(c.critique ? { next } : {}),
    ...(edge ? { edge } : {}),
    ...(reviewer
      ? { reviewer, calibration: MEASURED_REVIEWERS.test(reviewer) ? 'measured' : 'unmeasured' }
      : {}),
  };
}
