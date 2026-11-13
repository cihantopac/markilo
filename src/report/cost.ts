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
const SUBAGENTS_ONLY = 'subagents only — the session itself is not counted';
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
  /** The subagent this entry belongs to; parts of one interrupted agent share the name and add up. */
  agent?: string;
  /** Which part of an interrupted (resumed) agent this entry is, from 1. */
  part?: number;
  /** A part whose minutes could not be read from the harness: the agent minutes are then incomplete. */
  minutesUnknown?: true;
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

/**
 * An entry's `at` is stamped when it is recorded, which is when the agent's work ended, so its working interval is
 * `[at - minutes, at]`. `elapsed` is the span from the earliest start to the latest end (waiting included); `busy` is
 * the union of the intervals (waiting and overlap excluded). Undefined without readable times.
 */
function timeSpansOf(entries: CostEntry[]): { busy: number; elapsed: number } | undefined {
  const spans = entries
    .map((e) => ({ end: Date.parse(e.at), m: e.minutes ?? 0 }))
    .filter((x) => Number.isFinite(x.end))
    .map((x) => ({ start: x.end - x.m * 60_000, end: x.end }))
    .sort((a, b) => a.start - b.start);
  if (!spans.length) return undefined;
  let busy = 0;
  let curStart = spans[0]!.start;
  let curEnd = spans[0]!.end;
  for (const sp of spans.slice(1)) {
    if (sp.start <= curEnd) curEnd = Math.max(curEnd, sp.end);
    else {
      busy += curEnd - curStart;
      curStart = sp.start;
      curEnd = sp.end;
    }
  }
  busy += curEnd - curStart;
  const elapsed = Math.max(...spans.map((x) => x.end)) - spans[0]!.start;
  return { busy: r2(busy / 60_000), elapsed: r2(elapsed / 60_000) };
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
  const spans = timeSpansOf(log.entries);
  const elapsed = spans?.elapsed;
  // Entries without a readable time stamp still count, by their minutes.
  const unstamped = r2(
    log.entries.filter((e) => !Number.isFinite(Date.parse(e.at))).reduce((a, e) => a + (e.minutes ?? 0), 0),
  );
  const busy = spans ? r2(spans.busy + unstamped) : undefined;
  const wallText = busy !== undefined ? ` (${busy} busy minutes, ${elapsed} elapsed including waiting)` : '';
  const agentMinutesText = `${minutes} agent minutes (parallel agents add up)`;
  const subagentUsd = r2(
    log.entries.filter((e) => e.source !== 'session').reduce((a, e) => a + entryUsd(e).usd, 0),
  );
  const named = [...new Set(log.entries.filter((e) => e.agent).map((e) => e.agent!))].map((agent) => {
    const es = log.entries.filter((e) => e.agent === agent);
    return {
      agent,
      parts: es.length,
      tokens: es.reduce((a, e) => a + (e.tokens ?? 0), 0),
      minutes: r2(es.reduce((a, e) => a + (e.minutes ?? 0), 0)),
      usd: r2(es.reduce((a, e) => a + entryUsd(e).usd, 0)),
      ...(es.some((e) => e.minutesUnknown) ? { minutesIncomplete: true } : {}),
    };
  });
  const minutesIncomplete = log.entries.some((e) => e.minutesUnknown);
  const usdLevel = level(total, log.budgetUsd);
  // The time budget counts working time (busy), not the user's waiting or overlapping agents twice.
  const timeUsed = busy ?? minutes;
  const timeLevel = log.budgetMinutes ? level(timeUsed, log.budgetMinutes) : 0;
  const status = (['ok', 'warn', 'over'] as const)[Math.max(usdLevel, timeLevel)]!;
  const byTime = timeLevel > usdLevel;
  return {
    budgetUsd: log.budgetUsd,
    totalUsd: total,
    remainingUsd: remaining,
    minutes,
    agentMinutes: minutes,
    ...(busy !== undefined ? { busyMinutes: busy, elapsedMinutes: elapsed, wallMinutes: elapsed } : {}),
    ...(minutesIncomplete ? { minutesIncomplete: true } : {}),
    subagentUsd,
    ...(named.length ? { agents: named } : {}),
    ...(log.budgetMinutes
      ? { minutesBudget: log.budgetMinutes, minutesRemaining: r2(log.budgetMinutes - timeUsed) }
      : {}),
    estimated: phases.some((p) => p.estimated),
    status,
    basis,
    lowerBound,
    note: lowerBound ? LOWER_BOUND_NOTE : undefined,
    ...(lowerBound ? { label: SUBAGENTS_ONLY } : {}),
    phases,
    next:
      byTime && status === 'over'
        ? `Time budget reached (${agentMinutesText}${wallText}): stop starting agents, show the user what exists and ask whether to continue (markilo cost --budget-minutes <m>).`
        : byTime && status === 'warn'
          ? `Under ${r2(log.budgetMinutes! - timeUsed)} busy minutes of the time budget left (${agentMinutesText}${wallText}): finish the current step, then ask before starting another round or agent.`
          : status === 'over'
            ? 'Budget reached: stop paid work, show the user what exists and ask whether to raise the budget (markilo cost --budget <usd>).'
            : status === 'warn'
              ? `Under $${remaining} left: finish the current step, then ask before starting another round or agent.`
              : undefined,
  };
}

/** The kinds of agent a round starts, the phase each is recorded under, and the defaults used without history. */
export const PLAN_KINDS = {
  explore: { phase: 'explore', minutes: [10, 16], tokens: [150_000, 300_000] },
  develop: { phase: 'refine', minutes: [12, 20], tokens: [150_000, 300_000] },
  critic: { phase: 'verify', minutes: [4, 8], tokens: [40_000, 90_000] },
} as const;
export type PlanKind = keyof typeof PLAN_KINDS;

/** `explore:3,develop:1,critic:1` → counts per kind (a kind without a count means 1). */
export function parsePlan(text: string): Partial<Record<PlanKind, number>> {
  const out: Partial<Record<PlanKind, number>> = {};
  for (const part of text.split(',')) {
    const [rawKind, rawCount] = part.split(':').map((s) => s.trim().toLowerCase());
    if (!rawKind) continue;
    if (!(rawKind in PLAN_KINDS))
      throw new MarkiloError(
        'USAGE',
        `Unknown agent kind "${rawKind}" in --plan.`,
        `Use ${Object.keys(PLAN_KINDS).join(', ')}, e.g. explore:3,develop:1,critic:1.`,
      );
    const n = rawCount === undefined ? 1 : Number(rawCount);
    if (!Number.isInteger(n) || n < 1)
      throw new MarkiloError('USAGE', `--plan count for ${rawKind} must be a whole number from 1.`);
    out[rawKind as PlanKind] = (out[rawKind as PlanKind] ?? 0) + n;
  }
  if (!Object.keys(out).length)
    throw new MarkiloError('USAGE', '--plan needs agents, e.g. explore:3,develop:1,critic:1.');
  return out;
}

/**
 * Estimate a round before it starts. Per kind: this brand's recorded named agents of the kind's phase when there are at
 * least 2 (their range), else the defaults. Agent minutes add up; wall time is the longest agent of each kind, since the
 * agents of a kind run in parallel and the kinds run one after another.
 */
export function planEstimate(log: CostLog, plan: Partial<Record<PlanKind, number>>) {
  const range = (xs: number[]): [number, number] => [r2(Math.min(...xs)), r2(Math.max(...xs))];
  const agentMin: [number, number] = [0, 0];
  const wall: [number, number] = [0, 0];
  const usd: [number, number] = [0, 0];
  // Dollars are tokens × the brand's recorded rate (the latest entry that sets one), else the default rate.
  const rate = [...log.entries].reverse().find((e) => e.rate !== undefined)?.rate ?? DEFAULT_RATE;
  const kinds = (Object.keys(plan) as PlanKind[]).map((kind) => {
    const count = plan[kind]!;
    const def = PLAN_KINDS[kind];
    const names = [
      ...new Set(log.entries.filter((e) => e.phase === def.phase && e.agent).map((e) => e.agent!)),
    ];
    const agents = names.map((agent) => {
      const es = log.entries.filter((e) => e.phase === def.phase && e.agent === agent);
      return {
        minutes: es.reduce((a, e) => a + (e.minutes ?? 0), 0),
        tokens: es.reduce((a, e) => a + (e.tokens ?? 0), 0),
        complete: !es.some((e) => e.minutesUnknown) && es.some((e) => (e.minutes ?? 0) > 0),
      };
    });
    const usable = agents.filter((a) => a.complete);
    const history = usable.length >= 2;
    const m = history ? range(usable.map((a) => a.minutes)) : ([...def.minutes] as [number, number]);
    const withTokens = agents.filter((a) => a.tokens > 0);
    const tokenHistory = withTokens.length >= 2;
    const t = tokenHistory ? range(withTokens.map((a) => a.tokens)) : ([...def.tokens] as [number, number]);
    const d: [number, number] = [(t[0] / 1e6) * rate, (t[1] / 1e6) * rate];
    agentMin[0] += count * m[0];
    agentMin[1] += count * m[1];
    wall[0] += m[0];
    wall[1] += m[1];
    usd[0] += count * d[0];
    usd[1] += count * d[1];
    return {
      kind,
      agents: count,
      perAgentMinutes: m,
      perAgentTokens: t,
      tokensSource: tokenHistory ? `this brand's ${withTokens.length} recorded ${kind} agents` : 'defaults',
      source: history ? `this brand's ${usable.length} recorded ${kind} agents` : 'defaults',
    };
  });
  const rr = (p: [number, number]): [number, number] => [r2(p[0]), r2(p[1])];
  const summary = costSummary(log);
  const shortUsd = r2(Math.max(0, usd[1] - summary.remainingUsd));
  // Like with like: the time budget counts busy time (parallel agents overlap and count once), so the round's busy
  // time — the estimate's wallMinutes, the longest agent of each kind — is what it adds, not the summed agent minutes.
  const shortMin =
    summary.minutesRemaining !== undefined ? r2(Math.max(0, wall[1] - summary.minutesRemaining)) : undefined;
  const fits = shortUsd === 0 && (shortMin ?? 0) === 0;
  const sources = new Set(kinds.map((k) => (k.source === 'defaults' ? 'defaults' : 'history')));
  return {
    plan,
    estimate: { agentMinutes: rr(agentMin), wallMinutes: rr(wall), usd: rr(usd) },
    source: sources.size > 1 ? 'mixed' : sources.has('history') ? 'history' : 'defaults',
    kinds,
    rate,
    ...(summary.label ? { label: summary.label } : {}),
    budgetUsd: summary.budgetUsd,
    remainingUsd: summary.remainingUsd,
    ...(summary.minutesRemaining !== undefined
      ? { minutesBudget: summary.minutesBudget, minutesRemaining: summary.minutesRemaining }
      : {}),
    fits,
    ...(fits
      ? {}
      : { shortfall: { usd: shortUsd, ...(shortMin !== undefined ? { busyMinutes: shortMin } : {}) } }),
    note: 'Compared against the upper end of the estimate: dollars against the remaining dollars, the busy time (wallMinutes) against the remaining busy minutes. Dollars are for subagents only; the session itself is not counted.',
  };
}
