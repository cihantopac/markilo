import { copyFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { hexToOklch, oklchToHex } from '../analyze/color.js';
import { MarkiloError } from '../core/errors.js';
import { nowIso, readJson, readText, writeGenerated, writeJson } from '../core/fsx.js';
import type { Workspace } from '../core/workspace.js';
import { composeLockup } from '../design/lockup.js';
import { lintSvg } from '../svg/lint.js';
import { optimizeSvg } from '../svg/optimize.js';

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
  };
  palette: { primary: string; secondary?: string; accent?: string; ink: string; paper: string; dark: string };
  typography?: { fontId: string; weight: number; family?: string; license?: string };
  tagline?: string;
  approvedAt: string;
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
  return {
    ...kit,
    read(file) {
      const rel = kit.files[file];
      return rel ? readText(join(ws.finalDir(brand), rel)) : undefined;
    },
  };
}

/** Near-neutral inks tinted toward the brand hue read as part of the system rather than as stock black. */
function inkFor(primary: string): { ink: string; dark: string } {
  const h = hexToOklch(primary).h;
  return { ink: oklchToHex({ l: 0.2, c: 0.012, h }), dark: oklchToHex({ l: 0.16, c: 0.012, h }) };
}

/** Freezes an approved concept into final/: optimized masters, generated lockups and brand.json. */
export function finalizeConcept(
  ws: Workspace,
  brand: string,
  conceptId: string,
  opts: { tagline?: string; force?: boolean } = {},
): BrandKit {
  ws.assertNotLocked(brand);
  const concept = ws.concept(brand, conceptId);
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
  const wordmark = take(concept.files.wordmark, 'wordmark.svg');
  if (symbol) files.symbol = 'symbol.svg';
  if (wordmark) files.wordmark = 'wordmark.svg';
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
  if (lockup(undefined, 'lockup-compact.svg', 'horizontal', 1.3, 0.5))
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
    approvedAt: nowIso(),
  };
  writeJson(kitPath(ws, brand), kit);
  ws.saveConcept({ ...concept, status: 'approved' });
  return kit;
}

/** Registers an existing identity that must be preserved exactly (copied byte-for-byte). */
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
  return kit;
}
