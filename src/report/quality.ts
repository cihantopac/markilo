import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { checkLetters, letterAdvice } from '../analyze/letters.js';
import { loadMark, sampleFromSvg } from '../analyze/mark.js';
import { assessQuality, type QualityReport } from '../analyze/quality.js';
import { compareMarks, RISK_THRESHOLDS } from '../analyze/similarity.js';
import { type ConstructionSpec, compileSpec } from '../construct/compile.js';
import { MarkiloError } from '../core/errors.js';
import { readText, writeGenerated, writeJson } from '../core/fsx.js';
import type { Workspace } from '../core/workspace.js';
import { composeLockup } from '../design/lockup.js';
import { inkMetrics } from '../export/geometry.js';
import { type ContextPeer, groundFor, renderContextSheet } from '../render/context.js';
import { renderReviewSheet, renderWordmarkSheet } from '../render/sheet.js';
import { buildOriginalityReport, readReferences } from './originality.js';

/** Collected reference marks, direct competitors first, one per brand, for the context sheet. */
async function contextPeers(ws: Workspace, brand: string): Promise<ContextPeer[]> {
  const seen = new Set<string>();
  const refs = [...readReferences(ws, brand).references].sort(
    (a, b) => Number((b.category ?? 'direct') === 'direct') - Number((a.category ?? 'direct') === 'direct'),
  );
  const out: ContextPeer[] = [];
  for (const r of refs) {
    const key = r.name.toLowerCase().replace(/\s+(icon|logo|mark|app)$/i, '');
    if (seen.has(key)) continue;
    const file = join(ws.referencesDir(brand), r.file);
    if (!existsSync(file)) continue;
    seen.add(key);
    const ext = extname(file).toLowerCase();
    const ground = groundFor(
      await loadMark(file).then(
        (m) => m.colors,
        () => [],
      ),
    );
    if (ext === '.svg') out.push({ name: r.name, svg: readFileSync(file, 'utf8'), ground });
    else
      out.push({
        name: r.name,
        raster: { bytes: readFileSync(file), mime: ext === '.png' ? 'image/png' : 'image/jpeg' },
        ground,
      });
    if (out.length >= 7) break;
  }
  return out;
}

const ICON: Record<string, string> = { pass: '✓', warn: '!', fail: '✗', info: 'i' };

export function qualityMarkdown(reports: QualityReport[], title: string): string {
  const L = [`# Quality report — ${title}`, ''];
  for (const r of reports) {
    L.push(
      `## ${r.subject} (${r.role})`,
      '',
      `${r.summary.pass} pass · ${r.summary.warn} warn · ${r.summary.fail} fail`,
      '',
    );
    L.push('| | Check | Value | Notes |', '| --- | --- | --- | --- |');
    for (const c of r.checks) L.push(`| ${ICON[c.status]} | ${c.label} | ${c.value} | ${c.message} |`);
    L.push('');
  }
  L.push(`_${reports[0]?.note ?? ''}_`, '');
  return L.join('\n');
}

/** The letter check for a wordmark built from a recipe, when the file on disk is still what that recipe draws. */
async function wordmarkLetters(ws: Workspace, brand: string, id: string, svg: string) {
  const recipe = ws.conceptFile(brand, id, 'construction-wordmark.json');
  if (!existsSync(recipe)) return undefined;
  try {
    const compiled = await compileSpec(JSON.parse(readFileSync(recipe, 'utf8')) as ConstructionSpec, {});
    if (!compiled.letters) return undefined;
    const drawn = [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
    if (drawn.join('|') !== compiled.layers.map((l) => l.d).join('|')) return undefined;
    return letterAdvice(
      await checkLetters(
        compiled.layers.map((l) => l.d),
        compiled.letters,
        { name: ws.brand(brand).name },
      ),
    );
  } catch {
    return undefined;
  }
}

/** Runs every automated check on a concept and writes the reports and the review contact sheet. */
export async function verifyConcept(ws: Workspace, brand: string, id: string) {
  ws.assertNotLocked(brand);
  const concept = ws.concept(brand, id);
  const dir = ws.conceptDir(brand, id);
  const reports: QualityReport[] = [];
  const sheets: string[] = [];
  for (const [role, rel] of [
    ['symbol', concept.files.symbol],
    ['wordmark', concept.files.wordmark],
    ['lockup', concept.files.lockupHorizontal],
  ] as const) {
    if (!rel) continue;
    const svg = readText(ws.conceptFile(brand, id, rel));
    reports.push(
      await assessQuality(svg, `${id}/${rel}`, role, { paper: concept.palette.paper ?? '#ffffff' }),
    );
    if (role === 'symbol' && concept.files.small) {
      // The small version is measured like a symbol, and must still read as the same mark: the similarity
      // engine's "review" bar (0.62), the level at which it would flag two marks as related.
      const small = readText(ws.conceptFile(brand, id, concept.files.small));
      const r = await assessQuality(small, `${id}/${concept.files.small}`, 'symbol', {
        paper: concept.palette.paper ?? '#ffffff',
      });
      const cmp = await compareMarks(
        await sampleFromSvg(small, { id: 'small' }),
        await sampleFromSvg(svg, { id: 'symbol' }),
      );
      const same = cmp.visual >= RISK_THRESHOLDS.review;
      r.checks.push({
        id: 'same-mark',
        label: 'Reads as the main symbol',
        status: same ? 'pass' : 'warn',
        value: cmp.visual,
        message: same
          ? `${Math.round(cmp.visual * 100)}% like the main symbol: the same mark, simplified.`
          : `Only ${Math.round(cmp.visual * 100)}% like the main symbol (≥ ${Math.round(RISK_THRESHOLDS.review * 100)}% reads as the same mark): at 16 px people would not connect them.`,
      });
      r.summary[same ? 'pass' : 'warn']++;
      reports.push({ ...r, role: 'small' });
    }
    if (role === 'symbol') {
      const sheet = join(dir, 'review', 'symbol-sheet.png');
      writeGenerated(sheet, await renderReviewSheet(svg, `${concept.title} — symbol`));
      sheets.push(sheet);
    }
    if (role === 'wordmark') {
      const letters = await wordmarkLetters(ws, brand, id, svg);
      if (letters) {
        const r = reports[reports.length - 1]!;
        const problems = [...letters.fix, ...letters.notes];
        r.checks.push({
          id: 'letters',
          label: 'Letters read as themselves',
          status: problems.length ? 'warn' : 'pass',
          value: problems.length,
          message: problems.length
            ? problems.join(' ')
            : 'Every changed letter still looks more like itself than like any other letter, and keeps its counters.',
        });
        r.summary[problems.length ? 'warn' : 'pass']++;
      }
      const sheet = join(dir, 'review', 'wordmark-sheet.png');
      writeGenerated(sheet, await renderWordmarkSheet(svg, `${concept.title} — wordmark`));
      sheets.push(sheet);
    }
  }
  if (!reports.length) throw new MarkiloError('INVALID_INPUT', `Concept ${id} has no files to verify.`);
  const qPath = join(ws.reportsDir(brand), `quality-${id}.json`);
  const primary = reports[0]!;
  const merged: QualityReport = {
    ...primary,
    checks: reports.flatMap((r) =>
      r.checks.map((c) => ({
        ...c,
        id: `${r.role}:${c.id}`,
        label: reports.length > 1 ? `${r.role}: ${c.label}` : c.label,
      })),
    ),
    summary: reports.reduce(
      (acc, r) => ({
        pass: acc.pass + r.summary.pass,
        warn: acc.warn + r.summary.warn,
        fail: acc.fail + r.summary.fail,
        info: acc.info + r.summary.info,
      }),
      { pass: 0, warn: 0, fail: 0, info: 0 },
    ),
  };
  writeJson(qPath, merged);
  writeGenerated(join(ws.reportsDir(brand), `quality-${id}.md`), qualityMarkdown(reports, concept.title));
  // The mark in real contexts (tabs, home screen, header, avatars) next to the collected competitors. It contains
  // third-party marks, so it goes to the git-ignored research cache.
  let contextSheet: string | undefined;
  if (concept.files.symbol) {
    contextSheet = join(ws.cacheDir(brand), 'review', `context-${id}.png`);
    const symbolSvg = readText(ws.conceptFile(brand, id, concept.files.symbol));
    const lockupRel = concept.files.lockupHorizontal;
    const lockup = lockupRel
      ? readText(ws.conceptFile(brand, id, lockupRel))
      : concept.files.wordmark
        ? composeLockup(symbolSvg, readText(ws.conceptFile(brand, id, concept.files.wordmark)), {
            layout: 'horizontal',
            symbolInk: (await inkMetrics(symbolSvg)).bbox,
          }).svg
        : undefined;
    writeGenerated(
      contextSheet,
      await renderContextSheet({
        name: ws.brand(brand).name,
        symbol: symbolSvg,
        ...(concept.files.small ? { small: readText(ws.conceptFile(brand, id, concept.files.small)) } : {}),
        ...(lockup ? { lockup } : {}),
        paper: concept.palette.paper ?? '#ffffff',
        primary: concept.palette.primary,
        peers: await contextPeers(ws, brand),
      }),
    );
  }
  const orig = await buildOriginalityReport(ws, brand, id);
  const blocking = merged.summary.fail > 0 || orig.report.verdict === 'redesign';
  if (concept.status === 'draft' && !blocking) ws.saveConcept({ ...concept, status: 'verified' });
  return {
    concept: id,
    status: blocking ? 'needs-work' : 'verified',
    quality: merged.summary,
    failing: merged.checks.filter((c) => c.status === 'fail').map((c) => `${c.label}: ${c.message}`),
    warnings: merged.checks.filter((c) => c.status === 'warn').map((c) => `${c.label}: ${c.message}`),
    originality: {
      verdict: orig.report.verdict,
      confidence: orig.report.confidence,
      missingEvidence: orig.report.evidence.missing.slice(0, 4),
      topMatch: orig.report.visual.matches[0]
        ? {
            name: orig.report.visual.matches[0].name,
            similarity: orig.report.visual.matches[0].visual,
            risk: orig.report.visual.matches[0].risk,
          }
        : null,
      genericity: orig.report.genericity ?? null,
      closestConcept: orig.report.diversity.sort((a, b) => b.visual - a.visual)[0] ?? null,
      nameRisk: orig.report.name.risk,
    },
    files: {
      reviewSheets: sheets,
      ...(contextSheet ? { contextSheet } : {}),
      quality: qPath,
      originality: orig.mdPath,
    },
  };
}
