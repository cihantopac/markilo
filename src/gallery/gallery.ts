import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { QualityReport } from '../analyze/quality.js';
import { readJson, readText, writeGenerated } from '../core/fsx.js';
import { portableRelative, resolveInsideReal } from '../core/paths.js';
import type { Concept, WorkspaceBrand } from '../core/types.js';
import type { Workspace } from '../core/workspace.js';
import { composeLockup } from '../design/lockup.js';
import { placeMark, squircle } from '../export/geometry.js';
import { type BrandKit, kitPath } from '../export/kit.js';
import { adaptToGround, groundsFor, onFillVariant } from '../export/variants.js';
import { gateOf } from '../report/gate.js';
import type { OriginalityReport } from '../report/originality.js';
import { aspectOf, nestSvg, svgDocument } from '../svg/compose.js';
import { escapeAttr, escapeText } from '../svg/xml.js';

interface Subject {
  key: string;
  brand: WorkspaceBrand;
  title: string;
  status: string;
  symbol?: string;
  wordmark?: string;
  lockup?: string;
  palette: { primary: string; secondary?: string; accent?: string; ink: string; paper: string; dark: string };
  concept?: Concept;
  quality?: QualityReport;
  originality?: OriginalityReport;
  locked: boolean;
}

const DARK = '#111318';

/** Inline SVG sized for HTML; ids are prefixed so many marks can share the page. */
function inline(svg: string, w: number, h: number, cls = '', label = 'logo'): string {
  return svgDocument(w, h, nestSvg(svg, { x: 0, y: 0, width: w, height: h })).replace(
    '<svg ',
    `<svg class="${cls}" role="img" aria-label="${escapeAttr(label)}" `,
  );
}

function fitInline(svg: string, maxW: number, maxH: number, cls = ''): string {
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
  const fill = s.locked ? s.palette.paper : s.palette.primary;
  const mark = s.locked ? s.symbol : onFillVariant(s.symbol, fill).svg;
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
  return svgDocument(size, size, body).replace('<svg ', '<svg class="tile" ');
}

async function mockups(s: Subject): Promise<string> {
  const art = s.lockup ?? s.wordmark ?? s.symbol!;
  // Every surface gets artwork adapted to its own background (no-op when contrast is already fine).
  const on = (svg: string, ground: string) =>
    s.locked ? svg : adaptToGround(svg, ground, { dark: s.palette.ink });
  const rev = on(art, DARK);
  const onWhite = on(art, '#ffffff');
  const favicon = s.symbol ? inline(on(s.symbol, '#ffffff'), 16, 16) : '';
  const parts: string[] = [];
  parts.push(
    `<figure class="mock browser"><div class="tabbar"><div class="tab">${favicon}<span>${escapeText(s.brand.name)}</span></div><div class="tab ghost"><span>New tab</span></div></div><div class="addr">${escapeText(s.brand.slug)}.example</div><div class="page"><nav>${fitInline(onWhite, 150, 28)}<span>Product</span><span>Pricing</span><span class="btn" style="background:${s.palette.primary}">Get started</span></nav><div class="hero"><b></b><i></i><i></i></div></div><figcaption>Browser tab &amp; site header</figcaption></figure>`,
  );
  parts.push(
    `<figure class="mock darkui"><nav>${fitInline(rev, 150, 28)}<span>Docs</span><span>Blog</span></nav><div class="hero"><b></b><i></i></div><figcaption>Dark interface</figcaption></figure>`,
  );
  if (s.symbol) {
    const t = await tile(s, 64, 'squircle', 0.6);
    const apps = ['#e8eaef', '#d6dbe4', '#c9cfdb', '#dfe3ea', '#d0d5df'];
    parts.push(
      `<figure class="mock phone"><div class="screen"><div class="grid">${apps.map((c, i) => (i === 2 ? `<div class="app">${t}<span>${escapeText(s.brand.name.slice(0, 10))}</span></div>` : `<div class="app"><i style="background:${c}"></i><span>App</span></div>`)).join('')}</div></div><figcaption>iOS home screen</figcaption></figure>`,
    );
    parts.push(
      `<figure class="mock android"><div class="screen">${await tile(s, 56, 'circle')}${await tile(s, 56, 'squircle')}</div><figcaption>Android adaptive masks</figcaption></figure>`,
    );
    parts.push(
      `<figure class="mock dock"><div class="bar">${['#c7ccd6', '#aeb6c4'].map((c) => `<i style="background:${c}"></i>`).join('')}${await tile(s, 54, 'squircle', 0.56)}<i style="background:#bfc5d0"></i></div><figcaption>macOS Dock</figcaption></figure>`,
    );
    parts.push(
      `<figure class="mock store"><div class="card">${await tile(s, 72, 'squircle')}<div><b>${escapeText(s.brand.name)}</b><small>${escapeText(s.concept?.direction ?? 'App')}</small><span class="get">GET</span></div></div><figcaption>App store listing</figcaption></figure>`,
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
    `<figure class="mock social"><div class="post"><div class="who"><i style="background:${s.palette.primary}"></i><b>${escapeText(s.brand.name)}</b></div>${og.replace('<svg ', '<svg class="og" ')}<small>${escapeText(s.brand.slug)}.example</small></div><figcaption>Link preview (Open Graph)</figcaption></figure>`,
  );
  const cardFill = s.locked ? s.palette.paper : s.palette.primary;
  const cardArt = s.locked ? art : onFillVariant(art, cardFill).svg;
  parts.push(
    `<figure class="mock bizcard"><div class="front" style="background:${cardFill}">${fitInline(cardArt, 170, 50)}</div><div class="back">${s.symbol ? inline(on(s.symbol, '#ffffff'), 26, 26) : ''}<b>Full Name</b><small>Role · name@${escapeText(s.brand.slug)}.example</small></div><figcaption>Business card</figcaption></figure>`,
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

/** Compact review card: what you need to decide, with details and mockups folded away. */
async function subjectCard(s: Subject, opts: { review?: boolean } = {}): Promise<string> {
  const g = groundsFor(s.palette.paper);
  const on = (svg: string, ground: string) =>
    s.locked ? svg : adaptToGround(svg, ground, { dark: s.palette.ink });
  const lock = s.lockup ?? s.wordmark;
  // A wordmark-led concept is shown as its word first; the symbol is the icon cut from it.
  const wordLed = s.concept?.lead === 'wordmark' && s.wordmark;
  const hero = wordLed
    ? fitInline(s.wordmark!, 260, 90)
    : s.symbol
      ? inline(s.symbol, 112, 112)
      : fitInline(lock!, 220, 80);
  const alt = s.symbol ? inline(on(s.symbol, g.opposite), 64, 64) : fitInline(on(lock!, g.opposite), 120, 44);
  const sizes = s.symbol ? [16, 24, 32, 48].map((n) => inline(s.symbol!, n, n)).join('') : '';
  const avg = criticAverage(s);
  const gate = s.concept ? gateOf(s.concept) : undefined;
  const q = s.quality?.summary;
  const o = s.originality;
  const pills = [
    q
      ? `<span class="pill ${q.fail ? 'bad' : q.warn ? 'warn' : 'good'}" title="Measured technical checks">checks ${q.pass}/${q.pass + q.warn + q.fail}${q.fail ? ` · ${q.fail} fail` : ''}</span>`
      : '',
    o
      ? `<span class="pill ${o.verdict === 'redesign' ? 'bad' : o.verdict === 'no-conflicts-found' ? 'good' : 'warn'}" title="Originality verdict and confidence">${escapeText(o.verdict.replace(/-/g, ' '))}${o.confidence ? ` · ${escapeText(o.confidence)}` : ''}</span>`
      : '',
    avg !== undefined
      ? `<span class="pill ${avg >= 7 ? 'good' : avg >= 6 ? 'warn' : 'bad'}" title="Critic average (judgment, 0–10)">critic ${avg}</span>`
      : '',
    gate && gate.status !== 'not-reviewed'
      ? `<span class="pill ${gate.status === 'passed' ? 'good' : 'bad'}" title="${escapeAttr(gate.status === 'passed' ? (gate.looks ? "Passed on the majority of cold looks after a first look on the edge of the bar. In Markilo's 1.0 validation an independent judge panel rejected both such passes: treat it as worth showing, not finished." : 'Passed the critic gate') : gate.reasons.join('; '))}">${gate.status === 'passed' ? (gate.looks ? `passed at the edge (${gate.looks.passed} of ${gate.looks.of} looks)` : 'critic: above the bar') : gate.status === 'undecided' ? 'critic: on the edge' : 'critic: below the bar'}</span>`
      : '',
    gate?.calibration === 'unmeasured'
      ? `<span class="pill warn" title="${escapeAttr(`Reviewed by ${gate.reviewer}; the gate was calibrated on Claude Opus, so how well it predicts an independent judge on this model is not measured.`)}">reviewer not calibrated</span>`
      : '',
    s.locked ? '<span class="pill lock">locked</span>' : '',
  ].join('');
  const key = escapeAttr(`${s.brand.slug}/${s.key}`);
  const palette = [
    s.palette.primary,
    s.palette.secondary,
    s.palette.accent,
    s.palette.ink,
    s.palette.paper,
  ].filter(Boolean) as string[];
  const checks = s.quality
    ? `<h4>Technical checks</h4><ul class="checks">${
        s.quality.checks
          .filter((c) => c.status !== 'pass')
          .map(
            (c) =>
              `<li class="${c.status}"><b>${escapeText(c.label)}</b> ${escapeText(String(c.value))} — ${escapeText(c.message)}</li>`,
          )
          .join('') || '<li class="pass">All checks pass.</li>'
      }</ul>`
    : '';
  const sim = o
    ? `<h4>Originality</h4><p class="muted">${o.evidence ? `Evidence: ${escapeText(o.evidence.visual.coverage)} visual, ${escapeText(o.evidence.registry.coverage)} registry, ${escapeText(o.evidence.names.coverage)} names.` : ''}</p><ul class="checks">${
        o.visual.matches
          .slice(0, 4)
          .map(
            (m) =>
              `<li class="${m.risk === 'high' ? 'fail' : m.risk === 'review' ? 'warn' : 'pass'}"><b>${escapeText(m.name)}</b> ${Math.round(m.visual * 100)}%</li>`,
          )
          .join('') || '<li class="info">No references compared.</li>'
      }${(o.evidence?.missing ?? [])
        .slice(0, 3)
        .map((m) => `<li class="info">${escapeText(m)}</li>`)
        .join('')}</ul>`
    : '';
  const judgment = s.concept?.judgment
    ? `<h4>Critic</h4><ul class="checks">${Object.entries(s.concept.judgment)
        .map(
          ([k, v]) =>
            `<li class="${v.score >= 7 ? 'pass' : v.score >= 6 ? 'warn' : 'fail'}"><b>${escapeText(k)}</b> ${v.score} — ${escapeText(v.rationale)}</li>`,
        )
        .join('')}</ul>`
    : '';
  const decide =
    s.locked || opts.review === false
      ? ''
      : `<div class="decide" data-key="${key}" data-title="${escapeAttr(s.title)}">
    <div class="seg">${(
      [
        ['keep', s.concept?.round !== undefined ? 'Select' : 'Keep'],
        ['refine', s.concept?.round !== undefined ? 'Change' : 'Refine'],
        ['drop', 'Drop'],
      ] as const
    )
      .map(([v, l]) => `<button type="button" data-pick="${v}">${l}</button>`)
      .join('')}</div>
    <div class="chips">${REVISION_CHIPS.map((c) => `<button type="button" class="chip" data-chip="${escapeAttr(c)}">${escapeText(c)}</button>`).join('')}</div>
    <input type="text" class="note" placeholder="Anything specific? (optional)">
    <ol class="pins" title="Click on the large mark to point at a spot"></ol>
    <label class="cmp"><input type="checkbox" data-cmp="${key}"> Compare</label>
  </div>`;
  return `<article class="card${s.status === 'rejected' ? ' rejected' : ''}" id="${escapeAttr(`${s.brand.slug}-${s.key}`)}">
  <header><h3>${escapeText(s.title)}</h3><span class="status">${escapeText(s.status)}</span></header>
  <div class="stage"><div class="ground${decide ? ' pinnable' : ''}" data-key="${key}" style="background:${g.native}">${hero}</div><div class="ground small" style="background:${g.opposite}">${alt}</div></div>
  ${lock && s.symbol ? `<div class="lockup" style="background:${g.native}">${fitInline(lock, 300, 54)}</div>` : ''}
  ${sizes ? `<div class="sizes" style="background:${g.native}">${sizes}</div>` : ''}
  <div class="pills">${pills}</div>
  ${s.concept ? `<p class="idea">${escapeText(s.concept.pitch?.idea ?? s.concept.direction)}</p>` : ''}
  ${
    s.concept?.pitch && (s.concept.pitch.strengths.length || s.concept.pitch.weaknesses.length)
      ? `<ul class="pitch">${s.concept.pitch.strengths.map((x) => `<li class="plus">${escapeText(x)}</li>`).join('')}${s.concept.pitch.weaknesses.map((x) => `<li class="minus">${escapeText(x)}</li>`).join('')}</ul>`
      : ''
  }
  ${s.concept?.critique && gate && gate.status !== 'passed' ? `<p class="verdict">Critic: ${s.concept.critique.present ? 'would present it as is' : 'would not present it as is'} — ${escapeText(s.concept.critique.reason)}${s.concept.readsAs?.length ? `<br><span class="muted">A stranger sees: ${s.concept.readsAs.slice(0, 2).map(escapeText).join(' · ')}</span>` : ''}</p>` : ''}
  ${decide}
  <details><summary>Details &amp; mockups</summary>
    ${s.concept ? `<p class="muted">${escapeText(s.concept.rationale)}</p>` : ''}
    <div class="swatches">${palette.map((c) => `<span style="background:${c}" title="${c}"></span>`).join('')}<code>${palette.join(' · ')}</code></div>
    ${
      s.concept?.readsAs?.length
        ? `<h4>First impressions (critic, before reading the idea)</h4><p class="muted">${s.concept.readsAs.map(escapeText).join(' · ')}</p>`
        : ''
    }
    ${checks}${sim}${judgment}
    <div class="mockups">${await mockups(s)}</div>
  </details>
</article>`;
}

/** The approved (or locked) identity, presented as the result: variants, grounds, palette and where the files are. */
async function approvedPanel(
  ws: Workspace,
  b: WorkspaceBrand,
  s: Subject,
  exports: { assets: { group: string; path: string }[] } | undefined,
): Promise<string> {
  const g = groundsFor(s.palette.paper);
  const on = (svg: string, ground: string) =>
    s.locked ? svg : adaptToGround(svg, ground, { dark: s.palette.ink });
  const lock = s.lockup ?? s.wordmark;
  const link = (rel: string, label: string) =>
    `<a href="${escapeAttr(portableRelative(ws.galleryDir(), join(ws.exportsDir(b.slug), rel)))}">${escapeText(label)}</a>`;
  const groups = exports
    ? Object.entries(
        exports.assets.reduce<Record<string, number>>((acc, a) => {
          acc[a.group] = (acc[a.group] ?? 0) + 1;
          return acc;
        }, {}),
      )
        .map(([k, n]) => `${k} ${n}`)
        .join(' · ')
    : 'not exported yet — run "markilo export"';
  const palette = [
    s.palette.primary,
    s.palette.secondary,
    s.palette.accent,
    s.palette.ink,
    s.palette.paper,
  ].filter(Boolean) as string[];
  const tiles = [
    lock ? `<div class="ground wide" style="background:${g.native}">${fitInline(lock, 420, 90)}</div>` : '',
    lock
      ? `<div class="ground wide" style="background:${g.opposite}">${fitInline(on(lock, g.opposite), 420, 90)}</div>`
      : '',
    s.symbol ? `<div class="ground" style="background:${g.native}">${inline(s.symbol, 110, 110)}</div>` : '',
    s.symbol
      ? `<div class="ground" style="background:${s.locked ? g.native : s.palette.primary}">${inline(s.locked ? s.symbol : onFillVariant(s.symbol, s.palette.primary).svg, 110, 110)}</div>`
      : '',
  ].join('');
  const o = s.originality;
  return `<div class="approved">
  <div class="approved-grid">${tiles}</div>
  <div class="approved-meta">
    <div class="swatches">${palette.map((c) => `<span style="background:${c}" title="${c}"></span>`).join('')}<code>${palette.join(' · ')}</code></div>
    <p class="muted">${s.quality ? `Checks ${s.quality.summary.pass}/${s.quality.summary.pass + s.quality.summary.warn + s.quality.summary.fail}${s.quality.summary.fail ? ` · ${s.quality.summary.fail} failing` : ''} · ` : ''}${o ? `originality ${escapeText(o.verdict.replace(/-/g, ' '))}${o.confidence ? ` (${escapeText(o.confidence)} confidence)` : ''} · ` : ''}exports: ${escapeText(groups)}</p>
    ${exports ? `<p class="links">${link('index.html', 'Every file (preview)')} ${link('guidelines/index.html', 'Brand guidelines')} ${link('asset-manifest.json', 'Asset manifest')} ${link('logos/primary/primary-color.svg', 'Primary logo')} ${link('web/head-snippet.html', 'Web head tags')}</p>` : ''}
  </div>
  <details><summary>On surfaces</summary><div class="mockups">${await mockups(s)}</div></details>
</div>`;
}

function maybeJson<T>(p: string): T | undefined {
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
function sketchCards(ws: Workspace, b: WorkspaceBrand): string[] {
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
  <span class="cap"><b>${escapeText(sk.id)}</b>${picked ? ` · ${review?.by === 'user' ? 'your pick' : 'critic’s pick'}` : ''}${sk.ready === false ? ' · <i class="bad">not ready</i>' : ''} — ${escapeText(sk.caption ?? '')}</span>
</button>`;
      })
      .join('');
    if (!tiles) continue;
    const critic = review
      ? `<p class="muted"><b>${review.by === 'user' ? 'Recorded pick' : 'Critic'}:</b> ${escapeText(review.pick ? `develop ${review.pick}` : 'none of these')} — ${escapeText(review.notes)}</p>`
      : '<p class="muted">Not reviewed by the critic yet.</p>';
    out.push(`<article class="card sketchcard" data-key="${key}">
  <header><h3>${escapeText(c.title)}</h3><span class="status">sketches</span></header>
  <p class="idea">${escapeText(c.direction)}</p>
  <div class="skgrid">${tiles}</div>
  <details${review ? '' : ' open'}><summary>What the critic saw</summary>${critic}</details>
  <div class="decide sketch" data-key="${key}">
    <button type="button" class="chip" data-sketch="none">None of these — try a different move</button>
    <input type="text" class="note" placeholder="Why this one, or what to change (optional)">
  </div>
</article>`);
  }
  return out;
}

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
      concept: c,
      ...(q ? { quality: q } : {}),
      ...(o ? { originality: o } : {}),
      locked: false,
    });
  }
  return out;
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
      ? `<details class="assets"><summary>Exported assets (${exports.assets.length})</summary>${Object.entries(
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
      // Delivered: the approved identity leads; explored concepts are history, not choices.
      const explored: string[] = [];
      for (const s of subjects.filter((x) => x.key !== 'final'))
        explored.push(await subjectCard(s, { review: false }));
      sections.push(
        `<section class="brand"><h2>${escapeText(b.name)} <small>${escapeText(b.role)} · ${approved.locked ? 'locked identity' : 'approved identity'}</small></h2>${await approvedPanel(ws, b, approved, exports)}${explored.length ? `<details class="rejected-list"><summary>Explored concepts (${explored.length}) — for reference</summary><div class="grid">${explored.join('\n')}</div></details>` : ''}${exportList}</section>`,
      );
      continue;
    }
    const active: string[] = [];
    const rejected: string[] = [];
    // Proposals are grouped by round, the latest first; each round can be rejected as a whole.
    const byRound = new Map<number, string[]>();
    for (const s of subjects) {
      const r = s.concept?.round;
      if (r !== undefined && s.status !== 'rejected')
        byRound.set(r, [...(byRound.get(r) ?? []), await subjectCard(s)]);
      else (s.status === 'rejected' ? rejected : active).push(await subjectCard(s));
    }
    const roundPanels = [...byRound.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(
        ([r, cards], i) =>
          `<${i ? 'details class="round"' : 'div class="round"'}>${i ? `<summary>Round ${r} (${cards.length})</summary>` : `<h3 class="sub">Round ${r} — ${cards.length === 3 ? 'three directions' : `${cards.length} proposals`}: select one, ask for changes, combine or reject all</h3>`}<div class="grid three">${cards.join('\n')}</div>${i ? '' : `<div class="rejectall" data-brand="${escapeAttr(b.slug)}" data-round="${r}"><button type="button" class="chip" data-reject-all>Reject all ${cards.length === 3 ? 'three' : cards.length}</button><input type="text" class="note" placeholder="What is missing? What should the next round try?"></div>`}</${i ? 'details' : 'div'}>`,
      )
      .join('');
    const sketches = b.locked ? [] : sketchCards(ws, b);
    const ideas = b.locked ? '' : ideasPanel(ws, b.slug);
    sections.push(
      `<section class="brand"><h2>${escapeText(b.name)} <small>${escapeText(b.role)}${b.locked ? ' · locked' : ''} · ${active.length + [...byRound.values()].reduce((a, x) => a + x.length, 0)} to review</small></h2>${roundPanels}${ideas}${sketches.length ? `<h3 class="sub">Sketches — pick one per direction to develop (${sketches.length})</h3><div class="grid wide">${sketches.join('\n')}</div>` : ''}${active.length || (!sketches.length && !byRound.size) ? `<div class="grid">${active.join('\n') || (rejected.length ? `<p class="empty">Nothing is waiting for a decision. The ${rejected.length} rejected concepts are below; point at one you still like and send it to your agent, or ask for new directions.</p>` : '<p class="empty">No concepts yet.</p>')}</div>` : ''}${rejected.length ? `<details class="rejected-list"${active.length ? '' : ' open'}><summary>Rejected (${rejected.length})</summary><div class="grid">${rejected.join('\n')}</div></details>` : ''}${exportList}</section>`,
    );
  }
  const family =
    m.family && familyMarks.length > 1
      ? `<section class="family"><h2>${escapeText(m.family.name)} family</h2><div class="fmrow">${familyMarks.join('')}</div></section>`
      : '';
  const html = page(
    m.name,
    family + sections.join('\n'),
    sections.some((x) => x.includes('class="decide')),
  );
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
    `<li><b>${escapeText(i.id)}</b> ${escapeText(i.hook)} <small>— ${escapeText(i.means)} · ${escapeText(i.source)}${i.concepts?.length ? ` · became ${escapeText(i.concepts.join(', '))}` : ''}</small>${i.review ? `<br><small class="reading">Critic: ${escapeText(i.review.reading)}</small>` : ''}</li>`;
  return `<details class="ideas"${kept.length || open.length ? ' open' : ''}><summary>Ideas — ${kept.length} kept, ${struck.length} struck${open.length ? `, ${open.length} not reviewed` : ''}</summary>${kept.length ? `<ol>${kept.map(row).join('')}</ol>` : ''}${open.length ? `<ul>${open.map(row).join('')}</ul>` : ''}${struck.length ? `<details><summary>Struck before drawing (${struck.length})</summary><ul class="struck">${struck.map(row).join('')}</ul></details>` : ''}</details>`;
}

function page(title: string, body: string, reviewing: boolean): string {
  // Defence in depth: SVG from research and other people's repositories is sanitized before it is inlined, and the
  // page's own script is the only one allowed to run (a fresh nonce per build), so anything that slipped through
  // still cannot execute or call out.
  const nonce = randomBytes(16).toString('base64');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'">
<title>${escapeText(title)} — ${reviewing ? 'Markilo review' : 'brand identity'}</title>
<style>
:root{--bg:#f3f4f6;--card:#fff;--ink:#16181d;--muted:#6a7080;--line:#e2e4e9;--good:#127a4a;--warn:#9a6400;--bad:#b42318;--accent:#2563eb}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0d0f13;--card:#16191f;--ink:#e9ebf0;--muted:#9aa1ae;--line:#2a2e37;--accent:#7aa2ff}}
.verdict{font-size:13px;border-left:3px solid var(--bad);padding:4px 8px;margin:6px 0}.ideas{margin:8px 0 16px;padding:10px 14px;border:1px solid var(--line);border-radius:10px;background:var(--card)}.ideas li{margin:6px 0}.ideas .reading{color:var(--muted)}.ideas .struck{opacity:.7}
:root[data-theme=dark]{--bg:#0d0f13;--card:#16191f;--ink:#e9ebf0;--muted:#9aa1ae;--line:#2a2e37;--accent:#7aa2ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding-bottom:84px}
header.top{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid var(--line)}
header.top h1{font-size:16px;margin:0}header.top p{margin:0;color:var(--muted);font-size:12px}
button{font:inherit;cursor:pointer;color:inherit}.top button{border:1px solid var(--line);background:transparent;border-radius:8px;padding:7px 12px}
main{max-width:1280px;margin:0 auto;padding:16px}
h2{font-size:18px;margin:20px 0 10px}h2 small{font-size:12px;color:var(--muted);font-weight:500}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.grid.three{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}.round{margin:8px 0 20px}details.round>summary{cursor:pointer;color:var(--muted);margin:6px 0}
.pitch{list-style:none;padding:0;margin:4px 0 8px;font-size:13px}.pitch li{padding:1px 0 1px 16px;position:relative}.pitch li:before{position:absolute;left:0;font-weight:700}.pitch .plus:before{content:'+';color:var(--good)}.pitch .minus:before{content:'−';color:var(--bad)}
.rejectall{display:flex;gap:8px;align-items:center;margin-top:10px}.rejectall .note{flex:1}.rejectall .chip.on{background:var(--bad);border-color:var(--bad);color:#fff}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:8px}
.card.rejected{opacity:.6}
.card header{display:flex;justify-content:space-between;align-items:baseline;gap:8px}.card h3{margin:0;font-size:15px}
.status{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.stage{display:grid;grid-template-columns:1fr 96px;gap:6px}.ground{display:grid;place-items:center;border-radius:10px;height:140px;border:1px solid var(--line)}.ground.small{height:140px}
.lockup{display:grid;place-items:center;border-radius:10px;height:70px;border:1px solid var(--line)}
.sizes{display:flex;gap:12px;align-items:flex-end;justify-content:center;padding:8px;border-radius:10px;border:1px solid var(--line)}
.pills{display:flex;flex-wrap:wrap;gap:4px}.pill{font-size:11px;padding:1px 8px;border-radius:99px;border:1px solid var(--line)}
.pill.good{color:var(--good)}.pill.warn{color:var(--warn)}.pill.bad{color:var(--bad)}.pill.lock{background:#fff3c4;color:#6d5200;border-color:#f0d27a}
.idea{margin:0;font-size:13px}
.decide{display:flex;flex-direction:column;gap:6px;border-top:1px dashed var(--line);padding-top:8px}
.seg{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--line);border-radius:8px;overflow:hidden}
.seg button{border:0;background:transparent;padding:6px}.seg button+button{border-left:1px solid var(--line)}
.seg button.on[data-pick=keep]{background:var(--good);color:#fff}.seg button.on[data-pick=refine]{background:var(--accent);color:#fff}.seg button.on[data-pick=drop]{background:var(--bad);color:#fff}
.chips{display:flex;flex-wrap:wrap;gap:4px}.chip{border:1px solid var(--line);background:transparent;border-radius:99px;padding:2px 8px;font-size:12px}.chip.on{background:var(--accent);border-color:var(--accent);color:#fff}
.decide:not(.refine) .chips{display:none}
.note{width:100%;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:transparent;color:inherit;font:inherit}
details summary{cursor:pointer;color:var(--muted);font-size:12px}details[open] summary{margin-bottom:6px}
h4{margin:10px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}.muted{color:var(--muted);font-size:12px;margin:4px 0}
.checks{list-style:none;padding:0;margin:0}.checks li{padding:2px 0 2px 18px;position:relative;font-size:12px}.checks li:before{position:absolute;left:0}
.checks .pass:before{content:"✓";color:var(--good)}.checks .warn:before{content:"!";color:var(--warn)}.checks .fail:before{content:"✗";color:var(--bad)}.checks .info:before{content:"i";color:var(--muted)}
.swatches{display:flex;gap:4px;align-items:center;flex-wrap:wrap}.swatches span{width:18px;height:18px;border-radius:4px;border:1px solid var(--line)}.swatches code{font-size:11px;color:var(--muted)}
.mockups{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;margin-top:8px}.mock{margin:0;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:8px;overflow:hidden}figcaption{font-size:11px;color:var(--muted);margin-top:6px}
.browser .tabbar{display:flex;gap:4px;background:#dfe2e8;border-radius:8px 8px 0 0;padding:6px 6px 0}.browser .tab{display:flex;gap:6px;align-items:center;background:#fff;border-radius:7px 7px 0 0;padding:5px 10px;font-size:12px;color:#222}.browser .tab.ghost{background:transparent;color:#666}.browser .addr{background:#fff;font-size:11px;color:#777;padding:4px 10px;border-bottom:1px solid #e5e7eb}
.page{background:#fff;padding:10px;border-radius:0 0 8px 8px}.page nav,.darkui nav{display:flex;align-items:center;gap:10px;font-size:11px;color:#444}.page nav span:first-of-type,.darkui nav span:first-of-type{margin-left:auto}.btn{color:#fff;padding:3px 8px;border-radius:6px}
.hero b{display:block;height:10px;width:60%;background:#e7e9ee;border-radius:4px;margin:12px 0 6px}.hero i{display:block;height:7px;width:80%;background:#f0f1f4;border-radius:4px;margin:5px 0}
.darkui{background:#111318}.darkui nav{color:#cfd3db}.darkui .hero b{background:#2a2e37}.darkui .hero i{background:#20242c}
.phone .screen{background:linear-gradient(160deg,#5b6b8c,#2c3346);border-radius:16px;padding:12px}.phone .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.phone .app{display:grid;justify-items:center;gap:3px}.phone .app i,.phone .tile{width:36px;height:36px;border-radius:8px}.phone .app span{font-size:8px;color:#fff}
.android .screen{background:linear-gradient(160deg,#3b4b42,#1f2a24);border-radius:12px;padding:14px;display:flex;gap:14px;justify-content:center}
.dock .bar{display:flex;gap:8px;align-items:end;justify-content:center;border:1px solid rgba(255,255,255,.7);border-radius:14px;padding:6px;background-color:#c9d2e3}.dock .bar i{width:40px;height:40px;border-radius:10px;display:block}
.store .card{display:flex;flex-direction:row;gap:10px;align-items:center;background:#fff;color:#111;border-radius:10px;padding:10px}.store .tile{width:56px;height:56px}.store small{display:block;color:#666;font-size:10px}.store .get{display:inline-block;margin-top:4px;background:#eef1f6;color:#0a64d8;font-weight:700;font-size:10px;border-radius:99px;padding:2px 10px}
.social .post{background:#fff;color:#111;border-radius:10px;padding:8px}.social .who{display:flex;gap:6px;align-items:center;font-size:11px;margin-bottom:6px}.social .who i{width:18px;height:18px;border-radius:50%}.og{width:100%;height:auto;border-radius:6px;border:1px solid #e6e8ec}.social small{color:#777;font-size:10px}
.bizcard .front{border-radius:6px;aspect-ratio:85/55;display:grid;place-items:center;box-shadow:0 4px 14px rgba(0,0,0,.15)}.bizcard .back{margin-top:6px;background:#fff;color:#222;border-radius:6px;padding:8px;display:grid;gap:2px;box-shadow:0 4px 14px rgba(0,0,0,.1)}.bizcard small{color:#777;font-size:9px}
.family .fmrow{display:flex;gap:16px;flex-wrap:wrap}.fm{display:grid;justify-items:center;gap:6px;background:#fff;color:#222;border-radius:12px;padding:12px;border:1px solid var(--line)}
.approved{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;display:grid;gap:10px}.approved-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}.approved-grid .ground{height:150px}.approved-grid .ground.wide{grid-column:span 2}.links a{margin-right:12px;color:var(--accent)}.ground svg,.lockup svg,.approved-grid svg{max-width:92%;height:auto}.assets{margin-top:12px}.assets a{margin-right:8px;font-size:12px}.empty{color:var(--muted)}
.pinnable{position:relative;cursor:crosshair}.pin{position:absolute;transform:translate(-50%,-50%);width:20px;height:20px;border-radius:50%;background:var(--accent);color:#fff;font-size:11px;font-weight:700;display:grid;place-items:center;box-shadow:0 0 0 2px #fff}
.pins{margin:0;padding-left:20px;display:grid;gap:4px}.pins:empty{display:none}.pins li input{width:100%;border:1px solid var(--line);border-radius:6px;padding:3px 6px;background:transparent;color:inherit;font:inherit;font-size:12px}
.cmp{font-size:12px;color:var(--muted)}
h3.sub{font-size:14px;margin:8px 0;color:var(--muted);font-weight:600}.grid.wide{grid-template-columns:repeat(auto-fill,minmax(420px,1fr));margin-bottom:12px}
.skgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px}
.sk{display:grid;gap:4px;border:2px solid var(--line);border-radius:10px;background:transparent;padding:4px;text-align:left}.sk .ground{height:110px}.sk .sizes{padding:4px;gap:8px}
.sk .cap{font-size:11px;color:var(--muted);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.sk .cap b{color:var(--ink)}.sk.picked{border-style:dashed;border-color:var(--muted)}
.sk.on{border-color:var(--accent);border-style:solid}.chip[data-sketch].on{background:var(--bad);border-color:var(--bad);color:#fff}i.bad{color:var(--bad);font-style:normal}
dialog#cmpd{max-width:min(1100px,96vw);width:100%;border:1px solid var(--line);border-radius:14px;background:var(--card);color:var(--ink);padding:16px}dialog#cmpd::backdrop{background:rgba(0,0,0,.45)}
dialog#cmpd button,dialog#cmpd input{font:inherit;color:inherit;border:1px solid var(--line);background:transparent;border-radius:8px;padding:7px 12px}dialog#cmpd input{width:100%;margin:10px 0}
.cmpgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.cmpcol{display:grid;gap:8px;align-content:start}.cmpcol h3{margin:0;font-size:15px}.cmpcol .prefer.on{background:var(--good);border-color:var(--good);color:#fff}
.bar{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--line);padding:10px 16px;display:flex;gap:10px;align-items:center;z-index:9}
.bar .sum{flex:1;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar button{border:1px solid var(--line);background:transparent;border-radius:8px;padding:7px 12px}.bar button.primary{background:var(--accent);border-color:var(--accent);color:#fff}
@media (max-width:640px){.stage{grid-template-columns:1fr 72px}.bar .sum{display:none}}
</style></head><body>
<header class="top"><div><h1>${escapeText(title)} · ${reviewing ? 'review' : 'brand identity'}</h1><p>${reviewing ? 'Select the direction you want, ask for changes (click on a mark to point at a spot), tick “combine with another” on the ones to mix, or reject all three with a note — then send your decisions to your agent. The choice is yours; no critic score decides it.' : 'Approved identity, its variants and exported files. Explored concepts are kept for reference.'}</p></div><button type="button" id="theme">Theme</button></header>
<main>${body}</main>
${reviewing ? '' : '<style>.bar{display:none}body{padding-bottom:16px}</style>'}<div class="bar"><span class="sum" id="sum">No decisions yet.</span><button type="button" id="clear">Clear</button><button type="button" id="cmpbtn">Compare (0)</button><button type="button" id="copy">Copy request</button><button type="button" class="primary" id="send">Save decisions</button></div>
<dialog id="cmpd"><div class="cmpgrid" id="cmpgrid"></div><input type="text" id="cmpreason" placeholder="Why do you prefer it? (optional, then press Prefer this)"><p class="muted" id="cmpwhy"></p><button type="button" id="cmpclose">Close</button></dialog>
<script nonce="${nonce}">
(()=>{const K='markilo-review:'+location.pathname;let st={};try{st=JSON.parse(localStorage.getItem(K)||'{}')}catch(e){}
const q=new URLSearchParams(location.search),TOKEN=q.get('t'),SERVED=location.protocol.startsWith('http')&&!!TOKEN;
const save=()=>{try{localStorage.setItem(K,JSON.stringify(st))}catch(e){}render()};
const boxes=[...document.querySelectorAll('.decide:not(.sketch)')];const get=k=>st[k]=st[k]||{};
const skcards=[...document.querySelectorAll('.sketchcard')];const rejs=[...document.querySelectorAll('.rejectall')];const rk=r=>'_reject:'+r.dataset.brand+'/'+r.dataset.round;
const where=(x,y)=>(y<34?'top':y>66?'bottom':'middle')+'-'+(x<34?'left':x>66?'right':'center');
function render(){boxes.forEach(b=>{const k=b.dataset.key,v=st[k]||{};b.classList.toggle('refine',v.pick==='refine');
b.querySelectorAll('[data-pick]').forEach(x=>x.classList.toggle('on',x.dataset.pick===v.pick));
b.querySelectorAll('[data-chip]').forEach(x=>x.classList.toggle('on',(v.chips||[]).includes(x.dataset.chip)));
const n=b.querySelector('.note');if(document.activeElement!==n)n.value=v.note||'';
const c=b.querySelector('[data-cmp]');if(c)c.checked=!!v.compare;
const ol=b.querySelector('.pins');const focused=ol.contains(document.activeElement);if(!focused){ol.innerHTML='';(v.pins||[]).forEach((p,i)=>{const li=document.createElement('li');const inp=document.createElement('input');inp.placeholder='What should change here ('+where(p.x,p.y)+')?';inp.value=p.note||'';inp.oninput=e=>{p.note=e.target.value;try{localStorage.setItem(K,JSON.stringify(st))}catch(e){}};li.append(inp);ol.append(li)})}
const g=document.querySelector('.pinnable[data-key="'+CSS.escape(k)+'"]');if(g){g.querySelectorAll('.pin').forEach(p=>p.remove());(v.pins||[]).forEach((p,i)=>{const d=document.createElement('span');d.className='pin';d.style.left=p.x+'%';d.style.top=p.y+'%';d.textContent=i+1;d.title='Remove pin';d.onclick=e=>{e.stopPropagation();v.pins.splice(i,1);save()};g.append(d)})}});
rejs.forEach(r=>{const v=st[rk(r)]||{};r.querySelector('[data-reject-all]').classList.toggle('on',!!v.on);const n=r.querySelector('.note');if(document.activeElement!==n)n.value=v.note||''});
skcards.forEach(c=>{const v=st[c.dataset.key]||{};c.querySelectorAll('[data-sketch]').forEach(x=>x.classList.toggle('on',x.dataset.sketch===v.sketch));const n=c.querySelector('.note');if(document.activeElement!==n)n.value=v.note||''});
const e=Object.entries(st).filter(([k,v])=>k!=='_prefer'&&!k.startsWith('_reject:')&&(v.pick||v.sketch));const ra=Object.entries(st).filter(([k,v])=>k.startsWith('_reject:')&&v.on).map(([k])=>'reject all of round '+k.split('/')[1]);document.getElementById('sum').textContent=e.length||ra.length?[...ra,...e.map(([k,v])=>(v.sketch?'sketch '+v.sketch:v.pick==='keep'?'select':v.pick)+' '+k.split('/')[1])].join(' · '):'No decisions yet.';
document.getElementById('cmpbtn').textContent='Compare ('+Object.values(st).filter(v=>v&&v.compare).length+')'}
boxes.forEach(b=>{const k=b.dataset.key;
b.querySelectorAll('[data-pick]').forEach(x=>x.onclick=()=>{const v=get(k);v.pick=v.pick===x.dataset.pick?undefined:x.dataset.pick;save()});
b.querySelectorAll('[data-chip]').forEach(x=>x.onclick=()=>{const v=get(k);v.chips=v.chips||[];const c=x.dataset.chip;v.chips=v.chips.includes(c)?v.chips.filter(y=>y!==c):[...v.chips,c];save()});
b.querySelector('.note').oninput=e=>{get(k).note=e.target.value;try{localStorage.setItem(K,JSON.stringify(st))}catch(e){}};
const c=b.querySelector('[data-cmp]');if(c)c.onchange=()=>{get(k).compare=c.checked;save()}});
rejs.forEach(r=>{const k=rk(r);r.querySelector('[data-reject-all]').onclick=()=>{const v=get(k);v.on=!v.on;save()};r.querySelector('.note').oninput=e=>{get(k).note=e.target.value;try{localStorage.setItem(K,JSON.stringify(st))}catch(e){}}});
skcards.forEach(c=>{const k=c.dataset.key;c.querySelectorAll('[data-sketch]').forEach(x=>x.onclick=()=>{const v=get(k);v.sketch=v.sketch===x.dataset.sketch?undefined:x.dataset.sketch;save()});
c.querySelector('.note').oninput=e=>{get(k).note=e.target.value;try{localStorage.setItem(K,JSON.stringify(st))}catch(e){}}});
document.querySelectorAll('.pinnable').forEach(g=>g.onclick=ev=>{const r=g.getBoundingClientRect();const v=get(g.dataset.key);v.pins=v.pins||[];if(v.pins.length>=6)return;
v.pins.push({x:Math.round((ev.clientX-r.left)/r.width*100),y:Math.round((ev.clientY-r.top)/r.height*100),note:''});if(!v.pick)v.pick='refine';save();
const ol=document.querySelector('.decide[data-key="'+CSS.escape(g.dataset.key)+'"] .pins');const last=ol&&ol.lastElementChild;if(last)last.querySelector('input').focus()});
function feedback(){const d=[];for(const[k,v]of Object.entries(st)){if(k==='_prefer'||k.startsWith('_reject:')||!v||!(v.pick||v.sketch||(v.pins||[]).length||v.note))continue;const[brand,concept]=k.split('/');
d.push({brand,concept,decision:v.pick||null,...(v.sketch?{sketch:v.sketch}:{}),tags:v.chips||[],note:v.note||'',pins:(v.pins||[]).map((p,i)=>({n:i+1,x:p.x,y:p.y,where:where(p.x,p.y),note:p.note||''}))})}
const rejectAll=Object.entries(st).filter(([k,v])=>k.startsWith('_reject:')&&v&&v.on).map(([k,v])=>{const[brand,round]=k.slice(8).split('/');return{brand,round:Number(round),note:v.note||''}});
return{schema:'markilo/feedback@1',gallery:location.pathname,savedAt:new Date().toISOString(),decisions:d,preferred:st._prefer||null,rejectAll}}
function request(){const f=feedback(),L=[];for(const r of f.rejectAll)L.push('Reject all of round '+r.round+' for '+r.brand+(r.note?': '+r.note:''));for(const d of f.decisions.filter(x=>x.sketch))L.push(d.sketch==='none'?'No sketch for '+d.concept+': try a different move'+(d.note?' ('+d.note+')':''):'Develop sketch '+d.sketch+' of '+d.concept+(d.note?' ('+d.note+')':''));
for(const d of f.decisions.filter(x=>x.decision==='refine')){const w=[...d.tags];if(d.note)w.push(d.note);d.pins.forEach(p=>w.push('at '+p.where+(p.note?': '+p.note:'')));L.push('/markilo:refine '+d.brand+' '+d.concept+(w.length?': '+w.join('; '):''))}
const keep=f.decisions.filter(x=>x.decision==='keep').map(x=>x.concept),drop=f.decisions.filter(x=>x.decision==='drop').map(x=>x.concept);
const comb=f.decisions.filter(x=>x.tags.includes('combine with another')).map(x=>x.concept);if(comb.length>1)L.push('Combine: '+comb.join(' + '));
if(keep.length)L.push('Selected: '+keep.join(', '));if(drop.length)L.push('Drop (mark rejected): '+drop.join(', '));if(f.preferred)L.push('Preferred: '+f.preferred.concept+(f.preferred.why?' — '+f.preferred.why:''));
return L.length?L.join('\\n'):'(no decisions yet)'}
const flash=(id,t,orig)=>{const b=document.getElementById(id);b.textContent=t;setTimeout(()=>b.textContent=orig,1800)};
document.getElementById('copy').onclick=async()=>{const t=request();try{await navigator.clipboard.writeText(t);flash('copy','Copied ✓','Copy request')}catch(e){prompt('Copy this request:',t)}};
const send=document.getElementById('send');send.textContent=SERVED?'Send to your agent':'Download decisions';
send.onclick=async()=>{const f=feedback();if(SERVED){try{const r=await fetch('/feedback',{method:'POST',headers:{'content-type':'application/json','x-markilo-token':TOKEN},body:JSON.stringify(f)});flash('send',r.ok?'Sent ✓ — tell your agent':'Not saved ('+r.status+')','Send to your agent')}catch(e){flash('send','Not saved','Send to your agent')}}
else{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(f,null,2)],{type:'application/json'}));a.download='markilo-feedback.json';a.click();flash('send','Saved — run markilo feedback --import','Download decisions')}};
document.getElementById('clear').onclick=()=>{st={};save()};
const dlg=document.getElementById('cmpd');document.getElementById('cmpclose').onclick=()=>dlg.close();
document.getElementById('cmpbtn').onclick=()=>{const keys=Object.entries(st).filter(([k,v])=>k!=='_prefer'&&v&&v.compare).map(([k])=>k);if(keys.length<2){alert('Tick "Compare" on two or more concepts first.');return}
const grid=document.getElementById('cmpgrid');grid.innerHTML='';for(const k of keys){const card=document.querySelector('.decide[data-key="'+CSS.escape(k)+'"]').closest('.card');const col=document.createElement('div');col.className='cmpcol';
const h=document.createElement('h3');h.textContent=card.querySelector('h3').textContent;col.append(h);for(const sel of['.stage','.lockup','.sizes','.pills','.idea']){const n=card.querySelector(sel);if(n){const c=n.cloneNode(true);c.querySelectorAll('.pin').forEach(p=>p.remove());c.querySelectorAll('.pinnable').forEach(p=>p.classList.remove('pinnable'));col.append(c)}}
const b=document.createElement('button');b.type='button';b.className='prefer'+(st._prefer&&st._prefer.key===k?' on':'');b.textContent='Prefer this';b.onclick=()=>{const why=document.getElementById('cmpreason').value.trim();st._prefer={key:k,brand:k.split('/')[0],concept:k.split('/')[1],why,over:keys.filter(x=>x!==k).map(x=>x.split('/')[1])};save();dlg.close()};col.append(b);grid.append(col)}
document.getElementById('cmpwhy').textContent=st._prefer?'Current preference: '+st._prefer.concept+(st._prefer.why?' — '+st._prefer.why:''):'';dlg.showModal()};
document.getElementById('theme').onclick=()=>{const d=document.documentElement;d.dataset.theme=d.dataset.theme==='dark'?'light':'dark'};
render()})();
</script>
</body></html>
`;
}
