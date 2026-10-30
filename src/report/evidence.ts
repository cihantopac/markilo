import type { Source } from '../core/types.js';
import type { ReferenceEntry } from './originality.js';

export type Coverage = 'none' | 'minimal' | 'adequate';
export type Confidence = 'low' | 'medium' | 'high';

/**
 * How much research an originality verdict needs before it may say "no conflicts found".
 * Deliberately simple and published (docs/ORIGINALITY.md) so users can see what a verdict rests on.
 */
export const EVIDENCE_CRITERIA = {
  visual: {
    minimal: { total: 3, direct: 1 },
    adequate: { total: 8, direct: 3, other: 2 },
  },
  registry: {
    minimal: { searches: 1 },
    adequate: { registries: 2, international: ['wipo-gbd', 'tmview'] },
  },
  names: { minimal: 1, adequate: 3 },
} as const;

export interface EvidenceDimension {
  coverage: Coverage;
  have: string;
  /** What to add to reach the next level (empty when adequate). */
  next: string[];
}

export interface EvidenceAssessment {
  visual: EvidenceDimension;
  registry: EvidenceDimension;
  names: EvidenceDimension;
  confidence: Confidence;
  /** Plain-language list of what is missing for a high-confidence verdict. */
  missing: string[];
}

const norm = (s: string) =>
  s
    .toLocaleLowerCase('en')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

export function assessEvidence(input: {
  brandName: string;
  references: ReferenceEntry[];
  sources: Source[];
  competitorNames: string[];
  suggestedClasses: number[];
}): EvidenceAssessment {
  const V = EVIDENCE_CRITERIA.visual;
  const direct = input.references.filter((r) => (r.category ?? 'direct') === 'direct').length;
  const other = input.references.length - direct;
  const total = input.references.length;
  const visual: EvidenceDimension = {
    coverage:
      total >= V.adequate.total && direct >= V.adequate.direct && other >= V.adequate.other
        ? 'adequate'
        : total >= V.minimal.total && direct >= V.minimal.direct
          ? 'minimal'
          : 'none',
    have: `${total} reference mark(s): ${direct} direct competitor, ${other} category/form-family`,
    next: [],
  };
  if (visual.coverage !== 'adequate') {
    if (direct < V.adequate.direct)
      visual.next.push(
        `add ${V.adequate.direct - direct} more direct competitor mark(s) (markilo research competitors)`,
      );
    if (other < V.adequate.other)
      visual.next.push(
        `add ${V.adequate.other - other} category leader or similar-form mark(s) (--category category|form-family)`,
      );
    if (total < V.adequate.total) visual.next.push(`reach ${V.adequate.total} references in total`);
  }

  const name = norm(input.brandName);
  const searches = input.sources.filter(
    (s) =>
      s.type === 'registry' &&
      s.registry &&
      norm(s.registry.query).includes(name.slice(0, Math.max(3, name.length - 2))),
  );
  const registries = new Set(searches.map((s) => s.registry!.id));
  const international = EVIDENCE_CRITERIA.registry.adequate.international.some((r) => registries.has(r));
  const classesSearched = new Set(searches.flatMap((s) => s.registry!.classes ?? []));
  const classesCovered =
    !input.suggestedClasses.length || input.suggestedClasses.some((c) => classesSearched.has(c));
  const registry: EvidenceDimension = {
    coverage:
      registries.size >= EVIDENCE_CRITERIA.registry.adequate.registries && international && classesCovered
        ? 'adequate'
        : searches.length >= EVIDENCE_CRITERIA.registry.minimal.searches
          ? 'minimal'
          : 'none',
    have: searches.length
      ? `${searches.length} logged search(es) in ${[...registries].join(', ')}${classesSearched.size ? `, classes ${[...classesSearched].sort((a, b) => a - b).join(', ')}` : ''}`
      : `no registry searches logged for "${input.brandName}"`,
    next: [],
  };
  if (registry.coverage !== 'adequate') {
    if (!international)
      registry.next.push('search an international database (WIPO Global Brand Database or TMview)');
    if (registries.size < EVIDENCE_CRITERIA.registry.adequate.registries)
      registry.next.push(
        'search at least one national register for your main market (e.g. USPTO, TÜRKPATENT, UKIPO)',
      );
    if (!classesCovered)
      registry.next.push(`include the suggested Nice classes (${input.suggestedClasses.join(', ')})`);
    registry.next.push(
      'log each search: markilo profile add-source --type registry --registry <id> --query "<name>" --classes … --results <n>',
    );
  }

  const N = EVIDENCE_CRITERIA.names;
  const nameCount = input.competitorNames.length;
  const names: EvidenceDimension = {
    coverage: nameCount >= N.adequate ? 'adequate' : nameCount >= N.minimal ? 'minimal' : 'none',
    have: `${nameCount} competitor name(s) compared`,
    next:
      nameCount >= N.adequate ? [] : [`add ${N.adequate - nameCount} more competitor name(s) to the brief`],
  };

  const levels = [visual.coverage, registry.coverage, names.coverage];
  const confidence: Confidence = levels.every((l) => l === 'adequate')
    ? 'high'
    : levels.every((l) => l !== 'none')
      ? 'medium'
      : 'low';
  return { visual, registry, names, confidence, missing: [...visual.next, ...registry.next, ...names.next] };
}
