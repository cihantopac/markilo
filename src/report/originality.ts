import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadMark, type MarkSample } from '../analyze/mark.js';
import {
  type Comparison,
  compareMarks,
  type Genericity,
  genericity,
  RISK_THRESHOLDS,
  type RiskLevel,
} from '../analyze/similarity.js';
import { MarkiloError } from '../core/errors.js';
import { readJson, writeGenerated, writeJson } from '../core/fsx.js';
import type { Concept } from '../core/types.js';
import type { Workspace } from '../core/workspace.js';
import { compareNames, type NameComparison, pronunciationNotes } from '../name/similarity.js';
import { REGISTRIES, suggestNiceClasses } from '../name/trademark.js';
import { createRaster, dihedral } from '../render/image.js';
import { encodePng } from '../render/png.js';
import { assessEvidence, type Confidence, type EvidenceAssessment } from './evidence.js';
import { brandKeyOf, officialHostsFrom } from './references.js';

export interface ReferenceEntry {
  id: string;
  file: string;
  name: string;
  source: string;
  retrievedAt: string;
  category?: string;
  notes?: string;
}

export interface ReferenceIndex {
  schema: 'markilo/references@1';
  references: ReferenceEntry[];
}

export function referenceIndexPath(ws: Workspace, brand: string): string {
  return join(ws.referencesDir(brand), 'references.json');
}

export function readReferences(ws: Workspace, brand: string): ReferenceIndex {
  const p = referenceIndexPath(ws, brand);
  return existsSync(p) ? readJson<ReferenceIndex>(p) : { schema: 'markilo/references@1', references: [] };
}

export type OriginalityVerdict = 'redesign' | 'needs-review' | 'insufficient-evidence' | 'no-conflicts-found';
export type AssessedRisk = RiskLevel | 'unknown';

export interface OriginalityReport {
  schema: 'markilo/originality@2';
  brand: string;
  concept: string;
  generatedAt: string;
  /**
   * redesign: measured high similarity or a stock shape. needs-review: a possible conflict a person must judge.
   * insufficient-evidence: too little research to say anything reassuring. no-conflicts-found: nothing found within
   * the stated scope (never proof of availability).
   */
  verdict: OriginalityVerdict;
  /** How much the verdict can be trusted, from the evidence behind it. */
  confidence: Confidence;
  evidence: EvidenceAssessment;
  scope: {
    referencesCompared: number;
    /** Distinct brands among the references (what the evidence level counts). */
    brandsCompared?: number;
    references: { id: string; name: string; source: string; retrievedAt: string }[];
    conceptsCompared: string[];
    nameCompetitors: number;
    registrySearchesLogged: { ref: string; retrievedAt: string; notes?: string }[];
  };
  visual: {
    risk: AssessedRisk;
    thresholds: typeof RISK_THRESHOLDS;
    /** Closest file per brand, most similar first (several logos of one brand are one comparison). */
    matches: (Comparison & { name: string; brand?: string; source: string; image?: string })[];
  };
  diversity: { concept: string; visual: number; risk: RiskLevel; reasons: string[] }[];
  genericity?: Genericity;
  name: {
    candidate: string;
    risk: AssessedRisk;
    comparisons: NameComparison[];
    pronunciation: string[];
    registryConflicts: { registry: string; marks: string[] }[];
  };
  trademark: {
    suggestedClasses: number[];
    classReasons: string[];
    registries: { name: string; url: string; how: string }[];
  };
  limitations: string[];
}

/** Side-by-side image: concept | reference | overlay (concept blue, reference orange, overlap dark). */
function comparisonImage(a: MarkSample, b: MarkSample, transformK: number): Buffer {
  const S = 160;
  const gap = 12;
  const img = createRaster(S * 3 + gap * 4, S + gap * 2, [255, 255, 255, 255]);
  const n = a.normalized.width;
  const bm = transformK ? dihedralCached(b, transformK) : b.normalized.data;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const sx = Math.floor((x / S) * n);
      const sy = Math.floor((y / S) * n);
      const va = a.normalized.data[sy * n + sx]!;
      const vb = bm[sy * n + sx]!;
      const put = (panel: number, r: number, g: number, bl: number) => {
        const o = ((y + gap) * img.width + gap + panel * (S + gap) + x) * 4;
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = bl;
      };
      const mix = (v: number, c: number) => Math.round(255 - v * (255 - c));
      put(0, mix(va, 28), mix(va, 34), mix(va, 48));
      put(1, mix(vb, 28), mix(vb, 34), mix(vb, 48));
      const both = Math.min(va, vb);
      put(
        2,
        Math.round(255 - va * 220 - both * 20),
        Math.round(255 - Math.max(va, vb) * 120 - both * 100),
        Math.round(255 - vb * 220 - both * 20),
      );
    }
  return encodePng(img);
}

const dihedralCached = (m: MarkSample, k: number) => dihedral(m.normalized, k).data;
const TRANSFORM_INDEX: Record<string, number> = {
  identity: 0,
  rot90: 1,
  rot180: 2,
  rot270: 3,
  mirror: 4,
  'mirror+rot90': 5,
  'mirror+rot180': 6,
  'mirror+rot270': 7,
};

const maxRisk = (levels: RiskLevel[]): RiskLevel =>
  levels.includes('high') ? 'high' : levels.includes('review') ? 'review' : 'low';

export async function buildOriginalityReport(
  ws: Workspace,
  brand: string,
  conceptId: string,
  opts: { competitorNames?: string[] } = {},
): Promise<{ report: OriginalityReport; jsonPath: string; mdPath: string }> {
  const concept = ws.concept(brand, conceptId);
  const markFile = concept.files.symbol ?? concept.files.wordmark;
  if (!markFile)
    throw new MarkiloError('INVALID_INPUT', `Concept ${conceptId} has no symbol or wordmark file.`);
  const sample = await loadMark(ws.conceptFile(brand, conceptId, markFile), {
    id: conceptId,
    label: concept.title,
  });

  const refs = readReferences(ws, brand).references;
  const outDir = join(ws.reportsDir(brand), `originality-${conceptId}`);
  const matches: OriginalityReport['visual']['matches'] = [];
  for (const r of refs) {
    const file = join(ws.referencesDir(brand), r.file);
    if (!existsSync(file)) continue;
    let ref: MarkSample;
    try {
      ref = await loadMark(file, { id: r.id, label: r.name });
    } catch {
      continue;
    }
    const c = await compareMarks(sample, ref);
    const entry: (typeof matches)[number] = {
      ...c,
      name: r.name,
      brand: brandKeyOf(r.name),
      source: r.source,
    };
    if (c.risk !== 'low') {
      const imgName = `vs-${r.id}.png`;
      writeGenerated(
        join(outDir, imgName),
        comparisonImage(sample, ref, TRANSFORM_INDEX[String(c.signals.silhouette?.details.transform)] ?? 0),
      );
      entry.image = `originality-${conceptId}/${imgName}`;
    }
    matches.push(entry);
  }
  matches.sort((a, b) => b.visual - a.visual);
  // Keep the closest file of each brand: a brand's second and third logo add no new evidence, only noise.
  const perBrand = matches.filter((m, i) => matches.findIndex((x) => x.brand === m.brand) === i);

  const others: Concept[] = ws.concepts(brand).filter((c) => c.id !== conceptId && c.status !== 'rejected');
  const diversity: OriginalityReport['diversity'] = [];
  for (const o of others) {
    const f = o.files.symbol ?? o.files.wordmark;
    if (!f || !existsSync(ws.conceptFile(brand, o.id, f))) continue;
    const c = await compareMarks(sample, await loadMark(ws.conceptFile(brand, o.id, f), { id: o.id }));
    diversity.push({ concept: o.id, visual: c.visual, risk: c.risk, reasons: c.reasons });
  }

  const brief = ws.brief(brand);
  const competitorNames = [
    ...(brief.competitors ?? []).map((c) => c.name),
    ...refs.map((r) => r.name),
    ...(opts.competitorNames ?? []),
  ].filter((v, i, a) => v && a.indexOf(v) === i && v.toLowerCase() !== brief.name.toLowerCase());
  const nameComparisons = competitorNames
    .map((n) => compareNames(brief.name, n))
    .sort((a, b) => b.score - a.score);
  const desc = [
    brief.oneLiner,
    brief.product?.type,
    brief.product?.category,
    ...(brief.product?.features ?? []),
  ]
    .filter(Boolean)
    .join(' ');
  const nice = brief.niceClasses?.length
    ? { classes: brief.niceClasses, reasons: ['from brief'] }
    : suggestNiceClasses(desc);
  const profile = ws.profile(brand);
  const registrySources = profile.sources.filter((s) => s.type === 'registry');
  const registrySearches = registrySources.map((s) => ({
    ref: s.ref,
    retrievedAt: s.retrievedAt,
    notes: [
      s.registry &&
        `${s.registry.id}: "${s.registry.query}"${s.registry.classes?.length ? ` classes ${s.registry.classes.join(',')}` : ''}${s.registry.resultCount !== undefined ? `, ${s.registry.resultCount} results reviewed` : ''}`,
      s.notes,
    ]
      .filter(Boolean)
      .join(' — '),
  }));
  const registryConflicts = registrySources
    .filter((s) => s.registry?.conflicts?.length)
    .map((s) => ({ registry: s.registry!.id, marks: s.registry!.conflicts! }));
  const evidence = assessEvidence({
    brandName: brief.name,
    references: refs,
    officialHosts: officialHostsFrom(brief.competitors),
    sources: profile.sources,
    competitorNames,
    suggestedClasses: nice.classes,
  });

  const g = concept.files.symbol ? await genericity(sample) : undefined;
  // "low" is only claimed when something was actually compared; otherwise the risk is unknown.
  const visualRisk: AssessedRisk = perBrand.length ? maxRisk(perBrand.map((m) => m.risk)) : 'unknown';
  const diversityRisk = maxRisk(diversity.map((d) => d.risk));
  const measuredNameRisk = nameComparisons.length ? maxRisk(nameComparisons.map((n) => n.risk)) : 'unknown';
  const nameRisk: AssessedRisk =
    registryConflicts.length && (measuredNameRisk === 'low' || measuredNameRisk === 'unknown')
      ? 'review'
      : measuredNameRisk;
  const verdict: OriginalityVerdict =
    visualRisk === 'high' || g?.level === 'generic'
      ? 'redesign'
      : visualRisk === 'review' ||
          nameRisk === 'review' ||
          nameRisk === 'high' ||
          g?.level === 'near-primitive'
        ? 'needs-review'
        : evidence.visual.coverage === 'none' || evidence.registry.coverage === 'none'
          ? 'insufficient-evidence'
          : 'no-conflicts-found';
  const confidence = verdict === 'redesign' ? 'high' : evidence.confidence;

  const limitations = [
    `Compared against ${refs.length} reference mark(s) collected for this brand; marks outside that set were not compared.`,
    'Absence of similar results is not evidence that the design or name is unique or registrable.',
    'Automated similarity measures shape, composition, structure and color. Conceptual similarity (same idea drawn differently) needs human review.',
    'This report is not legal advice and is not a trademark clearance search. Consult a trademark attorney before adoption.',
  ];
  if (!registrySearches.length)
    limitations.push(
      'No registry searches have been logged yet (markilo profile add-source --type registry ...).',
    );
  if (diversityRisk !== 'low')
    limitations.push(
      'Some concepts in this round are too similar to each other to count as separate directions.',
    );

  const report: OriginalityReport = {
    schema: 'markilo/originality@2',
    brand,
    concept: conceptId,
    generatedAt: new Date().toISOString(),
    verdict,
    confidence,
    evidence,
    scope: {
      referencesCompared: matches.length,
      brandsCompared: perBrand.length,
      references: refs.map((r) => ({ id: r.id, name: r.name, source: r.source, retrievedAt: r.retrievedAt })),
      conceptsCompared: diversity.map((d) => d.concept),
      nameCompetitors: competitorNames.length,
      registrySearchesLogged: registrySearches,
    },
    visual: { risk: visualRisk, thresholds: RISK_THRESHOLDS, matches: perBrand.slice(0, 10) },
    diversity,
    ...(g ? { genericity: g } : {}),
    name: {
      candidate: brief.name,
      risk: nameRisk,
      comparisons: nameComparisons.slice(0, 10),
      pronunciation: pronunciationNotes(brief.name),
      registryConflicts,
    },
    trademark: {
      suggestedClasses: nice.classes,
      classReasons: nice.reasons,
      registries: REGISTRIES.map(({ name, url, how }) => ({ name, url, how })),
    },
    limitations,
  };
  const jsonPath = join(ws.reportsDir(brand), `originality-${conceptId}.json`);
  const mdPath = join(ws.reportsDir(brand), `originality-${conceptId}.md`);
  writeJson(jsonPath, report);
  writeGenerated(mdPath, originalityMarkdown(report, concept));
  return { report, jsonPath, mdPath };
}

const VERDICT_TEXT: Record<OriginalityVerdict, string> = {
  'no-conflicts-found':
    'Nothing similar was found within the research scope below. This is not proof that the mark or name is available.',
  'insufficient-evidence':
    'Not enough research has been done to call this concept original. Collect the evidence listed below before relying on it.',
  'needs-review': 'Some overlaps need a human look before this concept moves forward.',
  redesign:
    'High similarity or a stock-primitive silhouette. Rework the concept rather than tweaking details.',
};

export function originalityMarkdown(r: OriginalityReport, concept: Concept): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const lines: string[] = [];
  lines.push(`# Originality & Similarity Report — ${concept.title}`, '');
  lines.push(
    `Brand \`${r.brand}\` · concept \`${r.concept}\` · generated ${r.generatedAt.slice(0, 16).replace('T', ' ')} UTC`,
    '',
  );
  lines.push(`**Verdict: ${r.verdict}** · confidence **${r.confidence}**. ${VERDICT_TEXT[r.verdict]}`, '');
  lines.push('## Evidence behind this verdict', '');
  lines.push('| Dimension | Coverage | What was done |', '| --- | --- | --- |');
  lines.push(`| Visual references | ${r.evidence.visual.coverage} | ${r.evidence.visual.have} |`);
  lines.push(`| Trademark registers | ${r.evidence.registry.coverage} | ${r.evidence.registry.have} |`);
  lines.push(`| Competitor names | ${r.evidence.names.coverage} | ${r.evidence.names.have} |`);
  lines.push('');
  if (r.evidence.missing.length)
    lines.push('To raise confidence:', '', ...r.evidence.missing.map((m) => `- ${m}`), '');
  lines.push('## Research scope', '');
  lines.push(
    `- Reference marks compared: ${r.scope.referencesCompared}${r.scope.brandsCompared !== undefined ? ` (${r.scope.brandsCompared} distinct brands)` : ''}`,
  );
  for (const ref of r.scope.references)
    lines.push(`  - ${ref.name} — ${ref.source} (retrieved ${ref.retrievedAt.slice(0, 10)})`);
  lines.push(`- Other concepts compared: ${r.scope.conceptsCompared.join(', ') || 'none'}`);
  lines.push(`- Competitor names compared: ${r.scope.nameCompetitors}`);
  lines.push(`- Registry searches logged: ${r.scope.registrySearchesLogged.length}`);
  for (const s of r.scope.registrySearchesLogged)
    lines.push(`  - ${s.ref} (${s.retrievedAt.slice(0, 10)})${s.notes ? ` — ${s.notes}` : ''}`);
  lines.push('');
  lines.push('## Visual similarity', '');
  lines.push(
    `Overall visual risk: **${r.visual.risk}** (review ≥ ${pct(r.visual.thresholds.review)}, high ≥ ${pct(r.visual.thresholds.high)}).`,
    '',
  );
  if (r.visual.matches.length) {
    lines.push(
      '| Reference | Similarity | Silhouette | Hashes | Structure | Color | Risk |',
      '| --- | --- | --- | --- | --- | --- | --- |',
    );
    for (const m of r.visual.matches)
      lines.push(
        `| ${m.name} | ${pct(m.visual)} | ${pct(m.signals.silhouette?.score ?? 0)} (${m.signals.silhouette?.details.transform}) | ${pct(m.signals['perceptual-hash']?.score ?? 0)} | ${pct(m.signals.structure?.score ?? 0)} | ${pct(m.color)} | ${m.risk} |`,
      );
    lines.push('');
    for (const m of r.visual.matches.filter((x) => x.risk !== 'low')) {
      lines.push(
        `### ${m.name} — ${m.risk}`,
        '',
        ...m.reasons.map((x) => `- ${x}`),
        '',
        `Source: ${m.source}`,
        '',
      );
      if (m.image)
        lines.push(
          `![concept vs ${m.name}](${m.image})`,
          '',
          '_Left: concept · middle: reference · right: overlay (overlap is darkest)._',
          '',
        );
    }
  } else lines.push('_No reference marks have been collected yet; visual comparison was not possible._', '');
  if (r.genericity) {
    lines.push('## Distinctiveness from stock shapes', '');
    lines.push(
      `Closest primitive: **${r.genericity.closest}** at ${pct(r.genericity.similarity)} overlap → ${r.genericity.level}.`,
      '',
    );
  }
  lines.push('## Difference from the other concepts', '');
  if (r.diversity.length) {
    lines.push('| Concept | Similarity | Assessment |', '| --- | --- | --- |');
    for (const d of r.diversity)
      lines.push(
        `| ${d.concept} | ${pct(d.visual)} | ${d.risk === 'low' ? 'distinct direction' : d.risk === 'review' ? 'related — check that the ideas differ' : 'variation of the same idea'} |`,
      );
  } else lines.push('_No other concepts to compare._');
  lines.push('', '## Name', '');
  lines.push(`Candidate: **${r.name.candidate}** · name risk **${r.name.risk}**`, '');
  if (r.name.comparisons.length) {
    lines.push(
      '| Compared with | Score | Spelling | Sound | Risk | Why |',
      '| --- | --- | --- | --- | --- | --- |',
    );
    for (const c of r.name.comparisons)
      lines.push(
        `| ${c.other} | ${pct(c.score)} | ${pct(c.signals.spelling)} | ${pct(c.signals.sound)} | ${c.risk} | ${c.reasons.join(' ')} |`,
      );
    lines.push('');
  }
  for (const c of r.name.registryConflicts)
    lines.push(`- Registry search in ${c.registry} found possibly conflicting marks: ${c.marks.join(', ')}.`);
  for (const n of r.name.pronunciation) lines.push(`- ${n}`);
  lines.push('', '## Trademark pre-screening', '');
  lines.push(
    `Suggested Nice classes (confirm with counsel): ${r.trademark.suggestedClasses.join(', ') || 'none suggested'}${r.trademark.classReasons.length ? ` — ${r.trademark.classReasons.join('; ')}` : ''}.`,
    '',
  );
  for (const reg of r.trademark.registries) lines.push(`- [${reg.name}](${reg.url}) — ${reg.how}`);
  lines.push('', '## Limitations', '', ...r.limitations.map((l) => `- ${l}`), '');
  return lines.join('\n');
}
