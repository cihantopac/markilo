import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseCommand } from '../src/cli/args.js';
import { findCommand } from '../src/cli/commands.js';
import { loadKit } from '../src/export/kit.js';
import { decodeImage } from '../src/render/png.js';
import { verifyConcept } from '../src/report/quality.js';
import { fixture, synthBrand, tmp } from './helpers.js';

vi.mock('../src/research/appstore.js', async (orig) => ({
  ...(await orig<typeof import('../src/research/appstore.js')>()),
  searchIosApps: async () => [
    {
      store: 'ios',
      id: '123456789',
      name: 'Rivalry',
      url: 'https://apps.apple.com/app/id123456789',
      screenshots: [],
      retrievedAt: '2026-11-12T10:00:00.000Z',
      sourceApi: 'https://itunes.apple.com/lookup?id=123456789',
    },
  ],
}));

const bin = join(__dirname, '..', 'plugin', 'dist', 'markilo.mjs');
const run = (args: string[], cwd: string) =>
  spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });

describe('cli (bundled)', () => {
  it('prints help and version', () => {
    const cwd = tmp();
    expect(run(['help'], cwd).stdout).toContain('Usage: markilo');
    expect(run(['--version'], cwd).stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
  it('centers a mark and refuses to overwrite without --force', () => {
    const cwd = tmp();
    writeFileSync(
      join(cwd, 'in.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="40" y="40" width="40" height="40" fill="#111"/></svg>',
    );
    const r = run(['center', 'in.svg', '-o', 'out.svg'], cwd);
    const j = JSON.parse(r.stdout);
    expect(j.out).toBe('out.svg');
    expect(j.after).toBeLessThan(j.before);
    expect(readFileSync(join(cwd, 'out.svg'), 'utf8')).toContain('translate(');
    expect(run(['center', 'in.svg', '-o', 'out.svg'], cwd).status).not.toBe(0);
    expect(run(['center', 'in.svg', '-o', 'out.svg', '--force'], cwd).status).toBe(0);
  });
  it('sets and removes a brand colour for each ground', () => {
    const cwd = tmp();
    const ok = (args: string[]) => {
      const r = run(args, cwd);
      expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
      return JSON.parse(r.stdout);
    };
    ok(['init', '--name', 'Demo']);
    ok(['brand', 'add', 'Tidepool']);
    ok([
      'concept',
      'new',
      '--brand',
      'tidepool',
      '--id',
      'p1',
      '--title',
      'One',
      '--direction',
      'd',
      '--rationale',
      'r',
      '--semantics',
      'a',
      '--primary',
      '#3ddc97',
      '--on-dark',
      '#3ddc97',
    ]);
    const conceptJson = () =>
      JSON.parse(
        readFileSync(join(cwd, 'brand', 'brands', 'tidepool', 'concepts', 'p1', 'concept.json'), 'utf8'),
      );
    expect(conceptJson().palette.onDark).toBe('#3ddc97');
    const set = ['concept', 'update', '--brand', 'tidepool', '--concept', 'p1'];
    ok([...set, '--on-light', '#007044']);
    expect(conceptJson().palette.onLight).toBe('#007044');
    const bad = run([...set, '--on-light', 'green'], cwd);
    expect(JSON.parse(bad.stderr).error.code).toBe('INVALID_INPUT');
    expect(ok([...set, '--on-light', '#ccffee']).warnings[0]).toMatch(/under 3:1 on a light ground/);
    ok([...set, '--on-light', 'none']);
    expect(conceptJson().palette.onLight).toBeUndefined();
    expect(conceptJson().palette.onDark).toBe('#3ddc97');
  });
  it('sets the brand tile and the mark colour on it', () => {
    const cwd = tmp();
    const ok = (args: string[]) => {
      const r = run(args, cwd);
      expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
      return JSON.parse(r.stdout);
    };
    ok(['init', '--name', 'Demo']);
    ok(['brand', 'add', 'Lumen']);
    // biome-ignore format: one flag per pair reads better
    ok(['concept', 'new', '--brand', 'lumen', '--id', 'p1', '--title', 'One', '--direction', 'd', '--rationale', 'r',
      '--semantics', 'a', '--primary', '#c2255c', '--on-brand', 'auto', '--tile', '#1A1A1A']);
    const conceptJson = () =>
      JSON.parse(
        readFileSync(join(cwd, 'brand', 'brands', 'lumen', 'concepts', 'p1', 'concept.json'), 'utf8'),
      );
    expect(conceptJson().palette).toMatchObject({ onBrand: 'auto', tile: '#1a1a1a' });
    const set = ['concept', 'update', '--brand', 'lumen', '--concept', 'p1'];
    ok([...set, '--on-brand', '#FFFFFF']);
    expect(conceptJson().palette.onBrand).toBe('#ffffff');
    for (const bad of [
      ['--tile', 'red'],
      ['--on-brand', 'white'],
      ['--tile', 'auto'],
    ]) {
      const r = run([...set, ...bad], cwd);
      expect(r.status, bad.join(' ')).not.toBe(0);
      expect(JSON.parse(r.stderr).error.code).toBe('INVALID_INPUT');
    }
    ok([...set, '--on-brand', 'none', '--tile', 'none']);
    expect(conceptJson().palette.onBrand).toBeUndefined();
    expect(conceptJson().palette.tile).toBeUndefined();
  });
  it('render --compare and --sheet take the ground colours', () => {
    const cwd = tmp();
    const rose =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M20 20h60v60H20z" fill="#c2255c"/></svg>';
    writeFileSync(join(cwd, 'a.svg'), rose);
    writeFileSync(join(cwd, 'b.svg'), rose);
    const r = run(
      [
        'render',
        'a.svg',
        'b.svg',
        '--compare',
        '--primary',
        '#c2255c',
        '--on-dark',
        '#f783ac',
        '-o',
        'c.png',
      ],
      cwd,
    );
    expect(r.status, r.stderr).toBe(0);
    const plain = run(['render', 'a.svg', 'b.svg', '--compare', '-o', 'p.png'], cwd);
    expect(plain.status, plain.stderr).toBe(0);
    expect(readFileSync(join(cwd, 'c.png')).equals(readFileSync(join(cwd, 'p.png')))).toBe(false);
    const bad = run(['render', 'a.svg', 'b.svg', '--compare', '--on-dark', 'pink', '-o', 'x.png'], cwd);
    expect(JSON.parse(bad.stderr).error.code).toBe('INVALID_INPUT');
    const noPrimary = run(
      ['render', 'a.svg', 'b.svg', '--compare', '--on-dark', '#f783ac', '-o', 'x.png'],
      cwd,
    );
    expect(JSON.parse(noPrimary.stderr).error.code).toBe('USAGE');
    const sheet = run(
      ['render', 'a.svg', '--sheet', '--primary', '#c2255c', '--on-dark', '#f783ac', '-o', 's.png'],
      cwd,
    );
    expect(sheet.status, sheet.stderr).toBe(0);
  });
  it('render --family, palette --sheet and render --compare --tile write sheets', () => {
    const { dir: cwd } = synthBrand();
    const ok = (args: string[]) => {
      const r = run(args, cwd);
      expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
      return JSON.parse(r.stdout);
    };
    const word = fixture('glyphs/nimbra-word.svg');
    const png = (f: string) => readFileSync(join(cwd, f)).subarray(0, 4).toString('latin1');
    expect(ok(['render', word, '--family', word, '-o', 'fam.png']).words).toBe(2);
    expect(png('fam.png')).toBe('\x89PNG');
    const sheet = ok([
      'palette',
      '--sheet',
      '--brand',
      'nimbra',
      '--concept',
      'fold',
      '--palettes',
      '#c2255c,#0b7285',
      '-o',
      'pal.png',
    ]);
    expect(sheet.palettes).toEqual(['#c2255c', '#0b7285']);
    expect(png('pal.png')).toBe('\x89PNG');
    const bad = run(
      ['palette', '--sheet', '--brand', 'nimbra', '--concept', 'fold', '--palettes', 'pink', '-o', 'x.png'],
      cwd,
    );
    expect(JSON.parse(bad.stderr).error.code).toBe('INVALID_INPUT');
    const rose =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M20 20h60v60H20z" fill="#c2255c"/></svg>';
    writeFileSync(join(cwd, 'a.svg'), rose);
    writeFileSync(join(cwd, 'b.svg'), rose);
    ok(['render', 'a.svg', 'b.svg', '--compare', '-o', 'p.png']);
    ok(['render', 'a.svg', 'b.svg', '--compare', '--tile', '--primary', '#c2255c', '-o', 't.png']);
    expect(readFileSync(join(cwd, 'p.png')).equals(readFileSync(join(cwd, 't.png')))).toBe(false);
  }, 60_000);
  it('render --compare --tile --primary draws the tile row in that colour', async () => {
    const cwd = tmp();
    const rose =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M30 30h40v40H30z" fill="#ffffff"/></svg>';
    writeFileSync(join(cwd, 'a.svg'), rose);
    writeFileSync(join(cwd, 'b.svg'), rose);
    const f = findCommand(['render'])!;
    await f.spec.run(
      parseCommand(
        f.spec,
        ['a.svg', 'b.svg', '--compare', '--tile', '--primary', '#d4561c', '-o', 't.png'],
        cwd,
      ),
    );
    const img = decodeImage(readFileSync(join(cwd, 't.png')));
    // The tile ground is the third row of each sketch; scan the left margin of the sheet for it.
    const counts = new Map<string, number>();
    for (let y = 0; y < img.height; y++) {
      const i = (y * img.width + img.width - 3) * 4;
      const hex = [0, 1, 2].map((k) => img.data[i + k]!.toString(16).padStart(2, '0')).join('');
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
    expect(counts.get('d4561c') ?? 0).toBeGreaterThan(50);
  }, 30_000);
  it('finalize warns when the critique is on another concept', async () => {
    const { ws, dir: cwd } = synthBrand();
    const fold = ws.concept('nimbra', 'fold');
    // The critique sits on a copy of the concept; the concept the user chose was never reviewed.
    mkdirSync(ws.conceptDir('nimbra', 'fold-b'), { recursive: true });
    copyFileSync(
      join(ws.conceptDir('nimbra', 'fold'), 'symbol.svg'),
      join(ws.conceptDir('nimbra', 'fold-b'), 'symbol.svg'),
    );
    ws.saveConcept({ ...fold, id: 'fold-b', files: { symbol: 'symbol.svg' } });
    const { critique: _c, blind: _b, ...bare } = fold;
    ws.saveConcept(bare);
    await verifyConcept(ws, 'nimbra', 'fold');
    const r = run(
      ['finalize', '--brand', 'nimbra', '--concept', 'fold', '--user-choice', 'This one.', '--accept-risk'],
      cwd,
    );
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.kit.gate.status).toBe('not-reviewed');
    expect(out.critiqueElsewhere).toEqual(['fold-b']);
    expect(out.warnings.join(' ')).toMatch(/not-reviewed.*fold-b/);
  }, 60_000);
  it("finalize says the critic's scores were not recorded", async () => {
    const { ws, dir: cwd } = synthBrand();
    for (const c of ws.concepts('nimbra')) {
      const { critique: _c, blind: _b, judgment: _j, ...bare } = c;
      ws.saveConcept(bare as typeof c);
    }
    await verifyConcept(ws, 'nimbra', 'fold');
    const cost = run(
      ['cost', '--brand', 'nimbra', '--phase', 'verify', '--usd', '0.4', '--agent', 'design-critic'],
      cwd,
    );
    expect(cost.status, cost.stderr).toBe(0);
    const r = run(
      ['finalize', '--brand', 'nimbra', '--concept', 'fold', '--user-choice', 'This one.', '--accept-risk'],
      cwd,
    );
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.kit.gate.status).toBe('not-reviewed');
    expect(out.critiqueElsewhere).toBeUndefined();
    expect(out.warnings.join(' ')).toMatch(
      /a critic ran \(design-critic, .+\) but its scores were not recorded.*concept update --blind/,
    );
  }, 60_000);
  it('proposals points at a critique on another concept', async () => {
    const { ws, dir: cwd } = synthBrand();
    const fold = ws.concept('nimbra', 'fold');
    mkdirSync(ws.conceptDir('nimbra', 'fold-b'), { recursive: true });
    copyFileSync(
      join(ws.conceptDir('nimbra', 'fold'), 'symbol.svg'),
      join(ws.conceptDir('nimbra', 'fold-b'), 'symbol.svg'),
    );
    ws.saveConcept({ ...fold, id: 'fold-b', files: { symbol: 'symbol.svg' } });
    const { critique: _c, blind: _b, judgment: _j, ...bare } = fold;
    ws.saveConcept({ ...bare, status: 'draft' } as typeof fold);
    // At explore time (draft) the hint is noise: only the pointer stays.
    const draft = JSON.parse(run(['proposals', '--brand', 'nimbra', '--concepts', 'fold'], cwd).stdout);
    expect(draft.critiqueElsewhere).toEqual({ fold: ['fold-b'] });
    expect((draft.warnings ?? []).join(' ')).not.toMatch(/not-reviewed/);
    ws.saveConcept({ ...bare, status: 'shortlisted' } as typeof fold);
    const r = run(['proposals', '--brand', 'nimbra', '--concepts', 'fold'], cwd);
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.critiqueElsewhere).toEqual({ fold: ['fold-b'] });
    expect(out.warnings.join(' ')).toMatch(/not-reviewed.*fold-b/);
  }, 60_000);
  it('family glyphs and family word build a word with a baseline; proposals warns for a word without one', () => {
    const { ws, dir: cwd } = synthBrand();
    const ok = (args: string[]) => {
      const r = run(args, cwd);
      expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
      return JSON.parse(r.stdout);
    };
    const wordFile = fixture('glyphs/nimbra-word.svg');
    const g = ok(['family', 'glyphs', '--brand', 'nimbra', '--ref', wordFile, '--text', 'NIMBRA']);
    expect(g.ref).toBe('nimbra-word');
    expect(g.glyphs.map((x: { file: string }) => x.file)).toEqual([
      'N.svg',
      'I.svg',
      'M.svg',
      'B.svg',
      'R.svg',
      'A.svg',
    ]);
    expect(existsSync(join(g.dir, 'glyphs.json'))).toBe(true);
    expect(readFileSync(g.word, 'utf8')).toMatch(/data-baseline="60"/);
    // A lockup's measured copy holds the word only: the symbol circle is gone.
    const l = ok([
      'family',
      'glyphs',
      '--brand',
      'nimbra',
      '--ref',
      fixture('glyphs/nimbra-lockup.svg'),
      '--text',
      'NIMBRA',
    ]);
    const lockCopy = readFileSync(l.word, 'utf8');
    expect(lockCopy).toMatch(/data-baseline="70"/);
    expect(lockCopy).not.toContain('<circle');
    const bad = run(['family', 'glyphs', '--brand', 'nimbra', '--ref', wordFile, '--text', 'NIMBR'], cwd);
    expect(bad.status).not.toBe(0);
    expect(JSON.parse(bad.stderr).error.groups).toHaveLength(6);
    const wm = ok(['family', 'word', '--brand', 'nimbra', '--text', 'BRAVO', '--take', 'nimbra-word:BRA']);
    expect(wm.missing).toEqual(['V', 'O']);
    expect(readFileSync(wm.out, 'utf8')).toContain('data-lettering="family"');
    // The concept's word is drawn without metrics: proposals and svg lint say so.
    const conceptWord = join(ws.conceptDir('nimbra', 'fold'), 'wordmark.svg');
    writeFileSync(conceptWord, readFileSync(wordFile, 'utf8'));
    const p = ok(['proposals', '--brand', 'nimbra', '--concepts', 'fold']);
    expect(p.warnings.join(' ')).toMatch(/fold: the word has no baseline; lockups will guess its position/);
    const lint = ok(['svg', 'lint', conceptWord]);
    expect(lint.results[0].issues.map((i: { rule: string }) => i.rule)).toContain('word-baseline');
    writeFileSync(conceptWord, readFileSync(wm.out, 'utf8'));
    expect(ok(['proposals', '--brand', 'nimbra', '--concepts', 'fold']).warnings).toBeUndefined();
  }, 60_000);
  it('a redraw after the critique makes the gate stale, and proposals and verify say so', () => {
    const cwd = tmp();
    const ok = (args: string[]) => {
      const r = run(args, cwd);
      expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
      return JSON.parse(r.stdout);
    };
    ok(['init', '--name', 'Demo']);
    ok(['brand', 'add', 'Tidepool']);
    // biome-ignore format: one flag per pair reads better
    ok(['concept', 'new', '--brand', 'tidepool', '--id', 'p1', '--title', 'One', '--direction', 'd', '--rationale', 'r',
      '--semantics', 'a', '--primary', '#0b7285']);
    const symbol = join(cwd, 'brand', 'brands', 'tidepool', 'concepts', 'p1', 'symbol.svg');
    writeFileSync(symbol, readFileSync(fixture('marks/fold-n.svg'), 'utf8'));
    const set = ['concept', 'update', '--brand', 'tidepool', '--concept', 'p1'];
    const scored = ok([
      ...set,
      '--blind',
      'distinctiveness=7,memorability=7,brand-fit=7,craft=7,versatility=7',
      '--present',
      'yes:ready',
      '--show',
    ]);
    expect(scored.reviewedArt).toMatch(/^[0-9a-f]{64}$/);
    expect(scored.gate.status).toBe('passed');
    writeFileSync(symbol, readFileSync(fixture('marks/fold-n.svg'), 'utf8').replace('#ff8a3d', '#e8590c'));
    const shown = ok(['concept', 'show', '--brand', 'tidepool', '--concept', 'p1']);
    expect(shown.gate).toMatchObject({ status: 'stale', previous: { status: 'passed' } });
    const proposals = ok(['proposals', '--brand', 'tidepool', '--concepts', 'p1']);
    expect(JSON.stringify(proposals)).toMatch(/the critique is older than the drawing/);
    const verify = ok(['verify', '--brand', 'tidepool', '--concept', 'p1']);
    expect(JSON.stringify(verify)).toMatch(/the critique is older than the drawing/);
  }, 60_000);
  it('an identical drawing brings the earlier critique back after a redraw and a second critique', () => {
    const cwd = tmp();
    const ok = (args: string[]) => {
      const r = run(args, cwd);
      expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
      return JSON.parse(r.stdout);
    };
    ok(['init', '--name', 'Demo']);
    ok(['brand', 'add', 'Tidepool']);
    // biome-ignore format: one flag per pair reads better
    ok(['concept', 'new', '--brand', 'tidepool', '--id', 'p1', '--title', 'One', '--direction', 'd', '--rationale', 'r',
      '--semantics', 'a', '--primary', '#0b7285']);
    const symbol = join(cwd, 'brand', 'brands', 'tidepool', 'concepts', 'p1', 'symbol.svg');
    const v1 = readFileSync(fixture('marks/fold-n.svg'), 'utf8');
    writeFileSync(symbol, v1);
    const set = ['concept', 'update', '--brand', 'tidepool', '--concept', 'p1'];
    ok([
      ...set,
      '--blind',
      'distinctiveness=7,memorability=7,brand-fit=7,craft=7,versatility=7',
      '--present',
      'yes:ready',
    ]);
    writeFileSync(symbol, v1.replace('#ff8a3d', '#e8590c'));
    expect(ok(['concept', 'show', '--brand', 'tidepool', '--concept', 'p1']).gate.status).toBe('stale');
    // Back to V1 byte for byte: the critique still on file matches again.
    writeFileSync(symbol, v1);
    const back = ok(['concept', 'show', '--brand', 'tidepool', '--concept', 'p1']);
    expect(back.gate).toMatchObject({ status: 'passed' });
    // A critique of the other drawing keeps V1's in the history; returning to V1 restores it and says so.
    writeFileSync(symbol, v1.replace('#ff8a3d', '#e8590c'));
    ok([
      ...set,
      '--blind',
      'distinctiveness=4,memorability=4,brand-fit=4,craft=4,versatility=4',
      '--present',
      'no:weak',
    ]);
    expect(ok(['concept', 'show', '--brand', 'tidepool', '--concept', 'p1']).gate.status).toBe(
      'below-threshold',
    );
    writeFileSync(symbol, v1);
    const r = ok([...set, '--show']);
    expect(r.restored).toMatch(/^restored the critique of \d{4}-/);
    expect(r.gate.status).toBe('passed');
    expect(r.blind.scores.craft).toBe(7);
    expect(r.critiques).toHaveLength(1);
  }, 60_000);
  it('finalize keeps a stand-in font under standIn for family lettering', async () => {
    const { ws, dir } = synthBrand();
    const cwd = dirname(ws.root);
    expect(cwd).toBe(dir);
    const fold = ws.concept('nimbra', 'fold');
    ws.saveConcept({
      ...fold,
      typography: {
        fontId: 'outfit',
        weight: 600,
        family: 'Outfit',
        license: 'OFL-1.1',
        lettering: 'family',
      },
    });
    await verifyConcept(ws, 'nimbra', 'fold');
    const r = run(
      ['finalize', '--brand', 'nimbra', '--concept', 'fold', '--user-choice', 'This one.', '--accept-risk'],
      cwd,
    );
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.kit.typography).toEqual({ lettering: 'family', standIn: { fontId: 'outfit', weight: 600 } });
  }, 60_000);
  it('primary change recolours the masters; --no-recolor keeps them', () => {
    const { ws, dir: cwd } = synthBrand();
    const ok = (args: string[]) => {
      const r = run(args, cwd);
      expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
      return JSON.parse(r.stdout);
    };
    const cdir = ws.conceptDir('nimbra', 'fold');
    const from = readFileSync(join(cdir, 'symbol.svg'), 'utf8');
    // A lockup in the same colour, once as an attribute and once in a style declaration; a neighbour shade stays.
    writeFileSync(
      join(cdir, 'lockup.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#3B5BDB" d="M0 0h5v5z"/><path style="stroke:#3b5bdb;fill:#3b5bdc" d="M5 5h5v5z"/></svg>',
    );
    ok(['concept', 'update', '--brand', 'nimbra', '--concept', 'fold', '--lockup-horizontal', 'lockup.svg']);
    const kept = ok([
      'concept',
      'update',
      '--brand',
      'nimbra',
      '--concept',
      'fold',
      '--primary',
      '#2b3a52',
      '--no-recolor',
    ]);
    expect(kept.recolored).toBeUndefined();
    expect(readFileSync(join(cdir, 'symbol.svg'), 'utf8')).toBe(from);
    ok([
      'concept',
      'update',
      '--brand',
      'nimbra',
      '--concept',
      'fold',
      '--primary',
      '#3b5bdb',
      '--no-recolor',
    ]);
    const r = ok(['concept', 'update', '--brand', 'nimbra', '--concept', 'fold', '--primary', '#2b3a52']);
    expect(r.recolored).toEqual(
      expect.arrayContaining([
        { file: 'symbol.svg', from: '#3b5bdb', to: '#2b3a52', count: 2 },
        { file: 'lockup.svg', from: '#3b5bdb', to: '#2b3a52', count: 2 },
      ]),
    );
    expect(readFileSync(join(cdir, 'symbol.svg'), 'utf8')).not.toContain('#3b5bdb');
    expect(readFileSync(join(cdir, 'symbol.svg'), 'utf8')).toContain('fill="#2b3a52"');
    const lock = readFileSync(join(cdir, 'lockup.svg'), 'utf8');
    expect(lock).toContain('fill="#2b3a52"');
    expect(lock).toContain('stroke:#2b3a52;fill:#3b5bdc');
  }, 60_000);
  it('finalize fails on a stale master colour; --accept-colours records it', async () => {
    const { ws, dir: cwd } = synthBrand();
    const fin = [
      'finalize',
      '--brand',
      'nimbra',
      '--concept',
      'fold',
      '--user-choice',
      'This one.',
      '--accept-risk',
    ];
    // The accent changes, the master keeps drawing the old one: that colour is stale.
    const upd = run(
      ['concept', 'update', '--brand', 'nimbra', '--concept', 'fold', '--accent', '#e5484d', '--no-recolor'],
      cwd,
    );
    expect(upd.status, upd.stderr).toBe(0);
    expect(ws.concept('nimbra', 'fold').paletteHistory).toEqual(['#ff8a3d']);
    await verifyConcept(ws, 'nimbra', 'fold');
    const verify = JSON.parse(run(['verify', '--brand', 'nimbra', '--concept', 'fold'], cwd).stdout);
    expect(verify.warnings.join(' ')).toMatch(/symbol\.svg uses #ff8a3d, which is not in the palette/);
    const bad = run(fin, cwd);
    expect(bad.status).not.toBe(0);
    expect(JSON.parse(bad.stderr).error.code).toBe('INVALID_INPUT');
    expect(bad.stderr).toMatch(
      /symbol\.svg uses #ff8a3d, which is not in the palette — run `concept update --recolor-from #ff8a3d --<role> <#hex>`/,
    );
    const r = run([...fin, '--accept-colours'], cwd);
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.kit.warnings.join(' ')).toMatch(/symbol\.svg uses #ff8a3d/);
    expect(out.warnings.join(' ')).toMatch(/symbol\.svg uses #ff8a3d/);
  }, 60_000);
  it('an off-palette shade finalizes with a warning', async () => {
    const { ws, dir: cwd } = synthBrand();
    await verifyConcept(ws, 'nimbra', 'fold');
    const r = run(
      ['finalize', '--brand', 'nimbra', '--concept', 'fold', '--user-choice', 'This one.', '--accept-risk'],
      cwd,
    );
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    // An off-palette shade is a note for this run; brand.json keeps only what was knowingly accepted.
    expect(out.kit.warnings).toBeUndefined();
    expect(
      JSON.parse(readFileSync(join(cwd, 'brand', 'brands', 'nimbra', 'final', 'brand.json'), 'utf8'))
        .warnings,
    ).toBeUndefined();
    expect(out.warnings.join(' ')).toMatch(/symbol\.svg uses #2b44b0, which is not a palette role/);
    expect(out.warnings.join(' ')).not.toMatch(/run `concept update/);
  }, 60_000);
  it('finalize --force leaves no master the new kit does not list', async () => {
    const { ws, dir: cwd } = synthBrand();
    const cdir = ws.conceptDir('nimbra', 'fold');
    copyFileSync(join(cdir, 'symbol.svg'), join(cdir, 'symbol-small.svg'));
    const upd = ['concept', 'update', '--brand', 'nimbra', '--concept', 'fold'];
    expect(run([...upd, '--small', 'symbol-small.svg'], cwd).status).toBe(0);
    await verifyConcept(ws, 'nimbra', 'fold');
    const fin = [
      'finalize',
      '--brand',
      'nimbra',
      '--concept',
      'fold',
      '--user-choice',
      'This one.',
      '--accept-risk',
    ];
    expect(run(fin, cwd).status).toBe(0);
    const final = join(cwd, 'brand', 'brands', 'nimbra', 'final');
    expect(existsSync(join(final, 'symbol-small.svg'))).toBe(true);
    // The user now wants the main symbol at small sizes: the small file is no longer part of the kit.
    ws.saveConcept({ ...ws.concept('nimbra', 'fold'), status: 'shortlisted', smallSizes: 'main' });
    const r = run([...fin, '--force'], cwd);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).kit.files.symbolSmall).toBeUndefined();
    expect(existsSync(join(final, 'symbol-small.svg'))).toBe(false);
    expect(existsSync(join(final, 'symbol.svg'))).toBe(true);
  }, 60_000);
  it('an old kit whose gate says `failed` reads as below-threshold and still exports', async () => {
    const { ws, dir: cwd } = synthBrand();
    await verifyConcept(ws, 'nimbra', 'fold');
    const fin = run(
      ['finalize', '--brand', 'nimbra', '--concept', 'fold', '--user-choice', 'This one.', '--accept-risk'],
      cwd,
    );
    expect(fin.status, fin.stderr).toBe(0);
    const kitFile = join(cwd, 'brand', 'brands', 'nimbra', 'final', 'brand.json');
    const kit = JSON.parse(readFileSync(kitFile, 'utf8'));
    writeFileSync(kitFile, JSON.stringify({ ...kit, gate: { ...kit.gate, status: 'failed' } }, null, 2));
    expect(loadKit(ws, 'nimbra').gate?.status).toBe('below-threshold');
    const r = run(['export', '--brand', 'nimbra', '--only', 'web'], cwd);
    expect(r.status, r.stderr).toBe(0);
  }, 60_000);
  it('the stale-colour remedy works: --recolor-from rewrites it to a role that keeps its colour', async () => {
    const { ws, dir: cwd } = synthBrand();
    const upd = ['concept', 'update', '--brand', 'nimbra', '--concept', 'fold'];
    expect(run([...upd, '--accent', '#e5484d', '--no-recolor'], cwd).status).toBe(0);
    // The accent keeps its value: a plain --accent call finds nothing to recolour.
    expect(JSON.parse(run([...upd, '--accent', '#e5484d'], cwd).stdout).recolored).toBeUndefined();
    const bad = run([...upd, '--recolor-from', '#ff8a3d'], cwd);
    expect(JSON.parse(bad.stderr).error.code).toBe('USAGE');
    const r = run([...upd, '--recolor-from', '#FF8A3D', '--accent', '#e5484d'], cwd);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).recolored).toEqual([
      expect.objectContaining({ file: 'symbol.svg', from: '#ff8a3d', to: '#e5484d' }),
    ]);
    expect(readFileSync(join(ws.conceptDir('nimbra', 'fold'), 'symbol.svg'), 'utf8')).not.toMatch(/#ff8a3d/i);
    await verifyConcept(ws, 'nimbra', 'fold');
    const fin = run(
      ['finalize', '--brand', 'nimbra', '--concept', 'fold', '--user-choice', 'This one.', '--accept-risk'],
      cwd,
    );
    expect(fin.status, fin.stderr).toBe(0);
  }, 60_000);
  it('recolour, then revert to chosen: the restored drawing follows the palette and finalizes', async () => {
    const { ws, dir: cwd } = synthBrand();
    const upd = ['concept', 'update', '--brand', 'nimbra', '--concept', 'fold'];
    const cdir = ws.conceptDir('nimbra', 'fold');
    expect(run([...upd, '--status', 'shortlisted'], cwd).status).toBe(0);
    expect(JSON.parse(readFileSync(join(cdir, 'chosen', 'files.json'), 'utf8')).palette.primary).toBe(
      '#3b5bdb',
    );
    expect(run([...upd, '--primary', '#2b3a52'], cwd).status).toBe(0);
    const r = run(['concept', 'revert', '--brand', 'nimbra', '--concept', 'fold', '--to', 'chosen'], cwd);
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.recolored).toEqual([{ file: 'symbol.svg', from: '#3b5bdb', to: '#2b3a52', count: 2 }]);
    expect(readFileSync(join(cdir, 'symbol.svg'), 'utf8')).not.toContain('#3b5bdb');
    await verifyConcept(ws, 'nimbra', 'fold');
    const verify = JSON.parse(run(['verify', '--brand', 'nimbra', '--concept', 'fold'], cwd).stdout);
    expect(verify.warnings.join(' ')).not.toMatch(/not in the palette/);
    const fin = run(
      ['finalize', '--brand', 'nimbra', '--concept', 'fold', '--user-choice', 'This one.', '--accept-risk'],
      cwd,
    );
    expect(fin.status, fin.stderr).toBe(0);
  }, 60_000);
  it('revert with a chosen/ kept before 1.6 restores by name and warns that it did not recolour', () => {
    const { ws, dir: cwd } = synthBrand();
    const upd = ['concept', 'update', '--brand', 'nimbra', '--concept', 'fold'];
    const cdir = ws.conceptDir('nimbra', 'fold');
    expect(run([...upd, '--status', 'shortlisted'], cwd).status).toBe(0);
    rmSync(join(cdir, 'chosen', 'files.json'));
    expect(run([...upd, '--primary', '#2b3a52'], cwd).status).toBe(0);
    const r = run(['concept', 'revert', '--brand', 'nimbra', '--concept', 'fold', '--to', 'chosen'], cwd);
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.restored).toEqual(expect.arrayContaining(['symbol.svg', 'wordmark.svg']));
    expect(out.recolored).toBeUndefined();
    expect(out.warnings.join(' ')).toMatch(/kept before 1\.6 without its palette/);
    expect(readFileSync(join(cdir, 'symbol.svg'), 'utf8')).toContain('#3b5bdb');
  }, 60_000);
  it('a rejected option leaves the files as they were (recolour is written last)', () => {
    const { ws, dir: cwd } = synthBrand();
    const cdir = ws.conceptDir('nimbra', 'fold');
    const before = readFileSync(join(cdir, 'symbol.svg'), 'utf8');
    for (const extra of [
      ['--present', 'maybe'],
      ['--blind', 'craft=7'],
      ['--judgment', 'bad'],
      ['--semantics', ';'],
    ]) {
      const r = run(
        ['concept', 'update', '--brand', 'nimbra', '--concept', 'fold', '--primary', '#2b3a52', ...extra],
        cwd,
      );
      expect(r.status, extra.join(' ')).not.toBe(0);
      expect(readFileSync(join(cdir, 'symbol.svg'), 'utf8')).toBe(before);
      expect(ws.concept('nimbra', 'fold').palette.primary).toBe('#3b5bdb');
    }
  }, 60_000);
  it('a critique of a changed drawing starts clean: no judgment, answer or looks of the old drawing', () => {
    const { ws, dir: cwd } = synthBrand();
    const upd = ['concept', 'update', '--brand', 'nimbra', '--concept', 'fold'];
    const blind = 'distinctiveness=7,memorability=7,brand-fit=7,craft=7,versatility=7';
    const first = run(
      [...upd, '--blind', blind, '--present', 'yes:good', '--judgment', 'craft=8:clean'],
      cwd,
    );
    expect(first.status, first.stderr).toBe(0);
    const reviews = ws.concept('nimbra', 'fold').reviews;
    // The drawing changes; the new critic records only its blind scores in this call.
    copyFileSync(fixture('marks/leaf-letter.svg'), join(ws.conceptDir('nimbra', 'fold'), 'symbol.svg'));
    const r = run([...upd, '--blind', blind, '--show'], cwd);
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.judgment).toBeUndefined();
    expect(out.critique).toBeUndefined();
    expect(out.looks).toBeUndefined();
    expect(out.critiques).toHaveLength(1);
    expect(out.critiques[0].judgment.craft.score).toBe(8);
    expect(out.gate.status).not.toBe('passed');
    // Its first answer counts as a new review; a follow-up call on the same drawing keeps this call's scores.
    const next = JSON.parse(run([...upd, '--present', 'yes:fine', '--show'], cwd).stdout);
    expect(next.blind.scores.craft).toBe(7);
    expect(next.reviews).toBe((reviews ?? 0) + 1);
  }, 60_000);
  it('family word --fill writes the given fill on the word', () => {
    const { dir: cwd } = synthBrand();
    const ok = (args: string[]) => {
      const r = run(args, cwd);
      expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
      return JSON.parse(r.stdout);
    };
    ok([
      'family',
      'glyphs',
      '--brand',
      'nimbra',
      '--ref',
      fixture('glyphs/nimbra-word.svg'),
      '--text',
      'NIMBRA',
    ]);
    const wm = ok([
      'family',
      'word',
      '--brand',
      'nimbra',
      '--text',
      'BRA',
      '--take',
      'nimbra-word:BRA',
      '--fill',
      '#1B2140',
    ]);
    expect(readFileSync(wm.out, 'utf8')).toContain('<g fill="#1b2140"');
    const dflt = ok(['family', 'word', '--brand', 'nimbra', '--text', 'BRA', '--take', 'nimbra-word:BRA']);
    expect(readFileSync(dflt.out, 'utf8')).toContain('<g fill="#111111"');
    expect(
      run(
        [
          'family',
          'word',
          '--brand',
          'nimbra',
          '--text',
          'BRA',
          '--take',
          'nimbra-word:BRA',
          '--fill',
          'nope',
        ],
        cwd,
      ).status,
    ).not.toBe(0);
  }, 60_000);
  it('verify warns for a ground colour in a master', () => {
    const cwd = tmp();
    const ok = (args: string[]) => {
      const r = run(args, cwd);
      expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
      return JSON.parse(r.stdout);
    };
    ok(['init', '--name', 'Demo']);
    ok(['brand', 'add', 'Tidepool']);
    // biome-ignore format: one flag per pair reads better
    ok(['concept', 'new', '--brand', 'tidepool', '--id', 'p1', '--title', 'One', '--direction', 'd', '--rationale', 'r',
      '--semantics', 'a', '--primary', '#e0a22a']);
    const symbol = join(cwd, 'brand', 'brands', 'tidepool', 'concepts', 'p1', 'symbol.svg');
    writeFileSync(
      symbol,
      readFileSync(fixture('marks/fold-n.svg'), 'utf8').replace(/#[0-9a-f]{6}/gi, '#a86f00'),
    );
    ok([
      'concept',
      'update',
      '--brand',
      'tidepool',
      '--concept',
      'p1',
      '--symbol',
      'symbol.svg',
      '--on-light',
      '#a86f00',
    ]);
    const verify = ok(['verify', '--brand', 'tidepool', '--concept', 'p1']);
    expect(verify.warnings.join(' ')).toMatch(
      /the master symbol\.svg uses the light colour #a86f00; keep masters in the primary and let exports pick the ground colour/,
    );
    writeFileSync(
      symbol,
      readFileSync(fixture('marks/fold-n.svg'), 'utf8').replace(/#[0-9a-f]{6}/gi, '#e0a22a'),
    );
    expect(ok(['verify', '--brand', 'tidepool', '--concept', 'p1']).warnings.join(' ')).not.toMatch(
      /keep masters in the primary/,
    );
  }, 60_000);
  it('concept update takes paths from the cwd, stored relative, and keeps a chat choice', () => {
    const cwd = tmp();
    const ok = (args: string[]) => {
      const r = run(args, cwd);
      expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
      return JSON.parse(r.stdout);
    };
    ok(['init', '--name', 'Demo']);
    ok(['brand', 'add', 'Tidepool']);
    for (const id of ['p1', 'p2'])
      ok([
        'concept',
        'new',
        '--brand',
        'tidepool',
        '--id',
        id,
        '--title',
        id,
        '--direction',
        'd',
        '--rationale',
        'r',
        '--semantics',
        'a',
        '--primary',
        '#1d4e89',
      ]);
    const rel = (id: string) => `brand/brands/tidepool/concepts/${id}`;
    writeFileSync(join(cwd, rel('p1'), 'symbol.svg'), readFileSync(fixture('marks/fold-n.svg')));
    writeFileSync(join(cwd, rel('p2'), 'symbol.svg'), readFileSync(fixture('marks/bars.svg')));
    const set = ['concept', 'update', '--brand', 'tidepool', '--concept', 'p1'];
    // accepts a cwd-relative path inside the concept folder and stores it relative
    ok([...set, '--symbol', `${rel('p1')}/symbol.svg`]);
    const conceptJson = () => JSON.parse(readFileSync(join(cwd, rel('p1'), 'concept.json'), 'utf8'));
    expect(conceptJson().files.symbol).toBe('symbol.svg');
    ok([...set, '--symbol', join(cwd, rel('p1'), 'symbol.svg')]);
    expect(conceptJson().files.symbol).toBe('symbol.svg');
    // refuses a cwd-relative path outside the concept folder
    const out = run([...set, '--symbol', `${rel('p2')}/symbol.svg`], cwd);
    expect(JSON.parse(out.stderr).error.code).toBe('UNSAFE_PATH');
    // through --workspace with an unresolved (symlinked) path, the stored path is still relative to the concept
    ok([...set, '--symbol', 'symbol.svg', '--workspace', join(cwd, 'brand')]);
    expect(conceptJson().files.symbol).toBe('symbol.svg');
    // --status shortlisted keeps the chosen drawing, as feedback --apply does
    const r = ok([...set, '--status', 'shortlisted']);
    expect(r.kept.length).toBeGreaterThan(0);
    expect(existsSync(join(cwd, rel('p1'), 'chosen', 'symbol.svg'))).toBe(true);
  });
  it("center refuses to write into a brand's final/ folder", () => {
    const cwd = tmp();
    run(['init', '--name', 'Demo'], cwd);
    run(['brand', 'add', 'Acme', '--locked'], cwd);
    run(['brand', 'add', 'Tidepool'], cwd);
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="40" y="40" width="40" height="40" fill="#111"/></svg>';
    writeFileSync(join(cwd, 'in.svg'), svg);
    const code = (out: string, at = cwd) => {
      const r = run(['center', join(cwd, 'in.svg'), '-o', out], at);
      return r.status === 0 ? 'OK' : JSON.parse(r.stderr).error.code;
    };
    const finalOf = (slug: string) => join(cwd, 'brand', 'brands', slug, 'final');
    expect(code(join(finalOf('acme'), 'symbol.svg'))).toBe('LOCKED');
    expect(code(join(finalOf('tidepool'), 'symbol.svg'))).toBe('USAGE');
    expect(code(finalOf('tidepool'))).toBe('USAGE');
    // Found from the output path too, when the command runs outside the workspace.
    expect(code(join(finalOf('tidepool'), 'masters', 'symbol.svg'), tmp())).toBe('USAGE');
    expect(existsSync(finalOf('tidepool'))).toBe(false);
    expect(code(join(cwd, 'centered.svg'))).toBe('OK');
  });
  it('returns structured errors with stable codes', () => {
    const cwd = tmp();
    const r = run(['brand', 'list'], cwd);
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stderr).error.code).toBe('NO_WORKSPACE');
    const u = run(['frobnicate'], cwd);
    expect(u.status).toBe(64);
    expect(JSON.parse(u.stderr).error.code).toBe('USAGE');
  });
  it('reports the workspace status without failing when there is none', () => {
    const cwd = tmp();
    const none = run(['status'], cwd);
    expect(none.status, none.stderr).toBe(0);
    expect(JSON.parse(none.stdout)).toMatchObject({ found: false });
    run(['init', '--name', 'Demo'], cwd);
    run(['brand', 'add', 'Status Test'], cwd);
    const some = JSON.parse(run(['status'], cwd).stdout);
    expect(some).toMatchObject({ found: true, brands: [{ slug: 'status-test', stage: 'research' }] });
    expect(some.next).toMatch(/research repo/);
  });
  it('runs a workspace flow from any directory', () => {
    const cwd = tmp();
    expect(run(['init', '--name', 'Demo'], cwd).status).toBe(0);
    expect(JSON.parse(run(['brand', 'add', 'Örnek Marka'], cwd).stdout).brand.slug).toBe('ornek-marka');
    const wm = run(
      ['wordmark', '--text', 'Örnek', '--font', 'inter', '--weight', '700', '--tracking=-20', '-o', 'wm.svg'],
      cwd,
    );
    expect(wm.status, wm.stderr).toBe(0);
    expect(readFileSync(join(cwd, 'wm.svg'), 'utf8')).toContain('data-cap-height');
    expect(run(['wordmark', '--text', 'x', '--font', 'inter', '-o', 'wm.svg'], cwd).status).toBe(1);
    const net = run(['research', 'site', 'https://example.com', '--brand', 'ornek-marka'], cwd);
    expect(JSON.parse(net.stderr).error.code).toBe('NETWORK_DISABLED');
  });
  // Regression: the installed plugin has no node_modules; everything must be inside plugin/dist.
  it('runs from a copy of dist with no node_modules anywhere above it', () => {
    const dir = tmp();
    for (const f of readdirSync(dirname(bin))) copyFileSync(join(dirname(bin), f), join(dir, f));
    writeFileSync(
      join(dir, 'spec.json'),
      JSON.stringify({ layers: [{ fill: '#123456', shape: { circle: { c: [512, 512], r: 400 } } }] }),
    );
    const r = spawnSync(
      process.execPath,
      [join(dir, 'markilo.mjs'), 'construct', 'spec.json', '-o', 'o.svg'],
      {
        cwd: dir,
        encoding: 'utf8',
      },
    );
    expect(r.status, r.stderr).toBe(0);
    const v = spawnSync(process.execPath, [join(dir, 'markilo.mjs'), 'render', 'o.svg', '-o', 'o.png'], {
      cwd: dir,
      encoding: 'utf8',
    });
    expect(v.status, v.stderr).toBe(0);
  });
  it('builds a mark from a construction spec with the bundled PathKit', () => {
    const cwd = tmp();
    writeFileSync(
      join(cwd, 'spec.json'),
      JSON.stringify({
        params: { w: 120 },
        vary: { w: [100, 140] },
        layers: [
          {
            fill: '#123456',
            shape: { arc: { c: [512, 512], r: 380, from: 40, to: 320, width: 'w', cap: 'round' } },
          },
        ],
      }),
    );
    const r = run(['construct', 'spec.json', '-o', 'mark.svg', '--guides', 'c.png'], cwd);
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(join(cwd, 'mark.svg'), 'utf8')).toMatch(/<path[^>]+fill="#123456"/);
    expect(existsSync(join(cwd, 'c.png'))).toBe(true);
    const v = run(['construct', 'spec.json', '--vary', '--out-dir', 'v'], cwd);
    expect(v.status, v.stderr).toBe(0);
    expect(JSON.parse(v.stdout).built).toBe(2);
    expect(existsSync(join(cwd, 'v', 'variants.png'))).toBe(true);
  });
  it('builds a sketch board and records the critic pick', () => {
    const cwd = tmp();
    run(['init'], cwd);
    run(['brand', 'add', 'Nimbra'], cwd);
    const made = run(
      [
        'concept',
        'new',
        '--brand',
        'nimbra',
        '--id',
        'a',
        '--title',
        'A',
        '--direction',
        'd',
        '--rationale',
        'r',
        '--semantics',
        'x',
        '--primary',
        '#225577',
      ],
      cwd,
    );
    expect(made.status, made.stderr).toBe(0);
    const dir = join(cwd, 'brand', 'brands', 'nimbra', 'concepts', 'a', 'sketches');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 's1.json'),
      JSON.stringify({
        idea: 'a door left ajar',
        layers: [{ fill: 'primary', shape: { rect: { x: 200, y: 100, w: 600, h: 820, r: 40 } } }],
      }),
    );
    writeFileSync(
      join(dir, 's2.json'),
      JSON.stringify({
        idea: 'one gesture',
        layers: [
          {
            fill: 'primary',
            shape: { arc: { c: [512, 512], r: 380, from: 20, to: 300, width: 120, cap: 'round' } },
          },
        ],
      }),
    );
    // A hairline gap: the idea may be fine, but it disappears at 16 px, so the sketch is not ready for review.
    writeFileSync(
      join(dir, 's3.json'),
      JSON.stringify({
        idea: 'a split block',
        layers: [
          {
            fill: 'primary',
            shape: {
              gap: {
                shape: { rect: { x: 150, y: 150, w: 724, h: 724 } },
                cut: { rect: { x: 0, y: 506, w: 1024, h: 12 } },
                width: 0,
              },
            },
          },
        ],
      }),
    );
    const b = run(['sketches', '--brand', 'nimbra', '--concept', 'a'], cwd);
    expect(b.status, b.stderr).toBe(0);
    const out = JSON.parse(b.stdout);
    expect(out.sketches.map((x: { idea: string }) => x.idea)).toEqual([
      'a door left ajar',
      'one gesture',
      'a split block',
    ]);
    const split = out.sketches[2];
    expect(split.ready).toBe(false);
    expect(split.fix.join(' ')).toMatch(/≥ 80 units/);
    expect(out.sketches[1].ready).toBe(true);
    expect(out.notReady).toEqual(['s3']);
    expect(readFileSync(join(dir, 's1.svg'), 'utf8')).toContain('fill="#225577"');
    expect(existsSync(join(dir, 'board.png'))).toBe(true);
    const pick = run(
      [
        'concept',
        'update',
        '--brand',
        'nimbra',
        '--concept',
        'a',
        '--sketch-pick',
        's2',
        '--sketch-notes',
        'keep the gesture',
        '--show',
      ],
      cwd,
    );
    expect(JSON.parse(pick.stdout).sketchReview.pick).toBe('s2');
    expect(
      run(['concept', 'update', '--brand', 'nimbra', '--concept', 'a', '--sketch-pick', 's9'], cwd).status,
    ).toBe(1);
    // The user sees the boards in the gallery, with the critic's reading, and may pick another sketch there.
    expect(run(['gallery'], cwd).status).toBe(0);
    const html = readFileSync(join(cwd, 'brand', 'gallery', 'index.html'), 'utf8');
    expect(html).toContain('class="card sketchcard" data-key="nimbra/a"');
    expect(html).toMatch(/data-sketch="s2"[^>]*>[\s\S]*?critic’s pick/);
    const fb = join(cwd, 'fb.json');
    writeFileSync(
      fb,
      JSON.stringify({
        schema: 'markilo/feedback@1',
        decisions: [{ brand: 'nimbra', concept: 'a', decision: null, sketch: 's1', note: 'the door' }],
        preferred: null,
      }),
    );
    const applied = run(['feedback', '--import', fb, '--apply'], cwd);
    expect(applied.status, applied.stderr).toBe(0);
    expect(JSON.parse(applied.stdout).requests).toEqual(['develop sketch s1 of nimbra/a (the door)']);
    const user = JSON.parse(run(['concept', 'show', '--brand', 'nimbra', '--concept', 'a'], cwd).stdout);
    expect(user.concept?.sketchReview ?? user.sketchReview).toMatchObject({ pick: 's1', by: 'user' });
    expect(JSON.stringify(user)).toContain('Critic (picked s2): keep the gesture');
    expect(readFileSync(join(cwd, 'brand', 'brands', 'nimbra', 'decisions.md'), 'utf8')).toMatch(
      /\*\*Sketch pick \(user\)\*\* · a: develop s1 — the door/,
    );
  });
  it('compares colors by CIEDE2000 and contrast', () => {
    const r = run(['color', 'compare', '#d12c12', '#ffffff'], tmp());
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).pairs[0]).toMatchObject({ deltaE00: 49.4, contrast: 5.15 });
  });
  it('shortcut install is a dry run without --yes and refuses foreign files', () => {
    const dir = tmp();
    const dry = JSON.parse(run(['shortcut', 'install', '--dir', dir], dir).stdout);
    expect(dry.applied).toBe(false);
    expect(existsSync(join(dir, 'markilo', 'SKILL.md'))).toBe(false);
    expect(JSON.parse(run(['shortcut', 'install', '--dir', dir, '--yes'], dir).stdout).applied).toBe(true);
    expect(JSON.parse(run(['shortcut', 'status', '--dir', dir], dir).stdout).managedByMarkilo).toBe(true);
    expect(JSON.parse(run(['shortcut', 'uninstall', '--dir', dir, '--yes'], dir).stdout).applied).toBe(true);
  });
});

describe('cli: idea longlist', () => {
  it('records ideas, the critic strikes or keeps them from the words, and says what is next', () => {
    const cwd = tmp();
    run(['init'], cwd);
    run(['brand', 'add', 'Lumen'], cwd);
    const add = (hook: string, source: string) =>
      run(['ideas', '--brand', 'lumen', '--add', hook, '--means', 'why it fits', '--source', source], cwd);
    const first = JSON.parse(add('an arch with a keystone', 'product').stdout);
    expect(first.summary.ideas).toBe(1);
    expect(first.next).toMatch(/at least 12/);
    for (let i = 0; i < 11; i++) add(`hook ${i}`, i % 2 ? 'audience' : 'name');
    const r = JSON.parse(
      run(['ideas', '--brand', 'lumen', '--idea', 'i1', '--strike', 'a generic architecture icon'], cwd)
        .stdout,
    );
    expect(r.ideas[0].review).toMatchObject({ verdict: 'strike', reading: 'a generic architecture icon' });
    expect(r.next).toMatch(/Critic: review i2/);
    const bad = run(['ideas', '--brand', 'lumen', '--add', 'x', '--means', 'y', '--source', 'vibes'], cwd);
    expect(bad.status).not.toBe(0);
    const kept = JSON.parse(
      run(
        ['ideas', '--brand', 'lumen', '--idea', 'i2', '--keep', 'a lamp seen from above', '--rank', '1'],
        cwd,
      ).stdout,
    );
    expect(kept.summary).toMatchObject({ kept: 1, struck: 1, unreviewed: 10 });
    expect(kept.summary.bySource).toMatchObject({ product: 1, name: 6, audience: 5 });
  });
});

describe('cli export --theme-color', () => {
  it('rejects a colour name with USAGE and lists the option in the usage', () => {
    const cwd = tmp();
    run(['init', '--name', 'Demo'], cwd);
    run(['brand', 'add', 'Nimbra'], cwd);
    const r = run(['export', '--brand', 'nimbra', '--theme-color', 'blue'], cwd);
    expect(r.status).toBe(64);
    expect(JSON.parse(r.stderr).error.code).toBe('USAGE');
  });
});

describe('finalize --wordmark-only (bundled)', () => {
  it('is refused on a locked brand with LOCKED', () => {
    const cwd = tmp();
    run(['init'], cwd);
    run(['brand', 'add', 'Fixed', '--locked'], cwd);
    const r = run(
      ['finalize', '--brand', 'fixed', '--concept', 'x', '--user-choice', 'u', '--wordmark-only'],
      cwd,
    );
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toContain('LOCKED');
  });
});

describe('cli export --out and --progress', () => {
  const setup = () => {
    const cwd = tmp();
    run(['init', '--name', 'Demo'], cwd);
    run(['brand', 'add', 'Acme', '--locked'], cwd);
    const r = run(
      [
        'lock',
        '--brand',
        'acme',
        '--symbol',
        join(__dirname, 'fixtures', 'marks', 'orbit.svg'),
        '--primary',
        '#7a3cf0',
      ],
      cwd,
    );
    expect(r.status, r.stderr).toBe(0);
    return { cwd, brandDir: join(cwd, 'brand', 'brands', 'acme') };
  };

  it('writes the kit to --out and leaves the default exports folder absent', () => {
    const { cwd, brandDir } = setup();
    const r = run(['export', '--brand', 'acme', '--only', 'tokens', '--out', 'kit'], cwd);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(cwd, 'kit', 'asset-manifest.json'))).toBe(true);
    expect(existsSync(join(brandDir, 'exports'))).toBe(false);
    expect(JSON.parse(r.stdout).outDir).toBe(join(realpathSync(cwd), 'kit'));
  });

  it('prints one progress line per group on stderr and a single JSON result on stdout', () => {
    const { cwd } = setup();
    const r = run(['export', '--brand', 'acme', '--only', 'tokens,guidelines', '--progress'], cwd);
    expect(r.status, r.stderr).toBe(0);
    const lines = r.stderr
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l).progress);
    expect(lines.map((p) => p.group)).toEqual(['tokens', 'guidelines']);
    expect(lines[0]).toMatchObject({ done: 1, total: 2 });
    expect(lines[0].files).toBeGreaterThan(0);
    expect(lines.at(-1).done).toBe(lines.at(-1).total);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  });

  it('refuses unsafe --out targets', () => {
    const { cwd, brandDir } = setup();
    const root = join(cwd, 'brand');
    const final = join(brandDir, 'final');
    const finalBefore = readdirSync(final).sort();
    const full = join(cwd, 'full');
    mkdirSync(full);
    writeFileSync(join(full, 'precious.txt'), 'keep');
    const plain = join(cwd, 'plain'); // non-empty, no manifest
    mkdirSync(plain);
    writeFileSync(join(plain, 'a.txt'), 'keep');
    symlinkSync(final, join(cwd, 'link-to-final'));
    const bad: string[][] = [
      [full],
      [final],
      [join(final, 'sub')],
      [join(brandDir)],
      [root],
      [cwd],
      [join(cwd, '..')],
      ['/'],
      [join(cwd, 'link-to-final')],
      [join(cwd, 'link-to-final', 'x')],
      [join(brandDir, 'FINAL', 'sub')],
      [''],
      [plain, '--clean'],
      [full, '--clean'],
      [`${root}/../brand`],
    ];
    for (const [out, ...extra] of bad) {
      const r = run(['export', '--brand', 'acme', '--only', 'tokens', '--out', out!, ...extra], cwd);
      expect(r.status, `${out} ${extra}`).toBe(64);
      expect(JSON.parse(r.stderr).error.code, `${out} ${extra}`).toBe('USAGE');
    }
    expect(readFileSync(join(full, 'precious.txt'), 'utf8')).toBe('keep');
    expect(readFileSync(join(plain, 'a.txt'), 'utf8')).toBe('keep');
    expect(readdirSync(final).sort()).toEqual(finalBefore);
    expect(existsSync(join(final, 'asset-manifest.json'))).toBe(false);
  });

  it('--clean with --out replaces only a folder Markilo made', () => {
    const { cwd } = setup();
    const out = join(cwd, 'kit');
    expect(run(['export', '--brand', 'acme', '--only', 'tokens', '--out', out], cwd).status).toBe(0);
    writeFileSync(join(out, 'stale.txt'), 'old');
    const again = run(['export', '--brand', 'acme', '--only', 'tokens', '--out', out], cwd);
    expect(JSON.parse(again.stderr).error.code).toBe('USAGE');
    const r = run(['export', '--brand', 'acme', '--only', 'tokens', '--out', out, '--clean'], cwd);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(out, 'stale.txt'))).toBe(false);
    expect(existsSync(join(out, 'asset-manifest.json'))).toBe(true);
  });

  it('validates before deleting: a bogus group with --clean leaves the folder intact', () => {
    const { cwd } = setup();
    const out = join(cwd, 'k2');
    expect(run(['export', '--brand', 'acme', '--only', 'tokens', '--out', out], cwd).status).toBe(0);
    const r = run(['export', '--brand', 'acme', '--only', 'bogus', '--out', out, '--clean'], cwd);
    expect(JSON.parse(r.stderr).error.code).toBe('USAGE');
    expect(existsSync(join(out, 'asset-manifest.json'))).toBe(true);
  });
});

describe('small fixes found in use (bundled)', () => {
  it('lists title, direction, rationale and the palette options in the concept update usage', () => {
    const cwd = tmp();
    const out = run(['concept', 'update', '--help'], cwd).stdout.split('\n')[0]!;
    for (const flag of ['--title', '--direction', '--rationale', '--primary', '--secondary', '--accent'])
      expect(out).toContain(flag);
  });

  it('says in finalize --accept-risk that no competitor marks were compared when there are no references', () => {
    const cwd = tmp();
    const ok = (args: string[]) => {
      const r = run(args, cwd);
      expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
      return JSON.parse(r.stdout);
    };
    ok(['init', '--name', 'Demo']);
    ok(['brand', 'add', 'Tidepool']);
    ok([
      'concept',
      'new',
      '--brand',
      'tidepool',
      '--id',
      'p1',
      '--title',
      'One',
      '--direction',
      'd',
      '--rationale',
      'r',
      '--semantics',
      'a',
      '--primary',
      '#1d4e89',
      '--round',
      '1',
    ]);
    const dir = join(cwd, 'brand', 'brands', 'tidepool', 'concepts', 'p1');
    writeFileSync(
      join(dir, 'symbol.svg'),
      readFileSync(fixture('marks/fold-n.svg'), 'utf8').replace(/#[0-9a-f]{6}/gi, '#1d4e89'),
    );
    ok(['concept', 'update', '--brand', 'tidepool', '--concept', 'p1', '--symbol', 'symbol.svg']);
    ok(['verify', '--brand', 'tidepool', '--concept', 'p1']);
    const r = ok([
      'finalize',
      '--brand',
      'tidepool',
      '--concept',
      'p1',
      '--user-choice',
      'This one',
      '--accept-risk',
    ]);
    expect(r.kit.originality.verdict).toBe('insufficient-evidence');
    expect(r.kit.originality.note).toBe(
      "No competitor marks were compared, so this verdict says nothing about similarity. Run research (with the user's OK to use the network) before relying on the mark.",
    );
  }, 60_000);
});

describe('cli frictions', () => {
  const setup = () => {
    const cwd = tmp();
    const ok = (args: string[]) => {
      const r = run(args, cwd);
      expect(r.status, `${args.join(' ')}: ${r.stderr}`).toBe(0);
      return JSON.parse(r.stdout);
    };
    ok(['init', '--name', 'Demo']);
    ok(['brand', 'add', 'Tidepool']);
    return { cwd, ok };
  };
  it('answers amend, batch, and compact write results', () => {
    const { cwd, ok } = setup();
    const a = ok(['answers', '--brand', 'tidepool', '--question', 'Who is it for?', '--answer', 'Divers']);
    expect(a.count).toBe(1);
    expect(a.recorded[0]).toMatchObject({ id: 'Q1', answer: 'Divers' });
    expect(a.questions).toBeUndefined();
    const m = ok(['answers', '--brand', 'tidepool', '--amend', 'Q1', '--answer', 'Snorkellers']);
    expect(m.recorded[0]).toMatchObject({ id: 'Q1', answer: 'Snorkellers' });
    writeFileSync(
      join(cwd, 'batch.json'),
      JSON.stringify([
        { question: 'Colours?', answer: 'Blue' },
        { question: 'Tone?', answer: 'Calm' },
      ]),
    );
    expect(ok(['answers', '--brand', 'tidepool', '--file', 'batch.json']).count).toBe(2);
    const all = ok(['answers', '--brand', 'tidepool']);
    expect(all.questions.map((q: { id: string; answer: string }) => `${q.id}:${q.answer}`)).toEqual([
      'Q1:Snorkellers',
      'Q2:Blue',
      'Q3:Calm',
    ]);
    expect(run(['answers', '--brand', 'tidepool', '--amend', 'Q9', '--answer', 'x'], cwd).status).not.toBe(0);
    const both = run(
      ['answers', '--brand', 'tidepool', '--amend', 'Q1', '--question', 'New?', '--answer', 'x'],
      cwd,
    );
    expect(both.status).not.toBe(0);
    expect(both.stderr).toContain('INVALID_INPUT');
    expect(ok(['answers', '--brand', 'tidepool']).questions).toHaveLength(3);
    writeFileSync(join(cwd, 'bad.json'), '{"question":"x"}');
    const bad = run(['answers', '--brand', 'tidepool', '--file', 'bad.json'], cwd);
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).toContain('INVALID_INPUT');
  }, 60_000);
  it('concept update sets semantics and prints a compact result unless --show', () => {
    const { ok } = setup();
    ok([
      'concept',
      'new',
      '--brand',
      'tidepool',
      '--id',
      'p1',
      '--title',
      'One',
      '--direction',
      'd',
      '--rationale',
      'r',
      '--semantics',
      'a',
      '--primary',
      '#1d4e89',
      '--round',
      '1',
    ]);
    const set = ['concept', 'update', '--brand', 'tidepool', '--concept', 'p1'];
    const r = ok([...set, '--semantics', 'tide; pool']);
    expect(r).toMatchObject({ id: 'p1', status: 'draft', changed: ['semantics'] });
    expect(r.palette).toBeUndefined();
    const s = ok([...set, '--primary', '#112233', '--show']);
    expect(s.palette.primary).toBe('#112233');
    expect(s.semantics).toEqual(['tide', 'pool']);
    expect(ok([...set, '--primary', '#112233']).changed).toEqual([]);
  }, 60_000);
  it('brand update renames the display name, and reference update changes the category', () => {
    const { cwd, ok } = setup();
    const r = ok(['brand', 'update', '--brand', 'tidepool', '--name', 'TIDEPOOL']);
    expect(r).toMatchObject({ brand: 'tidepool', name: 'TIDEPOOL', was: 'Tidepool' });
    expect(ok(['brand', 'list']).brands.map((b: { name: string }) => b.name)).toContain('TIDEPOOL');
    expect(ok(['brief', 'show', '--brand', 'tidepool']).name).toBe('TIDEPOOL');
    copyFileSync(fixture('marks/fold-n.svg'), join(cwd, 'm.svg'));
    const added = ok([
      'reference',
      'add',
      '--brand',
      'tidepool',
      '--file',
      'm.svg',
      '--name',
      'Acme',
      '--source',
      'note',
      '--notes',
      'first',
    ]);
    const up = ok([
      'reference',
      'update',
      '--brand',
      'tidepool',
      '--id',
      added.added,
      '--category',
      'inspiration',
      '--notes',
      'likes the fold',
    ]);
    expect(up).toMatchObject({ category: 'inspiration', was: 'direct' });
    expect(up.notes).toContain('likes the fold');
    expect(up.notes).toContain('sha256:');
    const bad = run(
      ['reference', 'update', '--brand', 'tidepool', '--id', added.added, '--category', 'nope'],
      cwd,
    );
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).toContain('INVALID_INPUT');
  }, 60_000);
  it('name risk carries the reasons that produced it', () => {
    const { cwd, ok } = setup();
    ok([
      'concept',
      'new',
      '--brand',
      'tidepool',
      '--id',
      'p1',
      '--title',
      'One',
      '--direction',
      'd',
      '--rationale',
      'r',
      '--semantics',
      'a',
      '--primary',
      '#1d4e89',
      '--round',
      '1',
    ]);
    copyFileSync(
      fixture('marks/fold-n.svg'),
      join(cwd, 'brand', 'brands', 'tidepool', 'concepts', 'p1', 'symbol.svg'),
    );
    ok(['concept', 'update', '--brand', 'tidepool', '--concept', 'p1', '--symbol', 'symbol.svg']);
    const o = ok(['originality', '--brand', 'tidepool', '--concept', 'p1', '--names', 'Tidepoll']);
    expect(o.nameRisk).not.toBe('low');
    expect(o.nameRiskReasons.length).toBeGreaterThan(0);
    expect(
      ok(['verify', '--brand', 'tidepool', '--concept', 'p1']).originality.nameRiskReasons,
    ).toBeDefined();
  }, 60_000);
});

describe('research app (stubbed network)', () => {
  it('research app hints at --as-reference', async () => {
    const dir = tmp();
    const base = ['--workspace', join(dir, 'brand')];
    expect(run(['init', '--name', 'Demo', ...base], dir).status).toBe(0);
    expect(run(['brand', 'add', 'Tidepool', ...base], dir).status).toBe(0);
    const go = async (extra: string[]) => {
      const f = findCommand(['research', 'app'])!;
      const argv = ['123456789', '--brand', 'tidepool', '--allow-network', ...base, ...extra];
      return (await f.spec.run(parseCommand(f.spec, argv, dir))) as { hint?: string; reference: unknown };
    };
    const r = await go(['--competitor']);
    expect(r.reference).toBeNull();
    expect(r.hint).toBe(
      'nothing stored as a reference — add --as-reference to keep the icon for similarity checks',
    );
    expect((await go([])).hint).toBeUndefined();
  });
});
