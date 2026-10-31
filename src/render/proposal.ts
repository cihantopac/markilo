import { composeLockup } from '../design/lockup.js';
import { inkMetrics, placeMark } from '../export/geometry.js';
import { adaptToGround, groundsFor, onFillVariant } from '../export/variants.js';
import { nestSvg, svgDocument } from '../svg/compose.js';
import { renderPng } from './resvg.js';
import { label } from './sheet.js';

/** One proposal of an exploration round, as the user compares it: the identity, on its paper and reversed, and its icon. */
export interface ProposalInput {
  title: string;
  /** "Round 1 · A" */
  caption: string;
  idea?: string;
  lead: 'symbol' | 'wordmark';
  symbol?: string;
  wordmark?: string;
  lockup?: string;
  small?: string;
  paper: string;
  ink?: string;
  primary: string;
}

const W = 640;
const PAD = 28;
const DARK = '#111318';

/** Centers artwork by its ink inside a box, as large as fits (wide wordmarks and square symbols alike). */
async function fitCenter(svg: string, box: { x: number; y: number; width: number; height: number }) {
  const m = await inkMetrics(svg);
  const s = Math.min(box.width / m.bbox.w, box.height / m.bbox.h);
  return nestSvg(svg, {
    x: box.x + box.width / 2 - (m.center.x - m.viewBox.x) * s,
    y: box.y + box.height / 2 - (m.center.y - m.viewBox.y) * s,
    width: m.viewBox.width * s,
    height: m.viewBox.height * s,
  });
}

/** Splits text into lines of at most `max` characters, at word boundaries. */
function wrap(text: string, max: number, lines: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const word of text.split(/\s+/)) {
    if (cur && `${cur} ${word}`.length > max) {
      out.push(cur);
      cur = word;
    } else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    out.length = lines;
    out[lines - 1] = `${out[lines - 1]!.replace(/[\s,.;:]+\S*$/, '')}…`;
  }
  return out;
}

/** The identity a proposal leads with: the word for a wordmark-led one, else the lockup, else the symbol. */
export function heroOf(p: ProposalInput, symbolInk?: { x: number; y: number; w: number; h: number }) {
  if (p.lead === 'wordmark' && p.wordmark) return p.wordmark;
  if (p.lockup) return p.lockup;
  if (p.symbol && p.wordmark)
    return composeLockup(p.symbol, p.wordmark, {
      layout: 'horizontal',
      ...(symbolInk ? { symbolInk } : {}),
    }).svg;
  return p.symbol ?? p.wordmark!;
}

export async function proposalSvg(p: ProposalInput): Promise<{ svg: string; width: number; height: number }> {
  const g = groundsFor(p.paper, DARK);
  const symbolInk = p.symbol ? (await inkMetrics(p.symbol)).bbox : undefined;
  const hero = heroOf(p, symbolInk);
  const wide = p.lead === 'wordmark' || hero !== p.symbol;
  const neutrals = p.ink ? { dark: p.ink } : {};
  let body = '';
  let y = PAD;
  body += label(p.caption, PAD, y + 12, 13, '#6a707c');
  body += label(p.title.slice(0, 48), PAD, y + 38, 22, '#16181d');
  y += 58;

  // The identity on its own paper, large, then reversed on the opposite ground.
  const heroBox = { x: PAD, y, width: W - PAD * 2, height: 230 };
  body += `<rect x="${heroBox.x}" y="${heroBox.y}" width="${heroBox.width}" height="${heroBox.height}" rx="14" fill="${g.native}" stroke="#e1e4ea"/>`;
  body += await fitCenter(hero, {
    x: heroBox.x + 56,
    y: heroBox.y + (wide ? 70 : 40),
    width: heroBox.width - 112,
    height: heroBox.height - (wide ? 140 : 80),
  });
  y += heroBox.height + 12;
  const altBox = { x: PAD, y, width: W - PAD * 2, height: 130 };
  body += `<rect x="${altBox.x}" y="${altBox.y}" width="${altBox.width}" height="${altBox.height}" rx="14" fill="${g.opposite}"/>`;
  body += await fitCenter(adaptToGround(hero, g.opposite, neutrals), {
    x: altBox.x + 90,
    y: altBox.y + (wide ? 40 : 24),
    width: altBox.width - 180,
    height: altBox.height - (wide ? 80 : 48),
  });
  y += altBox.height + 16;

  // The compact icon: an app tile, an avatar, and true-size 32 and 16 px renders on both grounds.
  const icon = p.symbol;
  if (icon) {
    const tile = 96;
    body += `<rect x="${PAD}" y="${y}" width="${tile}" height="${tile}" rx="22" fill="${p.primary}"/>`;
    body += await placeMark(
      onFillVariant(icon, p.primary).svg,
      { x: PAD, y, width: tile, height: tile },
      { mode: 'box', fraction: 0.6 },
    );
    const ax = PAD + tile + 24;
    body += `<rect x="${ax}" y="${y}" width="${tile}" height="${tile}" rx="22" fill="${g.native}" stroke="#e1e4ea"/>`;
    body += await placeMark(icon, { x: ax, y, width: tile, height: tile }, { mode: 'box', fraction: 0.62 });
    const cx = ax + tile + 24;
    body += `<circle cx="${cx + tile / 2}" cy="${y + tile / 2}" r="${tile / 2}" fill="${g.opposite}"/>`;
    body += await placeMark(
      adaptToGround(icon, g.opposite, neutrals),
      { x: cx, y, width: tile, height: tile },
      { mode: 'circle', radius: 0.34 },
    );
    const small = p.small ?? icon;
    const sx = cx + tile + 28;
    const sw = W - PAD - sx;
    for (const [i, ground] of [g.native, g.opposite].entries()) {
      const ry = y + i * 50;
      body += `<rect x="${sx}" y="${ry}" width="${sw}" height="46" rx="10" fill="${ground}" stroke="#e1e4ea"/>`;
      const art = i ? adaptToGround(small, ground, neutrals) : small;
      body += await placeMark(
        art,
        { x: sx + 14, y: ry + 7, width: 32, height: 32 },
        { mode: 'box', fraction: 1 },
      );
      body += await placeMark(
        art,
        { x: sx + 60, y: ry + 15, width: 16, height: 16 },
        { mode: 'box', fraction: 1 },
      );
      const darkGround = i === 0 ? g.darkFirst : !g.darkFirst;
      body += label('32 · 16 px', sx + 90, ry + 28, 11, darkGround ? '#c9ced8' : '#6a707c');
    }
    y += tile + 16;
  } else {
    body += label('No compact icon yet', PAD, y + 14, 13, '#b4232c');
    y += 28;
  }

  if (p.idea)
    for (const line of wrap(p.idea, 70, 3)) {
      body += label(line, PAD, y + 16, 14, '#30343c');
      y += 22;
    }
  const height = y + PAD;
  return { svg: svgDocument(W, height, body, { background: '#f7f8fa' }), width: W, height };
}

export async function renderProposal(p: ProposalInput): Promise<Buffer> {
  const { svg, width } = await proposalSvg(p);
  return renderPng(svg, { width });
}

/** A round's proposals side by side, so the user (and the agent showing them) compares them in one image. */
export async function renderRoundBoard(proposals: ProposalInput[]): Promise<Buffer> {
  const panels = await Promise.all(proposals.map((p) => proposalSvg(p)));
  const gap = 16;
  const width = panels.length * W + (panels.length + 1) * gap;
  const height = Math.max(...panels.map((x) => x.height)) + gap * 2;
  const body = panels
    .map((x, i) => nestSvg(x.svg, { x: gap + i * (W + gap), y: gap, width: W, height: x.height }))
    .join('');
  return renderPng(svgDocument(width, height, body, { background: '#e9ebef' }), { width });
}
