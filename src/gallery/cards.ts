import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { QualityReport } from '../analyze/quality.js';
import { readJson, readText } from '../core/fsx.js';
import { portableRelative } from '../core/paths.js';
import type { Concept, WorkspaceBrand } from '../core/types.js';
import type { Workspace } from '../core/workspace.js';
import { placeMark, squircle } from '../export/geometry.js';
import { type GroundPalette, groundsFor, markOnGround, tileGround } from '../export/variants.js';
import { gateOf } from '../report/gate.js';
import type { OriginalityReport } from '../report/originality.js';
import { aspectOf, nestSvg, svgDocument } from '../svg/compose.js';
import { escapeAttr, escapeText } from '../svg/xml.js';
import { t, ta } from '../ui/chrome.js';

/** The gallery's markup: the round's board, one proposal at a time, the approved identity and sketch boards. */

export interface Subject {
  key: string;
  brand: WorkspaceBrand;
  title: string;
  status: string;
  symbol?: string;
  wordmark?: string;
  lockup?: string;
  palette: { primary: string; secondary?: string; accent?: string; ink: string; paper: string; dark: string };
  /** The palette the ground resolver reads (onDark/onLight, onBrand, tile), as previews and export read it. */
  grounds: GroundPalette;
  concept?: Concept;
  /** artHash of the concept's symbol and wordmark as they are now (a critique of an older drawing reads stale). */
  art?: string;
  quality?: QualityReport;
  originality?: OriginalityReport;
  locked: boolean;
}

export const DARK = '#111318';

/** Inline SVG sized for HTML; ids are prefixed so many marks can share the page. */
export function inline(svg: string, w: number, h: number, cls = '', label = 'logo'): string {
  return svgDocument(w, h, nestSvg(svg, { x: 0, y: 0, width: w, height: h })).replace(
    '<svg ',
    `<svg class="${cls}" role="img" aria-label="${escapeAttr(label)}" `,
  );
}

export function fitInline(svg: string, maxW: number, maxH: number, cls = ''): string {
  const a = aspectOf(svg);
  const w = Math.min(maxW, maxH * a);
  return inline(svg, Math.round(w), Math.round(w / a), cls);
}

async function tile(
  s: Subject,
  size: number,
  shape: 'squircle' | 'circle' | 'square',
  fraction = 0.58,
): Promise<string> {
  if (!s.symbol) return '';
  const fill = s.locked ? s.palette.paper : tileGround(s.grounds);
  const mark = s.locked ? s.symbol : markOnGround(s.symbol, fill, s.grounds, { tile: true });
  const under =
    shape === 'circle'
      ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${fill}"/>`
      : shape === 'square'
        ? `<rect width="${size}" height="${size}" fill="${fill}"/>`
        : squircle(size, 0, size * 0.225, fill);
  const body =
    under +
    (await placeMark(
      mark,
      { x: 0, y: 0, width: size, height: size },
      shape === 'circle' ? { mode: 'circle', radius: 0.33 } : { mode: 'box', fraction },
    ));
  return svgDocument(size, size, body).replace('<svg ', '<svg class="apptile" ');
}

async function mockups(s: Subject): Promise<string> {
  const art = s.lockup ?? s.wordmark ?? s.symbol!;
  // Every surface gets artwork adapted to its own background (no-op when contrast is already fine).
  const on = (svg: string, ground: string) =>
    s.locked ? svg : markOnGround(svg, ground, s.grounds, { neutrals: { dark: s.palette.ink } });
  const rev = on(art, DARK);
  const onWhite = on(art, '#ffffff');
  const favicon = s.symbol ? inline(on(s.symbol, '#ffffff'), 16, 16) : '';
  const parts: string[] = [];
  const cap = (en: string) => `<figcaption>${t(en)}</figcaption>`;
  parts.push(
    `<figure class="mock browser"><div class="tabbar"><div class="tab">${favicon}<span>${escapeText(s.brand.name)}</span></div><div class="tab ghost"><span>New tab</span></div></div><div class="addr">${escapeText(s.brand.slug)}.example</div><div class="page"><nav>${fitInline(onWhite, 150, 28)}<span>Product</span><span>Pricing</span><span class="btn-mock" style="background:${s.palette.primary}">Get started</span></nav><div class="hero"><b></b><i></i><i></i></div></div>${cap('Browser tab & site header')}</figure>`,
  );
  parts.push(
    `<figure class="mock darkui"><nav>${fitInline(rev, 150, 28)}<span>Docs</span><span>Blog</span></nav><div class="hero"><b></b><i></i></div>${cap('Dark interface')}</figure>`,
  );
  if (s.symbol) {
    const appTile = await tile(s, 64, 'squircle', 0.6);
    const apps = ['#e9e2d6', '#ddd5c9', '#d3cabd', '#e9e2d6', '#ddd5c9'];
    parts.push(
      `<figure class="mock phone"><div class="screen"><div class="grid">${apps.map((c, i) => (i === 2 ? `<div class="app">${appTile}<span>${escapeText(s.brand.name.slice(0, 10))}</span></div>` : `<div class="app"><i style="background:${c}"></i><span>App</span></div>`)).join('')}</div></div>${cap('iOS home screen')}</figure>`,
    );
    parts.push(
      `<figure class="mock android"><div class="screen">${await tile(s, 56, 'circle')}${await tile(s, 56, 'squircle')}</div>${cap('Android adaptive masks')}</figure>`,
    );
    parts.push(
      `<figure class="mock dock"><div class="bar">${['#ddd5c9', '#d3cabd'].map((c) => `<i style="background:${c}"></i>`).join('')}${await tile(s, 54, 'squircle', 0.56)}<i style="background:#e9e2d6"></i></div>${cap('macOS Dock')}</figure>`,
    );
    parts.push(
      `<figure class="mock store"><div class="card">${await tile(s, 72, 'squircle')}<div><b>${escapeText(s.brand.name)}</b><small>${escapeText(s.concept?.direction ?? 'App')}</small><span class="get">GET</span></div></div>${cap('App store listing')}</figure>`,
    );
  }
  const og = svgDocument(
    600,
    315,
    nestSvg(art, { x: 600 * 0.2, y: 315 * 0.36, width: 600 * 0.6, height: 315 * 0.28 }) +
      `<rect y="307" width="600" height="8" fill="${s.palette.primary}"/>`,
    { background: s.palette.paper },
  );
  parts.push(
    `<figure class="mock social"><div class="post"><div class="who"><i style="background:${s.palette.primary}"></i><b>${escapeText(s.brand.name)}</b></div>${og.replace('<svg ', '<svg class="og" ')}<small>${escapeText(s.brand.slug)}.example</small></div>${cap('Link preview (Open Graph)')}</figure>`,
  );
  const cardFill = s.locked ? s.palette.paper : tileGround(s.grounds);
  const cardArt = s.locked ? art : markOnGround(art, cardFill, s.grounds, { tile: true });
  parts.push(
    `<figure class="mock bizcard"><div class="front" style="background:${cardFill}">${fitInline(cardArt, 170, 50)}</div><div class="back">${s.symbol ? inline(on(s.symbol, '#ffffff'), 26, 26) : ''}<b>Full Name</b><small>Role · name@${escapeText(s.brand.slug)}.example</small></div>${cap('Business card')}</figure>`,
  );
  return parts.join('');
}

const REVISION_CHIPS = [
  'combine with another',
  'bolder',
  'simpler',
  'more distinctive',
  'closer to the idea',
  'different color',
  'different typeface',
  'wordmark spacing',
  'better at small sizes',
];

function criticAverage(s: Subject): number | undefined {
  const j = s.concept?.judgment;
  if (!j || !Object.keys(j).length) return undefined;
  const scores = Object.values(j).map((x) => x.score);
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

/**
 * The idea in one short sentence: the first sentence; past `max` characters it ends at its last clause (a colon,
 * semicolon or dash) that fits, and only without one is it cut at a word with an ellipsis.
 */
export function oneLine(text: string, max = 140): string {
  const first = text.trim().split(/(?<=[.!?])\s+/)[0] ?? '';
  if (first.length <= max) return first;
  const clause = Math.max(
    ...[':', ';', ' — ', ' – '].map((sep) => first.lastIndexOf(sep, max)).filter((i) => i >= 24),
    -1,
  );
  if (clause > 0) return `${first.slice(0, clause).trimEnd()}.`;
  const cut = first.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '')}…`;
}

/** What a chooser must not miss, said in a few words: failing checks, an originality conflict, a critic below the bar. */
function flagsOf(s: Subject): string[] {
  const q = s.quality?.summary;
  const o = s.originality;
  const gate = s.concept ? gateOf(s.concept, s.art) : undefined;
  return [
    q?.fail ? (q.fail === 1 ? t('1 check failing') : t('{0} checks failing', [q.fail])) : '',
    o?.verdict === 'redesign'
      ? t('originality: redesign')
      : o?.verdict === 'needs-review'
        ? t('originality: needs review')
        : '',
    gate?.status === 'below-threshold' ? t('critic: below the bar') : '',
  ].filter(Boolean);
}

function palettesOf(s: Subject): string[] {
  return [s.palette.primary, s.palette.secondary, s.palette.accent, s.palette.ink, s.palette.paper].filter(
    Boolean,
  ) as string[];
}

/** A tile on the round's board: the word on its own ground, the icon on the opposite one, the letter and title. */
export function tileHtml(s: Subject, letter?: string): string {
  const g = groundsFor(s.palette.paper);
  const on = (svg: string, ground: string) =>
    s.locked ? svg : markOnGround(svg, ground, s.grounds, { neutrals: { dark: s.palette.ink } });
  const word = s.lockup ?? s.wordmark;
  const art = word ? fitInline(word, 240, 56) : fitInline(s.symbol!, 72, 72);
  const icon = s.symbol ? inline(on(s.symbol, g.opposite), 28, 28) : '';
  const flag = flagsOf(s).length
    ? `<i class="tile-flag" ${ta('title', 'Has a problem — see the proposal')}>!</i>`
    : '';
  return `<a class="tile" href="#${escapeAttr(`${s.brand.slug}-${s.key}`)}" data-target="${escapeAttr(`${s.brand.slug}-${s.key}`)}">
  <span class="tile-art" style="background:${g.native}">${art}</span>
  <span class="tile-cap">${letter ? `<b class="l">${letter}</b>` : ''}<span class="tile-title">${escapeText(s.title)}</span>${flag}<span class="tile-pick"></span>${icon ? `<span class="tile-icon" style="background:${g.opposite}">${icon}</span>` : ''}</span>
</a>`;
}

/** The round's board: every proposal at a glance; choosing a tile brings that proposal forward. */
export function boardHtml(tiles: string[]): string {
  return `<nav class="board"${ta('aria-label', 'Proposals')}>${tiles.join('')}</nav>`;
}

/**
 * One proposal, large: the mark, its icon on the opposite ground, the small sizes and the lockup, one idea line, any
 * problem in a word, and the decision. Everything else — strengths and weaknesses, checks, originality, the critic,
 * the rationale, palette and surfaces — is folded into Details.
 */
export async function proposalHtml(
  s: Subject,
  opts: { review?: boolean; letter?: string } = {},
): Promise<string> {
  const g = groundsFor(s.palette.paper);
  const on = (svg: string, ground: string) =>
    s.locked ? svg : markOnGround(svg, ground, s.grounds, { neutrals: { dark: s.palette.ink } });
  const lock = s.lockup ?? s.wordmark;
  // A wordmark-led concept is shown as its word first; the symbol is the icon cut from it.
  const wordLed = s.concept?.lead === 'wordmark' && s.wordmark;
  const hero = wordLed
    ? fitInline(s.wordmark!, 560, 150)
    : s.symbol
      ? inline(s.symbol, 220, 220)
      : fitInline(lock!, 520, 140);
  const icon = s.symbol
    ? inline(on(s.symbol, g.opposite), 120, 120)
    : fitInline(on(lock!, g.opposite), 220, 70);
  const sizes = s.symbol ? [16, 24, 32, 48].map((n) => inline(s.symbol!, n, n)).join('') : '';
  const gate = s.concept ? gateOf(s.concept, s.art) : undefined;
  const avg = criticAverage(s);
  const q = s.quality;
  const o = s.originality;
  const key = escapeAttr(`${s.brand.slug}/${s.key}`);
  const palette = palettesOf(s);
  const ideaFull = s.concept ? (s.concept.pitch?.idea ?? s.concept.direction) : '';
  const idea = ideaFull ? oneLine(ideaFull) : '';
  const flags = flagsOf(s);
  const pitch = s.concept?.pitch;
  const list = (cls: string, xs: string[]) =>
    xs.length ? `<ul class="${cls}">${xs.map((x) => `<li>${escapeText(x)}</li>`).join('')}</ul>` : '';
  const checks = q
    ? `<section><h4>${t('Technical checks')}</h4><p class="muted">${t('{0} of {1} pass', [q.summary.pass, q.summary.pass + q.summary.warn + q.summary.fail])}</p><ul class="checks">${
        q.checks
          .filter((c) => c.status !== 'pass')
          .map(
            (c) =>
              `<li class="${c.status}"><b>${escapeText(c.label)}</b> ${escapeText(String(c.value))} — ${escapeText(c.message)}</li>`,
          )
          .join('') || `<li class="pass">${t('All checks pass.')}</li>`
      }</ul></section>`
    : '';
  const sim = o
    ? `<section><h4>${t('Originality')}</h4><p class="muted">${t(o.verdict.replace(/-/g, ' '))}${o.confidence ? ` · ${t(o.confidence)}` : ''}${o.evidence ? ` · ${t('Evidence: {0} visual, {1} registry, {2} names.', [o.evidence.visual.coverage, o.evidence.registry.coverage, o.evidence.names.coverage])}` : ''}</p><ul class="checks">${
        o.visual.matches
          .slice(0, 4)
          .map(
            (m) =>
              `<li class="${m.risk === 'high' ? 'fail' : m.risk === 'review' ? 'warn' : 'pass'}"><b>${escapeText(m.name)}</b> ${Math.round(m.visual * 100)}%</li>`,
          )
          .join('') || `<li class="info">${t('No references compared.')}</li>`
      }${(o.evidence?.missing ?? [])
        .slice(0, 3)
        .map((m) => `<li class="info">${escapeText(m)}</li>`)
        .join('')}</ul></section>`
    : '';
  const critic =
    s.concept?.judgment || s.concept?.critique || s.concept?.readsAs?.length
      ? `<section><h4>${t('Critic')}</h4>${
          gate && gate.status !== 'not-reviewed'
            ? `<p class="muted">${gate.status === 'passed' ? (gate.looks ? t('passed at the edge ({0} of {1} looks)', [gate.looks.passed, gate.looks.of]) : t('critic: above the bar')) : gate.status === 'undecided' ? t('critic: on the edge') : gate.status === 'stale' ? t('critic: older than the drawing') : t('critic: below the bar')}${avg !== undefined ? ` · ${t('critic {0}', [avg])}` : ''}${gate.calibration === 'unmeasured' ? ` · ${t('reviewer not calibrated')}` : ''}</p>`
            : ''
        }${
          s.concept?.critique && gate && gate.status !== 'passed'
            ? `<p class="verdict">${t(s.concept.critique.present ? 'would present it as is' : 'would not present it as is')} — ${escapeText(s.concept.critique.reason)}</p>`
            : ''
        }${
          s.concept?.readsAs?.length
            ? `<p class="muted">${t('A stranger sees:')} ${s.concept.readsAs.map(escapeText).join(' · ')}</p>`
            : ''
        }${
          s.concept?.judgment
            ? `<ul class="checks">${Object.entries(s.concept.judgment)
                .map(
                  ([k, v]) =>
                    `<li class="${v.score >= 7 ? 'pass' : v.score >= 6 ? 'warn' : 'fail'}"><b>${escapeText(k)}</b> ${v.score} — ${escapeText(v.rationale)}</li>`,
                )
                .join('')}</ul>`
            : ''
        }</section>`
      : '';
  const decide =
    s.locked || opts.review === false
      ? ''
      : `<div class="decide" data-key="${key}" data-title="${escapeAttr(s.title)}">
    <div class="actions">${(
      [
        ['keep', s.concept?.round !== undefined ? 'Select' : 'Keep'],
        ['refine', s.concept?.round !== undefined ? 'Request changes' : 'Refine'],
        ['drop', 'Drop'],
      ] as const
    )
      .map(
        ([v, l]) =>
          `<button type="button" class="btn" data-pick="${v}" aria-pressed="false">${t(l)}</button>`,
      )
      .join(
        '',
      )}<label class="cmp"><input type="checkbox" data-cmp="${key}"> ${t('Add to comparison')}</label></div>
    <div class="chips"><p class="hint">${t('What should change? Pick any, add a note, or click on the large mark to pin a spot.')}</p>${REVISION_CHIPS.map((c) => `<button type="button" class="chip" data-chip="${escapeAttr(c)}">${t(c)}</button>`).join('')}</div>
    <input type="text" class="note"${ta('placeholder', 'Anything specific? (optional)')}>
    <ol class="pins"${ta('title', 'Click on the large mark to point at a spot')}></ol>
  </div>`;
  return `<article class="proposal${s.status === 'rejected' ? ' rejected' : ''}" id="${escapeAttr(`${s.brand.slug}-${s.key}`)}">
  <header><h3>${opts.letter ? `<span class="letter">${opts.letter}</span>` : ''}${escapeText(s.title)}</h3><span class="status">${t(s.status)}</span></header>
  ${idea ? `<p class="idea">${escapeText(idea)}</p>` : ''}
  <div class="showcase">
    <div class="ground hero${decide ? ' pinnable' : ''}" data-key="${key}" style="background:${g.native}">${hero}</div>
    <div class="ground icon" style="background:${g.opposite}">${icon}</div>
    ${sizes ? `<div class="ground sizes" style="background:${g.native}">${sizes}</div>` : ''}
    ${lock && s.symbol ? `<div class="ground lockup" style="background:${g.native}">${fitInline(lock, 440, 70)}</div>` : ''}
  </div>
  ${flags.length ? `<p class="flags">${flags.map((f) => `<span class="flag">${f}</span>`).join('')}</p>` : ''}
  ${s.locked ? `<p class="muted">${t('locked')}</p>` : ''}
  ${decide}
  <details class="more"><summary>${t('Details')}</summary>
    <div class="more-grid">
      ${
        pitch && (pitch.strengths.length || pitch.weaknesses.length || ideaFull !== idea)
          ? `<section class="pitch"><h4>${t('The idea')}</h4>${ideaFull !== idea ? `<p>${escapeText(ideaFull)}</p>` : ''}${list('plus', pitch.strengths)}${list('minus', pitch.weaknesses)}</section>`
          : ideaFull !== idea
            ? `<section class="pitch"><h4>${t('The idea')}</h4><p>${escapeText(ideaFull)}</p></section>`
            : ''
      }
      ${s.concept ? `<section><h4>${t('Rationale')}</h4><p class="muted">${escapeText(s.concept.rationale)}</p><div class="swatches">${palette.map((c) => `<span style="background:${c}" title="${c}"></span>`).join('')}<code>${palette.join(' · ')}</code></div></section>` : ''}
      ${checks}${sim}${critic}
    </div>
    <h4>${t('On surfaces')}</h4>
    <div class="mockups">${await mockups(s)}</div>
  </details>
</article>`;
}

/** The approved (or locked) identity, presented as the result: variants, grounds, palette and where the files are. */
export async function approvedPanel(
  ws: Workspace,
  b: WorkspaceBrand,
  s: Subject,
  exports: { assets: { group: string; path: string }[] } | undefined,
): Promise<string> {
  const g = groundsFor(s.palette.paper);
  const on = (svg: string, ground: string) =>
    s.locked ? svg : markOnGround(svg, ground, s.grounds, { neutrals: { dark: s.palette.ink } });
  const lock = s.lockup ?? s.wordmark;
  const link = (rel: string, label: string, cls = '') =>
    `<a${cls ? ` class="${cls}"` : ''} href="${escapeAttr(portableRelative(ws.galleryDir(), join(ws.exportsDir(b.slug), rel)))}">${t(label)}</a>`;
  const label = (en: string) => `<span class="tag">${t(en)}</span>`;
  const groups = exports
    ? Object.entries(
        exports.assets.reduce<Record<string, number>>((acc, a) => {
          acc[a.group] = (acc[a.group] ?? 0) + 1;
          return acc;
        }, {}),
      )
        .map(([k, n]) => `${escapeText(k)} ${n}`)
        .join(' · ')
    : t('not exported yet — run "markilo export"');
  const palette = [
    s.palette.primary,
    s.palette.secondary,
    s.palette.accent,
    s.palette.ink,
    s.palette.paper,
  ].filter(Boolean) as string[];
  const tiles = [
    lock
      ? `<div class="ground wide" style="background:${g.native}">${fitInline(lock, 420, 90)}${label('Primary')}</div>`
      : '',
    lock
      ? `<div class="ground wide" style="background:${g.opposite}">${fitInline(on(lock, g.opposite), 420, 90)}${label('Reversed')}</div>`
      : '',
    s.symbol
      ? `<div class="ground" style="background:${g.native}">${inline(s.symbol, 110, 110)}${label('Symbol')}</div>`
      : '',
    s.symbol
      ? `<div class="ground" style="background:${s.locked ? g.native : tileGround(s.grounds)}">${inline(s.locked ? s.symbol : markOnGround(s.symbol, tileGround(s.grounds), s.grounds, { tile: true }), 110, 110)}${label('On brand color')}</div>`
      : '',
  ].join('');
  const o = s.originality;
  return `<div class="approved">
  <div class="approved-grid">${tiles}</div>
  <div class="approved-meta">
    <div class="swatches">${palette.map((c) => `<span style="background:${c}" title="${c}"></span>`).join('')}<code>${palette.join(' · ')}</code></div>
    <p class="muted">${s.quality ? `${t('Checks {0}/{1}', [s.quality.summary.pass, s.quality.summary.pass + s.quality.summary.warn + s.quality.summary.fail])}${s.quality.summary.fail ? ` · ${t('{0} failing', [s.quality.summary.fail])}` : ''} · ` : ''}${o ? `${t('originality')} ${t(o.verdict.replace(/-/g, ' '))}${o.confidence ? ` (${t(`${o.confidence} confidence`)})` : ''} · ` : ''}${t('exports:')} ${groups}</p>
    ${exports ? `<p class="links">${link('index.html', 'Open the asset kit', 'primary')} ${link('guidelines/index.html', 'Brand guidelines')} ${link('asset-manifest.json', 'Asset manifest')} ${link('logos/primary/primary-color.svg', 'Primary logo')} ${link('web/head-snippet.html', 'Web head tags')}</p>` : ''}
  </div>
  <details><summary>${t('On surfaces')}</summary><div class="mockups">${await mockups(s)}</div></details>
</div>`;
}

export function maybeJson<T>(p: string): T | undefined {
  return existsSync(p) ? readJson<T>(p) : undefined;
}

interface BoardEntry {
  id: string;
  caption?: string;
  ready?: boolean;
  fix?: string[];
  quality?: { legibility16?: number };
}

/**
 * Directions still at the sketch stage: their boards, the critic's reading and a pick the user can make here. A sketch
 * is cheap; a developed mark that fails the gate is not, so this is where the user's eye pays off most.
 */
export function sketchCards(ws: Workspace, b: WorkspaceBrand): string[] {
  const out: string[] = [];
  for (const c of ws.concepts(b.slug)) {
    // concept new names symbol.svg up front; a direction is past the sketch stage once a mark file exists.
    const drawn = [c.files.symbol, c.files.wordmark].some(
      (f) => f && existsSync(ws.conceptFile(b.slug, c.id, f)),
    );
    if (c.status === 'rejected' || drawn) continue;
    const board = maybeJson<{ sketches: BoardEntry[]; paper?: string }>(
      ws.conceptFile(b.slug, c.id, join('sketches', 'board.json')),
    );
    if (!board?.sketches?.length) continue;
    const paper = board.paper ?? c.palette.paper ?? '#ffffff';
    const review = c.sketchReview;
    const key = escapeAttr(`${b.slug}/${c.id}`);
    const tiles = board.sketches
      .map((sk) => {
        const f = ws.conceptFile(b.slug, c.id, join('sketches', `${sk.id}.svg`));
        if (!/^[a-z][a-z0-9-]*$/.test(sk.id) || !existsSync(f)) return '';
        const svg = readText(f);
        const picked = review?.pick === sk.id;
        return `<button type="button" class="sk${picked ? ' picked' : ''}" data-sketch="${escapeAttr(sk.id)}" title="${escapeAttr(sk.caption ?? sk.id)}">
  <span class="ground" style="background:${paper}">${inline(svg, 92, 92)}</span>
  <span class="sizes" style="background:${paper}">${inline(svg, 32, 32)}${inline(svg, 16, 16)}</span>
  <span class="cap"><b>${escapeText(sk.id)}</b>${picked ? ` · ${t(review?.by === 'user' ? 'your pick' : 'critic’s pick')}` : ''}${sk.ready === false ? ` · <i class="bad">${t('not ready')}</i>` : ''} — ${escapeText(sk.caption ?? '')}</span>
</button>`;
      })
      .join('');
    if (!tiles) continue;
    const critic = review
      ? `<p class="muted"><b>${t(review.by === 'user' ? 'Recorded pick:' : 'Critic:')}</b> ${review.pick ? t('develop {0}', [review.pick]) : t('none of these')} — ${escapeText(review.notes)}</p>`
      : `<p class="muted">${t('Not reviewed by the critic yet.')}</p>`;
    out.push(`<article class="card sketchcard" data-key="${key}">
  <header><h3>${escapeText(c.title)}</h3><span class="status">${t('sketches')}</span></header>
  <p class="idea">${escapeText(c.direction)}</p>
  <div class="skgrid">${tiles}</div>
  <details${review ? '' : ' open'}><summary>${t('What the critic saw')}</summary>${critic}</details>
  <div class="decide sketch" data-key="${key}">
    <button type="button" class="chip" data-sketch="none">${t('None of these — try a different move')}</button>
    <input type="text" class="note"${ta('placeholder', 'Why this one, or what to change (optional)')}>
  </div>
</article>`);
  }
  return out;
}
