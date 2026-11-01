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
}

export interface CostLog {
  schema: 'markilo/cost@1';
  budgetUsd: number;
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
  const status = total >= log.budgetUsd ? 'over' : total >= log.budgetUsd * WARN_AT ? 'warn' : 'ok';
  return {
    budgetUsd: log.budgetUsd,
    totalUsd: total,
    remainingUsd: remaining,
    minutes: r2(phases.reduce((a, p) => a + p.minutes, 0)),
    estimated: phases.some((p) => p.estimated),
    status,
    phases,
    next:
      status === 'over'
        ? 'Budget reached: stop paid work, show the user what exists and ask whether to raise the budget (markilo cost --budget <usd>).'
        : status === 'warn'
          ? `Under $${remaining} left: finish the current step, then ask before starting another round or agent.`
          : undefined,
  };
}
