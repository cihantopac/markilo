import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Workspace } from '../src/core/workspace.js';
import { parseFeedback, storeFeedback } from '../src/gallery/feedback.js';
import { costSummary, DEFAULT_BUDGET_USD } from '../src/report/cost.js';
import { fixture, tmp } from './helpers.js';

const bin = join(__dirname, '..', 'plugin', 'dist', 'markilo.mjs');
const run = (args: string[], cwd: string) =>
  spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });
const ok = (args: string[], cwd: string) => {
  const r = run(args, cwd);
  if (r.status !== 0) throw new Error(`${args.join(' ')}: ${r.stderr}`);
  return JSON.parse(r.stdout);
};

/** A workspace with brand "Tidepool" and `n` proposals in round 1, each with a symbol and a wordmark. */
function proposals(n: number, names?: string[]) {
  const cwd = tmp();
  ok(['init', '--name', 'Demo'], cwd);
  ok(['brand', 'add', 'Tidepool'], cwd);
  for (let i = 1; i <= n; i++) {
    const id = names?.[i - 1] ?? `p${i}`;
    ok(
      [
        'concept',
        'new',
        '--brand',
        'tidepool',
        '--id',
        id,
        '--title',
        `Proposal ${i}`,
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
        ...(i === 1 ? ['--lead', 'wordmark'] : []),
      ],
      cwd,
    );
    const dir = join(cwd, 'brand', 'brands', 'tidepool', 'concepts', id);
    copyFileSync(fixture('marks/fold-n.svg'), join(dir, 'symbol.svg'));
    ok(
      [
        'wordmark',
        '--text',
        'tidepool',
        '--font',
        'fraunces',
        '--weight',
        '600',
        '-o',
        join(dir, 'wordmark.svg'),
      ],
      cwd,
    );
    ok(['concept', 'update', '--brand', 'tidepool', '--concept', id, '--wordmark', 'wordmark.svg'], cwd);
  }
  return cwd;
}

describe('exploration rounds', () => {
  it('a one-proposal round still writes its board', () => {
    const cwd = proposals(1);
    const r = ok(['proposals', '--brand', 'tidepool'], cwd);
    expect(r.board).toBeTruthy();
    expect(existsSync(r.board)).toBe(true);
  }, 60_000);
  it('letters follow creation order, not ids', () => {
    const cwd = proposals(3, ['zeta', 'alpha', 'mid']);
    const shown = (id: string) =>
      ok(['concept', 'show', '--brand', 'tidepool', '--concept', id], cwd) as { letter?: string };
    expect(['zeta', 'alpha', 'mid'].map((id) => shown(id).letter)).toEqual(['A', 'B', 'C']);
    const r = ok(['proposals', '--brand', 'tidepool'], cwd);
    expect(r.proposals).toEqual(['zeta', 'alpha', 'mid']);
    expect(r.order.map((o: { letter: string; id: string }) => `${o.letter}:${o.id}`)).toEqual([
      'A:zeta',
      'B:alpha',
      'C:mid',
    ]);
    expect(r.orderNote).toBeUndefined(); // letters from 1.4: no note
    expect(r.order[0]).toEqual({ letter: 'A', id: 'zeta', title: 'Proposal 1', status: 'draft' });
  });

  it('a single proposal keeps its letter', () => {
    const cwd = proposals(3, ['zeta', 'alpha', 'mid']);
    const r = ok(['proposals', '--brand', 'tidepool', '--concepts', 'mid'], cwd);
    expect(r.order).toEqual([{ letter: 'C', id: 'mid', title: 'Proposal 3', status: 'draft' }]);
    const png = readFileSync(r.files[0]);
    expect(png.length).toBeGreaterThan(1000);
  });

  it('a 1.3.0 round without letters orders by creation time', async () => {
    const { Workspace } = await import('../src/core/workspace.js');
    const { roundOrder } = await import('../src/design/rounds.js');
    const cwd = proposals(3, ['zeta', 'alpha', 'mid']);
    const w = Workspace.locate(cwd);
    for (const [i, id] of ['zeta', 'alpha', 'mid'].entries()) {
      const c = w.concept('tidepool', id);
      delete c.letter;
      c.createdAt = `2026-01-0${i + 1}T00:00:00.000Z`;
      w.saveConcept(c);
    }
    expect(roundOrder(w.concepts('tidepool')).map((c) => c.id)).toEqual(['zeta', 'alpha', 'mid']);
    const r = ok(['proposals', '--brand', 'tidepool'], cwd);
    expect(r.order.map((o: { letter: string }) => o.letter)).toEqual(['A', 'B', 'C']);
    expect(r.proposals).toEqual(['zeta', 'alpha', 'mid']);
    // A concept without a letter, shown alone, takes its position in its round.
    const one = ok(['proposals', '--brand', 'tidepool', '--concepts', 'mid'], cwd);
    expect(one.order[0].letter).toBe('C');
  });

  it('extending a 1.3.0 round gives distinct letters, and proposals says the order changed', () => {
    const cwd = proposals(2, ['zeta', 'alpha']);
    const w = Workspace.locate(cwd);
    for (const [i, id] of ['zeta', 'alpha'].entries()) {
      const c = w.concept('tidepool', id);
      delete c.letter;
      c.createdAt = `2026-01-0${i + 1}T00:00:00.000Z`;
      w.saveConcept(c);
    }
    ok(
      [
        'concept',
        'new',
        '--brand',
        'tidepool',
        '--id',
        'aaa',
        '--title',
        'x',
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
      ],
      cwd,
    );
    copyFileSync(
      fixture('marks/fold-n.svg'),
      join(cwd, 'brand', 'brands', 'tidepool', 'concepts', 'aaa', 'symbol.svg'),
    );
    const r = ok(['proposals', '--brand', 'tidepool'], cwd);
    expect(r.order.map((o: { letter: string; id: string }) => `${o.letter}:${o.id}`)).toEqual([
      'A:zeta',
      'B:alpha',
      'C:aaa',
    ]);
    expect(r.orderNote).toMatch(/not their ids/);
    // The gallery shows the same order: A, B, C.
    const html = readFileSync(ok(['gallery'], cwd).gallery, 'utf8');
    const cards = [...html.matchAll(/<span class="letter">([A-Z]+)<\/span>([^<]*)<\/h3>/g)].map(
      (m) => `${m[1]}:${m[2]}`,
    );
    expect(cards).toEqual(['A:Proposal 1', 'B:Proposal 2', 'C:x']);
    // Old concepts keep the letters they showed; the new one took the free one.
    expect(Workspace.locate(cwd).concept('tidepool', 'aaa').letter).toBe('C');
  });

  it('allows three proposals per round, no skipped round, and a third round only on the user’s direction', () => {
    const cwd = proposals(3);
    const base = [
      'concept',
      'new',
      '--brand',
      'tidepool',
      '--title',
      'x',
      '--direction',
      'd',
      '--rationale',
      'r',
      '--semantics',
      'a',
      '--primary',
      '#1d4e89',
    ];
    const full = run([...base, '--id', 'p4', '--round', '1'], cwd);
    expect(full.status).not.toBe(0);
    expect(JSON.parse(full.stderr).error.message).toMatch(/already has 3 proposals/);
    expect(JSON.parse(run([...base, '--id', 'skip', '--round', '3'], cwd).stderr).error.message).toMatch(
      /skip/,
    );
    for (const id of ['q1', 'q2', 'q3']) ok([...base, '--id', id, '--round', '2'], cwd);
    const third = run([...base, '--id', 'r1', '--round', '3'], cwd);
    expect(JSON.parse(third.stderr).error.hint).toMatch(/--directed/);
    const directed = ok(
      [...base, '--id', 'r1', '--round', '3', '--directed', 'Try a serif, like the old letterhead'],
      cwd,
    );
    expect(directed.concept).toBe('r1');
    // A refinement outside any round is not limited.
    expect(ok([...base, '--id', 'q1-b'], cwd).concept).toBe('q1-b');
  });

  it('renders the round for the user: a proposal card each and the round side by side', () => {
    const cwd = proposals(3);
    ok(
      [
        'concept',
        'update',
        '--brand',
        'tidepool',
        '--concept',
        'p1',
        '--idea',
        'The word as a tide line',
        '--strengths',
        'Reads at 12 px; ownable ligature',
        '--weaknesses',
        'The ligature slows reading',
      ],
      cwd,
    );
    const r = ok(['proposals', '--brand', 'tidepool'], cwd);
    expect(r.round).toBe(1);
    expect(r.proposals).toEqual(['p1', 'p2', 'p3']);
    expect(existsSync(r.board)).toBe(true);
    expect(r.files).toHaveLength(3);
    // The words are Fraunces as set: proposals says so, so the designer keeps designing.
    expect(r.typeset.p1).toBeGreaterThanOrEqual(0.95);
    // The score names what it was measured against.
    expect(r.typesetBase.p1).toEqual({ font: 'fraunces', weight: 600, case: expect.any(String) });
    expect(r.missing.filter((m: string) => m.includes('fraunces 600 as set'))).toHaveLength(3);
    // p2 and p3 have no strengths or weaknesses yet; p1 has its pitch.
    expect(r.missing.filter((m: string) => m.includes('strengths'))).toHaveLength(2);
    const shown = ok(['concept', 'show', '--brand', 'tidepool', '--concept', 'p1'], cwd);
    expect(shown.pitch).toEqual({
      idea: 'The word as a tide line',
      strengths: ['Reads at 12 px', 'ownable ligature'],
      weaknesses: ['The ligature slows reading'],
    });
    const status = ok(['status'], cwd);
    expect(status.brands[0]).toMatchObject({ stage: 'review', round: 1 });
    const html = readFileSync(ok(['gallery'], cwd).gallery, 'utf8');
    expect(html).toContain('Round 1 — three directions');
    expect(html).toContain('data-reject-all');
    expect(html).toContain('The ligature slows reading');
  }, 60_000);

  it('a rejected round is recorded from the gallery and asks for the next round, then for direction', () => {
    const cwd = proposals(3);
    ok(['proposals', '--brand', 'tidepool'], cwd);
    const file = join(cwd, 'decisions.json');
    writeFileSync(
      file,
      JSON.stringify({
        schema: 'markilo/feedback@1',
        decisions: [],
        preferred: null,
        rejectAll: [{ brand: 'tidepool', round: 1, note: 'Too corporate; try something warmer' }],
      }),
    );
    const f = ok(['feedback', '--brand', 'tidepool', '--import', file, '--apply'], cwd);
    expect(f.requests[0]).toBe('reject all of round 1 for tidepool: Too corporate; try something warmer');
    expect(f.applied).toContain('tidepool round 1 → rejected');
    expect(ok(['status'], cwd).brands[0].stage).toBe('next round');
  }, 60_000);
});

describe('the chosen concept', () => {
  it('keeps the drawing the user chose and shows it next to the developed one', () => {
    const cwd = proposals(3);
    ok(['proposals', '--brand', 'tidepool'], cwd);
    const file = join(cwd, 'choice.json');
    writeFileSync(
      file,
      JSON.stringify({
        schema: 'markilo/feedback@1',
        decisions: [
          { brand: 'tidepool', concept: 'p2', decision: 'keep', tags: [], note: 'This one', pins: [] },
        ],
        preferred: null,
      }),
    );
    const f = ok(['feedback', '--brand', 'tidepool', '--import', file, '--apply'], cwd);
    expect(f.applied).toContain('tidepool/p2 → kept as chosen (chosen/)');
    const dir = join(cwd, 'brand', 'brands', 'tidepool', 'concepts', 'p2');
    expect(existsSync(join(dir, 'chosen', 'symbol.svg'))).toBe(true);
    // Unchanged: nothing to compare. Developed: the choice and the current state side by side.
    expect(ok(['proposals', '--brand', 'tidepool', '--concepts', 'p2'], cwd).compare).toBeUndefined();
    copyFileSync(fixture('marks/leaf-letter.svg'), join(dir, 'symbol.svg'));
    const r = ok(['proposals', '--brand', 'tidepool', '--concepts', 'p2'], cwd);
    expect(existsSync(r.compare.p2)).toBe(true);
    // leaf-letter is a different form than what was chosen: the result measures it and warns.
    expect(r.formChange.p2.symbol).toBeLessThan(0.85);
    expect(r.warnings.join('\n')).toMatch(
      /p2: the symbol's form changed from what the user chose \(IoU 0\.\d\d\) — show chosen-vs-now and ask before going on/,
    );
    // A second selection does not overwrite what the user first chose.
    expect(ok(['feedback', '--brand', 'tidepool', '--apply'], cwd).applied).not.toContain(
      'tidepool/p2 → kept as chosen (chosen/)',
    );
  }, 60_000);
});

describe('concept adopt', () => {
  it('adopt copies the drawing and re-pins chosen', () => {
    const cwd = proposals(3);
    const concepts = join(cwd, 'brand', 'brands', 'tidepool', 'concepts');
    copyFileSync(fixture('marks/leaf-letter.svg'), join(concepts, 'p3', 'symbol.svg'));
    ok(['concept', 'update', '--brand', 'tidepool', '--concept', 'p2', '--status', 'shortlisted'], cwd);
    expect(existsSync(join(concepts, 'p2', 'chosen', 'symbol.svg'))).toBe(true);
    const r = ok(
      ['concept', 'adopt', '--brand', 'tidepool', '--concept', 'p2', '--from', 'p3', '--files', 'symbol'],
      cwd,
    );
    expect(r.concept).toBe('p2');
    expect(r.copied).toEqual(['symbol.svg']);
    expect(r.chosen).toContain('symbol.svg');
    const other = readFileSync(join(concepts, 'p3', 'symbol.svg'), 'utf8');
    expect(readFileSync(join(concepts, 'p2', 'symbol.svg'), 'utf8')).toBe(other);
    expect(readFileSync(join(concepts, 'p2', 'chosen', 'symbol.svg'), 'utf8')).toBe(other);
    const saved = JSON.parse(readFileSync(join(concepts, 'p2', 'concept.json'), 'utf8'));
    expect(saved.adoptedFrom).toMatchObject({ concept: 'p3', files: ['symbol'] });
    expect(readFileSync(join(cwd, 'brand', 'brands', 'tidepool', 'decisions.md'), 'utf8')).toMatch(
      /Adopted.*p2.*p3/,
    );
    // The adopted drawing is the user's choice now: nothing drifted yet.
    expect(ok(['proposals', '--brand', 'tidepool', '--concepts', 'p2'], cwd).compare).toBeUndefined();
    expect(existsSync(join(concepts, 'p2', 'review', 'chosen-vs-now.png'))).toBe(false);
    copyFileSync(fixture('marks/fold-n.svg'), join(concepts, 'p2', 'symbol.svg'));
    expect(existsSync(ok(['proposals', '--brand', 'tidepool', '--concepts', 'p2'], cwd).compare.p2)).toBe(
      true,
    );
  }, 60_000);
  it('adopt marks a review recorded without its drawing as stale', () => {
    const cwd = proposals(2);
    const concepts = join(cwd, 'brand', 'brands', 'tidepool', 'concepts');
    copyFileSync(fixture('marks/leaf-letter.svg'), join(concepts, 'p2', 'symbol.svg'));
    const json = join(concepts, 'p1', 'concept.json');
    const c = JSON.parse(readFileSync(json, 'utf8'));
    delete c.reviewedArt;
    c.judgment = Object.fromEntries(
      ['distinctiveness', 'memorability', 'legibility', 'craft', 'brandFit'].map((k) => [
        k,
        { score: 9, note: 'ok' },
      ]),
    );
    writeFileSync(json, JSON.stringify(c));
    ok(
      ['concept', 'adopt', '--brand', 'tidepool', '--concept', 'p1', '--from', 'p2', '--files', 'symbol'],
      cwd,
    );
    const shown = ok(['concept', 'show', '--brand', 'tidepool', '--concept', 'p1'], cwd);
    expect(shown.gate.status).toBe('stale');
  }, 60_000);
  it('adopt refuses an approved concept and an unknown --from', () => {
    const cwd = proposals(2);
    const adopt = (id: string, from: string) =>
      run(['concept', 'adopt', '--brand', 'tidepool', '--concept', id, '--from', from], cwd);
    const unknown = adopt('p1', 'p9');
    expect(unknown.status).not.toBe(0);
    expect(JSON.parse(unknown.stderr).error.code).toBe('NOT_FOUND');
    const same = adopt('p1', 'p1');
    expect(JSON.parse(same.stderr).error.code).toBe('USAGE');
    const bad = run(
      ['concept', 'adopt', '--brand', 'tidepool', '--concept', 'p1', '--from', 'p2', '--files', 'logo'],
      cwd,
    );
    expect(JSON.parse(bad.stderr).error.code).toBe('INVALID_INPUT');
    const json = join(cwd, 'brand', 'brands', 'tidepool', 'concepts', 'p1', 'concept.json');
    writeFileSync(json, JSON.stringify({ ...JSON.parse(readFileSync(json, 'utf8')), status: 'approved' }));
    const locked = adopt('p1', 'p2');
    expect(locked.status).not.toBe(0);
    expect(JSON.parse(locked.stderr).error.code).toBe('LOCKED');
  }, 60_000);
});

describe('wordmark-led kits', () => {
  it('export the word itself as the primary logo, not a symbol + word lockup', () => {
    const cwd = proposals(3);
    ok(['verify', '--brand', 'tidepool', '--concept', 'p1'], cwd);
    ok(
      ['finalize', '--brand', 'tidepool', '--concept', 'p1', '--user-choice', 'This one', '--accept-risk'],
      cwd,
    );
    ok(['export', '--brand', 'tidepool', '--only', 'logos'], cwd);
    const exports = join(cwd, 'brand', 'brands', 'tidepool', 'exports');
    const manifest = JSON.parse(readFileSync(join(exports, 'asset-manifest.json'), 'utf8'));
    const primary = manifest.assets.find(
      (a: { path: string }) => a.path === 'logos/primary/primary-color.svg',
    );
    expect(primary.derivedFrom).toBe('wordmark.svg');
    // The lockups still exist for places that want the icon beside the word.
    expect(existsSync(join(exports, 'logos', 'secondary', 'secondary-color.svg'))).toBe(true);
    // The appmark is named for assistive technology like the other masters.
    expect(readFileSync(join(exports, 'logos', 'appmark', 'appmark.svg'), 'utf8')).toMatch(
      /<title>[^<]+<\/title>/,
    );
  }, 120_000);
});

describe('typeset likeness', () => {
  it('tells a typeface as set from a word with a treatment through its letters', async () => {
    const { typesetLikeness } = await import('../src/analyze/typeset.js');
    const cwd = tmp();
    const plain = join(cwd, 'plain.svg');
    ok(
      [
        'wordmark',
        '--text',
        'tidepool',
        '--font',
        'sora',
        '--weight',
        '600',
        '--tracking',
        '15',
        '-o',
        plain,
      ],
      cwd,
    );
    const spec = join(cwd, 'cut.json');
    writeFileSync(
      spec,
      JSON.stringify({
        role: 'wordmark',
        layers: [
          {
            fill: '#111111',
            shape: {
              subtract: [
                {
                  glyph: {
                    text: 'tidepool',
                    font: 'sora',
                    weight: 600,
                    height: 180,
                    at: [20, 300],
                    tracking: 10,
                  },
                },
                { rect: { x: 0, y: 230, w: 1400, h: 14, rotate: -12 } },
              ],
            },
          },
        ],
      }),
    );
    ok(['construct', spec, '-o', join(cwd, 'cut.svg')], cwd);
    const font = { id: 'sora', weight: 600 };
    const untouched = await typesetLikeness(readFileSync(plain, 'utf8'), font, 'Tidepool');
    const cut = await typesetLikeness(readFileSync(join(cwd, 'cut.svg'), 'utf8'), font, 'Tidepool');
    expect(untouched!.likeness).toBeGreaterThanOrEqual(0.98);
    expect(cut!.likeness).toBeLessThan(0.92);
    expect(
      (await typesetLikeness(readFileSync(plain, 'utf8'), { id: 'fraunces', weight: 600 }, 'Tidepool'))!
        .likeness,
    ).toBeLessThan(0.7);
  }, 60_000);
});

describe('icon container', () => {
  it('flags an icon drawn on its own tile, not a free-standing mark', async () => {
    const { carriesTile } = await import('../src/analyze/typeset.js');
    const tiled =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path fill="#0b7285" fill-rule="evenodd" d="M247 32H777C896 32 992 128 992 247V777C992 896 896 992 777 992H247C128 992 32 896 32 777V247C32 128 128 32 247 32ZM432 176H292V648H432Z"/></svg>';
    expect(await carriesTile(tiled)).toBe(true);
    expect(await carriesTile(readFileSync(fixture('marks/fold-n.svg'), 'utf8'))).toBe(false);
  });
});

describe('feedback from the gallery', () => {
  it('keeps only valid round rejections and turns combinations and selections into requests', () => {
    const f = parseFeedback({
      schema: 'markilo/feedback@1',
      decisions: [
        {
          brand: 'tidepool',
          concept: 'p1',
          decision: 'keep',
          tags: ['combine with another'],
          note: 'its type',
          pins: [],
        },
        {
          brand: 'tidepool',
          concept: 'p2',
          decision: null,
          tags: ['combine with another'],
          note: 'its icon',
          pins: [],
        },
      ],
      preferred: null,
      rejectAll: [
        { brand: 'tidepool', round: 2, note: 'none of these' },
        { brand: '../etc', round: 1, note: 'x' },
        { brand: 'tidepool', round: 0.5, note: 'x' },
      ],
    });
    expect(f.rejectAll).toEqual([{ brand: 'tidepool', round: 2, note: 'none of these' }]);
    const dir = tmp();
    expect(storeFeedback({ root: dir } as never, f)).toContain('latest.json');
  });
});

describe('cost tracking', () => {
  it('sums phases, estimates tokens, prefers measured dollars and stops at the budget', () => {
    const log = {
      schema: 'markilo/cost@1' as const,
      budgetUsd: DEFAULT_BUDGET_USD,
      entries: [
        { phase: 'understand' as const, at: '', tokens: 1_000_000, minutes: 2 },
        { phase: 'explore' as const, at: '', usd: 2.5, minutes: 9 },
      ],
    };
    const s = costSummary(log);
    expect(s.totalUsd).toBe(3.1);
    expect(s.status).toBe('ok');
    expect(s.phases.map((p) => [p.phase, p.usd, p.estimated])).toEqual([
      ['understand', 0.6, true],
      ['explore', 2.5, false],
    ]);
    expect(costSummary({ ...log, budgetUsd: 3.5 }).status).toBe('warn');
    const over = costSummary({ ...log, budgetUsd: 3 });
    expect(over.status).toBe('over');
    expect(over.next).toMatch(/stop paid work/);
  });

  it('records phases and the budget from the CLI', () => {
    const cwd = tmp();
    ok(['init', '--name', 'Demo'], cwd);
    ok(['brand', 'add', 'Tidepool'], cwd);
    ok(['cost', '--brand', 'tidepool', '--budget', '4'], cwd);
    const r = ok(
      ['cost', '--brand', 'tidepool', '--phase', 'explore', '--tokens', '6000000', '--minutes', '12'],
      cwd,
    );
    expect(r).toMatchObject({ budgetUsd: 4, totalUsd: 3.6, status: 'warn', estimated: true });
    expect(
      JSON.parse(run(['cost', '--brand', 'tidepool', '--phase', 'dreaming', '--usd', '1'], cwd).stderr).error
        .code,
    ).toBe('USAGE');
  });
});

describe('round letters under concurrency', () => {
  const newArgs = (id: string) => [
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
    '--round',
    '1',
  ];

  it('parallel concept new gets distinct letters', async () => {
    const { spawn } = await import('node:child_process');
    const cwd = proposals(0);
    const exits = await Promise.all(
      ['p1', 'p2', 'p3'].map(
        (id) =>
          new Promise<number | null>((done) => {
            const child = spawn(process.execPath, [bin, ...newArgs(id)], { cwd, stdio: 'ignore' });
            child.on('close', done);
          }),
      ),
    );
    expect(exits).toEqual([0, 0, 0]);
    const w = Workspace.locate(cwd);
    const letters = ['p1', 'p2', 'p3'].map((id) => w.concept('tidepool', id).letter);
    expect([...letters].sort()).toEqual(['A', 'B', 'C']);
    expect(existsSync(join(cwd, 'brand', 'brands', 'tidepool', '.lock'))).toBe(false);
  });

  it('a stored duplicate letter is shown once', () => {
    const cwd = proposals(2, ['first', 'second']);
    const w = Workspace.locate(cwd);
    const a = w.concept('tidepool', 'first');
    const b = w.concept('tidepool', 'second');
    a.createdAt = '2026-01-01T00:00:00.000Z';
    b.createdAt = '2026-01-02T00:00:00.000Z';
    a.letter = 'A';
    b.letter = 'A';
    w.saveConcept(a);
    w.saveConcept(b);
    const r = ok(['proposals', '--brand', 'tidepool'], cwd);
    expect(r.order.map((o: { letter: string; id: string }) => `${o.letter}:${o.id}`)).toEqual([
      'A:first',
      'B:second',
    ]);
    expect(r.letterConflicts).toEqual([{ id: 'second', stored: 'A', shown: 'B' }]);
    expect(r.notes.join(' ')).toContain('second is shown as B');
    // Keeping the shown letter makes the conflict go away; a taken letter is refused.
    expect(
      run(['concept', 'update', '--brand', 'tidepool', '--concept', 'second', '--letter', 'A'], cwd).status,
    ).not.toBe(0);
    ok(['concept', 'update', '--brand', 'tidepool', '--concept', 'second', '--letter', 'B'], cwd);
    expect(ok(['proposals', '--brand', 'tidepool'], cwd).letterConflicts).toBeUndefined();
  });

  it('--letter is checked against the whole round', () => {
    const cwd = proposals(2, ['first', 'second']);
    const w = Workspace.locate(cwd);
    const a = w.concept('tidepool', 'first');
    const b = w.concept('tidepool', 'second');
    a.createdAt = '2026-01-01T00:00:00.000Z';
    b.createdAt = '2026-01-02T00:00:00.000Z';
    delete a.letter; // written by 1.3.0: no letter of its own
    b.letter = 'A';
    w.saveConcept(a);
    w.saveConcept(b);
    // The earlier concept may take A (the later one then moves on); the later one may not take what the earlier shows.
    ok(['concept', 'update', '--brand', 'tidepool', '--concept', 'first', '--letter', 'A'], cwd);
    expect(w.concept('tidepool', 'first').letter).toBe('A');
    const r = run(['concept', 'update', '--brand', 'tidepool', '--concept', 'second', '--letter', 'A'], cwd);
    expect(r.status).not.toBe(0);
    expect(existsSync(join(cwd, 'brand', 'brands', 'tidepool', '.lock'))).toBe(false);
  });

  it('a stale lock is replaced', () => {
    const cwd = proposals(0);
    const lock = join(cwd, 'brand', 'brands', 'tidepool', '.lock');
    writeFileSync(lock, '');
    const old = new Date(Date.now() - 60_000);
    utimesSync(lock, old, old);
    ok(newArgs('p1'), cwd);
    expect(Workspace.locate(cwd).concept('tidepool', 'p1').letter).toBe('A');
    expect(existsSync(lock)).toBe(false);
  });
});
