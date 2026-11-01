import { escapeAttr, escapeText } from '../svg/xml.js';
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
 * straight from the folder, offline, with no script.
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
    ? `<div class="hero"><figure style="background:${g.native}">${img('logos/primary/primary-color.svg', `${kit.name} logo`)}</figure>${
        has('logos/primary/primary-reversed.svg')
          ? `<figure style="background:${g.opposite}">${img('logos/primary/primary-reversed.svg', `${kit.name} logo, reversed`)}</figure>`
          : ''
      }</div>`
    : '';
  const colors = Object.entries(kit.palette)
    .filter(([, v]) => typeof v === 'string' && v.startsWith('#'))
    .map(
      ([k, v]) =>
        `<span class="chip"><i style="background:${v}"></i>${escapeText(k)} <code>${v}</code></span>`,
    )
    .join('');
  const start = essentials(kit, has)
    .map(([use, p]) => `<tr><td>${escapeText(use)}</td><td>${link(p)}</td></tr>`)
    .join('');

  // Logos: one row per logo, one column per variant, each on the ground it is made for.
  const rows = LOGO_ROWS.filter(([name]) => assets.some((a) => a.path.startsWith(`logos/${name}/`)));
  const variants = LOGO_VARIANTS.filter((v) => rows.some(([name]) => has(`logos/${name}/${name}-${v}.svg`)));
  const matrix = rows.length
    ? `<div class="matrix" style="--cols:${variants.length}"><span></span>${variants.map((v) => `<b class="vh">${v}</b>`).join('')}${rows
        .map(
          ([name, title]) =>
            `<p class="rh">${escapeText(title)}</p>${variants
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
      return `<section id="${grp}"><h2>${grp}/ <small>${count} files — ${escapeText(FOLDERS[grp].replace(/`/g, ''))}</small></h2>${
        grp === 'logos' ? matrix : ''
      }${cards ? `<div class="cards">${cards}</div>` : ''}${others ? `<table class="files">${others}</table>` : ''}</section>`;
    })
    .join('\n');
  const nav = groupsIn(assets)
    .map((grp) => `<a href="#${grp}">${grp}</a>`)
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self' file: data:; base-uri 'none'; form-action 'none'">
<title>${escapeText(kit.name)} — brand kit</title>
<style>
:root{--bg:#f4f5f7;--card:#fff;--text:#16181d;--muted:#5f6573;--line:#e2e4e9;--check:#e9ebef}
@media (prefers-color-scheme:dark){:root{--bg:#0e1014;--card:#171a20;--text:#e8eaef;--muted:#9aa1ae;--line:#2a2e37;--check:#20242b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1180px;margin:0 auto;padding:32px 16px 64px}a{color:inherit}h1{margin:0;font-size:28px}h2{margin:40px 0 12px;font-size:20px}h2 small{font-weight:400;color:var(--muted);font-size:14px}
.sub{color:var(--muted);margin:4px 0 20px}nav{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}nav a{padding:4px 10px;border:1px solid var(--line);border-radius:99px;text-decoration:none;background:var(--card)}
.hero{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}.hero figure{margin:0;border-radius:14px;border:1px solid var(--line);aspect-ratio:2/1;overflow:hidden}.hero img{display:block;width:100%;height:100%;object-fit:contain;padding:18% 15%}
.chips{display:flex;flex-wrap:wrap;gap:12px;margin:14px 0}.chip{display:flex;align-items:center;gap:6px;font-size:13px}.chip i{width:18px;height:18px;border-radius:5px;border:1px solid var(--line)}
table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}td{padding:7px 12px;border-top:1px solid var(--line);vertical-align:top}tr:first-child td{border-top:0}td:first-child{width:38%}
.matrix{display:grid;grid-template-columns:minmax(120px,170px) repeat(var(--cols),minmax(0,1fr));gap:10px;align-items:center;overflow-x:auto}.vh{font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}.rh{margin:0;font-size:13px}
.cell figure{margin:0;border-radius:10px;border:1px solid var(--line);aspect-ratio:2/1;overflow:hidden}.cell img{display:block;width:100%;height:100%;object-fit:contain;padding:14% 12%}.cell small{display:block;text-align:center;color:var(--muted);font-size:12px;margin-top:3px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-top:12px}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px;display:grid;gap:4px;font-size:13px;min-width:0}.card b{font-weight:600;overflow-wrap:anywhere}.card small{color:var(--muted)}
.thumb{display:block;aspect-ratio:4/3;overflow:hidden;border-radius:6px;background:repeating-conic-gradient(var(--check) 0 25%,transparent 0 50%) 0 0/16px 16px}.thumb img{display:block;width:100%;height:100%;object-fit:contain;padding:8%}
.files{margin-top:12px;font-size:13px}code{font-size:12px}
@media (max-width:640px){.matrix{grid-template-columns:90px repeat(var(--cols),minmax(110px,1fr))}}
</style></head><body><main>
<h1>${escapeText(kit.name)} brand kit</h1>
<p class="sub">${assets.length} files · every file below is shown on the background it is made for · ${link('README.md')} · ${link('asset-manifest.json')}</p>
${hero}
${colors ? `<div class="chips">${colors}</div>` : ''}
${start ? `<h2>Start here</h2><table>${start}</table>` : ''}
<nav>${nav}</nav>
${sections}
</main></body></html>
`;
}
