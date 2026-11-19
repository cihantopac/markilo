import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { QualityReport } from '../analyze/quality.js';
import { readJson, readText, writeGenerated } from '../core/fsx.js';
import { portableRelative, resolveInsideReal } from '../core/paths.js';
import type { Concept, WorkspaceBrand } from '../core/types.js';
import type { Workspace } from '../core/workspace.js';
import { composeLockup } from '../design/lockup.js';
import { roundLetters, rounds } from '../design/rounds.js';
import { type BrandKit, kitPath } from '../export/kit.js';
import { artHash } from '../report/gate.js';
import type { OriginalityReport } from '../report/originality.js';
import { escapeAttr, escapeText } from '../svg/xml.js';
import {
  CHROME_CSS,
  CHROME_SCRIPT,
  footHtml,
  type StepState,
  stepsHtml,
  t,
  ta,
  topBar,
  withChrome,
} from '../ui/chrome.js';
import {
  approvedPanel,
  boardHtml,
  DARK,
  inline,
  maybeJson,
  proposalHtml,
  type Subject,
  sketchCards,
  tileHtml,
} from './cards.js';
import { GALLERY_SCRIPT } from './client.js';
import { GALLERY_CSS } from './style.js';

function subjectsFor(ws: Workspace, b: WorkspaceBrand): Subject[] {
  const out: Subject[] = [];
  const reports = ws.reportsDir(b.slug);
  const kitFile = kitPath(ws, b.slug);
  const kit = maybeJson<BrandKit>(kitFile);
  if (kit) {
    const f = (rel?: string) => (rel ? readText(resolveInsideReal(ws.finalDir(b.slug), rel)) : undefined);
    const symbol = f(kit.files.symbol);
    const wordmark = f(kit.files.wordmark);
    const lockup = f(kit.files.lockupHorizontal);
    out.push({
      key: 'final',
      brand: b,
      title: `${b.name} — ${kit.locked ? 'preserved identity' : 'approved identity'}`,
      status: kit.locked ? 'locked' : 'approved',
      ...(symbol ? { symbol } : {}),
      ...(wordmark ? { wordmark } : {}),
      ...(lockup ? { lockup } : {}),
      palette: kit.palette,
      grounds: kit.palette,
      locked: kit.locked,
      ...(kit.concept
        ? { quality: maybeJson<QualityReport>(join(reports, `quality-${kit.concept}.json`)) }
        : {}),
    } as Subject);
  }
  if (b.locked) return out;
  for (const c of ws.concepts(b.slug)) {
    if (kit?.concept === c.id) continue;
    const read = (rel?: string) =>
      rel && existsSync(ws.conceptFile(b.slug, c.id, rel))
        ? readText(ws.conceptFile(b.slug, c.id, rel))
        : undefined;
    const symbol = read(c.files.symbol);
    const wordmark = read(c.files.wordmark);
    let lockup = read(c.files.lockupHorizontal);
    if (!lockup && symbol && wordmark) lockup = composeLockup(symbol, wordmark, { layout: 'horizontal' }).svg;
    if (!symbol && !wordmark) continue;
    const q = maybeJson<QualityReport>(join(reports, `quality-${c.id}.json`));
    const o = maybeJson<OriginalityReport>(join(reports, `originality-${c.id}.json`));
    out.push({
      key: c.id,
      brand: b,
      title: c.title,
      status: c.status,
      ...(symbol ? { symbol } : {}),
      ...(wordmark ? { wordmark } : {}),
      ...(lockup ? { lockup } : {}),
      palette: {
        primary: c.palette.primary,
        ...(c.palette.secondary ? { secondary: c.palette.secondary } : {}),
        ...(c.palette.accent ? { accent: c.palette.accent } : {}),
        ink: c.palette.ink ?? '#16181d',
        paper: c.palette.paper ?? '#ffffff',
        dark: DARK,
      },
      grounds: c.palette,
      concept: c,
      art: artHash(symbol, wordmark),
      ...(q ? { quality: q } : {}),
      ...(o ? { originality: o } : {}),
      ...(c.refreshedFrom ? originalOf(ws, b.slug, c) : {}),
      locked: false,
    });
  }
  return out;
}

/** Raster originals larger than this are shown as their trace instead (the page inlines every image). */
const MAX_INLINE_ORIGINAL = 4 * 1024 * 1024;
const RASTER_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** A refresh concept's original mark as gallery markup: the SVG inlined (sanitized), a raster as a data: image. */
function originalOf(ws: Workspace, slug: string, c: Concept): { original?: string } {
  const rel = c.refreshedFrom?.file;
  if (!rel) return {};
  const path = ws.conceptFile(slug, c.id, rel);
  if (!existsSync(path)) return {};
  try {
    const ext = extname(path).toLowerCase();
    if (ext === '.svg') return { original: inline(readText(path), 220, 220, '', 'original') };
    const mime = RASTER_MIME[ext];
    const trace = ws.conceptFile(slug, c.id, 'trace.svg');
    if (mime && statSync(path).size <= MAX_INLINE_ORIGINAL)
      return {
        original: `<img src="data:${mime};base64,${readFileSync(path).toString('base64')}" alt="original">`,
      };
    if (existsSync(trace)) return { original: inline(readText(trace), 220, 220, '', 'original') };
  } catch {
    // An unreadable original is left out; the concept itself is still shown.
  }
  return {};
}

export async function buildGallery(
  ws: Workspace,
  opts: { brands?: string[] } = {},
): Promise<{ path: string; subjects: number }> {
  const m = ws.manifest;
  const brands = m.brands.filter((b) => !opts.brands?.length || opts.brands.includes(b.slug));
  const sections: string[] = [];
  let count = 0;
  const familyMarks: string[] = [];
  let delivered = 0;
  let exported = 0;
  for (const b of brands) {
    const subjects = subjectsFor(ws, b);
    count += subjects.length;
    const first = subjects.find((s) => s.symbol);
    if (first?.symbol)
      familyMarks.push(
        `<div class="fm">${inline(first.symbol, 72, 72)}<span>${escapeText(b.name)}</span></div>`,
      );
    const exports = existsSync(join(ws.exportsDir(b.slug), 'asset-manifest.json'))
      ? readJson<{ assets: { group: string; path: string }[] }>(
          join(ws.exportsDir(b.slug), 'asset-manifest.json'),
        )
      : undefined;
    const exportList = exports
      ? `<details class="assets"><summary>${t('Exported assets ({0})', [exports.assets.length])}</summary>${Object.entries(
          exports.assets.reduce<Record<string, string[]>>((acc, a) => {
            acc[a.group] = [...(acc[a.group] ?? []), a.path];
            return acc;
          }, {}),
        )
          .map(
            ([g, files]) =>
              `<p><b>${escapeText(g)}</b> (${files.length}) ${files
                .filter(
                  (f) =>
                    f.endsWith('.svg') || f.endsWith('.ico') || f.endsWith('.icns') || f.endsWith('1024.png'),
                )
                .slice(0, 8)
                .map(
                  (f) =>
                    `<a href="${escapeAttr(portableRelative(ws.galleryDir(), join(ws.exportsDir(b.slug), f)))}">${escapeText(f.split('/').pop()!)}</a>`,
                )
                .join(' ')}</p>`,
          )
          .join('')}</details>`
      : '';
    const approved = subjects.find((s) => s.key === 'final');
    if (approved) {
      delivered++;
      if (exports) exported++;
      // Delivered: the approved identity leads; explored concepts are history, not choices.
      const explored: string[] = [];
      for (const s of subjects.filter((x) => x.key !== 'final'))
        explored.push(await proposalHtml(s, { review: false }));
      sections.push(
        `<section class="brand"><div class="brandhead"><h2>${escapeText(b.name)}</h2><small>${t(b.role)} · ${t(approved.locked ? 'locked identity' : 'approved identity')}</small></div>${await approvedPanel(ws, b, approved, exports)}${explored.length ? `<details class="rejected-list"><summary>${t('Explored concepts ({0}) — for reference', [explored.length])}</summary><div class="grid">${explored.join('\n')}</div></details>` : ''}${exportList}</section>`,
      );
      continue;
    }
    const active: string[] = [];
    const rejected: string[] = [];
    // Proposals are grouped by round, the latest first; each round can be rejected as a whole.
    const byRound = new Map<number, { tile: string; card: string }[]>();
    const letters = new Map<string, string>();
    const rank = new Map<string, number>();
    for (const g of rounds(ws.concepts(b.slug))) {
      for (const [id, l] of roundLetters(g.concepts)) letters.set(id, l);
      for (const c of g.concepts) rank.set(c.id, rank.size);
    }
    const ordered = [...subjects].sort(
      (a, b) => (rank.get(a.concept?.id ?? '') ?? -1) - (rank.get(b.concept?.id ?? '') ?? -1),
    );
    for (const s of ordered) {
      const r = s.concept?.round;
      if (r !== undefined && s.status !== 'rejected') {
        const cards = byRound.get(r) ?? [];
        const letter = letters.get(s.concept!.id)!;
        byRound.set(r, [...cards, { tile: tileHtml(s, letter), card: await proposalHtml(s, { letter }) }]);
      } else (s.status === 'rejected' ? rejected : active).push(await proposalHtml(s));
    }
    const roundPanels = [...byRound.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(
        ([r, cards], i) =>
          `<${i ? 'details class="round"' : 'div class="round"'}>${i ? `<summary>${t('Round {0} ({1})', [r, cards.length])}</summary>` : `<p class="eyebrow">${cards.length === 3 ? t('Round {0} — three directions', [r]) : cards.length === 1 ? t('Round {0} — one proposal', [r]) : t('Round {0} — {1} proposals', [r, cards.length])}</p>`}${boardHtml(cards.map((c) => c.tile))}<div class="proposals">${cards.map((c) => c.card).join('\n')}</div>${i ? '' : `<div class="rejectall" data-brand="${escapeAttr(b.slug)}" data-round="${r}"><span class="muted">${t('None of them right?')}</span><button type="button" class="chip" data-reject-all>${cards.length === 3 ? t('Reject all three') : cards.length === 1 ? t('Reject it') : t('Reject all {0}', [cards.length])}</button><input type="text" class="note"${ta('placeholder', 'What is missing? What should the next round try?')}></div>`}</${i ? 'details' : 'div'}>`,
      )
      .join('');
    const sketches = b.locked ? [] : sketchCards(ws, b);
    const ideas = b.locked ? '' : ideasPanel(ws, b.slug);
    sections.push(
      `<section class="brand"><div class="brandhead"><h2>${escapeText(b.name)}</h2><small>${t(b.role)}${b.locked ? ` · ${t('locked')}` : ''} · ${t('{0} to review', [active.length + [...byRound.values()].reduce((a, x) => a + x.length, 0)])}</small></div>${roundPanels}${ideas}${sketches.length ? `<p class="eyebrow">${t('Sketches — pick one per direction to develop ({0})', [sketches.length])}</p><div class="grid wide">${sketches.join('\n')}</div>` : ''}${active.length || (!sketches.length && !byRound.size) ? `<div class="grid">${active.join('\n') || (rejected.length ? `<p class="empty">${t('Nothing is waiting for a decision. The {0} rejected concepts are below; point at one you still like and send it to your agent, or ask for new directions.', [rejected.length])}</p>` : `<p class="empty">${t('No concepts yet.')}</p>`)}</div>` : ''}${rejected.length ? `<details class="rejected-list"${active.length ? '' : ' open'}><summary>${t('Rejected ({0})', [rejected.length])}</summary><div class="grid">${rejected.join('\n')}</div></details>` : ''}${exportList}</section>`,
    );
  }
  const family =
    m.family && familyMarks.length > 1
      ? `<section class="family brand"><div class="brandhead"><h2>${escapeText(m.family.name)}</h2><small>${t('family')}</small></div><div class="fmrow">${familyMarks.join('')}</div></section>`
      : '';
  const reviewing = sections.some((x) => x.includes('class="decide'));
  const steps: StepState[] = reviewing
    ? ['done', 'now', 'now', 'next', 'next']
    : delivered && delivered === brands.length
      ? exported === delivered
        ? ['done', 'done', 'done', 'done', 'done']
        : ['done', 'done', 'done', 'done', 'now']
      : ['now', 'next', 'next', 'next', 'next'];
  const html = page(m.name, family + sections.join('\n'), reviewing, steps);
  const path = join(ws.galleryDir(), 'index.html');
  writeGenerated(path, html);
  return { path, subjects: count };
}

/** The idea longlist with the critic's readings: why each direction exists, and what was struck before drawing. */
function ideasPanel(ws: Workspace, slug: string): string {
  const { ideas } = ws.ideas(slug);
  if (!ideas.length) return '';
  const kept = ideas
    .filter((i) => i.review?.verdict === 'keep')
    .sort((a, b) => (a.review!.rank ?? 99) - (b.review!.rank ?? 99));
  const struck = ideas.filter((i) => i.review?.verdict === 'strike');
  const open = ideas.filter((i) => !i.review);
  const row = (i: (typeof ideas)[number]) =>
    `<li><b>${escapeText(i.id)}</b> ${escapeText(i.hook)} <small>— ${escapeText(i.means)} · ${escapeText(i.source)}${i.concepts?.length ? ` · ${t('became {0}', [i.concepts.join(', ')])}` : ''}</small>${i.review ? `<br><small class="reading">${t('Critic:')} ${escapeText(i.review.reading)}</small>` : ''}</li>`;
  return `<details class="ideas"${kept.length || open.length ? ' open' : ''}><summary>${t('Ideas — {0} kept, {1} struck', [kept.length, struck.length])}${open.length ? `, ${t('{0} not reviewed', [open.length])}` : ''}</summary>${kept.length ? `<ol>${kept.map(row).join('')}</ol>` : ''}${open.length ? `<ul>${open.map(row).join('')}</ul>` : ''}${struck.length ? `<details><summary>${t('Struck before drawing ({0})', [struck.length])}</summary><ul class="struck">${struck.map(row).join('')}</ul></details>` : ''}</details>`;
}

function page(title: string, body: string, reviewing: boolean, steps: StepState[]): string {
  // Defence in depth: SVG from research and other people's repositories is sanitized before it is inlined, and the
  // page's own scripts are the only ones allowed to run (a fresh nonce per build), so anything that slipped through
  // still cannot execute or call out.
  const nonce = randomBytes(16).toString('base64');
  const lede = reviewing
    ? t('Pick one, ask for changes, or compare. The choice is yours.')
    : t('The approved identity, its variants and the exported files.');
  return withChrome(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'">
<title>${escapeText(title)} — ${reviewing ? 'Markilo review' : 'brand identity'}</title>
<script nonce="${nonce}">${CHROME_SCRIPT}</script>
<style>
${CHROME_CSS}
${GALLERY_CSS}
</style></head><body>
${topBar(reviewing ? 'Review' : 'Brand identity', stepsHtml(steps))}
<header class="intro"><h1>${escapeText(title)}</h1><p class="lede">${lede}</p>${reviewing ? `<noscript><p class="noscript">${t('Scripts are off here: look at the proposals and answer in chat, or open this file in a browser to record decisions.')}</p></noscript>` : ''}</header>
<main>${body}</main>
${footHtml()}
${reviewing ? '' : '<style>.actionbar{display:none}body{padding-bottom:0}</style>'}<div class="actionbar"><span class="sum" id="sum">${t('No decisions yet.')}</span><button type="button" id="clear">${t('Clear')}</button><button type="button" id="cmpbtn" disabled>${t('Compare ({0})', [0])}</button><button type="button" id="send">${t('Download decisions')}</button><button type="button" class="primary" id="copy">${t('Copy decisions')}</button></div>
<dialog id="cmpd"><h2>${t('Side by side')}</h2><div class="cmpgrid" id="cmpgrid"></div><input type="text" id="cmpreason"${ta('placeholder', 'Why do you prefer it? (optional, then press Prefer this)')}><p class="muted" id="cmpwhy"></p><button type="button" class="btn" id="cmpclose">${t('Close')}</button></dialog>
<dialog id="copyd"><h2>${t('Copy decisions')}</h2><p class="muted">${t('Copy this text and paste it into the chat with your agent.')}</p><textarea id="copytext" readonly${ta('aria-label', 'Your decisions')}></textarea><button type="button" class="btn" id="copyclose">${t('Close')}</button></dialog>
<script nonce="${nonce}">${GALLERY_SCRIPT}</script>
</body></html>
`);
}
