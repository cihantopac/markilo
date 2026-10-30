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

export interface GateResult {
  status: 'passed' | 'failed' | 'not-reviewed';
  /** Average of every recorded judgment score. */
  average?: number;
  reasons: string[];
  /**
   * Missed only on the average, with every required criterion ≥ the minimum and a yes from the critic: worth one
   * targeted refinement round on its lowest criteria. The bar itself does not move.
   */
  nearMiss?: true;
}

export function gateOf(c: Pick<Concept, 'judgment' | 'critique'>): GateResult {
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
    ...(average !== undefined ? { average } : {}),
    reasons,
    ...(nearMiss ? { nearMiss: true as const } : {}),
  };
}
