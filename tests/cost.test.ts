import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type CostLog, costSummary, parsePlan, planEstimate } from '../src/report/cost.js';
import { tmp } from './helpers.js';

const bin = join(__dirname, '..', 'plugin', 'dist', 'markilo.mjs');
const run = (args: string[], cwd: string) =>
  spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });
const ok = (args: string[], cwd: string) => {
  const r = run(args, cwd);
  if (r.status !== 0) throw new Error(`${args.join(' ')}: ${r.stderr}`);
  return JSON.parse(r.stdout);
};
const code = (args: string[], cwd: string) => JSON.parse(run(args, cwd).stderr).error.code;
const costFile = (cwd: string) => join(cwd, 'brand', 'brands', 'tidepool', 'cost.json');
const workspace = () => {
  const cwd = tmp();
  ok(['init', '--name', 'Demo'], cwd);
  ok(['brand', 'add', 'Tidepool'], cwd);
  return cwd;
};
const log = (entries: CostLog['entries']): CostLog => ({ schema: 'markilo/cost@1', budgetUsd: 12, entries });

describe('cost: lower bound and basis', () => {
  it('agent-only entries are a lower bound with the note', () => {
    const s = costSummary(log([{ phase: 'explore', at: '', tokens: 1_000_000 }]));
    expect(s.lowerBound).toBe(true);
    expect(s.note).toBe(
      "Only agent work is recorded; the main session's own work is missing, so the real cost is higher. Record it with markilo cost --phase <p> --session-usd <total shown by Claude Code>.",
    );
  });

  it('a session entry lifts the lower bound; old entries without source count as agent', () => {
    const s = costSummary(
      log([
        { phase: 'explore', at: '', usd: 2 },
        { phase: 'explore', at: '', usd: 1, source: 'session' },
      ]),
    );
    expect(s.lowerBound).toBe(false);
    expect(s.note).toBeUndefined();
    expect(s.totalUsd).toBe(3);
  });

  it('basis is measured, estimated or mixed', () => {
    const m = { phase: 'explore' as const, at: '', usd: 1 };
    const e = { phase: 'explore' as const, at: '', tokens: 1000 };
    expect(costSummary(log([m])).basis).toBe('measured');
    expect(costSummary(log([e])).basis).toBe('estimated');
    expect(costSummary(log([m, e])).basis).toBe('mixed');
  });
});

describe('cost --session-usd', () => {
  it('records the difference between cumulative totals', () => {
    const cwd = workspace();
    ok(['cost', '--brand', 'tidepool', '--phase', 'explore', '--session-usd', '2.5'], cwd);
    const s = ok(['cost', '--brand', 'tidepool', '--phase', 'refine', '--session-usd', '4'], cwd);
    const f = JSON.parse(readFileSync(costFile(cwd), 'utf8'));
    expect(f.entries.map((e: { usd: number; source: string }) => [e.usd, e.source])).toEqual([
      [2.5, 'session'],
      [1.5, 'session'],
    ]);
    expect(f.sessionUsd).toBe(4);
    expect(s).toMatchObject({ totalUsd: 4, lowerBound: false, basis: 'measured' });
  });

  it('treats a lower session total as a new session', () => {
    const cwd = workspace();
    ok(['cost', '--brand', 'tidepool', '--phase', 'explore', '--session-usd', '4'], cwd);
    ok(['cost', '--brand', 'tidepool', '--phase', 'refine', '--session-usd', '1.2'], cwd);
    const f = JSON.parse(readFileSync(costFile(cwd), 'utf8'));
    expect(f.entries[1].usd).toBe(1.2);
    expect(f.sessionUsd).toBe(1.2);
  });

  it('refuses bad values, a missing phase and a mix with --tokens/--usd', () => {
    const cwd = workspace();
    const b = ['cost', '--brand', 'tidepool'];
    expect(code([...b, '--phase', 'explore', '--session-usd', '-1'], cwd)).toBe('USAGE');
    expect(code([...b, '--phase', 'explore', '--session-usd=-1'], cwd)).toBe('USAGE');
    expect(code([...b, '--phase', 'explore', '--session-usd', 'abc'], cwd)).toBe('USAGE');
    expect(code([...b, '--session-usd', '2'], cwd)).toBe('USAGE');
    expect(code([...b, '--phase', 'explore', '--session-usd', '2', '--tokens', '5'], cwd)).toBe('USAGE');
    expect(code([...b, '--phase', 'explore', '--session-usd', '2', '--usd', '1'], cwd)).toBe('USAGE');
  });

  it('reads a 1.1 log without source or sessionUsd', () => {
    const cwd = workspace();
    mkdirSync(join(cwd, 'brand', 'brands', 'tidepool'), { recursive: true });
    writeFileSync(
      costFile(cwd),
      JSON.stringify(log([{ phase: 'explore', at: '2026-01-01', tokens: 2_000_000 }])),
    );
    expect(ok(['cost', '--brand', 'tidepool'], cwd)).toMatchObject({
      totalUsd: 1.2,
      lowerBound: true,
      basis: 'estimated',
    });
    // The session total already covers the agent's 1.2: only 1.8 is the main session's own share.
    const s = ok(['cost', '--brand', 'tidepool', '--phase', 'refine', '--session-usd', '3'], cwd);
    expect(s).toMatchObject({ totalUsd: 3, lowerBound: false, basis: 'mixed' });
  });

  it('subtracts agent work the session total already contains', () => {
    const cwd = workspace();
    ok(['cost', '--brand', 'tidepool', '--phase', 'explore', '--usd', '2'], cwd);
    const s = ok(['cost', '--brand', 'tidepool', '--phase', 'explore', '--session-usd', '2.5'], cwd);
    const f = JSON.parse(readFileSync(costFile(cwd), 'utf8'));
    expect(f.entries[1]).toMatchObject({ usd: 0.5, source: 'session', agentUsdIncluded: 2 });
    expect(s.phases.find((p: { phase: string }) => p.phase === 'explore').usd).toBe(2.5);
    expect(s.totalUsd).toBe(2.5);
  });

  it('subtracts only agent work recorded after the last session entry', () => {
    const cwd = workspace();
    ok(['cost', '--brand', 'tidepool', '--phase', 'explore', '--usd', '1'], cwd);
    ok(['cost', '--brand', 'tidepool', '--phase', 'explore', '--session-usd', '2'], cwd);
    ok(['cost', '--brand', 'tidepool', '--phase', 'refine', '--usd', '0.75'], cwd);
    const s = ok(['cost', '--brand', 'tidepool', '--phase', 'refine', '--session-usd', '3.5'], cwd);
    const f = JSON.parse(readFileSync(costFile(cwd), 'utf8'));
    expect(f.entries.map((e: { usd: number }) => e.usd)).toEqual([1, 1, 0.75, 0.75]);
    expect(f.entries[3].agentUsdIncluded).toBe(0.75);
    expect(s.totalUsd).toBe(3.5);
  });

  it('never records a negative session share, also for a new session', () => {
    const cwd = workspace();
    ok(['cost', '--brand', 'tidepool', '--phase', 'explore', '--usd', '3'], cwd);
    ok(['cost', '--brand', 'tidepool', '--phase', 'explore', '--session-usd', '2'], cwd);
    let f = JSON.parse(readFileSync(costFile(cwd), 'utf8'));
    expect(f.entries[1]).toMatchObject({ usd: 0, agentUsdIncluded: 3 });
    // A lower total is a new session: its total less the agent work recorded since the last session entry.
    ok(['cost', '--brand', 'tidepool', '--phase', 'refine', '--usd', '0.5'], cwd);
    ok(['cost', '--brand', 'tidepool', '--phase', 'refine', '--session-usd', '1.25'], cwd);
    f = JSON.parse(readFileSync(costFile(cwd), 'utf8'));
    expect(f.entries[3]).toMatchObject({ usd: 0.75, agentUsdIncluded: 0.5 });
  });
});

describe('cost: a time budget', () => {
  const at = '2026-11-12T00:00:00.000Z';
  it('a time budget turns the status to warn and over', () => {
    const base = { ...log([{ phase: 'explore', at, tokens: 100_000, minutes: 50 }]), budgetMinutes: 60 };
    const warn = costSummary(base);
    expect(warn.totalUsd).toBeLessThan(1);
    expect(warn.status).toBe('warn');
    expect(warn.minutesBudget).toBe(60);
    expect(warn.minutesRemaining).toBe(10);
    const over = costSummary({
      ...base,
      entries: [...base.entries, { phase: 'refine', at, tokens: 1000, minutes: 11 }],
    });
    expect(over.status).toBe('over');
    expect(over.next).toMatch(/time budget/i);
  });
  it('a 1.2 log without a time budget reads unchanged', () => {
    const s = costSummary(log([{ phase: 'explore', at, tokens: 100_000, minutes: 500 }]));
    expect(s.status).toBe('ok');
    expect('minutesBudget' in s).toBe(false);
    expect('minutesRemaining' in s).toBe(false);
  });
  it('--budget-minutes sets the time budget and refuses zero or negative', () => {
    const cwd = workspace();
    const r = ok(['cost', '--brand', 'tidepool', '--budget-minutes', '90'], cwd);
    expect(r.minutesBudget).toBe(90);
    expect(JSON.parse(readFileSync(costFile(cwd), 'utf8')).budgetMinutes).toBe(90);
    expect(code(['cost', '--brand', 'tidepool', '--budget-minutes', '0'], cwd)).toBe('USAGE');
    expect(code(['cost', '--brand', 'tidepool', '--budget-minutes=-5'], cwd)).toBe('USAGE');
  });
});

describe('cost: what it measures', () => {
  it('two overlapping agents: agent minutes add up, wall minutes do not', () => {
    const s = costSummary({
      ...log([
        { phase: 'explore', at: '2026-11-12T10:00:00.000Z', tokens: 100_000, minutes: 5 },
        { phase: 'explore', at: '2026-11-12T10:01:00.000Z', tokens: 100_000, minutes: 5 },
      ]),
      budgetMinutes: 8,
    });
    expect(s.agentMinutes).toBe(10);
    expect(s.minutes).toBe(10);
    expect(s.wallMinutes).toBe(6);
    expect(s.status).toBe('over');
    expect(s.next).toMatch(/10 agent minutes/);
    expect(s.next).toMatch(/6 minutes of wall-clock/);
  });
  it('says subagents only while the session is missing', () => {
    const s = costSummary(log([{ phase: 'explore', at: '', usd: 2 }]));
    expect(s.label).toBe('subagents only — the session itself is not counted');
    expect(s.subagentUsd).toBe(2);
    expect(s.wallMinutes).toBeUndefined();
    const withSession = costSummary(
      log([
        { phase: 'explore', at: '', usd: 2 },
        { phase: 'explore', at: '', usd: 1, source: 'session' },
      ]),
    );
    expect(withSession.label).toBeUndefined();
    expect(withSession.subagentUsd).toBe(2);
  });
  it('parts of one interrupted agent add up; a part without minutes is incomplete', () => {
    const cwd = workspace();
    const base = ['cost', '--brand', 'tidepool', '--phase', 'explore'];
    ok([...base, '--tokens', '100000', '--minutes', '4', '--agent', 'designer-a', '--part', '1'], cwd);
    const s = ok([...base, '--tokens', '50000', '--agent', 'designer-a', '--part', '2'], cwd);
    expect(s.agents).toEqual([
      expect.objectContaining({
        agent: 'designer-a',
        parts: 2,
        tokens: 150_000,
        minutes: 4,
        minutesIncomplete: true,
      }),
    ]);
    expect(s.minutesIncomplete).toBe(true);
    const f = JSON.parse(readFileSync(costFile(cwd), 'utf8'));
    expect(f.entries[1]).toMatchObject({ agent: 'designer-a', part: 2, minutesUnknown: true });
    expect(f.entries[0].minutesUnknown).toBeUndefined();
    expect(code([...base, '--tokens', '1', '--part', '2'], cwd)).toBe('INVALID_INPUT');
    expect(code([...base, '--tokens', '1', '--agent', 'x', '--part', '0'], cwd)).toBe('INVALID_INPUT');
  });
  it('a 1.3 log reads unchanged', () => {
    const entries: CostLog['entries'] = [
      { phase: 'explore', at: '2026-11-12T10:00:00.000Z', tokens: 1_000_000, minutes: 3 },
      { phase: 'refine', at: '2026-11-12T10:05:00.000Z', usd: 1.5, minutes: 2, source: 'session' },
    ];
    const s = costSummary(log(entries));
    // Every field a 1.3 summary had, pinned (1.4 only adds fields next to them).
    expect(s).toMatchObject({
      budgetUsd: 12,
      totalUsd: 2.1,
      remainingUsd: 9.9,
      minutes: 5,
      estimated: true,
      lowerBound: false,
      basis: 'mixed',
      status: 'ok',
      note: undefined,
      next: undefined,
      phases: [
        { phase: 'explore', entries: 1, estimated: true, minutes: 3, tokens: 1_000_000, usd: 0.6 },
        { phase: 'refine', entries: 1, estimated: false, minutes: 2, tokens: 0, usd: 1.5 },
      ],
    });
    expect('minutesIncomplete' in s).toBe(false);
    expect('agents' in s).toBe(false);
    expect(s.phases.map((p) => p.phase)).toEqual(['explore', 'refine']);
  });
});

describe('cost --plan', () => {
  const plan = parsePlan('explore:3,develop:1,critic:1');
  const agent = (phase: 'explore' | 'refine', name: string, minutes: number, usd: number) => ({
    phase,
    at: '',
    agent: name,
    part: 1,
    minutes,
    usd,
  });
  it("plan estimate uses defaults, then this brand's history", () => {
    const d = planEstimate(log([]), plan);
    expect(d.source).toBe('defaults');
    expect(d.estimate.agentMinutes).toEqual([3 * 10 + 12 + 4, 3 * 16 + 20 + 8]);
    expect(d.estimate.wallMinutes).toEqual([10 + 12 + 4, 16 + 20 + 8]);
    // One recorded explore agent is not enough history.
    expect(planEstimate(log([agent('explore', 'a', 30, 4)]), plan).source).toBe('defaults');
    const h = planEstimate(log([agent('explore', 'a', 30, 4), agent('explore', 'b', 40, 5)]), plan);
    expect(h.source).toBe('mixed');
    expect(h.kinds[0]).toMatchObject({ kind: 'explore', perAgentMinutes: [30, 40] });
    expect(h.estimate.agentMinutes).toEqual([3 * 30 + 12 + 4, 3 * 40 + 20 + 8]);
    expect(h.estimate.wallMinutes).toEqual([30 + 12 + 4, 40 + 20 + 8]);
    expect(h.estimate.usd).toEqual([13.8, 18.1]);
  });
  it('plan says whether it fits the budget', () => {
    expect(planEstimate(log([]), plan).fits).toBe(true);
    const tight = planEstimate({ ...log([]), budgetUsd: 5, budgetMinutes: 40 }, plan);
    expect(tight.fits).toBe(false);
    expect(tight.shortfall).toEqual({ usd: 5.6, agentMinutes: 36 });
    expect(() => parsePlan('paint:2')).toThrow(/Unknown agent kind/);
  });
});
