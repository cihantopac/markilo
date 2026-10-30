import { contrastRatio } from '../analyze/color.js';
import { inkMetrics, placeMark } from '../export/geometry.js';
import { onFillVariant } from '../export/variants.js';
import { nestSvg, svgDocument } from '../svg/compose.js';
import { escapeAttr } from '../svg/xml.js';
import { renderPng } from './resvg.js';
import { label } from './sheet.js';

/** Places artwork so its ink is `height` tall and starts at x (headers align logos left, by their ink). */
async function placeLeft(svg: string, x: number, y: number, height: number): Promise<string> {
  const m = await inkMetrics(svg);
  const s = height / m.bbox.h;
  return nestSvg(svg, {
    x: x - (m.bbox.x - m.viewBox.x) * s,
    y: y - (m.bbox.y - m.viewBox.y) * s,
    width: m.viewBox.width * s,
    height: m.viewBox.height * s,
  });
}

/** A mark that shares the context with the concept: a collected competitor or category reference. */
export interface ContextPeer {
  name: string;
  svg?: string;
  raster?: { bytes: Uint8Array; mime: string };
  /** The tile it is shown on: light marks (white logos for dark app tiles) go on a dark tile. */
  ground?: 'light' | 'dark';
}

export interface ContextSheetInput {
  name: string;
  symbol: string;
  lockup?: string;
  paper: string;
  primary: string;
  dark?: string;
  peers: ContextPeer[];
}

const W = 960;
const DARK_TILE = '#1b1f27';

/** A mark whose colors all nearly vanish on white is shown on a dark tile, as its owner would show it. */
export function groundFor(colors: string[]): 'light' | 'dark' {
  return colors.length && colors.every((c) => contrastRatio(c, '#ffffff') < 1.6) ? 'dark' : 'light';
}
const PAD = 24;
const NEUTRAL = '#d9dce3';

async function peerMark(p: ContextPeer, box: { x: number; y: number; width: number; height: number }) {
  if (p.svg) return placeMark(p.svg, box, { mode: 'box', fraction: 0.72 });
  if (p.raster) {
    const href = `data:${p.raster.mime};base64,${Buffer.from(p.raster.bytes).toString('base64')}`;
    return `<image href="${escapeAttr(href)}" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  return '';
}

/**
 * The concept where people will actually meet it, next to the competitors collected for the originality check:
 * browser tabs (16 px), a home screen of app icons, a site header and avatars. Critics judge distinctiveness and
 * legibility here, not on an empty artboard. Contains third-party marks, so it is written to the git-ignored
 * research cache, never to the concept folder.
 */
export async function renderContextSheet(input: ContextSheetInput): Promise<Buffer> {
  const { svg, width } = await contextSheetSvg(input);
  return renderPng(svg, { width });
}

export async function contextSheetSvg(input: ContextSheetInput): Promise<{ svg: string; width: number }> {
  const dark = input.dark ?? '#111318';
  const peers = input.peers.slice(0, 7);
  let body = '';
  let y = PAD;
  const heading = (text: string) => {
    body += label(text, PAD, y + 12, 13, '#30343c');
    y += 24;
  };

  // Browser tabs, light and dark: the 16 px favicon among others.
  heading('Browser tabs (16 px favicon)');
  for (const ground of [input.paper, dark]) {
    const isDark = ground === dark;
    body += `<rect x="${PAD}" y="${y}" width="${W - PAD * 2}" height="40" rx="8" fill="${isDark ? '#202329' : '#eceef2'}"/>`;
    const tabs: (ContextPeer | 'own' | undefined)[] = [peers[0], 'own', peers[1], peers[2]];
    for (const [i, t] of tabs.entries()) {
      const x = PAD + 8 + i * 220;
      const own = t === 'own';
      const tabFill = own ? (isDark ? '#2c3038' : '#ffffff') : isDark ? '#25282e' : '#e3e6eb';
      body += `<rect x="${x}" y="${y + 6}" width="210" height="28" rx="6" fill="${tabFill}"/>`;
      const icon = { x: x + 8, y: y + 12, width: 16, height: 16 };
      if (own)
        body += await placeMark(onFillVariant(input.symbol, tabFill).svg, icon, { mode: 'box', fraction: 1 });
      else if (t) body += await peerMark(t, icon);
      else body += `<circle cx="${icon.x + 8}" cy="${icon.y + 8}" r="7" fill="${NEUTRAL}"/>`;
      const name = own ? input.name : (t?.name ?? 'Untitled');
      body += label(name.slice(0, 22), x + 32, y + 24, 11, isDark ? '#c9ced8' : '#30343c');
    }
    y += 48;
  }

  // Home screen: an app icon among the category's icons.
  y += 8;
  heading('Home screen (60 px app icons)');
  const tiles: (ContextPeer | 'own' | undefined)[] = [
    peers[3],
    peers[4],
    peers[0],
    peers[5],
    peers[1],
    'own',
    peers[6],
    peers[2],
  ];
  body += `<rect x="${PAD}" y="${y}" width="${W - PAD * 2}" height="200" rx="16" fill="#2b3a55"/>`;
  for (const [i, t] of tiles.entries()) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = PAD + 60 + col * 220;
    const ty = y + 20 + row * 92;
    if (t === 'own') {
      const fill = input.primary;
      body += `<rect x="${x}" y="${ty}" width="60" height="60" rx="14" fill="${fill}"/>`;
      body += await placeMark(
        onFillVariant(input.symbol, fill).svg,
        { x, y: ty, width: 60, height: 60 },
        { mode: 'box', fraction: 0.62 },
      );
      body += label(input.name.slice(0, 14), x, ty + 76, 11, '#ffffff');
    } else if (t) {
      // A slot with no collected peer stays empty: a blank white tile would read as a white app icon.
      body += `<rect x="${x}" y="${ty}" width="60" height="60" rx="14" fill="${t.ground === 'dark' ? DARK_TILE : '#ffffff'}"/>`;
      body += await peerMark(t, { x: x + 6, y: ty + 6, width: 48, height: 48 });
      if (t.name) body += label(t.name.slice(0, 14), x, ty + 76, 11, '#dfe4ee');
    }
  }
  y += 216;

  // Site header, light and dark.
  heading('Site header (logo 28 px tall)');
  const logo = input.lockup ?? input.symbol;
  for (const ground of [input.paper, dark]) {
    body += `<rect x="${PAD}" y="${y}" width="${W - PAD * 2}" height="56" rx="8" fill="${ground}" stroke="#d9dce3"/>`;
    body += await placeLeft(onFillVariant(logo, ground).svg, PAD + 20, y + 14, 28);
    for (const [i, w] of [60, 72, 54].entries())
      body += `<rect x="${W - PAD - 320 + i * 96}" y="${y + 24}" width="${w}" height="8" rx="4" fill="${ground === dark ? '#3a3f48' : '#d9dce3'}"/>`;
    y += 64;
  }

  // Avatars.
  y += 8;
  heading('Avatars (40 px)');
  const avatars: (ContextPeer | 'own')[] = ['own', ...peers.slice(0, 6)];
  for (const [i, a] of avatars.entries()) {
    const cx = PAD + 20 + i * 64;
    if (a === 'own') {
      body += `<circle cx="${cx + 20}" cy="${y + 20}" r="20" fill="${input.primary}"/>`;
      body += await placeMark(
        onFillVariant(input.symbol, input.primary).svg,
        { x: cx, y, width: 40, height: 40 },
        { mode: 'circle', radius: 0.36 },
      );
    } else {
      body += `<circle cx="${cx + 20}" cy="${y + 20}" r="20" fill="${a.ground === 'dark' ? DARK_TILE : '#ffffff'}" stroke="#d9dce3"/>`;
      body += await peerMark(a, { x: cx + 7, y: y + 7, width: 26, height: 26 });
    }
  }
  y += 56;

  const H = y + PAD;
  return { svg: svgDocument(W, H, body, { background: '#f7f8fa' }), width: W };
}
