import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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
function proposals(n: number) {
  const cwd = tmp();
  ok(['init', '--name', 'Demo'], cwd);
  ok(['brand', 'add', 'Tidepool'], cwd);
  for (let i = 1; i <= n; i++) {
    const id = `p${i}`;
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

describe('typeset likeness', () => {
  it('tells a typeface as set from a word with a treatment through its letters', async () => {
    const { typesetLikeness } = await import('../src/analyze/typeset.js');
    const cwd = tmp();
    const plain = join(cwd, 'plain.svg');
    ok(
      [
        'wordmark',
        '--text',
        'relivaro',
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
                    text: 'relivaro',
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
    const untouched = await typesetLikeness(readFileSync(plain, 'utf8'), font, 'Relivaro');
    const cut = await typesetLikeness(readFileSync(join(cwd, 'cut.svg'), 'utf8'), font, 'Relivaro');
    expect(untouched!.likeness).toBeGreaterThanOrEqual(0.98);
    expect(cut!.likeness).toBeLessThan(0.92);
    expect(
      (await typesetLikeness(readFileSync(plain, 'utf8'), { id: 'fraunces', weight: 600 }, 'Relivaro'))!
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
