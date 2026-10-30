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
import { onFillVariant, reversedVariant } from '../export/variants.js';
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
  const rev = s.locked ? art : reversedVariant(art, DARK, s.palette.paper);
  const favicon = s.symbol ? inline(s.symbol, 16, 16) : '';
  const parts: string[] = [];
  parts.push(
    `<figure class="mock browser"><div class="tabbar"><div class="tab">${favicon}<span>${escapeText(s.brand.name)}</span></div><div class="tab ghost"><span>New tab</span></div></div><div class="addr">${escapeText(s.brand.slug)}.example</div><div class="page"><nav>${fitInline(art, 150, 28)}<span>Product</span><span>Pricing</span><span class="btn" style="background:${s.palette.primary}">Get started</span></nav><div class="hero"><b></b><i></i><i></i></div></div><figcaption>Browser tab &amp; site header</figcaption></figure>`,
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
    `<figure class="mock bizcard"><div class="front" style="background:${cardFill}">${fitInline(cardArt, 170, 50)}</div><div class="back">${s.symbol ? inline(s.symbol, 26, 26) : ''}<b>Full Name</b><small>Role · name@${escapeText(s.brand.slug)}.example</small></div><figcaption>Business card</figcaption></figure>`,
  );
  return parts.join('');
}

function badge(text: string, kind: string): string {
  return `<span class="badge ${kind}">${escapeText(text)}</span>`;
}

function scoreBadges(s: Subject): string {
  const out: string[] = [];
  if (s.quality)
    out.push(
      badge(
        `quality ${s.quality.summary.pass}✓ ${s.quality.summary.warn}! ${s.quality.summary.fail}✗`,
        s.quality.summary.fail ? 'bad' : s.quality.summary.warn ? 'warn' : 'good',
      ),
    );
  if (s.originality)
    out.push(
      badge(
        `originality: ${s.originality.verdict}${s.originality.confidence ? ` · ${s.originality.confidence} confidence` : ''}`,
        s.originality.verdict === 'redesign'
          ? 'bad'
          : s.originality.verdict === 'no-conflicts-found'
            ? 'good'
            : 'warn',
      ),
    );
  if (s.locked) out.push(badge('locked identity', 'lock'));
  out.push(badge(s.status, 'plain'));
  return out.join('');
}

async function subjectCard(s: Subject): Promise<string> {
  const palette = [s.palette.primary, s.palette.secondary, s.palette.accent, s.palette.ink].filter(
    Boolean,
  ) as string[];
  const sizes = s.symbol ? [16, 24, 32, 48, 64].map((n) => inline(s.symbol!, n, n)).join('') : '';
  const main = s.symbol
    ? inline(s.symbol, 168, 168, 'hero-mark')
    : fitInline(s.wordmark ?? s.lockup!, 300, 120, 'hero-mark');
  const lock = s.lockup ?? s.wordmark;
  const checks = s.quality
    ? `<details><summary>Technical checks</summary><ul class="checks">${s.quality.checks.map((c) => `<li class="${c.status}"><b>${escapeText(c.label)}</b> ${escapeText(String(c.value))} — ${escapeText(c.message)}</li>`).join('')}</ul></details>`
    : '';
  const orig = s.originality
    ? `<details><summary>Similarity (${s.originality.scope.referencesCompared} references)</summary><ul class="checks">${
        s.originality.visual.matches
          .slice(0, 5)
          .map(
            (m) =>
              `<li class="${m.risk === 'high' ? 'fail' : m.risk === 'review' ? 'warn' : 'pass'}"><b>${escapeText(m.name)}</b> ${Math.round(m.visual * 100)}% — ${escapeText(m.reasons[0] ?? '')}</li>`,
          )
          .join('') || '<li>No references collected.</li>'
      }${s.originality.diversity.map((d) => `<li class="${d.risk === 'high' ? 'fail' : d.risk === 'review' ? 'warn' : 'pass'}">vs concept <b>${escapeText(d.concept)}</b>: ${Math.round(d.visual * 100)}%</li>`).join('')}</ul></details>`
    : '';
  const fbKey = escapeAttr(`${s.brand.slug}/${s.key}`);
  return `<article class="concept" id="${escapeAttr(`${s.brand.slug}-${s.key}`)}" data-key="${fbKey}">
  <header><h3>${escapeText(s.title)}</h3><div class="badges">${scoreBadges(s)}</div></header>
  <div class="stage"><div class="ground light">${main}</div><div class="ground dark">${s.symbol ? inline(s.locked ? s.symbol : reversedVariant(s.symbol, DARK, s.palette.paper), 120, 120) : fitInline(s.locked ? lock! : reversedVariant(lock!, DARK, s.palette.paper), 220, 90)}</div><div class="ground brand" style="background:${s.palette.primary}">${s.symbol ? inline(s.locked ? s.symbol : onFillVariant(s.symbol, s.palette.primary).svg, 120, 120) : ''}</div></div>
  ${lock && s.symbol ? `<div class="lockup">${fitInline(lock, 420, 80)}</div>` : ''}
  <div class="sizes">${sizes}</div>
  <div class="chips">${palette.map((c) => `<span style="background:${c}" title="${c}"></span><code>${c}</code>`).join('')}</div>
  ${s.concept ? `<p class="dir"><b>${escapeText(s.concept.direction)}</b> — ${escapeText(s.concept.rationale)}</p><p class="sem">${s.concept.semantics.map((x) => `<span>${escapeText(x)}</span>`).join('')}</p>` : ''}
  ${checks}${orig}
  <div class="mockups">${await mockups(s)}</div>
  <div class="feedback"><label>Your feedback on “${escapeText(s.title)}”<textarea data-fb="${fbKey}" placeholder="What works, what doesn't, what to push further…"></textarea></label><div class="fbrow"><label><input type="radio" name="pick-${fbKey}" value="shortlist"> Shortlist</label><label><input type="radio" name="pick-${fbKey}" value="reject"> Reject</label><label><input type="radio" name="pick-${fbKey}" value="approve"> Approve</label></div></div>
</article>`;
}

function maybeJson<T>(p: string): T | undefined {
  return existsSync(p) ? readJson<T>(p) : undefined;
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
    const cards: string[] = [];
    for (const s of subjects) cards.push(await subjectCard(s));
    const compare =
      subjects.length > 1
        ? `<div class="compare">${subjects.map((s) => `<a href="#${escapeAttr(`${b.slug}-${s.key}`)}"><div class="cmp">${s.symbol ? inline(s.symbol, 96, 96) : fitInline(s.wordmark ?? s.lockup!, 150, 60)}</div><span>${escapeText(s.title)}</span></a>`).join('')}</div>`
        : '';
    sections.push(
      `<section class="brand"><h2>${escapeText(b.name)} <small>${escapeText(b.role)}${b.locked ? ' · locked' : ''}</small></h2>${compare}${exportList}${cards.join('\n') || '<p class="empty">No concepts yet.</p>'}</section>`,
    );
  }
  const family =
    m.family && familyMarks.length > 1
      ? `<section class="family"><h2>${escapeText(m.family.name)} family</h2><div class="fmrow">${familyMarks.join('')}</div></section>`
      : '';
  const html = page(m.name, family + sections.join('\n'));
  const path = join(ws.galleryDir(), 'index.html');
  writeGenerated(path, html);
  return { path, subjects: count };
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeText(title)} — Markilo gallery</title>
<style>
:root{--bg:#f4f5f7;--card:#fff;--ink:#16181d;--muted:#666c7a;--line:#e2e4e9;--good:#127a4a;--warn:#9a6400;--bad:#b42318}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0d0f13;--card:#16191f;--ink:#e9ebf0;--muted:#9aa1ae;--line:#272b33}}
:root[data-theme=dark]{--bg:#0d0f13;--card:#16191f;--ink:#e9ebf0;--muted:#9aa1ae;--line:#272b33}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header.top{position:sticky;top:0;z-index:5;display:flex;gap:12px;align-items:center;justify-content:space-between;padding:12px 24px;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
header.top h1{font-size:17px;margin:0}header.top .tools{display:flex;gap:8px;flex-wrap:wrap}button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:6px 12px;cursor:pointer}
main{max-width:1180px;margin:0 auto;padding:24px 16px 80px}h2{font-size:26px;margin:40px 0 12px}h2 small{font-size:14px;color:var(--muted);font-weight:500}
.concept{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px;margin:18px 0}.concept header{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.concept h3{margin:0;font-size:20px}
.badges{display:flex;gap:6px;flex-wrap:wrap}.badge{font-size:12px;padding:2px 9px;border-radius:99px;border:1px solid var(--line)}.badge.good{color:var(--good)}.badge.warn{color:var(--warn)}.badge.bad{color:var(--bad)}.badge.lock{background:#fff3c4;color:#6d5200;border-color:#f0d27a}
.stage{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;margin:16px 0}.ground{display:grid;place-items:center;border-radius:14px;min-height:200px;border:1px solid var(--line)}.ground.light{background:#fff}.ground.dark{background:${DARK}}
.lockup{background:#fff;border-radius:12px;padding:18px;display:grid;place-items:center;border:1px solid var(--line)}
.sizes{display:flex;gap:14px;align-items:flex-end;padding:12px;background:#fff;border-radius:12px;margin:10px 0;border:1px solid var(--line)}.chips{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.chips span{width:22px;height:22px;border-radius:6px;border:1px solid var(--line)}.chips code{font-size:12px;color:var(--muted);margin-right:8px}
.dir{margin:12px 0 4px}.sem span{display:inline-block;font-size:12px;border:1px solid var(--line);border-radius:99px;padding:1px 8px;margin:2px}
details{margin:8px 0}summary{cursor:pointer;color:var(--muted)}.checks{list-style:none;padding:0;margin:8px 0}.checks li{padding:4px 0 4px 22px;position:relative;font-size:13px}.checks li:before{position:absolute;left:0}.checks .pass:before{content:"✓";color:var(--good)}.checks .warn:before{content:"!";color:var(--warn)}.checks .fail:before{content:"✗";color:var(--bad)}.checks .info:before{content:"i";color:var(--muted)}
.mockups{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px;margin-top:16px}.mock{margin:0;background:var(--bg);border:1px solid var(--line);border-radius:14px;padding:12px;overflow:hidden}figcaption{font-size:12px;color:var(--muted);margin-top:8px}
.browser .tabbar{display:flex;gap:4px;background:#dfe2e8;border-radius:8px 8px 0 0;padding:6px 6px 0}.browser .tab{display:flex;gap:6px;align-items:center;background:#fff;border-radius:7px 7px 0 0;padding:5px 10px;font-size:12px;color:#222}.browser .tab.ghost{background:transparent;color:#666}.browser .addr{background:#fff;font-size:11px;color:#777;padding:4px 10px;border-bottom:1px solid #e5e7eb}
.page{background:#fff;padding:10px;border-radius:0 0 8px 8px}.page nav,.darkui nav{display:flex;align-items:center;gap:12px;font-size:12px;color:#444}.page nav span:first-of-type,.darkui nav span:first-of-type{margin-left:auto}.btn{color:#fff;padding:3px 9px;border-radius:6px}
.hero b{display:block;height:12px;width:60%;background:#e7e9ee;border-radius:4px;margin:16px 0 8px}.hero i{display:block;height:8px;width:80%;background:#f0f1f4;border-radius:4px;margin:6px 0}
.darkui{background:${DARK}}.darkui nav{color:#cfd3db}.darkui .hero b{background:#2a2e37}.darkui .hero i{background:#20242c}
.phone .screen{background:linear-gradient(160deg,#5b6b8c,#2c3346);border-radius:18px;padding:16px}.phone .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.phone .app{display:grid;justify-items:center;gap:3px}.phone .app i,.phone .tile{width:40px;height:40px;border-radius:9px}.phone .app span{font-size:9px;color:#fff}
.android .screen{background:linear-gradient(160deg,#3b4b42,#1f2a24);border-radius:14px;padding:18px;display:flex;gap:18px;justify-content:center}
.dock .bar{display:flex;gap:10px;align-items:end;justify-content:center;background:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.7);border-radius:16px;padding:8px;background-color:#c9d2e3}.dock .bar i{width:46px;height:46px;border-radius:11px;display:block}
.store .card{display:flex;gap:12px;align-items:center;background:#fff;color:#111;border-radius:12px;padding:12px}.store .tile{width:64px;height:64px}.store small{display:block;color:#666;font-size:11px}.store .get{display:inline-block;margin-top:4px;background:#eef1f6;color:#0a64d8;font-weight:700;font-size:11px;border-radius:99px;padding:2px 12px}
.social .post{background:#fff;color:#111;border-radius:12px;padding:10px}.social .who{display:flex;gap:8px;align-items:center;font-size:12px;margin-bottom:8px}.social .who i{width:20px;height:20px;border-radius:50%}.og{width:100%;height:auto;border-radius:8px;border:1px solid #e6e8ec}.social small{color:#777;font-size:11px}
.bizcard .front{border-radius:8px;aspect-ratio:85/55;display:grid;place-items:center;box-shadow:0 4px 14px rgba(0,0,0,.15)}.bizcard .back{margin-top:8px;background:#fff;color:#222;border-radius:8px;padding:10px;display:grid;gap:2px;box-shadow:0 4px 14px rgba(0,0,0,.1)}.bizcard small{color:#777;font-size:10px}
.feedback{margin-top:16px;border-top:1px dashed var(--line);padding-top:12px}.feedback textarea{display:block;width:100%;min-height:64px;margin-top:6px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);padding:8px;font:inherit}.fbrow{display:flex;gap:16px;margin-top:6px;font-size:13px}
.compare{display:flex;gap:12px;flex-wrap:wrap}.compare a{color:inherit;text-decoration:none;display:grid;gap:4px;justify-items:center;font-size:12px}.cmp{width:150px;height:120px;display:grid;place-items:center;background:#fff;border:1px solid var(--line);border-radius:12px}
.family .fmrow{display:flex;gap:20px;flex-wrap:wrap}.fm{display:grid;justify-items:center;gap:6px;background:#fff;color:#222;border-radius:14px;padding:16px;border:1px solid var(--line)}
.assets a{margin-right:8px;font-size:13px}.empty{color:var(--muted)}
@media (max-width:640px){.stage{grid-template-columns:1fr}.ground{min-height:150px}header.top{padding:10px 16px}}
</style></head><body>
<header class="top"><h1>${escapeText(title)} · Brand Preview Gallery</h1><div class="tools"><button type="button" id="theme">Toggle theme</button><button type="button" id="copy">Copy feedback for Claude</button></div></header>
<main>${body}</main>
<script>
(()=>{const K='markilo-feedback';let s={};try{s=JSON.parse(localStorage.getItem(K)||'{}')}catch(e){}
const save=()=>{try{localStorage.setItem(K,JSON.stringify(s))}catch(e){}};
document.querySelectorAll('textarea[data-fb]').forEach(t=>{const k=t.dataset.fb;t.value=(s[k]&&s[k].note)||'';t.addEventListener('input',()=>{(s[k]=s[k]||{}).note=t.value;save()})});
document.querySelectorAll('input[type=radio]').forEach(r=>{const k=r.name.slice(5);if(s[k]&&s[k].pick===r.value)r.checked=true;r.addEventListener('change',()=>{(s[k]=s[k]||{}).pick=r.value;save()})});
document.getElementById('theme').onclick=()=>{const d=document.documentElement;d.dataset.theme=d.dataset.theme==='dark'?'light':'dark'};
document.getElementById('copy').onclick=async()=>{const lines=Object.entries(s).filter(([,v])=>v.note||v.pick).map(([k,v])=>'- '+k+(v.pick?' ['+v.pick+']':'')+(v.note?': '+v.note.replace(/\\n/g,' '):''));const text='Markilo gallery feedback:\\n'+(lines.join('\\n')||'(no notes yet)');try{await navigator.clipboard.writeText(text);document.getElementById('copy').textContent='Copied ✓'}catch(e){prompt('Copy this feedback:',text)}};})();
</script>
</body></html>
`;
}
