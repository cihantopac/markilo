import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCommand } from '../src/cli/args.js';
import { findCommand } from '../src/cli/commands.js';
import { Workspace } from '../src/core/workspace.js';
import { loadBundledFace } from '../src/design/fonts.js';
import { wordmarkSvg } from '../src/design/wordmark.js';
import { kitPath } from '../src/export/kit.js';
import { buildGallery } from '../src/gallery/gallery.js';
import { decodeImage } from '../src/render/png.js';
import { REFRESH_BOARD_LABELS, refreshBoardSvg } from '../src/render/refresh.js';
import { renderPng } from '../src/render/resvg.js';
import { decodeEntities } from '../src/svg/xml.js';
import { TR } from '../src/ui/tr.js';
import { mark, tmp } from './helpers.js';

async function cmd(name: string, argv: string[], cwd: string): Promise<Record<string, unknown>> {
  const f = findCommand([name])!;
  return (await f.spec.run(parseCommand(f.spec, argv, cwd))) as Record<string, unknown>;
}

/** A workspace with the synthetic brand Tidepool, its current mark as a PNG (rendered from a fixture) and a wordmark. */
async function tidepool(fixtureMark = 'orbit') {
  const dir = tmp();
  const ws = Workspace.init(join(dir, 'brand'), 'Test');
  ws.addBrand({ name: 'Tidepool' });
  const png = join(dir, 'tidepool-current.png');
  writeFileSync(png, await renderPng(mark(fixtureMark), { width: 512 }));
  const word = join(dir, 'tidepool-word.svg');
  writeFileSync(word, wordmarkSvg(loadBundledFace('manrope', 700), 'tidepool', { color: '#2346d8' }));
  return { dir, ws, png, word };
}

/** Interface text the gallery marks for translation (as tests/ui.test.ts reads it). */
function translatable(html: string): string[] {
  const keys = new Set<string>();
  for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) keys.add(decodeEntities(m[1]!));
  for (const m of html.matchAll(/<(\w+) data-i18n>([^<]*)<\/\1>/g)) keys.add(decodeEntities(m[2]!));
  return [...keys];
}

describe('markilo refresh', () => {
  it('traces, rebuilds, drafts a small version and composes lockups, then stops at the owner’s decisions', async () => {
    const { dir, ws, png, word } = await tidepool();
    const r = (await cmd(
      'refresh',
      [
        '--brand',
        'tidepool',
        '--from',
        png,
        '--wordmark',
        word,
        '--colors',
        '2',
        '--equity',
        'in use since 2014 on the Tidepool app',
      ],
      dir,
    )) as {
      concept: string;
      kept: string;
      iou: number;
      symbol: string;
      small?: string;
      lockups: string[];
      board: string;
      next: string[];
      finalized: boolean;
    };
    expect(r.concept).toBe('refresh');
    expect(r.kept).toBe('rebuild');
    expect(r.iou).toBeGreaterThanOrEqual(0.95);

    const c = ws.concept('tidepool', 'refresh');
    const file = (rel: string) => ws.conceptFile('tidepool', 'refresh', rel);
    expect(c.files.symbol).toBe('symbol.svg');
    expect(existsSync(file('symbol.svg'))).toBe(true);
    expect(c.files.wordmark).toBe('wordmark.svg');
    expect(c.files.small).toBe('symbol-small.svg');
    expect(existsSync(file('symbol-small.svg'))).toBe(true);
    // The small version is drafted the way `construct --role small` builds one: its recipe sits beside it.
    expect(existsSync(file('construction-small.json'))).toBe(true);
    expect(r.lockups).toHaveLength(2);
    for (const l of ['lockup-horizontal.svg', 'lockup-stacked.svg']) {
      expect(existsSync(file(l))).toBe(true);
      expect(readFileSync(file(l), 'utf8')).toContain('<svg');
    }
    const board = file(join('review', 'refresh.png'));
    expect(r.board).toBe(board);
    const img = decodeImage(readFileSync(board));
    expect(img.width).toBeGreaterThan(500);

    // Equity prefilled; the original kept beside the rebuild.
    expect(c.equity).toEqual({ note: 'in use since 2014 on the Tidepool app', since: '2014' });
    expect(c.refreshedFrom?.file).toBe('original.png');
    expect(c.refreshedFrom?.kept).toBe('rebuild');
    expect(c.refreshedFrom?.iou).toBe(r.iou);
    expect(readFileSync(file('original.png'))).toEqual(readFileSync(png));

    // Nothing is finalized or exported; the owner's questions come back as next.
    expect(r.finalized).toBe(false);
    expect(c.status).toBe('draft');
    expect(existsSync(kitPath(ws, 'tidepool'))).toBe(false);
    expect(existsSync(ws.exportsDir('tidepool'))).toBe(false);
    const next = r.next.join('\n');
    expect(next).toMatch(/--small-sizes small\|main/);
    expect(next).toMatch(/layout/i);
    expect(next).toMatch(/--equity/);

    // The gallery shows the concept with the original beside it.
    const html = readFileSync((await buildGallery(ws)).path, 'utf8');
    const card = html.slice(html.indexOf('id="tidepool--refresh"'));
    expect(card).toContain('class="refresh-pair"');
    expect(card).toContain(`src="data:image/png;base64,${readFileSync(png).toString('base64')}"`);
    expect(card.indexOf('data-refresh="original"')).toBeLessThan(card.indexOf('data-refresh="rebuild"'));
    expect(translatable(card).filter((k) => !(k in TR))).toEqual([]);
    // No "Current" stand-in concept is needed any more.
    expect(ws.concepts('tidepool').map((x) => x.id)).toEqual(['refresh']);
  }, 180_000);

  it('keeps the trace, and says so, when the rebuild falls below --min-iou; a second run updates the concept', async () => {
    const { dir, ws, png } = await tidepool();
    await cmd('refresh', ['--brand', 'tidepool', '--from', png, '--colors', '2'], dir);
    const r = (await cmd(
      'refresh',
      ['--brand', 'tidepool', '--from', png, '--colors', '2', '--min-iou', '0.9999'],
      dir,
    )) as { kept: string; iou: number; warnings?: string[]; lockups: string[]; next: string[] };
    expect(r.kept).toBe('trace');
    expect(r.warnings?.join(' ')).toMatch(/kept the trace/i);
    expect(r.warnings?.join(' ')).toMatch(/0\.9999/);
    const c = ws.concept('tidepool', 'refresh');
    expect(c.refreshedFrom?.kept).toBe('trace');
    expect(readFileSync(ws.conceptFile('tidepool', 'refresh', 'symbol.svg'), 'utf8')).toBe(
      readFileSync(ws.conceptFile('tidepool', 'refresh', 'trace.svg'), 'utf8'),
    );
    // No wordmark: no lockups, and next says how to add them.
    expect(r.lockups).toEqual([]);
    expect(r.next.join('\n')).toMatch(/--wordmark/);
    expect(ws.concepts('tidepool')).toHaveLength(1);
  }, 180_000);

  it('takes an SVG as it is and refuses a locked brand', async () => {
    const { dir, ws } = await tidepool();
    const svg = join(dir, 'current.svg');
    writeFileSync(svg, mark('bolt'));
    const r = (await cmd('refresh', ['--brand', 'tidepool', '--from', svg], dir)) as {
      kept: string;
      iou: number;
      trace?: unknown;
    };
    expect(r.kept).toBe('rebuild');
    expect(r.iou).toBeGreaterThanOrEqual(0.95);
    expect(r.trace).toBeUndefined();
    const c = ws.concept('tidepool', 'refresh');
    expect(c.refreshedFrom?.file).toBe('original.svg');
    expect(c.palette.primary).toBe('#f2b705');
    const html = readFileSync((await buildGallery(ws)).path, 'utf8');
    expect(html.slice(html.indexOf('id="tidepool--refresh"'))).toContain('data-refresh="original"');

    const m = ws.manifest;
    m.brands.find((b) => b.slug === 'tidepool')!.locked = true;
    ws.saveManifest(m);
    await expect(cmd('refresh', ['--brand', 'tidepool', '--from', svg], dir)).rejects.toThrow(/locked/i);
  }, 180_000);
});

describe('refresh board', () => {
  const svg = mark('orbit');
  it('labels every part through the sheet labels, in English by default and in Turkish on request', () => {
    const input = { original: svg, refreshed: svg, kept: 'rebuild' as const, iou: 0.987, title: 'Tidepool' };
    const en = refreshBoardSvg(input);
    expect(en).toBe(refreshBoardSvg(input, 'en'));
    expect(refreshBoardSvg(input, 'tr')).not.toBe(en);
    for (const l of REFRESH_BOARD_LABELS) expect(TR[l], l).toBeTruthy();
  });
});
