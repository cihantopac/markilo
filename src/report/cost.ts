import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MarkiloError } from '../core/errors.js';
import { readJson, writeJson } from '../core/fsx.js';
import type { Workspace } from '../core/workspace.js';

/** The creative phases cost is tracked by, in workflow order. */
export const PHASES = ['understand', 'explore', 'refine', 'verify', 'export'] as const;
export type Phase = (typeof PHASES)[number];

/**
 * Default budget per brand, in US dollars of API-equivalent cost. Measured in Markilo 1.1's validation with the Opus
 * designer: one round of three proposals $5.81, development $1.7, an icon refinement $1.6 — one round, development and
 * export fit; a second round needs the user's OK to raise it.
 */
export const DEFAULT_BUDGET_USD = 12;
/**
 * USD per million tokens processed (input, cache and output together), measured on Markilo 1.0's real-project runs:
 * $6.85–9.01 for 10.9–16.3 M tokens, ≈ $0.55–0.63. An estimate for agentic work with heavy prompt caching; an entry
 * that records dollars directly (`--usd`, e.g. from Claude Code's own cost report) is used as is.
 */
export const DEFAULT_RATE = 0.6;
const LOWER_BOUND_NOTE =
  "Only agent work is recorded; the main session's own work is missing, so the real cost is higher. Record it with markilo cost --phase <p> --session-usd <total shown by Claude Code>.";
/** Share of the budget after which the report warns. */
const WARN_AT = 0.8;

export interface CostEntry {
  phase: Phase;
  at: string;
  tokens?: number;
  minutes?: number;
  /** Measured dollars when known; otherwise estimated from tokens × rate. */
  usd?: number;
  rate?: number;
  note?: string;
  /** Who did the work: a subagent (tokens or dollars) or the main session (dollars). Missing in 1.1 logs: `agent`. */
  source?: 'agent' | 'session';
  /** On a session entry: agent dollars the session total already contained, subtracted from its share. */
  agentUsdIncluded?: number;
}

export interface CostLog {
  schema: 'markilo/cost@1';
  budgetUsd: number;
  /** The last cumulative session total recorded with `--session-usd`; the next call records the difference. */
  sessionUsd?: number;
  /** Optional time budget in minutes of agent work (the harness's duration_ms), set with `--budget-minutes`. */
  budgetMinutes?: number;
  entries: CostEntry[];
}

const path = (ws: Workspace, slug: string) => join(ws.brandDir(slug), 'cost.json');

export function readCost(ws: Workspace, slug: string): CostLog {
  const p = path(ws, slug);
  return existsSync(p)
    ? readJson<CostLog>(p)
    : { schema: 'markilo/cost@1', budgetUsd: DEFAULT_BUDGET_USD, entries: [] };
}

export function writeCost(ws: Workspace, slug: string, log: CostLog): void {
  writeJson(path(ws, slug), log);
}

export function phaseOf(v: string): Phase {
  const p = v.trim().toLowerCase() as Phase;
  if (!PHASES.includes(p))
    throw new MarkiloError('USAGE', `Unknown phase "${v}".`, `Use one of: ${PHASES.join(', ')}.`);
  return p;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** What one entry cost: measured dollars, or tokens at the entry's rate. */
export function entryUsd(e: CostEntry): { usd: number; estimated: boolean } {
  if (e.usd !== undefined) return { usd: e.usd, estimated: false };
  return { usd: ((e.tokens ?? 0) / 1e6) * (e.rate ?? DEFAULT_RATE), estimated: true };
}

/**
 * The main session's own share of a cumulative Claude Code session total. That total already includes the subagents'
 * usage, so the agent entries recorded since the last session entry (all of them when there is none) are subtracted,
 * floored at 0. A total below the stored one means a new session started: its whole total is the delta.
 */
export function sessionShare(log: CostLog, total: number): { usd: number; agentUsdIncluded: number } {
  const prev = log.sessionUsd ?? 0;
  const delta = total >= prev ? total - prev : total;
  let last = -1;
  log.entries.forEach((e, i) => {
    if (e.source === 'session') last = i;
  });
  const agent = log.entries
    .slice(last + 1)
    .filter((e) => e.source !== 'session')
    .reduce((a, e) => a + entryUsd(e).usd, 0);
  const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
  return { usd: r6(Math.max(0, delta - agent)), agentUsdIncluded: r6(agent) };
}

/** Totals per phase and against the budget; `stop` means the next paid step would go over it. */
export function costSummary(log: CostLog) {
  const phases = PHASES.map((phase) => {
    const es = log.entries.filter((e) => e.phase === phase);
    const usd = es.reduce((a, e) => a + entryUsd(e).usd, 0);
    return {
      phase,
      entries: es.length,
      tokens: es.reduce((a, e) => a + (e.tokens ?? 0), 0),
      minutes: r2(es.reduce((a, e) => a + (e.minutes ?? 0), 0)),
      usd: r2(usd),
      estimated: es.some((e) => entryUsd(e).estimated),
    };
  }).filter((p) => p.entries);
  const total = r2(phases.reduce((a, p) => a + p.usd, 0));
  const remaining = r2(log.budgetUsd - total);
  // basis: `measured` when every entry carries dollars (`usd`), `estimated` when every entry is tokens × rate, `mixed`
  // otherwise. No entries: `measured` (nothing was estimated).
  const flags = log.entries.map((e) => entryUsd(e).estimated);
  const basis = flags.every((f) => !f) ? 'measured' : flags.every((f) => f) ? 'estimated' : 'mixed';
  // A total without any `session` entry (a missing source means `agent`) leaves out the main session's own work.
  const lowerBound = !log.entries.some((e) => e.source === 'session');
  const level = (used: number, budget: number) => (used >= budget ? 2 : used >= budget * WARN_AT ? 1 : 0);
  const minutes = r2(phases.reduce((a, p) => a + p.minutes, 0));
  const usdLevel = level(total, log.budgetUsd);
  const timeLevel = log.budgetMinutes ? level(minutes, log.budgetMinutes) : 0;
  const status = (['ok', 'warn', 'over'] as const)[Math.max(usdLevel, timeLevel)]!;
  const byTime = timeLevel > usdLevel;
  return {
    budgetUsd: log.budgetUsd,
    totalUsd: total,
    remainingUsd: remaining,
    minutes,
    ...(log.budgetMinutes
      ? { minutesBudget: log.budgetMinutes, minutesRemaining: r2(log.budgetMinutes - minutes) }
      : {}),
    estimated: phases.some((p) => p.estimated),
    status,
    basis,
    lowerBound,
    note: lowerBound ? LOWER_BOUND_NOTE : undefined,
    phases,
    next:
      byTime && status === 'over'
        ? 'Time budget reached: stop starting agents, show the user what exists and ask whether to continue (markilo cost --budget-minutes <m>).'
        : byTime && status === 'warn'
          ? `Under ${r2(log.budgetMinutes! - minutes)} minutes of the time budget left: finish the current step, then ask before starting another round or agent.`
          : status === 'over'
            ? 'Budget reached: stop paid work, show the user what exists and ask whether to raise the budget (markilo cost --budget <usd>).'
            : status === 'warn'
              ? `Under $${remaining} left: finish the current step, then ask before starting another round or agent.`
              : undefined,
  };
}
