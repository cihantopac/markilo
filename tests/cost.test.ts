import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type CostLog, costSummary } from '../src/report/cost.js';
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
