import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Concept } from '../src/core/types.js';
import { validateBrief } from '../src/core/validate.js';
import { finalizeConcept } from '../src/export/kit.js';
import { criterionOf, gateOf, requireCriterion } from '../src/report/gate.js';
import { verifyConcept } from '../src/report/quality.js';
import { synthBrand, tmp } from './helpers.js';

const bin = join(__dirname, '..', 'plugin', 'dist', 'markilo.mjs');
const run = (args: string[], cwd: string) =>
  spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });

const scored = (scores: Record<string, number>, present?: boolean): Concept =>
  ({
    judgment: Object.fromEntries(Object.entries(scores).map(([k, s]) => [k, { score: s, rationale: 'r' }])),
    ...(present === undefined
      ? {}
      : { critique: { present, reason: 'because', at: '2026-01-01T00:00:00Z' } }),
  }) as Concept;

describe('quality gate', () => {
  const strong = { 'brand-fit': 7, distinctiveness: 7, memorability: 7, craft: 6 };
  it('passes only with the required scores, the average and a yes', () => {
    expect(gateOf(scored(strong, true))).toMatchObject({ status: 'passed', average: 6.75, reasons: [] });
    expect(gateOf(scored(strong, false)).status).toBe('failed');
    expect(gateOf(scored(strong)).reasons.join(' ')).toMatch(/present it as is/);
    const weak = gateOf(scored({ ...strong, distinctiveness: 5 }, true));
    expect(weak.status).toBe('failed');
    expect(weak.reasons.join(' ')).toMatch(/distinctiveness 5/);
    expect(gateOf(scored({ 'brand-fit': 6, distinctiveness: 6, memorability: 6 }, true)).reasons).toEqual([
      'average 6 < 6.5',
    ]);
    expect(gateOf({} as Concept).status).toBe('not-reviewed');
    // A near miss: only the average is short and the critic would present it — one targeted round, same bar.
    const near = gateOf(scored({ 'brand-fit': 7, distinctiveness: 6, memorability: 6, craft: 6 }, true));
    expect(near).toMatchObject({ status: 'failed', nearMiss: true });
    expect(gateOf(scored({ ...strong, distinctiveness: 5 }, true)).nearMiss).toBeUndefined();
    expect(
      gateOf(scored({ 'brand-fit': 7, distinctiveness: 6, memorability: 6, craft: 6 }, false)).nearMiss,
    ).toBeUndefined();
  });

  it('gates on the blind scores when the critic recorded them', () => {
    const blind = (d: number, m: number, fit: number, present: boolean) =>
      ({
        ...scored({ 'brand-fit': 4, distinctiveness: 4, memorability: 4 }, present),
        blind: {
          scores: { distinctiveness: d, memorability: m, 'brand-fit': fit, craft: 6, versatility: 6 },
          at: '2026-01-01T00:00:00Z',
        },
      }) as Concept;
    // The informed scores are low, but the gate reads the blind ones (they predict an independent judge better).
    expect(gateOf(blind(7, 7, 8, true))).toMatchObject({ status: 'passed', basis: 'blind' });
    expect(gateOf(blind(6, 5, 7, true)).reasons.join(' ')).toMatch(/memorability 5 < 6 \(blind\)/);
    expect(gateOf(blind(7, 7, 7, false)).status).toBe('failed');
    expect(gateOf(scored({ 'brand-fit': 7, distinctiveness: 7, memorability: 7 }, true)).basis).toBe(
      'informed',
    );
  });

  it('decides a first look on the edge of the bar by the majority of three cold looks', () => {
    const at = '2026-01-01T00:00:00Z';
    const scores = (n: number) => ({
      distinctiveness: n,
      memorability: n,
      'brand-fit': n,
      craft: 6,
      versatility: 6,
    });
    const concept = (first: number, present: boolean, looks: [number, boolean][] = []) =>
      ({
        critique: { present, reason: 'because', at },
        blind: { scores: scores(first), at },
        looks: looks.map(([n, p]) => ({ scores: scores(n), present: p, reason: 'cold', at })),
      }) as unknown as Concept;
    // Every gate pass so far sat exactly at the bar, and a judge rejected half of them: one look is not enough.
    expect(gateOf(concept(6, true))).toMatchObject({ status: 'undecided', next: 'second-look' });
    expect(gateOf(concept(6, true)).reasons.join(' ')).toMatch(/2 more cold looks/);
    // Just under the bar with a yes is on the edge too: a noisy no should not lose a good mark.
    expect(gateOf(concept(5.5, true)).next).toBe('second-look');
    expect(gateOf(concept(5, true)).status).toBe('failed');
    // Clear decisions need no second look.
    expect(gateOf(concept(7, true)).status).toBe('passed');
    expect(gateOf(concept(6, false)).next).toBe('fix');
    // Two agreeing looks settle it; a split needs the third.
    expect(gateOf(concept(6, true, [[6.5, true]]))).toMatchObject({
      status: 'passed',
      next: 'present',
      looks: { passed: 2, of: 2 },
    });
    expect(gateOf(concept(6, true, [[5, false]]))).toMatchObject({
      status: 'undecided',
      looks: { passed: 1, of: 2 },
    });
    expect(
      gateOf(
        concept(6, true, [
          [5, false],
          [6, false],
        ]),
      ),
    ).toMatchObject({ status: 'failed', next: 'reject' });
    expect(
      gateOf(
        concept(5.5, true, [
          [6, true],
          [7, true],
        ]),
      ).status,
    ).toBe('passed');
  });

  it('says what to do next: present, fix once, or reject', () => {
    const c = (d: number, present: boolean, reviews?: number, reviewer?: string) =>
      ({
        critique: { present, reason: 'because', at: '2026-01-01T00:00:00Z' },
        blind: {
          scores: { distinctiveness: d, memorability: 7, 'brand-fit': 7, craft: 6, versatility: 6 },
          at: '2026-01-01T00:00:00Z',
          ...(reviewer ? { reviewer } : {}),
        },
        ...(reviews ? { reviews } : {}),
      }) as unknown as Concept;
    expect(gateOf(c(7, true)).next).toBe('present');
    // The cold scores clear the bar and only the critic's no stands in the way: one round on what it named.
    expect(gateOf(c(7, false, 1)).next).toBe('fix');
    expect(gateOf(c(7, false, 2)).next).toBe('reject');
    // A required score below the bar is the idea failing, not the execution: a new direction, not a rework.
    expect(gateOf(c(5, false, 1)).next).toBe('reject');
    expect(gateOf(c(7, true, 1, 'claude-opus-5-5'))).toMatchObject({
      reviewer: 'claude-opus-5-5',
      calibration: 'measured',
    });
    expect(gateOf(c(7, true, 1, 'gpt-5.5')).calibration).toBe('unmeasured');
    expect(gateOf(c(7, true)).calibration).toBeUndefined();
  });

  it('reads criteria under the spellings critics use', () => {
    expect(['brandFit', 'Brand fit', 'brand_fit', 'brandfit'].map(criterionOf)).toEqual(
      Array(4).fill('brand-fit'),
    );
    expect(criterionOf('premium')).toBe('premium-perception');
    expect(criterionOf('semantic')).toBe('semantic-relevance');
    expect(criterionOf('presentable')).toBeUndefined();
    expect(() => requireCriterion('vibes')).toThrow(/Unknown judgment criterion/);
    // A concept recorded with camelCase keys is still gated on brand fit.
    const legacy = scored({ brandFit: 7, distinctiveness: 7, memorability: 7 }, true);
    expect(gateOf(legacy).status).toBe('passed');
  });

  it("finalize needs the user's choice, whatever the critic decided", async () => {
    const { ws } = synthBrand();
    await verifyConcept(ws, 'nimbra', 'fold');
    // A critic's pass alone does not approve a logo: the user owns the creative choice.
    expect(gateOf(ws.concept('nimbra', 'fold')).status).toBe('passed');
    await expect(finalizeConcept(ws, 'nimbra', 'fold', { acceptRisk: true })).rejects.toThrow(
      /not been chosen by the user/,
    );
    const c = ws.concept('nimbra', 'fold');
    ws.saveConcept({ ...c, ...scored({ ...strong, memorability: 4 }, false) });
    const kit = await finalizeConcept(ws, 'nimbra', 'fold', {
      acceptRisk: true,
      userChoice: 'The owner prefers it.',
    });
    expect(kit.gate).toMatchObject({ status: 'failed', userChoice: 'The owner prefers it.' });
  }, 60_000);
});

describe('cli: critique and research', () => {
  it('records the present-as-is answer, also when written as a judgment', () => {
    const cwd = tmp();
    run(['init'], cwd);
    run(['brand', 'add', 'Gate Test'], cwd);
    run(
      [
        'concept',
        'new',
        '--brand',
        'gate-test',
        '--id',
        'a',
        '--title',
        'A',
        '--direction',
        'd',
        '--rationale',
        'r',
        '--semantics',
        'a,b',
        '--primary',
        '#123456',
      ],
      cwd,
    );
    const yes = run(
      ['concept', 'update', '--brand', 'gate-test', '--concept', 'a', '--present', 'yes:Ready for a client'],
      cwd,
    );
    expect(yes.status, yes.stderr).toBe(0);
    expect(JSON.parse(yes.stdout).critique).toMatchObject({ present: true, reason: 'Ready for a client' });
    const alias = run(
      [
        'concept',
        'update',
        '--brand',
        'gate-test',
        '--concept',
        'a',
        '--judgment',
        'presentable=no:Reads as a bar chart',
      ],
      cwd,
    );
    expect(alias.status, alias.stderr).toBe(0);
    const out = JSON.parse(alias.stdout);
    expect(out.critique).toMatchObject({ present: false, reason: 'Reads as a bar chart' });
    expect(out.judgment?.presentable).toBeUndefined();
    expect(out.gate.status).toBe('failed');
    const b = run(
      [
        'concept',
        'update',
        '--brand',
        'gate-test',
        '--concept',
        'a',
        '--blind',
        'distinctiveness=6,memorability=6,brandFit=7,craft=6,versatility=7',
      ],
      cwd,
    );
    expect(b.status, b.stderr).toBe(0);
    expect(JSON.parse(b.stdout).blind.scores).toMatchObject({ 'brand-fit': 7, distinctiveness: 6 });
    expect(
      run(
        ['concept', 'update', '--brand', 'gate-test', '--concept', 'a', '--blind', 'distinctiveness=6'],
        cwd,
      ).status,
    ).toBe(64);
    expect(JSON.parse(run(['concept', 'list', '--brand', 'gate-test'], cwd).stdout)[0].gate).toBe('failed');
    const reviewed = run(
      ['concept', 'update', '--brand', 'gate-test', '--concept', 'a', '--reviewer', 'gpt-5.5'],
      cwd,
    );
    expect(JSON.parse(reviewed.stdout).gate).toMatchObject({
      reviewer: 'gpt-5.5',
      calibration: 'unmeasured',
    });
    // Decisions are logged by the toolchain, not left to the agent: one line per verdict, not per call.
    const log = readFileSync(join(cwd, 'brand', 'brands', 'gate-test', 'decisions.md'), 'utf8');
    expect(log).toMatch(/\*\*Critique\*\* · a: would not present as is — Reads as a bar chart/);
    expect(log.match(/\*\*Critique\*\*/g)).toHaveLength(2);
    const named = run(
      [
        'concept',
        'update',
        '--brand',
        'gate-test',
        '--concept',
        'a',
        '--judgment',
        'brandFit=7:Calm and warm',
      ],
      cwd,
    );
    expect(JSON.parse(named.stdout).judgment['brand-fit'].score).toBe(7);
    const bad = run(
      ['concept', 'update', '--brand', 'gate-test', '--concept', 'a', '--judgment', 'vibes=9:Great'],
      cwd,
    );
    expect(bad.status).toBe(64);
    expect(JSON.parse(bad.stderr).error.hint).toMatch(/brand-fit/);
  });

  it('shows a concept with its gate, and explains a colour lost to an unquoted #', () => {
    const cwd = tmp();
    run(['init'], cwd);
    run(['brand', 'add', 'Show Test'], cwd);
    // What the shell passes for `--primary #1d4e89 --accent …` unquoted: everything after # is a comment.
    const lost = run(
      [
        'concept',
        'new',
        '--brand',
        'show-test',
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
      ],
      cwd,
    );
    expect(lost.status).toBe(64);
    expect(JSON.parse(lost.stderr).error.hint).toMatch(/Quote colours/);
    const camel = run(
      [
        'concept',
        'new',
        '--brand',
        'show-test',
        '--id',
        'splitS',
        '--title',
        'A',
        '--direction',
        'd',
        '--rationale',
        'r',
        '--semantics',
        'x',
        '--primary',
        '#1d4e89',
      ],
      cwd,
    );
    expect(JSON.parse(camel.stderr).error.hint).toMatch(/--id split-s/);
    run(
      [
        'concept',
        'new',
        '--brand',
        'show-test',
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
        '#1d4e89',
      ],
      cwd,
    );
    const shown = run(['concept', 'show', '--brand', 'show-test', '--concept', 'a'], cwd);
    expect(shown.status, shown.stderr).toBe(0);
    expect(JSON.parse(shown.stdout)).toMatchObject({ id: 'a', gate: { status: 'not-reviewed' } });
  });

  it('researches the current folder as "."', () => {
    const cwd = tmp();
    run(['init'], cwd);
    run(['brand', 'add', 'Dot'], cwd);
    const r = run(['research', 'repo', '.', '--brand', 'dot'], cwd);
    expect(r.status, r.stderr).toBe(0);
  });
});

describe('brief', () => {
  it('accepts color directions in words as well as hex colors', () => {
    const base = { schema: 'markilo/brief@1', brand: 'x', name: 'X', mode: 'new' };
    expect(
      validateBrief({ ...base, constraints: { colors: ['#12ab34', 'warm dusk: clay and amber, no blue'] } }),
    ).toEqual([]);
    expect(validateBrief({ ...base, constraints: { colors: ['#12ab3'] } }).join(' ')).toMatch(/#rrggbb/);
  });
});
