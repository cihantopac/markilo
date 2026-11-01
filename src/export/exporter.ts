import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio, normalizeColor } from '../analyze/color.js';
import { MarkiloError } from '../core/errors.js';
import { sha256, writeGenerated, writeJson } from '../core/fsx.js';
import type { Workspace } from '../core/workspace.js';
import { loadBundledFace } from '../design/fonts.js';
import { generatePalette } from '../design/palette.js';
import { textPathMarkup } from '../design/wordmark.js';
import { pngSize } from '../render/png.js';
import { renderPng } from '../render/resvg.js';
import { label } from '../render/sheet.js';
import { aspectOf, fmt, nestSvg, svgDocument } from '../svg/compose.js';
import { optimizeSvg } from '../svg/optimize.js';
import { escapeAttr, localName, parseXml, serializeXml, walk } from '../svg/xml.js';
import { encodeIcns, encodeIco, ICNS_TYPES } from './encoders.js';
import { placeMark, squircle } from './geometry.js';
import { guidelinesHtml, guidelinesMarkdown } from './guidelines.js';
import { type BrandKit, loadKit } from './kit.js';
import { SPECS } from './specs.js';
import {
  adaptToGround,
  groundsFor,
  isDarkGround,
  monochrome,
  onFillVariant,
  reversedVariant,
} from './variants.js';

export const EXPORT_GROUPS = [
  'logos',
  'web',
  'ios',
  'macos',
  'android',
  'windows',
  'social',
  'marketing',
  'tokens',
  'guidelines',
] as const;
export type ExportGroup = (typeof EXPORT_GROUPS)[number];

export interface AssetRecord {
  path: string;
  group: ExportGroup;
  purpose: string;
  format: string;
  width?: number;
  height?: number;
  bytes: number;
  sha256: string;
  derivedFrom: string;
}

export interface ExportResult {
  outDir: string;
  assets: AssetRecord[];
  skipped: { group: ExportGroup; reason: string }[];
  warnings: string[];
}

interface Ctx {
  kit: BrandKit;
  outDir: string;
  symbol?: string;
  /** Simplified symbol for 32 px and below (favicons, small ICO sizes, Windows target sizes). */
  small?: string;
  wordmark?: string;
  lockupH?: string;
  lockupS?: string;
  lockupC?: string;
  /** The logo that leads: the wordmark for a wordmark-led identity, else the horizontal lockup. */
  primary?: string;
  assets: AssetRecord[];
  warnings: string[];
}

async function emit(
  ctx: Ctx,
  rel: string,
  data: string | Buffer,
  meta: { group: ExportGroup; purpose: string; derivedFrom: string },
): Promise<void> {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  writeGenerated(join(ctx.outDir, rel), buf);
  const format = rel.slice(rel.lastIndexOf('.') + 1);
  const size = format === 'png' ? pngSize(buf) : undefined;
  ctx.assets.push({ path: rel, ...meta, format, ...(size ?? {}), bytes: buf.length, sha256: sha256(buf) });
}

async function png(svg: string, width: number, height?: number): Promise<Buffer> {
  return renderPng(svg, height ? { width, height } : { width });
}

/** Canvas of a given size with the mark placed by content. */
async function canvas(
  mark: string,
  w: number,
  h: number,
  fit: Parameters<typeof placeMark>[2],
  bg?: string,
  under = '',
): Promise<string> {
  const body = under + (await placeMark(mark, { x: 0, y: 0, width: w, height: h }, fit));
  return svgDocument(w, h, body, bg ? { background: bg } : {});
}

/** Whole lockup (no content-aware fit needed: lockups are tight to their ink by construction). */
function fitArt(
  art: string,
  w: number,
  h: number,
  maxW: number,
  maxH: number,
  cx = w / 2,
  cy = h / 2,
): string {
  const a = aspectOf(art);
  let aw = maxW;
  let ah = aw / a;
  if (ah > maxH) {
    ah = maxH;
    aw = ah * a;
  }
  return nestSvg(art, { x: cx - aw / 2, y: cy - ah / 2, width: aw, height: ah });
}

const grounds = (kit: BrandKit) => groundsFor(kit.palette.paper, kit.palette.dark);

// ---------------------------------------------------------------- logos
async function exportLogos(ctx: Ctx) {
  const overview: { name: string; variants: { v: string; svg: string }[] }[] = [];
  const { kit } = ctx;
  const arts: [string, string | undefined, string][] = [
    [
      'primary',
      ctx.primary,
      kit.lead === 'wordmark' ? 'Primary logo (the wordmark)' : 'Primary logo (horizontal lockup)',
    ],
    ['secondary', ctx.lockupS, 'Secondary logo (stacked lockup)'],
    ['compact', ctx.lockupC, 'Compact lockup for navigation bars and tight spaces'],
    ['symbol', ctx.symbol, 'Symbol / brandmark'],
    ['wordmark', ctx.wordmark, 'Wordmark'],
  ];
  for (const [name, art, purpose] of arts) {
    if (!art) continue;
    const from =
      name === 'primary' && (kit.lead === 'wordmark' || !ctx.lockupH) ? 'wordmark.svg' : `${name}.svg`;
    const variants: [string, string, string][] = kit.locked
      ? [['color', art, 'as provided (locked identity)']]
      : [
          [
            'color',
            art,
            `full color, for ${grounds(kit).darkFirst ? 'dark' : 'light'} backgrounds like ${grounds(kit).native}`,
          ],
          [
            'reversed',
            adaptToGround(art, grounds(kit).opposite, { dark: kit.palette.ink, light: '#ffffff' }),
            `for ${grounds(kit).darkFirst ? 'light' : 'dark'} backgrounds (${grounds(kit).opposite})`,
          ],
          ['black', monochrome(art, '#000000'), 'one-color black (print, fax, engraving)'],
          ['white', monochrome(art, '#ffffff'), 'one-color white (knockout on photos and dark fills)'],
          ['ink', monochrome(art, kit.palette.ink), `one-color brand ink ${kit.palette.ink}`],
        ];
    overview.push({ name, variants: variants.map(([v, svg]) => ({ v, svg })) });
    for (const [v, svg, note] of variants) {
      const clean = kit.locked ? svg : optimizeSvg(svg);
      await emit(ctx, `logos/${name}/${name}-${v}.svg`, clean, {
        group: 'logos',
        purpose: `${purpose} — ${note}`,
        derivedFrom: from,
      });
      const w = name === 'symbol' ? 1024 : 2000;
      await emit(ctx, `logos/${name}/${name}-${v}.png`, await png(clean, w), {
        group: 'logos',
        purpose: `${purpose} — ${note}, transparent PNG`,
        derivedFrom: from,
      });
    }
  }
  // A contact sheet of every variant on the ground it is made for: transparent white/black files look empty in
  // file browsers, so this is the place to see what each file is.
  if (overview.length) {
    const g = grounds(kit);
    const groundFor = (v: string): string =>
      v === 'color'
        ? g.native
        : v === 'reversed'
          ? g.opposite
          : v === 'white'
            ? '#111318'
            : v === 'black'
              ? '#ffffff'
              : contrastRatio(kit.palette.ink, g.native) >= 3
                ? g.native
                : g.opposite;
    const cols = Math.max(...overview.map((o) => o.variants.length));
    const cw = 300;
    const ch = 150;
    const head = 36;
    const W = 24 + cols * (cw + 12);
    const H = head + overview.length * (ch + 34) + 12;
    let body = label(
      `${kit.name} — logo files (each shown on the background it is made for)`,
      24,
      24,
      14,
      '#30343c',
    );
    overview.forEach((o, r) => {
      const y = head + r * (ch + 34);
      o.variants.forEach(({ v, svg }, c) => {
        const x = 24 + c * (cw + 12);
        const bg = groundFor(v);
        body += `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="10" fill="${bg}" stroke="#d9dce3"/>`;
        body += fitArt(svg, cw, ch, cw * 0.8, ch * 0.55, x + cw / 2, y + ch / 2);
        body += label(`${o.name}-${v}.svg`, x + 2, y + ch + 18, 11, '#5b6170');
      });
    });
    const sheet = svgDocument(W, H, body, { background: '#f4f5f7' });
    await emit(ctx, 'logos/overview.png', await png(sheet, W, H), {
      group: 'logos',
      purpose: 'Overview of every logo file on its intended background',
      derivedFrom: 'brand.json',
    });
    await emit(
      ctx,
      'logos/README.md',
      [
        `# ${kit.name} logo files`,
        '',
        'Open `overview.png` to see every file on the background it is made for.',
        '',
        `- \`*-color\`: full color for ${g.darkFirst ? 'dark' : 'light'} backgrounds (${g.native}).`,
        `- \`*-reversed\`: for ${g.darkFirst ? 'light' : 'dark'} backgrounds (${g.opposite}).`,
        '- `*-black`: one color, for light backgrounds, print, engraving.',
        '- `*-white`: one color, for dark backgrounds and photos. It looks empty in file previews because it is white on transparent.',
        `- \`*-ink\`: one color in the brand ink (${kit.palette.ink}).`,
        '',
        `Folders: \`primary\` (${kit.lead === 'wordmark' ? 'the wordmark' : 'horizontal lockup'}, default), \`secondary\` (stacked), \`compact\`, \`symbol\`, \`wordmark\`, \`appmark\`.`,
        '',
      ].join('\n'),
      { group: 'logos', purpose: 'Which logo file to use where', derivedFrom: 'brand.json' },
    );
  }
  if (ctx.symbol && !kit.locked) {
    const app = await appmarkSvg(ctx, 1024, 'rounded');
    await emit(ctx, 'logos/appmark/appmark.svg', app, {
      group: 'logos',
      purpose: 'Appmark: symbol on brand tile (avatars, app listings)',
      derivedFrom: 'symbol.svg',
    });
    await emit(ctx, 'logos/appmark/appmark.png', await png(app, 1024), {
      group: 'logos',
      purpose: 'Appmark PNG 1024',
      derivedFrom: 'symbol.svg',
    });
  }
}

/** Symbol on a brand-color tile. shape: rounded (generic tile), square (OS masks it), circle. */
async function appmarkSvg(
  ctx: Ctx,
  size: number,
  shape: 'rounded' | 'square' | 'circle',
  fraction = 0.6,
): Promise<string> {
  const fill = ctx.kit.palette.primary;
  const { svg } = onFillVariant(ctx.symbol!, fill);
  const under =
    shape === 'square'
      ? `<rect width="${size}" height="${size}" fill="${fill}"/>`
      : shape === 'circle'
        ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${fill}"/>`
        : squircle(size, 0, size * 0.225, fill);
  return canvas(svg, size, size, { mode: 'box', fraction }, undefined, under);
}

// ---------------------------------------------------------------- web
/** SVG favicon that swaps low-contrast colors when the browser UI is dark. */
export function adaptiveFavicon(symbol: string, dark: string, paper: string): string {
  const root = parseXml(symbol);
  const rules: string[] = [];
  let n = 0;
  walk(root, (el) => {
    if (
      !['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'g', 'svg'].includes(
        localName(el.name),
      )
    )
      return;
    for (const prop of ['fill', 'stroke'] as const) {
      const c = el.attrs[prop] ? normalizeColor(el.attrs[prop]!) : undefined;
      if (!c || contrastRatio(c, dark) >= 3) continue;
      const cls = `d${n++}`;
      el.attrs.class = `${el.attrs.class ? `${el.attrs.class} ` : ''}${cls}`;
      const lifted =
        reversedVariant(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1" fill="${c}"/></svg>`,
          dark,
          paper,
        ).match(/fill="(#[0-9a-f]{6})"/)?.[1] ?? paper;
      rules.push(`.${cls}{${prop}:${lifted}}`);
    }
  });
  if (!rules.length) return symbol;
  root.children.unshift({
    type: 'element',
    name: 'style',
    attrs: {},
    children: [{ type: 'text', value: `@media (prefers-color-scheme:dark){${rules.join('')}}` }],
  });
  return serializeXml(root);
}

async function exportWeb(ctx: Ctx) {
  const { kit } = ctx;
  const sym = ctx.symbol!;
  // Browser tabs show the favicon at 16–32 px: the small version when there is one.
  const tiny = ctx.small ?? sym;
  const tinyFrom = ctx.small ? 'symbol-small.svg' : 'symbol.svg';
  const fav = kit.locked ? tiny : optimizeSvg(adaptiveFavicon(tiny, '#202124', kit.palette.paper));
  await emit(ctx, 'web/favicon.svg', fav, {
    group: 'web',
    purpose: 'SVG favicon (adapts to dark browser UI)',
    derivedFrom: tinyFrom,
  });
  const icoPngs: Buffer[] = [];
  for (const s of SPECS.web.icoSizes)
    icoPngs.push(await png(await canvas(s <= 32 ? tiny : sym, s, s, { mode: 'box', fraction: 0.94 }), s));
  const i32 = SPECS.web.icoSizes.indexOf(32);
  if (i32 >= 0)
    await emit(ctx, 'web/favicon-32.png', icoPngs[i32]!, {
      group: 'web',
      purpose: '32 px PNG favicon (for frameworks that expect a PNG, e.g. Flutter web)',
      derivedFrom: tinyFrom,
    });
  await emit(ctx, 'web/favicon.ico', encodeIco(icoPngs), {
    group: 'web',
    purpose: `Legacy favicon (${SPECS.web.icoSizes.join('/')} px)`,
    derivedFrom: ctx.small ? 'symbol-small.svg (≤ 32 px), symbol.svg' : 'symbol.svg',
  });
  const touch = kit.locked
    ? await canvas(sym, 180, 180, { mode: 'box', fraction: 0.66 }, kit.palette.paper)
    : await appmarkSvg(ctx, 180, 'square', 0.62);
  await emit(ctx, 'web/apple-touch-icon.png', await png(touch, SPECS.web.appleTouch), {
    group: 'web',
    purpose: 'Apple touch icon 180×180, opaque',
    derivedFrom: 'symbol.svg',
  });
  for (const s of SPECS.web.manifestIcons) {
    const any = kit.locked
      ? await canvas(sym, s, s, { mode: 'box', fraction: 0.8 })
      : await appmarkSvg(ctx, s, 'rounded', 0.6);
    await emit(ctx, `web/icon-${s}.png`, await png(any, s), {
      group: 'web',
      purpose: `Web app manifest icon ${s}×${s} (purpose any)`,
      derivedFrom: 'symbol.svg',
    });
  }
  for (const s of SPECS.web.maskableIcons) {
    const fill = kit.locked ? kit.palette.paper : kit.palette.primary;
    const mark = kit.locked ? sym : onFillVariant(sym, fill).svg;
    const maskable = await canvas(
      mark,
      s,
      s,
      { mode: 'circle', radius: SPECS.web.maskableSafeRadius * 0.85 },
      fill,
    );
    await emit(ctx, `web/icon-maskable-${s}.png`, await png(maskable, s), {
      group: 'web',
      purpose: `Maskable icon ${s}×${s} (content inside the 40% safe circle)`,
      derivedFrom: 'symbol.svg',
    });
  }
  const manifest = {
    name: kit.name,
    short_name: kit.name.length > 12 ? kit.name.slice(0, 12) : kit.name,
    icons: [
      ...SPECS.web.manifestIcons.map((s) => ({
        src: `icon-${s}.png`,
        sizes: `${s}x${s}`,
        type: 'image/png',
        purpose: 'any',
      })),
      ...SPECS.web.maskableIcons.map((s) => ({
        src: `icon-maskable-${s}.png`,
        sizes: `${s}x${s}`,
        type: 'image/png',
        purpose: 'maskable',
      })),
    ],
    theme_color: kit.palette.primary,
    background_color: kit.palette.paper,
    display: 'standalone',
  };
  await emit(ctx, 'web/site.webmanifest', `${JSON.stringify(manifest, null, 2)}\n`, {
    group: 'web',
    purpose: 'Web app manifest',
    derivedFrom: 'brand.json',
  });
  const head = [
    '<!-- Generated by Markilo. Copy the web/ files to your site root. -->',
    `<link rel="icon" href="/favicon.ico" sizes="${SPECS.web.icoSizes.map((x) => `${x}x${x}`).join(' ')}">`,
    '<link rel="icon" href="/favicon.svg" sizes="any" type="image/svg+xml">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
    `<meta name="theme-color" content="${kit.palette.primary}">`,
    '<meta property="og:image" content="/og-image.png">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${escapeAttr(kit.name)} logo">`,
    '<meta name="twitter:card" content="summary_large_image">',
    '',
  ].join('\n');
  await emit(ctx, 'web/head-snippet.html', head, {
    group: 'web',
    purpose: 'HTML <head> tags for the web icons',
    derivedFrom: 'brand.json',
  });
}

// ---------------------------------------------------------------- iOS
async function exportIos(ctx: Ctx) {
  const { kit } = ctx;
  const S = SPECS.ios.appIcon;
  const sym = ctx.symbol!;
  const light = kit.locked
    ? await canvas(sym, S, S, { mode: 'box', fraction: 0.62 }, kit.palette.paper)
    : await appmarkSvg(ctx, S, 'square', 0.6);
  const base = 'ios/AppIcon.appiconset';
  await emit(ctx, `${base}/AppIcon-1024.png`, await png(light, S), {
    group: 'ios',
    purpose: 'iOS/iPadOS app icon 1024, opaque, unmasked',
    derivedFrom: 'symbol.svg',
  });
  const images: Record<string, unknown>[] = [
    { filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' },
  ];
  if (!kit.locked) {
    // Dark appearance: mark on a transparent background, the system supplies the dark backdrop.
    const darkMark = reversedVariant(sym, kit.palette.dark, kit.palette.paper);
    const dark = await canvas(darkMark, S, S, { mode: 'box', fraction: 0.6 });
    await emit(ctx, `${base}/AppIcon-1024-dark.png`, await png(dark, S), {
      group: 'ios',
      purpose: 'iOS 18+ dark appearance icon (transparent background)',
      derivedFrom: 'symbol.svg',
    });
    // Tinted appearance: grayscale artwork on black; the system applies the user's tint.
    const tinted = await canvas(monochrome(sym, '#ffffff'), S, S, { mode: 'box', fraction: 0.6 }, '#000000');
    await emit(ctx, `${base}/AppIcon-1024-tinted.png`, await png(tinted, S), {
      group: 'ios',
      purpose: 'iOS 18+ tinted appearance icon (grayscale)',
      derivedFrom: 'symbol.svg',
    });
    images.push(
      {
        appearances: [{ appearance: 'luminosity', value: 'dark' }],
        filename: 'AppIcon-1024-dark.png',
        idiom: 'universal',
        platform: 'ios',
        size: '1024x1024',
      },
      {
        appearances: [{ appearance: 'luminosity', value: 'tinted' }],
        filename: 'AppIcon-1024-tinted.png',
        idiom: 'universal',
        platform: 'ios',
        size: '1024x1024',
      },
    );
    // Layer sources for Icon Composer (iOS 26+ / macOS 26+ layered "Liquid Glass" icons).
    await emit(
      ctx,
      'ios/icon-composer/background.svg',
      svgDocument(S, S, '', { background: kit.palette.primary }),
      { group: 'ios', purpose: 'Icon Composer background layer', derivedFrom: 'brand.json' },
    );
    const fg = svgDocument(
      S,
      S,
      await placeMark(
        onFillVariant(sym, kit.palette.primary).svg,
        { x: 0, y: 0, width: S, height: S },
        { mode: 'box', fraction: 0.6 },
      ),
    );
    await emit(ctx, 'ios/icon-composer/foreground.svg', fg, {
      group: 'ios',
      purpose: 'Icon Composer foreground layer (import into Icon Composer)',
      derivedFrom: 'symbol.svg',
    });
  }
  await emit(
    ctx,
    `${base}/Contents.json`,
    `${JSON.stringify({ images, info: { author: 'markilo', version: 1 } }, null, 2)}\n`,
    { group: 'ios', purpose: 'Xcode asset catalog entry', derivedFrom: 'brand.json' },
  );
}

// ---------------------------------------------------------------- macOS
async function exportMacos(ctx: Ctx) {
  const { kit } = ctx;
  const { canvas: C, legacyBody: body, legacyCornerRadius } = SPECS.macos;
  const fill = kit.locked ? kit.palette.paper : kit.palette.primary;
  const mark = kit.locked ? ctx.symbol! : onFillVariant(ctx.symbol!, fill).svg;
  // macOS 26+: full-bleed square; the system applies the rounded shape (also the Icon Composer canvas).
  const square = svgDocument(
    C,
    C,
    await placeMark(mark, { x: 0, y: 0, width: C, height: C }, { mode: 'box', fraction: 0.5 }),
    { background: fill },
  );
  await emit(ctx, 'macos/AppIcon-1024-square.svg', square, {
    group: 'macos',
    purpose: 'macOS 26+ full-bleed square source (system rounds it; use with Icon Composer)',
    derivedFrom: 'symbol.svg',
  });
  await emit(ctx, 'macos/AppIcon-1024-square.png', await png(square, C), {
    group: 'macos',
    purpose: 'macOS 26+ full-bleed 1024 PNG',
    derivedFrom: 'symbol.svg',
  });
  // Legacy grid for .icns used outside Xcode (Electron, Tauri) and on older macOS.
  const inset = (C - body) / 2;
  const art = svgDocument(
    C,
    C,
    squircle(C, inset, legacyCornerRadius, fill) +
      (await placeMark(
        mark,
        { x: inset, y: inset, width: body, height: body },
        { mode: 'box', fraction: 0.6 },
      )),
  );
  await emit(ctx, 'macos/AppIcon-1024-legacy.svg', art, {
    group: 'macos',
    purpose: 'Legacy macOS icon on the 824 px grid (for .icns)',
    derivedFrom: 'symbol.svg',
  });
  const byPx = new Map<number, Buffer>();
  for (const px of [...new Set(ICNS_TYPES.map((t) => t.px))]) byPx.set(px, await png(art, px));
  for (const { px, label } of ICNS_TYPES) {
    const [s, x2] = label.split('@');
    await emit(ctx, `macos/AppIcon.iconset/icon_${s}x${s}${x2 ? '@2x' : ''}.png`, byPx.get(px)!, {
      group: 'macos',
      purpose: `iconset ${label}`,
      derivedFrom: 'symbol.svg',
    });
  }
  await emit(ctx, 'macos/AppIcon.icns', encodeIcns(byPx), {
    group: 'macos',
    purpose: 'macOS .icns (16–1024 px, legacy grid) for Electron/Tauri and older macOS',
    derivedFrom: 'symbol.svg',
  });
}

// ---------------------------------------------------------------- Android
async function exportAndroid(ctx: Ctx) {
  const { kit } = ctx;
  const A = SPECS.android;
  const sym = ctx.symbol!;
  const fill = kit.locked ? kit.palette.paper : kit.palette.primary;
  const fg = kit.locked ? sym : onFillVariant(sym, fill).svg;
  const safe = A.safeZoneDp / 2 / A.adaptiveDp; // radius as fraction of the layer
  for (const [d, k] of Object.entries(A.densities)) {
    const L = Math.round(A.adaptiveDp * k);
    const legacy = Math.round(A.legacyDp * k);
    const dir = `android/res/mipmap-${d}`;
    const fgSvg = svgDocument(
      L,
      L,
      await placeMark(fg, { x: 0, y: 0, width: L, height: L }, { mode: 'circle', radius: safe * 0.92 }),
    );
    await emit(ctx, `${dir}/ic_launcher_foreground.png`, await png(fgSvg, L), {
      group: 'android',
      purpose: `Adaptive icon foreground ${L}px (${d})`,
      derivedFrom: 'symbol.svg',
    });
    await emit(
      ctx,
      `${dir}/ic_launcher_background.png`,
      await png(svgDocument(L, L, '', { background: fill }), L),
      { group: 'android', purpose: `Adaptive icon background ${L}px (${d})`, derivedFrom: 'brand.json' },
    );
    if (!kit.locked) {
      const mono = svgDocument(
        L,
        L,
        await placeMark(
          monochrome(sym, '#ffffff'),
          { x: 0, y: 0, width: L, height: L },
          { mode: 'circle', radius: safe * 0.92 },
        ),
      );
      await emit(ctx, `${dir}/ic_launcher_monochrome.png`, await png(mono, L), {
        group: 'android',
        purpose: `Themed icon (monochrome) layer ${L}px (${d})`,
        derivedFrom: 'symbol.svg',
      });
    }
    const round = await canvas(
      fg,
      legacy,
      legacy,
      { mode: 'circle', radius: 0.34 },
      undefined,
      `<circle cx="${legacy / 2}" cy="${legacy / 2}" r="${legacy / 2}" fill="${fill}"/>`,
    );
    const sq = await canvas(
      fg,
      legacy,
      legacy,
      { mode: 'box', fraction: 0.58 },
      undefined,
      squircle(legacy, legacy * 0.04, legacy * 0.2, fill),
    );
    await emit(ctx, `${dir}/ic_launcher.png`, await png(sq, legacy), {
      group: 'android',
      purpose: `Legacy launcher icon ${legacy}px (${d})`,
      derivedFrom: 'symbol.svg',
    });
    await emit(ctx, `${dir}/ic_launcher_round.png`, await png(round, legacy), {
      group: 'android',
      purpose: `Legacy round launcher icon ${legacy}px (${d})`,
      derivedFrom: 'symbol.svg',
    });
  }
  const xml = (round: boolean) =>
    `<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated by Markilo -->\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@mipmap/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n${kit.locked ? '' : '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n'}</adaptive-icon>\n${round ? '' : ''}`;
  await emit(ctx, 'android/res/mipmap-anydpi-v26/ic_launcher.xml', xml(false), {
    group: 'android',
    purpose: 'Adaptive icon definition (API 26+)',
    derivedFrom: 'brand.json',
  });
  await emit(ctx, 'android/res/mipmap-anydpi-v26/ic_launcher_round.xml', xml(true), {
    group: 'android',
    purpose: 'Adaptive round icon definition (API 26+)',
    derivedFrom: 'brand.json',
  });
  await emit(
    ctx,
    'android/res/values/ic_launcher_colors.xml',
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="brand_primary">${kit.palette.primary}</color>\n</resources>\n`,
    { group: 'android', purpose: 'Brand color resource', derivedFrom: 'brand.json' },
  );
  const play = kit.locked
    ? await canvas(sym, A.playStore, A.playStore, { mode: 'box', fraction: 0.62 }, fill)
    : await appmarkSvg(ctx, A.playStore, 'square', 0.58);
  await emit(ctx, 'android/play-store-icon-512.png', await png(play, A.playStore), {
    group: 'android',
    purpose: 'Google Play listing icon 512×512 (Play applies the mask)',
    derivedFrom: 'symbol.svg',
  });
}

// ---------------------------------------------------------------- Windows
async function exportWindows(ctx: Ctx) {
  const { kit } = ctx;
  const W = SPECS.windows;
  const sym = ctx.symbol!;
  const forDark = kit.locked ? sym : reversedVariant(sym, '#202020', '#ffffff');
  const pngs: Buffer[] = [];
  for (const s of W.icoSizes)
    pngs.push(
      await png(
        await canvas(s <= 32 ? (ctx.small ?? sym) : sym, s, s, {
          mode: 'box',
          fraction: s <= 32 ? 0.94 : 0.86,
        }),
        s,
      ),
    );
  await emit(ctx, 'windows/app.ico', encodeIco(pngs), {
    group: 'windows',
    purpose: `Windows app icon (${W.icoSizes.join('/')} px)`,
    derivedFrom: 'symbol.svg',
  });
  const put = async (file: string, art: string, w: number, h: number, frac: number, purpose: string) =>
    emit(
      ctx,
      `windows/Assets/${file}`,
      await png(await canvas(art, w, h, { mode: 'box', fraction: frac }), w, h),
      { group: 'windows', purpose, derivedFrom: 'symbol.svg' },
    );
  for (const sc of W.scales) {
    const k = sc / 100;
    await put(`Square44x44Logo.scale-${sc}.png`, sym, 44 * k, 44 * k, 0.86, `App list icon 44 @${sc}%`);
    await put(
      `Square150x150Logo.scale-${sc}.png`,
      sym,
      150 * k,
      150 * k,
      0.5,
      `Medium tile 150 @${sc}% (required to publish)`,
    );
    await put(`StoreLogo.scale-${sc}.png`, sym, 50 * k, 50 * k, 0.86, `Store logo 50 @${sc}%`);
  }
  for (const sc of [100, 200]) {
    const k = sc / 100;
    await put(`Square71x71Logo.scale-${sc}.png`, sym, 71 * k, 71 * k, 0.6, `Small tile 71 @${sc}%`);
    await put(`Square310x310Logo.scale-${sc}.png`, sym, 310 * k, 310 * k, 0.45, `Large tile 310 @${sc}%`);
  }
  for (const t of W.targetSizes) {
    const frac = t <= 32 ? 0.94 : 0.88;
    await put(
      `Square44x44Logo.targetsize-${t}.png`,
      t <= 32 ? (ctx.small ?? sym) : sym,
      t,
      t,
      frac,
      `Taskbar/app list ${t}px (plated)`,
    );
    await put(
      `Square44x44Logo.targetsize-${t}_altform-unplated.png`,
      forDark,
      t,
      t,
      frac,
      `Taskbar ${t}px, unplated for dark theme`,
    );
    await put(
      `Square44x44Logo.targetsize-${t}_altform-lightunplated.png`,
      sym,
      t,
      t,
      frac,
      `Taskbar ${t}px, unplated for light theme`,
    );
  }
  const wideArt = ctx.primary ?? sym;
  for (const sc of [100, 200]) {
    for (const [name, Wd, H] of [
      ['Wide310x150Logo', 310, 150],
      ['SplashScreen', 620, 300],
    ] as const) {
      const w = Wd * (sc / 100);
      const h = H * (sc / 100);
      const svg = svgDocument(w, h, fitArt(wideArt, w, h, w * 0.6, h * 0.42));
      await emit(ctx, `windows/Assets/${name}.scale-${sc}.png`, await png(svg, w, h), {
        group: 'windows',
        purpose: `MSIX ${name} ${w}×${h}`,
        derivedFrom: ctx.primary
          ? ctx.kit.lead === 'wordmark' || !ctx.lockupH
            ? 'wordmark.svg'
            : 'lockup-horizontal.svg'
          : 'symbol.svg',
      });
    }
  }
}

// ---------------------------------------------------------------- social
async function socialCard(
  ctx: Ctx,
  w: number,
  h: number,
  opts: { tagline?: boolean; dark?: boolean; artShare?: number } = {},
): Promise<string> {
  const { kit } = ctx;
  // `dark` means "the alternate ground": dark for light-first brands, light for dark-first brands.
  const g = grounds(kit);
  const bg = opts.dark ? g.opposite : g.native;
  const art0 = ctx.primary ?? ctx.symbol!;
  const art = kit.locked ? art0 : adaptToGround(art0, bg, { dark: kit.palette.ink, light: '#ffffff' });
  let body = '';
  // Supergraphic: an oversized, cropped tint of the symbol that ties the card to the identity.
  if (ctx.symbol && !kit.locked) {
    const tint = monochrome(ctx.symbol, kit.palette.primary);
    body += `<g opacity="${isDarkGround(bg) ? 0.16 : 0.08}">${await placeMark(tint, { x: w - h * 0.95, y: -h * 0.2, width: h * 1.4, height: h * 1.4 }, { mode: 'box', fraction: 1 })}</g>`;
  }
  const hasTag = opts.tagline && kit.tagline;
  const artH = h * (opts.artShare ?? 0.26);
  body += fitArt(art, w, h, w * 0.62, artH, w / 2, hasTag ? h * 0.44 : h / 2);
  if (hasTag) {
    const face = kit.typography
      ? loadBundledFace(kit.typography.fontId, Math.min(500, ...[kit.typography.weight]))
      : loadBundledFace('inter', 500);
    const size = Math.round(h * 0.055);
    const probe = textPathMarkup(face, kit.tagline!, 0, 0, size, '#000');
    const color =
      contrastRatio(kit.palette.ink, bg) >= 4.5 ? kit.palette.ink : isDarkGround(bg) ? '#d9dce3' : '#2a2d35';
    body += textPathMarkup(
      face,
      kit.tagline!,
      (w - probe.width) / 2,
      h * 0.44 + artH / 2 + size * 1.9,
      size,
      color,
    ).markup;
  }
  body += `<rect x="0" y="${fmt(h - h * 0.025)}" width="${w}" height="${fmt(h * 0.025)}" fill="${kit.palette.primary}"/>`;
  return svgDocument(w, h, `<g>${body}</g>`, { background: bg, title: `${kit.name} social image` })
    .replace('<g>', '<g clip-path="url(#c)">')
    .replace('<title>', `<defs><clipPath id="c"><rect width="${w}" height="${h}"/></clipPath></defs><title>`);
}

async function exportSocial(ctx: Ctx) {
  const S = SPECS.social;
  const cards: [string, number, number, Parameters<typeof socialCard>[3], string][] = [
    ['og-image', S.og.width, S.og.height, { tagline: true }, 'Open Graph / link preview image'],
    [
      grounds(ctx.kit).darkFirst ? 'og-image-light' : 'og-image-dark',
      S.og.width,
      S.og.height,
      { tagline: true, dark: true },
      `Open Graph image on the alternate (${grounds(ctx.kit).darkFirst ? 'light' : 'dark'}) ground`,
    ],
    [
      'github-social-preview',
      S.githubPreview.width,
      S.githubPreview.height,
      { tagline: true },
      'GitHub repository social preview',
    ],
    ['x-header', S.xHeader.width, S.xHeader.height, { artShare: 0.3 }, 'X (Twitter) profile header'],
    [
      'linkedin-cover',
      S.linkedinCover.width,
      S.linkedinCover.height,
      { artShare: 0.42 },
      'LinkedIn page cover',
    ],
  ];
  for (const [name, w, h, o, purpose] of cards) {
    const svg = await socialCard(ctx, w, h, o);
    await emit(ctx, `social/${name}.svg`, svg, {
      group: 'social',
      purpose: `${purpose} (editable source)`,
      derivedFrom: 'lockup-horizontal.svg',
    });
    await emit(ctx, `social/${name}.png`, await png(svg, w, h), {
      group: 'social',
      purpose: `${purpose} ${w}×${h}`,
      derivedFrom: 'lockup-horizontal.svg',
    });
  }
  if (ctx.symbol) {
    const A = S.avatar;
    const avatar = ctx.kit.locked
      ? await canvas(ctx.symbol, A, A, { mode: 'circle', radius: 0.36 }, ctx.kit.palette.paper)
      : await appmarkSvg(ctx, A, 'square', 0.52);
    await emit(ctx, `social/avatar-${A}.png`, await png(avatar, A), {
      group: 'social',
      purpose: `Profile avatar ${A}×${A} (content safe inside circle crops)`,
      derivedFrom: 'symbol.svg',
    });
  }
}

// ---------------------------------------------------------------- marketing
async function exportMarketing(ctx: Ctx) {
  const { kit } = ctx;
  const art = ctx.primary ?? ctx.symbol!;
  if (!kit.locked && ctx.symbol) {
    for (const [v, color] of [
      ['white', '#ffffff'],
      ['black', '#000000'],
    ] as const) {
      const wm = svgDocument(
        512,
        512,
        `<g opacity="0.35">${await placeMark(monochrome(ctx.symbol, color), { x: 0, y: 0, width: 512, height: 512 }, { mode: 'box', fraction: 0.9 })}</g>`,
      );
      await emit(ctx, `marketing/watermark-${v}.svg`, wm, {
        group: 'marketing',
        purpose: `Watermark (${v}, 35% opacity) for photos and video`,
        derivedFrom: 'symbol.svg',
      });
      await emit(ctx, `marketing/watermark-${v}.png`, await png(wm, 512), {
        group: 'marketing',
        purpose: `Watermark PNG (${v})`,
        derivedFrom: 'symbol.svg',
      });
    }
  }
  const sig = svgDocument(600, 160, fitArt(art, 600, 160, 560, 110));
  await emit(ctx, 'marketing/email-signature.png', await png(sig, 600, 160), {
    group: 'marketing',
    purpose: 'Email signature logo 600×160 (display at 300×80)',
    derivedFrom: 'lockup-horizontal.svg',
  });

  const face = kit.typography
    ? loadBundledFace(kit.typography.fontId, kit.typography.weight)
    : loadBundledFace('inter', 600);
  const faceText = kit.typography
    ? loadBundledFace(kit.typography.fontId, 400)
    : loadBundledFace('inter', 400);
  const family = kit.typography?.family ?? 'Inter';
  // Slide template: SVG keeps live text for editing; the PNG preview uses outlines.
  const slide = (live: boolean) => {
    const W = 1920;
    const H = 1080;
    let body = fitArt(art, W, H, 420, 90, 160 + 210, 140);
    body += `<rect x="160" y="${H - 160}" width="240" height="10" fill="${kit.palette.primary}"/>`;
    if (live) {
      body += `<text x="160" y="560" font-family="${escapeAttr(family)}" font-size="96" font-weight="${kit.typography?.weight ?? 600}" fill="${kit.palette.ink}">Presentation title</text>`;
      body += `<text x="160" y="650" font-family="${escapeAttr(family)}" font-size="40" fill="${kit.palette.ink}" opacity="0.7">Subtitle, speaker and date</text>`;
    } else {
      body += textPathMarkup(face, 'Presentation title', 160, 560, 96, kit.palette.ink).markup;
      body += textPathMarkup(faceText, 'Subtitle, speaker and date', 160, 650, 40, kit.palette.ink).markup;
    }
    return svgDocument(W, H, body, { background: kit.palette.paper });
  };
  await emit(ctx, 'marketing/slide-title.svg', slide(true), {
    group: 'marketing',
    purpose: `Title slide template 1920×1080 (live text, ${family})`,
    derivedFrom: 'lockup-horizontal.svg',
  });
  await emit(ctx, 'marketing/slide-title.png', await png(slide(false), 1920, 1080), {
    group: 'marketing',
    purpose: 'Title slide preview',
    derivedFrom: 'lockup-horizontal.svg',
  });

  // Business card, 85 × 55 mm, front (logo) and back (contact placeholders).
  const mm = (body: string, bg: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="85mm" height="55mm" viewBox="0 0 85 55"><rect width="85" height="55" fill="${bg}"/>${body}</svg>`;
  const front = kit.locked
    ? mm(fitArt(art, 85, 55, 50, 18), kit.palette.paper)
    : mm(fitArt(onFillVariant(art, kit.palette.primary).svg, 85, 55, 50, 18), kit.palette.primary);
  const t = (s: string, y: number, size: number, weight = 400) =>
    `<text x="8" y="${y}" font-family="${escapeAttr(family)}" font-size="${size}" font-weight="${weight}" fill="${kit.palette.ink}">${s}</text>`;
  const back = mm(
    (ctx.symbol ? fitArt(ctx.symbol, 85, 55, 10, 10, 72, 12) : '') +
      t('Full Name', 30, 4.2, 600) +
      t('Role', 35.5, 3) +
      t('name@example.com', 44, 3) +
      t('example.com', 48.5, 3),
    kit.palette.paper,
  );
  await emit(ctx, 'marketing/business-card-front.svg', front, {
    group: 'marketing',
    purpose: 'Business card front, 85×55 mm (add 3 mm bleed for print)',
    derivedFrom: 'lockup-horizontal.svg',
  });
  await emit(ctx, 'marketing/business-card-back.svg', back, {
    group: 'marketing',
    purpose: 'Business card back template, 85×55 mm (live text)',
    derivedFrom: 'symbol.svg',
  });
}

// ---------------------------------------------------------------- tokens + guidelines
async function exportTokens(ctx: Ctx) {
  const { kit } = ctx;
  const pal = generatePalette({
    primary: kit.palette.primary,
    ...(kit.palette.secondary ? { secondary: kit.palette.secondary } : {}),
    ...(kit.palette.accent ? { accent: kit.palette.accent } : {}),
  });
  const dtcg: Record<string, unknown> = { color: { brand: {}, neutral: {}, semantic: {} } };
  const color = dtcg.color as Record<string, Record<string, unknown>>;
  for (const [name, s] of Object.entries(pal.scales)) {
    color.brand![name] = Object.fromEntries(
      Object.entries(s.scale).map(([k, v]) => [k, { $type: 'color', $value: v }]),
    );
  }
  color.neutral = Object.fromEntries(
    Object.entries(pal.neutral).map(([k, v]) => [k, { $type: 'color', $value: v }]),
  );
  color.semantic = Object.fromEntries(
    Object.entries(pal.semantic).map(([k, v]) => [k, { $type: 'color', $value: v }]),
  );
  color.ink = { $type: 'color', $value: kit.palette.ink } as never;
  color.paper = { $type: 'color', $value: kit.palette.paper } as never;
  dtcg.spacing = Object.fromEntries(
    [1, 2, 3, 4, 6, 8, 12, 16, 24].map((n) => [String(n), { $type: 'dimension', $value: `${n * 4}px` }]),
  );
  if (kit.typography)
    dtcg.font = {
      brand: {
        $type: 'fontFamily',
        $value: [kit.typography.family ?? kit.typography.fontId, 'system-ui', 'sans-serif'],
      },
    };
  await emit(ctx, 'tokens/tokens.json', `${JSON.stringify(dtcg, null, 2)}\n`, {
    group: 'tokens',
    purpose: 'Design tokens (W3C DTCG format)',
    derivedFrom: 'brand.json',
  });
  const css = [':root {'];
  for (const [name, s] of Object.entries(pal.scales))
    for (const [k, v] of Object.entries(s.scale)) css.push(`  --${kit.brand}-${name}-${k}: ${v};`);
  for (const [k, v] of Object.entries(pal.neutral)) css.push(`  --${kit.brand}-neutral-${k}: ${v};`);
  css.push(
    `  --${kit.brand}-ink: ${kit.palette.ink};`,
    `  --${kit.brand}-paper: ${kit.palette.paper};`,
    '}',
    '',
  );
  await emit(ctx, 'tokens/tokens.css', css.join('\n'), {
    group: 'tokens',
    purpose: 'CSS custom properties',
    derivedFrom: 'brand.json',
  });
  await emit(ctx, 'tokens/palette.json', `${JSON.stringify(pal, null, 2)}\n`, {
    group: 'tokens',
    purpose: 'Palette with contrast pairs and warnings',
    derivedFrom: 'brand.json',
  });
  ctx.warnings.push(...pal.warnings);
}

async function exportGuidelines(ctx: Ctx) {
  const pal = generatePalette({
    primary: ctx.kit.palette.primary,
    ...(ctx.kit.palette.secondary ? { secondary: ctx.kit.palette.secondary } : {}),
    ...(ctx.kit.palette.accent ? { accent: ctx.kit.palette.accent } : {}),
  });
  const input = {
    kit: ctx.kit,
    palette: pal,
    symbol: ctx.symbol,
    wordmark: ctx.wordmark,
    lockupH: ctx.lockupH,
    lockupS: ctx.lockupS,
    primary: ctx.primary,
    reversed: (s: string) =>
      ctx.kit.locked
        ? s
        : adaptToGround(s, grounds(ctx.kit).opposite, { dark: ctx.kit.palette.ink, light: '#ffffff' }),
  };
  await emit(ctx, 'guidelines/brand-guidelines.md', guidelinesMarkdown(input), {
    group: 'guidelines',
    purpose: 'Brand usage guidelines (Markdown)',
    derivedFrom: 'brand.json',
  });
  await emit(ctx, 'guidelines/index.html', guidelinesHtml(input), {
    group: 'guidelines',
    purpose: 'Brand usage guidelines (self-contained HTML)',
    derivedFrom: 'brand.json',
  });
}

const RUNNERS: Record<ExportGroup, (ctx: Ctx) => Promise<void>> = {
  logos: exportLogos,
  web: exportWeb,
  ios: exportIos,
  macos: exportMacos,
  android: exportAndroid,
  windows: exportWindows,
  social: exportSocial,
  marketing: exportMarketing,
  tokens: exportTokens,
  guidelines: exportGuidelines,
};
const NEEDS_SYMBOL: ExportGroup[] = ['web', 'ios', 'macos', 'android', 'windows'];

export async function exportBrand(
  ws: Workspace,
  brand: string,
  opts: { groups?: ExportGroup[]; clean?: boolean } = {},
): Promise<ExportResult> {
  const kit = loadKit(ws, brand);
  const outDir = ws.exportsDir(brand);
  if (opts.clean && existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  const ctx: Ctx = {
    kit,
    outDir,
    ...(kit.files.symbol ? { symbol: kit.read('symbol') } : {}),
    ...(kit.files.symbolSmall ? { small: kit.read('symbolSmall') } : {}),
    ...(kit.files.wordmark ? { wordmark: kit.read('wordmark') } : {}),
    ...(kit.files.lockupHorizontal ? { lockupH: kit.read('lockupHorizontal') } : {}),
    ...(kit.files.lockupStacked ? { lockupS: kit.read('lockupStacked') } : {}),
    ...(kit.files.lockupCompact ? { lockupC: kit.read('lockupCompact') } : {}),
    assets: [],
    warnings: [],
  };
  const lead = kit.lead === 'wordmark' ? (ctx.wordmark ?? ctx.lockupH) : (ctx.lockupH ?? ctx.wordmark);
  if (lead) ctx.primary = lead;
  const groups = opts.groups?.length ? opts.groups : [...EXPORT_GROUPS];
  for (const g of groups)
    if (!EXPORT_GROUPS.includes(g))
      throw new MarkiloError('USAGE', `Unknown export group "${g}". Use: ${EXPORT_GROUPS.join(', ')}.`);
  const skipped: ExportResult['skipped'] = [];
  for (const g of groups) {
    if (NEEDS_SYMBOL.includes(g) && !ctx.symbol) {
      skipped.push({ group: g, reason: 'needs a symbol (app icons cannot be made from a wordmark alone)' });
      continue;
    }
    await RUNNERS[g](ctx);
  }
  if (kit.locked)
    ctx.warnings.push(
      'Locked identity: variants that would alter the artwork (recolors, reversed, monochrome) were not generated.',
    );
  const manifest = {
    schema: 'markilo/assets@1',
    brand,
    name: kit.name,
    concept: kit.concept ?? null,
    locked: kit.locked,
    generatedAt: new Date().toISOString(),
    generator: 'markilo',
    specSources: Object.fromEntries(Object.entries(SPECS).map(([k, v]) => [k, v.sources])),
    assets: ctx.assets,
    skipped,
    warnings: ctx.warnings,
  };
  writeJson(join(outDir, 'asset-manifest.json'), manifest);
  return { outDir, assets: ctx.assets, skipped, warnings: ctx.warnings };
}
