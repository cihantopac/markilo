import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseCommand } from '../src/cli/args.js';
import { findCommand } from '../src/cli/commands.js';
import { Workspace } from '../src/core/workspace.js';
import { loadBundledFace } from '../src/design/fonts.js';
import { wordmarkSvg } from '../src/design/wordmark.js';
import { kitPath } from '../src/export/kit.js';
import { buildGallery } from '../src/gallery/gallery.js';
import { createRaster } from '../src/render/image.js';
import { decodeImage, encodePng } from '../src/render/png.js';
import { REFRESH_BOARD_LABELS, refreshBoardSvg } from '../src/render/refresh.js';
import { renderPng } from '../src/render/resvg.js';
import { decodeEntities } from '../src/svg/xml.js';
import { TR } from '../src/ui/tr.js';
import { mark, synthBrand, tmp } from './helpers.js';

// refresh reports its progress on stderr (for a person at the terminal); keep the test output clean.
beforeAll(() => {
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});
afterAll(() => {
  vi.restoreAllMocks();
});

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
  for (const m of html.matchAll(/data-i18n-(?:placeholder|title|aria-label)="([^"]+)"/g))
    keys.add(decodeEntities(m[1]!));
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
    expect(translatable(card)).toContain('The original mark');
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

describe('refresh originality', () => {
  it('reports the owner’s existing mark as likeness, never as risk, so a refresh with equity can finalize', async () => {
    const { dir, ws, png } = await tidepool();
    // The owner's own mark, saved as `existing` (as `research site` does), under another label.
    await cmd(
      'reference add',
      [
        '--brand',
        'tidepool',
        '--file',
        png,
        '--name',
        'Acme',
        '--source',
        'own app',
        '--category',
        'existing',
      ],
      dir,
    );
    await cmd(
      'refresh',
      [
        '--brand',
        'tidepool',
        '--from',
        png,
        '--colors',
        '2',
        '--equity',
        'in use since 2014 on the Tidepool app',
      ],
      dir,
    );
    const v = (await cmd('verify', ['--brand', 'tidepool', '--concept', 'refresh'], dir)) as {
      originality: { verdict: string };
    };
    const report = JSON.parse(
      readFileSync(join(ws.reportsDir('tidepool'), 'originality-refresh.json'), 'utf8'),
    ) as {
      verdict: string;
      visual: { matches: { name: string }[] };
      existing?: { name: string; visual: number }[];
    };
    expect(report.verdict).not.toBe('redesign');
    expect(report.visual.matches).toEqual([]);
    expect(report.existing?.map((e) => e.name)).toEqual(['Acme']);
    expect(report.existing![0]!.visual).toBeGreaterThan(0.9);
    expect(readFileSync(join(ws.reportsDir('tidepool'), 'originality-refresh.md'), 'utf8')).toMatch(
      /## Likeness to the existing mark/,
    );
    expect(v).toBeTruthy();
    await cmd(
      'finalize',
      ['--brand', 'tidepool', '--concept', 'refresh', '--user-choice', 'Keep our mark.', '--accept-risk'],
      dir,
    );
    const kit = JSON.parse(readFileSync(kitPath(ws, 'tidepool'), 'utf8')) as {
      originality: { verdict: string; existing?: { name: string; visual: number }[] };
    };
    expect(kit.originality.verdict).not.toBe('redesign');
    expect(kit.originality.existing?.map((e) => e.name)).toEqual(['Acme']);
  }, 180_000);

  it('still counts a competitor reference as risk when it shares the brand’s name', async () => {
    const { dir, ws } = await tidepool();
    // Another company's mark under the same name, saved as a direct competitor: a name match never makes it "own".
    const small = join(dir, 'tidepool-256.png');
    writeFileSync(small, await renderPng(mark('orbit'), { width: 256 }));
    await cmd(
      'reference add',
      [
        '--brand',
        'tidepool',
        '--file',
        small,
        '--name',
        'Tidepool logo',
        '--source',
        'other.example',
        '--category',
        'direct',
      ],
      dir,
    );
    await cmd('refresh', ['--brand', 'tidepool', '--from', small, '--colors', '2'], dir);
    await cmd('verify', ['--brand', 'tidepool', '--concept', 'refresh'], dir);
    const report = JSON.parse(
      readFileSync(join(ws.reportsDir('tidepool'), 'originality-refresh.json'), 'utf8'),
    ) as { visual: { matches: { name: string }[] }; existing?: unknown[] };
    expect(report.visual.matches.map((m) => m.name)).toContain('Tidepool logo');
    expect(report.existing ?? []).toEqual([]);
  }, 180_000);
});

describe('equity on a fresh design', () => {
  it('finalizes, but warns that equity is meant for a refresh of a mark already in use', async () => {
    const { ws, dir } = synthBrand();
    ws.saveConcept({ ...ws.concept('nimbra', 'fold'), equity: { note: 'in use since 2019', since: '2019' } });
    await cmd('verify', ['--brand', 'nimbra', '--concept', 'fold'], dir);
    const r = (await cmd(
      'finalize',
      ['--brand', 'nimbra', '--concept', 'fold', '--user-choice', 'This one.', '--accept-risk'],
      dir,
    )) as { warnings?: string[] };
    const note = /equity is meant for a refresh of a mark already in use/;
    expect(r.warnings?.join(' ')).toMatch(note);
    const kit = JSON.parse(readFileSync(kitPath(ws, 'nimbra'), 'utf8')) as { warnings?: string[] };
    expect(kit.warnings?.join(' ')).toMatch(note);
  }, 120_000);
});

describe('refresh reruns', () => {
  it('keeps what the owner changed since the last refresh, and replaces it only with --force', async () => {
    const { dir, ws, png, word } = await tidepool();
    const args = ['--brand', 'tidepool', '--from', png, '--colors', '2'];
    await cmd('refresh', args, dir);
    const small = ws.conceptFile('tidepool', 'refresh', 'symbol-small.svg');
    const edited = readFileSync(small, 'utf8').replace('<svg ', '<svg data-owner="edited" ');
    writeFileSync(small, edited);
    const c0 = ws.concept('tidepool', 'refresh');
    ws.saveConcept({ ...c0, smallSizes: 'main' });

    const r = (await cmd('refresh', [...args, '--wordmark', word, '--lang', 'tr'], dir)) as {
      warnings?: string[];
      keptOwnerFiles?: string[];
      lockups: string[];
      lang: string;
    };
    expect(readFileSync(small, 'utf8')).toBe(edited);
    expect(r.keptOwnerFiles).toEqual(['symbol-small.svg']);
    expect(r.warnings?.join(' ')).toMatch(
      /symbol-small\.svg was changed since the last refresh; kept it — pass --force to replace it/,
    );
    expect(r.lockups).toHaveLength(2);
    expect(r.lang).toBe('tr');
    expect(ws.concept('tidepool', 'refresh').smallSizes).toBe('main');
    expect(ws.concept('tidepool', 'refresh').files.small).toBe('symbol-small.svg');

    // A small version registered by hand is left alone too.
    writeFileSync(ws.conceptFile('tidepool', 'refresh', 'my-small.svg'), mark('orbit'));
    ws.saveConcept({
      ...ws.concept('tidepool', 'refresh'),
      files: { ...ws.concept('tidepool', 'refresh').files, small: 'my-small.svg' },
    });
    const r2 = (await cmd('refresh', args, dir)) as { warnings?: string[] };
    expect(ws.concept('tidepool', 'refresh').files.small).toBe('my-small.svg');
    expect(r2.warnings?.join(' ')).toMatch(/my-small\.svg, registered by hand/);

    const f = (await cmd('refresh', [...args, '--force'], dir)) as { keptOwnerFiles?: string[] };
    expect(f.keptOwnerFiles).toBeUndefined();
    expect(readFileSync(small, 'utf8')).not.toBe(edited);
    const c = ws.concept('tidepool', 'refresh');
    expect(c.files.small).toBe('symbol-small.svg');
    // The answer to small|main was about the old small version.
    expect(c.smallSizes).toBeUndefined();
  }, 180_000);

  it('leaves a symbol or wordmark registered by hand in place, and re-points it only with --force', async () => {
    const { dir, ws, png, word } = await tidepool();
    const args = ['--brand', 'tidepool', '--from', png, '--colors', '2', '--wordmark', word];
    await cmd('refresh', args, dir);
    writeFileSync(ws.conceptFile('tidepool', 'refresh', 'my-symbol.svg'), mark('orbit'));
    writeFileSync(ws.conceptFile('tidepool', 'refresh', 'my-word.svg'), readFileSync(word, 'utf8'));
    const c0 = ws.concept('tidepool', 'refresh');
    ws.saveConcept({ ...c0, files: { ...c0.files, symbol: 'my-symbol.svg', wordmark: 'my-word.svg' } });

    const r = (await cmd('refresh', args, dir)) as {
      warnings?: string[];
      keptOwnerFiles?: string[];
      symbol: string;
    };
    const c = ws.concept('tidepool', 'refresh');
    expect(c.files.symbol).toBe('my-symbol.svg');
    expect(r.keptOwnerFiles).toEqual(['my-symbol.svg', 'my-word.svg']);
    expect(r.symbol).toBe(ws.conceptFile('tidepool', 'refresh', 'my-symbol.svg'));
    expect(c.files.wordmark).toBe('my-word.svg');
    const warned = r.warnings?.join(' ') ?? '';
    expect(warned).toMatch(
      /files\.symbol is my-symbol\.svg, registered by hand; left it alone — pass --force/,
    );
    expect(warned).toMatch(
      /files\.wordmark is my-word\.svg, registered by hand; left it alone — pass --force/,
    );

    await cmd('refresh', [...args, '--force'], dir);
    const f = ws.concept('tidepool', 'refresh');
    expect(f.files.symbol).toBe('symbol.svg');
    expect(f.files.wordmark).toBe('wordmark.svg');
  }, 180_000);

  it('calls an SVG original kept below the gate "original", not a trace', async () => {
    const { dir, ws } = await tidepool();
    const svg = join(dir, 'current.svg');
    writeFileSync(svg, mark('fold-n'));
    const r = (await cmd('refresh', ['--brand', 'tidepool', '--from', svg, '--min-iou', '1'], dir)) as {
      kept: string;
      iou: number;
    };
    expect(r.kept).toBe('original');
    expect(r.iou).toBe(1);
    const html = readFileSync((await buildGallery(ws)).path, 'utf8');
    const card = html.slice(html.indexOf('id="tidepool--refresh"'));
    expect(card).toContain('data-refresh="original"');
    expect(card).toContain('<span data-i18n>Kept as it is</span>');
  }, 180_000);

  it('shows an original raster over 4 MB downscaled in the gallery', async () => {
    const { dir, ws, png } = await tidepool();
    await cmd('refresh', ['--brand', 'tidepool', '--from', png], dir);
    const side = 1100;
    const big = createRaster(side, side);
    big.data.set(randomBytes(big.data.length));
    const bytes = encodePng(big);
    expect(bytes.length).toBeGreaterThan(4 * 1024 * 1024);
    writeFileSync(ws.conceptFile('tidepool', 'refresh', 'original.png'), bytes);
    const html = readFileSync((await buildGallery(ws)).path, 'utf8');
    const card = html.slice(html.indexOf('id="tidepool--refresh"'));
    const src = /data-refresh="original"[^>]*><img src="data:image\/png;base64,([^"]+)"/.exec(card)?.[1];
    expect(src).toBeTruthy();
    expect(decodeImage(Buffer.from(src!, 'base64')).width).toBe(512);
  }, 180_000);
});

describe('rebuild', () => {
  it('checks the input and --min-iou before reading --against', async () => {
    const dir = tmp();
    writeFileSync(join(dir, 'in.svg'), mark('bolt'));
    await expect(
      cmd('rebuild', ['in.svg', '-o', 'out.svg', '--against', 'missing.png', '--min-iou', '2'], dir),
    ).rejects.toThrow(/--min-iou must be between 0 and 1/);
  });
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
