import { copyFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { hexToOklch, oklchToHex } from '../analyze/color.js';
import { MarkiloError } from '../core/errors.js';
import { nowIso, readJson, readText, writeGenerated, writeJson } from '../core/fsx.js';
import { resolveInsideReal } from '../core/paths.js';
import type { Workspace } from '../core/workspace.js';
import { composeLockup } from '../design/lockup.js';
import { type GateResult, gateOf } from '../report/gate.js';
import { lintSvg } from '../svg/lint.js';
import { optimizeSvg } from '../svg/optimize.js';
import { inkMetrics } from './geometry.js';

/** The approved, frozen identity that every export is derived from. Lives in brands/<slug>/final/. */
export interface BrandKit {
  schema: 'markilo/kit@1';
  brand: string;
  name: string;
  concept?: string;
  /** Locked kits are reproduced exactly: no recoloring, no re-composition, no optimization. */
  locked: boolean;
  files: {
    symbol?: string;
    wordmark?: string;
    lockupHorizontal?: string;
    lockupStacked?: string;
    lockupCompact?: string;
    /** The simplified symbol used at 32 px and below. */
    symbolSmall?: string;
  };
  palette: { primary: string; secondary?: string; accent?: string; ink: string; paper: string; dark: string };
  typography?: { fontId: string; weight: number; family?: string; license?: string };
  tagline?: string;
  /** Usage rules decided at approval (e.g. "never use the accent as an error color"); shown in the guidelines. */
  notes?: string[];
  approvedAt: string;
  /** Originality status at approval time, so exports and guidelines can say what was (not) checked. */
  originality?: {
    verdict: string;
    confidence: string;
    acceptedRisk: boolean;
    report: string;
    /** What the verdict rests on, so guidelines can state it plainly (e.g. that no registry search was done). */
    evidence?: { visual: string; registry: string; registryCoverage: string };
  };
  /** The critic gate at approval time; a concept that did not pass needs the user's own reason. */
  gate?: { status: GateResult['status']; average?: number; reasons: string[]; userChoice?: string };
}

export const kitPath = (ws: Workspace, brand: string) => join(ws.finalDir(brand), 'brand.json');

export function loadKit(
  ws: Workspace,
  brand: string,
): BrandKit & { read(file: keyof BrandKit['files']): string | undefined } {
  const p = kitPath(ws, brand);
  if (!existsSync(p)) {
    throw new MarkiloError(
      'NOT_FOUND',
      `No approved kit for "${brand}".`,
      'Run "markilo finalize --brand <slug> --concept <id>" (or "markilo lock" for a preserved identity).',
    );
  }
  const kit = readJson<BrandKit>(p);
  const HEX = /^#[0-9a-fA-F]{6}$/;
  for (const [k, v] of Object.entries(kit.palette ?? {})) {
    if (typeof v !== 'string' || !HEX.test(v))
      throw new MarkiloError('INVALID_INPUT', `final/brand.json palette.${k} must be #rrggbb.`);
  }
  return {
    ...kit,
    read(file) {
      const rel = kit.files[file];
      return rel ? readText(resolveInsideReal(ws.finalDir(brand), rel)) : undefined;
    },
  };
}

/** Near-neutral inks tinted toward the brand hue read as part of the system rather than as stock black. */
function inkFor(primary: string): { ink: string; dark: string } {
  const h = hexToOklch(primary).h;
  return { ink: oklchToHex({ l: 0.2, c: 0.012, h }), dark: oklchToHex({ l: 0.16, c: 0.012, h }) };
}

/** Freezes an approved concept into final/: optimized masters, generated lockups and brand.json. */
export async function finalizeConcept(
  ws: Workspace,
  brand: string,
  conceptId: string,
  opts: {
    tagline?: string;
    force?: boolean;
    acceptRisk?: boolean;
    notes?: string[];
    userChoice?: string;
  } = {},
): Promise<BrandKit> {
  ws.assertNotLocked(brand);
  const concept = ws.concept(brand, conceptId);
  const gate = gateOf(concept);
  // Only an independent critic's pass, or the user's own choice, finalizes a concept: an unreviewed or undecided one
  // would let the designer approve its own work.
  if (gate.status !== 'passed' && !opts.userChoice?.trim()) {
    throw new MarkiloError(
      'INVALID_INPUT',
      gate.status === 'not-reviewed'
        ? `Concept ${conceptId} has not been reviewed by the critic.`
        : gate.status === 'undecided'
          ? `Concept ${conceptId} is undecided: ${gate.reasons.join('; ')}.`
          : `Concept ${conceptId} did not pass the critic gate: ${gate.reasons.join('; ')}.`,
      gate.status === 'undecided'
        ? 'Ask fresh design-critic agents for the remaining cold looks (concept update --look … --look-present …).'
        : 'Have the design-critic agent review it, or, if the user chose it anyway, pass --user-choice "<their reason>".',
    );
  }
  const reportFile = join(ws.reportsDir(brand), `originality-${conceptId}.json`);
  if (!existsSync(reportFile)) {
    throw new MarkiloError(
      'INVALID_INPUT',
      `Concept ${conceptId} has no originality report.`,
      `Run "markilo verify --brand ${brand} --concept ${conceptId}" first.`,
    );
  }
  const orig = readJson<{
    verdict: string;
    confidence?: string;
    evidence?: { visual: { have: string }; registry: { have: string; coverage: string } };
  }>(reportFile);
  if (orig.verdict === 'redesign') {
    throw new MarkiloError(
      'INVALID_INPUT',
      `Concept ${conceptId} has originality verdict "redesign" and cannot be approved.`,
      'Rework the concept and verify it again.',
    );
  }
  const qualityFile = join(ws.reportsDir(brand), `quality-${conceptId}.json`);
  const quality = existsSync(qualityFile)
    ? readJson<{ checks: { label: string; status: string; message: string }[] }>(qualityFile)
    : undefined;
  const fails = quality?.checks.filter((c) => c.status === 'fail') ?? [];
  if (fails.length && !opts.acceptRisk) {
    throw new MarkiloError(
      'INVALID_INPUT',
      `Concept ${conceptId} has failing technical checks: ${fails.map((f) => f.label).join('; ')}.`,
      `${fails[0]!.message} Fix and verify again, or pass --accept-risk only if the user knowingly accepts it.`,
    );
  }
  if (orig.verdict !== 'no-conflicts-found' && !opts.acceptRisk) {
    throw new MarkiloError(
      'INVALID_INPUT',
      `Originality verdict is "${orig.verdict}" (confidence ${orig.confidence ?? 'unknown'}).`,
      'Collect the missing evidence and verify again, or, if the user knowingly accepts the risk, pass --accept-risk.',
    );
  }
  const dir = ws.finalDir(brand);
  if (existsSync(kitPath(ws, brand)) && !opts.force) {
    throw new MarkiloError(
      'EXISTS',
      `${brand} already has an approved kit.`,
      'Pass --force to replace it with this concept.',
    );
  }
  const files: BrandKit['files'] = {};
  const take = (rel: string | undefined, out: string) => {
    if (!rel) return undefined;
    const src = readText(ws.conceptFile(brand, conceptId, rel));
    const lint = lintSvg(src, { master: true });
    const errors = lint.issues.filter((i) => i.severity === 'error');
    if (errors.length)
      throw new MarkiloError(
        'INVALID_SVG',
        `${rel} is not a valid master: ${errors.map((e) => e.message).join(' ')}`,
      );
    const svg = optimizeSvg(src);
    writeGenerated(join(dir, out), svg);
    return svg;
  };
  const symbol = take(concept.files.symbol, 'symbol.svg');
  // Lockups place the symbol by its ink, so artboard margins do not change the gap or the symbol's size.
  const symbolInk = symbol ? (await inkMetrics(symbol)).bbox : undefined;
  const wordmark = take(concept.files.wordmark, 'wordmark.svg');
  if (symbol) files.symbol = 'symbol.svg';
  if (wordmark) files.wordmark = 'wordmark.svg';
  if (symbol && take(concept.files.small, 'symbol-small.svg')) files.symbolSmall = 'symbol-small.svg';
  const lockup = (
    rel: string | undefined,
    out: string,
    layout: 'horizontal' | 'stacked',
    scale?: number,
    gap?: number,
  ) => {
    if (rel) return take(rel, out);
    if (!symbol || !wordmark) return undefined;
    const l = composeLockup(symbol, wordmark, {
      layout,
      ...(symbolInk ? { symbolInk } : {}),
      title: concept.title,
      ...(scale ? { symbolScale: scale } : {}),
      ...(gap ? { gap } : {}),
    });
    writeGenerated(join(dir, out), l.svg);
    return l.svg;
  };
  if (lockup(concept.files.lockupHorizontal, 'lockup-horizontal.svg', 'horizontal'))
    files.lockupHorizontal = 'lockup-horizontal.svg';
  if (lockup(concept.files.lockupStacked, 'lockup-stacked.svg', 'stacked'))
    files.lockupStacked = 'lockup-stacked.svg';
  if (lockup(undefined, 'lockup-compact.svg', 'horizontal', 1, 0.4))
    files.lockupCompact = 'lockup-compact.svg';

  const { ink, dark } = inkFor(concept.palette.primary);
  const kit: BrandKit = {
    schema: 'markilo/kit@1',
    brand,
    name: ws.brand(brand).name,
    concept: conceptId,
    locked: false,
    files,
    palette: {
      primary: concept.palette.primary,
      ...(concept.palette.secondary ? { secondary: concept.palette.secondary } : {}),
      ...(concept.palette.accent ? { accent: concept.palette.accent } : {}),
      ink: concept.palette.ink ?? ink,
      paper: concept.palette.paper ?? '#ffffff',
      dark,
    },
    ...(concept.typography ? { typography: concept.typography } : {}),
    ...(opts.tagline ? { tagline: opts.tagline } : {}),
    ...(opts.notes?.length ? { notes: opts.notes } : {}),
    approvedAt: nowIso(),
    originality: {
      verdict: orig.verdict,
      confidence: orig.confidence ?? 'unknown',
      acceptedRisk: orig.verdict !== 'no-conflicts-found',
      report: `../reports/originality-${conceptId}.md`,
      ...(orig.evidence
        ? {
            evidence: {
              visual: orig.evidence.visual.have,
              registry: orig.evidence.registry.have,
              registryCoverage: orig.evidence.registry.coverage,
            },
          }
        : {}),
    },
    gate: {
      status: gate.status,
      ...(gate.average !== undefined ? { average: gate.average } : {}),
      reasons: gate.reasons,
      ...(gate.status !== 'passed' && opts.userChoice?.trim() ? { userChoice: opts.userChoice.trim() } : {}),
    },
  };
  writeJson(kitPath(ws, brand), kit);
  ws.saveConcept({ ...concept, status: 'approved' });
  ws.logDecision(
    brand,
    'Approved',
    `${conceptId} (${concept.title}). Gate ${gate.status}${gate.average !== undefined ? ` (average ${gate.average})` : ''}${kit.gate?.userChoice ? `; chosen by the user anyway: ${kit.gate.userChoice}` : ''}. Originality ${orig.verdict} (${orig.confidence ?? 'unknown'} confidence)${orig.verdict !== 'no-conflicts-found' ? ', risk accepted' : ''}.`,
  );
  return kit;
}

/** Registers an existing identity that must be preserved exactly (copied byte-for-byte). */
const ACTIVE_RULES = new Set([
  'no-script',
  'no-foreign-object',
  'no-active-content',
  'no-event-handlers',
  'no-external',
]);

export function lockIdentity(
  ws: Workspace,
  brand: string,
  input: {
    symbol?: string;
    wordmark?: string;
    lockup?: string;
    primary: string;
    paper?: string;
    ink?: string;
    force?: boolean;
  },
): BrandKit {
  for (const [k, v] of Object.entries({ primary: input.primary, paper: input.paper, ink: input.ink })) {
    if (v !== undefined && !/^#[0-9a-fA-F]{6}$/.test(v))
      throw new MarkiloError('INVALID_INPUT', `--${k} must be #rrggbb.`);
  }
  const dir = ws.finalDir(brand);
  if (existsSync(kitPath(ws, brand)) && !input.force)
    throw new MarkiloError('EXISTS', `${brand} already has a kit.`, 'Pass --force to replace it.');
  const files: BrandKit['files'] = {};
  const copy = (src: string | undefined, key: keyof BrandKit['files']) => {
    if (!src) return;
    if (!existsSync(src)) throw new MarkiloError('NOT_FOUND', `File not found: ${src}`);
    const lint = lintSvg(readText(src));
    if (lint.issues.some((i) => i.rule === 'parse'))
      throw new MarkiloError('INVALID_SVG', `${src} is not a parseable SVG.`);
    // A locked file is reproduced byte for byte in every export and may be installed into a site: it must not carry
    // anything that runs or reaches out when a browser shows it.
    const active = lint.issues.filter((i) => ACTIVE_RULES.has(i.rule));
    if (active.length)
      throw new MarkiloError(
        'INVALID_SVG',
        `${src} contains active or external content, so it cannot be locked as is: ${active.map((i) => i.message).join(' ')}`,
        `Clean a copy first ("markilo svg optimize ${basename(src)} -o clean.svg" removes scripts, handlers and external references), check it looks the same, and lock the copy.`,
      );
    const out = `locked-${key}-${basename(src)}`;
    copyFileSync(src, join(dir, out));
    files[key] = out;
  };
  writeJson(join(dir, '.keep.json'), { note: 'Locked identity: files are stored unmodified.' });
  copy(input.symbol, 'symbol');
  copy(input.wordmark, 'wordmark');
  copy(input.lockup, 'lockupHorizontal');
  if (!Object.keys(files).length)
    throw new MarkiloError('USAGE', 'Provide at least one of --symbol, --wordmark, --lockup.');
  const { ink, dark } = inkFor(input.primary);
  const kit: BrandKit = {
    schema: 'markilo/kit@1',
    brand,
    name: ws.brand(brand).name,
    locked: true,
    files,
    palette: { primary: input.primary, ink: input.ink ?? ink, paper: input.paper ?? '#ffffff', dark },
    approvedAt: nowIso(),
  };
  writeJson(kitPath(ws, brand), kit);
  const m = structuredClone(ws.manifest);
  const b = m.brands.find((x) => x.slug === brand)!;
  b.locked = true;
  ws.saveManifest(m);
  ws.logDecision(
    brand,
    'Locked',
    `Existing identity registered as locked (${Object.keys(files).join(', ')}); it is reproduced exactly and never redesigned.`,
  );
  return kit;
}
