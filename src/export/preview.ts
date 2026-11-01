import { escapeAttr, escapeText } from '../svg/xml.js';
import {
  CHROME_CSS,
  CHROME_HASH,
  CHROME_SCRIPT,
  footHtml,
  stepsHtml,
  t,
  topBar,
  withChrome,
} from '../ui/chrome.js';
import type { AssetRecord, ExportGroup } from './exporter.js';
import type { BrandKit } from './kit.js';
import { groundsFor } from './variants.js';

/** The one-colour and reversed treatments every logo is exported in, in the order they are shown. */
export const LOGO_VARIANTS = ['color', 'reversed', 'black', 'white'] as const;

/** What each export folder holds, for people who open the folder rather than the manifest. */
const FOLDERS: Record<ExportGroup, string> = {
  logos: 'every logo in color, reversed, black and white, as SVG and transparent PNG',
  web: 'favicons, home-screen icons, the web manifest and `head-snippet.html` to paste into your <head>',
  ios: 'the Xcode app icon set',
  macos: 'the macOS app icon (`.icns` and its sizes)',
  android: 'launcher icons (adaptive and legacy) for `res/`',
  windows: 'tiles and the app icon for Windows packages',
  social: 'link previews, profile covers and the avatar',
  marketing: 'banners and artwork for launch posts and stores',
  tokens: 'colors and type as JSON and CSS variables',
  guidelines: 'how to use the identity (HTML and Markdown)',
};

const LOGO_ROWS: [string, string][] = [
  ['primary', 'Primary — the default'],
  ['secondary', 'Secondary — stacked, for square-ish spaces'],
  ['compact', 'Compact — navigation bars and tight spaces'],
  ['symbol', 'Symbol — the mark alone'],
  ['wordmark', 'Wordmark — the word alone'],
];

/** The handful of files most people need, when the export has them. */
function essentials(kit: BrandKit, has: (p: string) => boolean): [string, string][] {
  const rows: [string, string][] = [
    [kit.lead === 'wordmark' ? 'Your logo (the wordmark)' : 'Your logo', 'logos/primary/primary-color.svg'],
    ['Logo on dark backgrounds', 'logos/primary/primary-reversed.svg'],
    ['The symbol alone', 'logos/symbol/symbol-color.svg'],
    ['App icon, avatar', 'logos/appmark/appmark.png'],
    ['Website icons (paste into <head>)', 'web/head-snippet.html'],
    ['Link preview image', 'social/og-image.png'],
    ['Colors as CSS variables', 'tokens/tokens.css'],
    ['How to use it', 'guidelines/index.html'],
  ];
  return rows.filter(([, p]) => has(p));
}

function groundOf(kit: BrandKit, variant: string): string {
  const g = groundsFor(kit.palette.paper, kit.palette.dark);
  return variant === 'color'
    ? g.native
    : variant === 'reversed'
      ? g.opposite
      : variant === 'white'
        ? '#111318'
        : '#ffffff';
}

const isImage = (a: AssetRecord) => a.format === 'png' || a.format === 'svg';
const groupsIn = (assets: AssetRecord[]) =>
  (Object.keys(FOLDERS) as ExportGroup[]).filter((g) => assets.some((a) => a.group === g));

/** `README.md` at the top of the export: where to start, the files most people need, and what each folder is. */
export function kitReadme(kit: BrandKit, assets: AssetRecord[]): string {
  const has = (p: string) => assets.some((a) => a.path === p);
  const g = groundsFor(kit.palette.paper, kit.palette.dark);
  const L = [
    `# ${kit.name} brand kit`,
    '',
    'Open **`index.html`** in a browser: it shows every file in this folder on the background it is made for.',
    '',
    '## The files most people need',
    '',
    '| Use | File |',
    '| --- | --- |',
    ...essentials(kit, has).map(([use, p]) => `| ${use} | \`${p}\` |`),
    '',
    '## Folders',
    '',
    ...groupsIn(assets).map(
      (grp) => `- \`${grp}/\` (${assets.filter((a) => a.group === grp).length} files) — ${FOLDERS[grp]}.`,
    ),
    '',
  ];
  if (assets.some((a) => a.group === 'logos') && !kit.locked)
    L.push(
      '## Logo variants',
      '',
      `- \`*-color\`: full color, for ${g.darkFirst ? 'dark' : 'light'} backgrounds like ${g.native}.`,
      `- \`*-reversed\`: for ${g.darkFirst ? 'light' : 'dark'} backgrounds (${g.opposite}).`,
      '- `*-black`: one color, for light backgrounds, print and engraving.',
      '- `*-white`: one color, for dark backgrounds and photos (it looks empty in file previews: white on transparent).',
      '',
    );
  L.push('`asset-manifest.json` lists every file with its purpose, size and checksum.', '');
  return L.join('\n');
}

/**
 * `index.html` at the top of the export: a preview of every file. Images are linked by relative path, so it works
 * straight from the folder, offline. Its only script is the language and theme switch, pinned by hash in the CSP;
 * without it the page reads the same, in English.
 */
export function kitIndexHtml(kit: BrandKit, assets: AssetRecord[]): string {
  const has = (p: string) => assets.some((a) => a.path === p);
  const g = groundsFor(kit.palette.paper, kit.palette.dark);
  const img = (p: string, alt: string) =>
    `<img src="${escapeAttr(p)}" alt="${escapeAttr(alt)}" loading="lazy">`;
  const link = (p: string, text = p) => `<a href="${escapeAttr(p)}">${escapeText(text)}</a>`;
  const size = (a: AssetRecord) =>
    a.width ? `${a.width}×${a.height}` : `${Math.max(1, Math.round(a.bytes / 1024))} KB`;

  const primary = has('logos/primary/primary-color.svg');
  const hero = primary
    ? `<div class="hero"><figure style="background:${g.native}">${img('logos/primary/primary-color.svg', `${kit.name} logo`)}<figcaption>${t('Primary logo')}</figcaption></figure>${
        has('logos/primary/primary-reversed.svg')
          ? `<figure style="background:${g.opposite}">${img('logos/primary/primary-reversed.svg', `${kit.name} logo, reversed`)}<figcaption>${t('On dark backgrounds')}</figcaption></figure>`
          : ''
      }</div>`
    : '';
  const colors = Object.entries(kit.palette)
    .filter(([, v]) => typeof v === 'string' && v.startsWith('#'))
    .map(([k, v]) => `<span class="chip"><i style="background:${v}"></i>${t(k)} <code>${v}</code></span>`)
    .join('');
  const start = essentials(kit, has)
    .map(([use, p]) => `<tr><td>${t(use)}</td><td>${link(p)}</td></tr>`)
    .join('');

  // Logos: one row per logo, one column per variant, each on the ground it is made for.
  const rows = LOGO_ROWS.filter(([name]) => assets.some((a) => a.path.startsWith(`logos/${name}/`)));
  const variants = LOGO_VARIANTS.filter((v) => rows.some(([name]) => has(`logos/${name}/${name}-${v}.svg`)));
  const matrix = rows.length
    ? `<div class="matrix" style="--cols:${variants.length}"><span></span>${variants.map((v) => `<b class="vh">${t(v)}</b>`).join('')}${rows
        .map(
          ([name, title]) =>
            `<p class="rh">${t(title)}</p>${variants
              .map((v) => {
                const svg = `logos/${name}/${name}-${v}.svg`;
                if (!has(svg)) return '<div></div>';
                const pngPath = `logos/${name}/${name}-${v}.png`;
                return `<div class="cell"><figure style="background:${groundOf(kit, v)}">${img(svg, `${name} ${v}`)}</figure><small>${link(svg, 'SVG')}${has(pngPath) ? ` · ${link(pngPath, 'PNG')}` : ''}</small></div>`;
              })
              .join('')}`,
        )
        .join('')}</div>`
    : '';
  const inMatrix = new Set(
    rows.flatMap(([name]) =>
      LOGO_VARIANTS.flatMap((v) => [`logos/${name}/${name}-${v}.svg`, `logos/${name}/${name}-${v}.png`]),
    ),
  );

  const sections = groupsIn(assets)
    .map((grp) => {
      const files = assets.filter((a) => a.group === grp && !inMatrix.has(a.path));
      const cards = files
        .filter(isImage)
        .map(
          (a) =>
            `<div class="card"><a class="thumb" href="${escapeAttr(a.path)}">${img(a.path, a.path)}</a><b>${link(a.path, a.path.slice(grp.length + 1))}</b><small>${size(a)} · ${escapeText(a.purpose)}</small></div>`,
        )
        .join('');
      const others = files
        .filter((a) => !isImage(a))
        .map(
          (a) =>
            `<tr><td>${link(a.path, a.path.slice(grp.length + 1))}</td><td>${escapeText(a.purpose)}</td></tr>`,
        )
        .join('');
      const count = assets.filter((a) => a.group === grp).length;
      return `<section id="${grp}"><h2>${grp}/ <small>${t('{0} files', [count])} — ${t(FOLDERS[grp].replace(/`/g, ''))}</small></h2>${
        grp === 'logos' ? matrix : ''
      }${cards ? `<div class="cards">${cards}</div>` : ''}${others ? `<table class="files">${others}</table>` : ''}</section>`;
    })
    .join('\n');
  const nav = groupsIn(assets)
    .map((grp) => `<a href="#${grp}">${grp}</a>`)
    .join('');

  return withChrome(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${CHROME_HASH}; style-src 'unsafe-inline'; img-src 'self' file: data:; base-uri 'none'; form-action 'none'">
<title>${escapeText(kit.name)} — brand kit</title>
<script>${CHROME_SCRIPT}</script>
<style>
${CHROME_CSS}
:root{--check:#e6ded1}:root[data-theme=dark]{--check:#2a201f}@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--check:#2a201f}}
main{max-width:1180px;margin:0 auto;padding:28px 16px 32px}h1{margin:0;font:600 34px/1.1 var(--serif);letter-spacing:-.01em}h2{margin:44px 0 12px;font:600 22px/1.2 var(--serif)}h2 small{font:400 13px/1.4 var(--sans);color:var(--muted)}
.sub{color:var(--muted);margin:6px 0 16px}.intro{display:grid;gap:14px;margin-bottom:20px}
nav{display:flex;flex-wrap:wrap;gap:6px;margin:24px 0 0;position:sticky;top:0;background:var(--bg);padding:10px 0;z-index:2;border-bottom:1px solid var(--line)}nav a{padding:5px 12px;border:1px solid var(--line);border-radius:99px;text-decoration:none;background:var(--card);color:var(--ink);font-size:13px}
.hero{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}.hero figure{margin:0;border-radius:16px;border:1px solid var(--line);aspect-ratio:2/1;overflow:hidden;position:relative}.hero img{display:block;width:100%;height:100%;object-fit:contain;padding:18% 15%}
.hero figcaption{position:absolute;left:12px;bottom:10px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;background:rgba(255,255,255,.86);color:#16120f;border-radius:99px;padding:3px 8px}
.chips{display:flex;flex-wrap:wrap;gap:8px 14px;margin:16px 0}.chip{display:flex;align-items:center;gap:6px;font-size:13px}.chip i{width:20px;height:20px;border-radius:6px;border:1px solid var(--line)}
table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}td{padding:8px 12px;border-top:1px solid var(--line);vertical-align:top}tr:first-child td{border-top:0}td:first-child{width:38%}
.matrix{display:grid;grid-template-columns:minmax(120px,170px) repeat(var(--cols),minmax(0,1fr));gap:10px;align-items:center;overflow-x:auto}.vh{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.rh{margin:0;font-size:13px}
.cell figure{margin:0;border-radius:10px;border:1px solid var(--line);aspect-ratio:2/1;overflow:hidden}.cell img{display:block;width:100%;height:100%;object-fit:contain;padding:14% 12%}.cell small{display:block;text-align:center;color:var(--muted);font-size:12px;margin-top:3px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-top:12px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px;display:grid;gap:4px;font-size:13px;min-width:0;box-shadow:var(--shadow)}.card b{font-weight:600;overflow-wrap:anywhere}.card small{color:var(--muted)}
.thumb{display:block;aspect-ratio:4/3;overflow:hidden;border-radius:8px;background:repeating-conic-gradient(var(--check) 0 25%,transparent 0 50%) 0 0/16px 16px}.thumb img{display:block;width:100%;height:100%;object-fit:contain;padding:8%}
.files{margin-top:12px;font-size:13px}code{font-size:12px}
@media (max-width:640px){h1{font-size:28px}.matrix{grid-template-columns:90px repeat(var(--cols),minmax(110px,1fr))}td:first-child{width:auto}}
</style></head><body>
${topBar('Asset kit')}
<main>
<div class="intro"><h1>${escapeText(kit.name)}</h1>${stepsHtml(['done', 'done', 'done', 'done', 'done'])}<p class="sub">${t('{0} files · every file below is shown on the background it is made for', [assets.length])} · ${link('README.md')} · ${link('asset-manifest.json')}</p></div>
${hero}
${colors ? `<div class="chips">${colors}</div>` : ''}
${start ? `<h2>${t('Start here')}</h2><table>${start}</table>` : ''}
<nav>${nav}</nav>
${sections}
</main>
${footHtml()}
</body></html>
`);
}
