import { MarkiloError } from '../core/errors.js';
import type { Concept } from '../core/types.js';

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
  /** undecided: the first look landed on the edge of the bar; two more cold looks decide (`next: second-look`). */
  status: 'passed' | 'failed' | 'not-reviewed' | 'undecided';
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
   * What to do with it: present it; fix it once (the cold scores clear the bar and only the critic's no, for a reason it
   * named, stands in the way); or reject it and spend the budget on a new direction. In Markilo's benchmark 1 of 34
   * concepts sent back after a failed gate passed later, after three rounds; every other pass came from a first look.
   */
  next?: 'present' | 'fix' | 'reject' | 'second-look';
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

export function gateOf(
  c: Pick<Concept, 'judgment' | 'critique' | 'blind' | 'reviews' | 'looks'>,
): GateResult {
  if (c.blind) return blindGate(c);
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
    status: reasons.length ? 'failed' : 'passed',
    basis: 'informed',
    ...(average !== undefined ? { average } : {}),
    reasons,
    ...(nearMiss ? { nearMiss: true as const } : {}),
    next: !reasons.length ? 'present' : nearMiss && (c.reviews ?? 1) < 2 ? 'fix' : 'reject',
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
    status: ok ? 'passed' : 'failed',
    reasons: ok
      ? []
      : [
          ...first.reasons.filter((r) => !r.startsWith('the first look')),
          `${failedLooks} of ${looks.length} cold looks did not pass`,
        ],
    next: ok ? 'present' : 'reject',
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
  const next: GateResult['next'] = !reasons.length
    ? 'present'
    : scoresClear && (c.reviews ?? 1) < 2
      ? 'fix'
      : 'reject';
  const lowest = Math.min(...GATE.required.map((k) => b[k] ?? 0));
  const edge =
    !!c.critique &&
    ((!reasons.length && lowest <= SECOND_LOOK.edge) ||
      (c.critique.present && !scoresClear && lowest >= SECOND_LOOK.below));
  return {
    status: reasons.length ? 'failed' : 'passed',
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
