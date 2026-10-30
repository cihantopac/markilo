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

  it('finalize refuses a concept that failed the gate unless the user chose it', async () => {
    const { ws } = synthBrand();
    await verifyConcept(ws, 'nimbra', 'fold');
    const c = ws.concept('nimbra', 'fold');
    ws.saveConcept({ ...c, ...scored({ ...strong, memorability: 4 }, false) });
    await expect(finalizeConcept(ws, 'nimbra', 'fold', { acceptRisk: true })).rejects.toThrow(
      /did not pass the critic gate/,
    );
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
    expect(JSON.parse(run(['concept', 'list', '--brand', 'gate-test'], cwd).stdout)[0].gate).toBe('failed');
    // Decisions are logged by the toolchain, not left to the agent.
    const log = readFileSync(join(cwd, 'brand', 'brands', 'gate-test', 'decisions.md'), 'utf8');
    expect(log).toMatch(/\*\*Critique\*\* · a: would not present as is — Reads as a bar chart/);
    expect(log.match(/^- \d{4}-\d{2}-\d{2} \d{2}:\d{2} · /gm)?.length).toBeGreaterThanOrEqual(2);
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
