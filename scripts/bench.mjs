#!/usr/bin/env node
// Markilo benchmark: runs the installed Markilo plugin end to end on realistic scenarios in headless Claude Code,
// then measures what came out (success, quality gate, checks, originality, exports), what it cost (tokens and the
// API-price equivalent reported by Claude Code) and how an independent, blind judge rates the marks.
//
//   node scripts/bench.mjs list
//   node scripts/bench.mjs run <id…|all> [--out <dir>] [--model <alias>] [--budget <usd>] [--repeat <n>]
//                                        [--plugin <dir> | --installed] [--scenarios <dir>] [--work <dir>]
//   node scripts/bench.mjs judge [<dir>] [--model <alias>] [--times <n>]  (majority of n looks per concept)
//                                        [--panel opus:3,sonnet:3]  (several judge models; majority of all looks)
//   node scripts/bench.mjs report [<dir>] [--title <text>]
//   node scripts/bench.mjs refresh <id> <run folder>  (re-measure a kept run folder; cost and tokens are kept)
//   node scripts/bench.mjs measure <workspace>      (the same metrics for any Markilo workspace)
//
// Runs happen in a temporary copy of each scenario's project; only metrics and Markilo's own outputs are kept
// (never research captures or third-party reference marks). The default <dir> is bench/results/<version>.
//
// Runs and judges are isolated from the machine's own Claude Code setup: user settings, plugins and their hooks are
// not loaded (--setting-sources project,local), only Markilo from --plugin (default: this checkout's plugin/, so a
// baseline is measured by pointing --plugin at an older checkout). --installed uses the installed plugin instead, as
// runs before 1.0 did. --scenarios reads scenarios from another folder (private validation projects stay outside
// this repository).
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(root, 'plugin', 'dist', 'markilo.mjs');
const GATE = ['brand-fit', 'distinctiveness', 'memorability'];
// Same reading as Markilo's gate (src/report/gate.ts): criteria under other spellings count by their canonical name.
const ALIAS = { semantic: 'semantic-relevance', cultural: 'cultural-fit', premium: 'premium-perception' };
const criterion = (k) => {
  const c = k
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  return ALIAS[c] ?? c;
};

const argv = process.argv.slice(2);
const opts = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--installed') opts.installed = true;
  else if (argv[i].startsWith('--')) opts[argv[i].slice(2)] = argv[++i];
  else positional.push(argv[i]);
}
const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return undefined;
  }
};
const lastJsonLine = (text) => {
  const line = String(text ?? '')
    .trim()
    .split('\n')
    .reverse()
    .find((l) => l.trim().startsWith('{'));
  try {
    return line ? JSON.parse(line) : null;
  } catch {
    return null;
  }
};
const SCEN = resolve(opts.scenarios ?? join(root, 'bench', 'scenarios'));
const PLUGIN = resolve(opts.plugin ?? join(root, 'plugin'));
const installed = opts.installed === true;
const pluginVersion = readJson(join(PLUGIN, '.claude-plugin', 'plugin.json'))?.version;
const version = installed
  ? readJson(join(root, 'package.json')).version
  : (pluginVersion ?? readJson(join(root, 'package.json')).version);
const commit = (() => {
  const r = spawnSync('git', ['-C', PLUGIN, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
})();
// A run takes half an hour; the checkout may change meanwhile (a rebuilt dist, an edited skill). Every run loads a
// snapshot taken when the benchmark started, so it measures one version from start to finish.
let snapshot;
const pluginSnapshot = () => {
  if (!snapshot) {
    const root = opts.work ? resolve(opts.work) : tmpdir();
    mkdirSync(root, { recursive: true });
    snapshot = join(mkdtempSync(join(root, 'markilo-bench-plugin-')), 'plugin');
    cpSync(PLUGIN, snapshot, { recursive: true });
  }
  return snapshot;
};
/** Claude Code flags that load Markilo and nothing else from this machine's setup. */
const isolation = () =>
  installed ? [] : ['--setting-sources', 'project,local', '--plugin-dir', pluginSnapshot()];
const scenarios = () =>
  readdirSync(SCEN)
    .filter((d) => existsSync(join(SCEN, d, 'scenario.json')))
    .map((d) => readJson(join(SCEN, d, 'scenario.json')));
const model = opts.model ? ['--model', opts.model] : [];
const budget = (s) => Number(opts.budget ?? s.budgetUsd ?? 20);

function prompt(s) {
  return `/markilo:design ${s.ask}

Benchmark run: the product owner is not available. Do not ask questions and do not wait for answers: wherever the
workflow would ask the user, take your own recommended answer, record it with \`markilo answers\`, and continue.
Public web research is approved (send no private data); keep it proportionate (about five competitor brands).

Follow the full design workflow as the skill describes it, from research and the brief through the sketch review,
development, verification and the critic's quality gate (at most two rounds of directions). The same words are used for
every version, so a baseline and a candidate get the same request. If no concept passes the gate, stop and report that plainly — that is an acceptable result. If one passes,
finalize the strongest (accept only an insufficient-evidence originality risk), choose the deliverables the product
needs with \`markilo deliverables\`, export, plan the asset installation with \`markilo install-assets --framework auto\`
(dry run only) and build the gallery (\`markilo gallery\`, not --serve).

${s.owner}

Finish with one line of JSON: {"passed": [concept ids], "finalized": "<concept id or null>", "notes": "<one sentence>"}`;
}

/** What a finished workspace says: brands, concepts, gate results, checks, originality and exports. */
function measure(ws) {
  const manifest = readJson(join(ws, 'markilo.json'));
  if (!manifest) return { workspace: false, brands: [] };
  const brands = manifest.brands.map((b) => {
    const dir = join(ws, 'brands', b.slug);
    const cdir = join(dir, 'concepts');
    const concepts = (existsSync(cdir) ? readdirSync(cdir) : [])
      .map((id) => readJson(join(cdir, id, 'concept.json')))
      .filter(Boolean)
      .map((c) => {
        const j = Object.fromEntries(Object.entries(c.judgment ?? {}).map(([k, v]) => [criterion(k), v]));
        const scores = Object.values(j).map((v) => v.score);
        const avg = scores.length ? scores.reduce((a, x) => a + x, 0) / scores.length : undefined;
        const q = readJson(join(dir, 'reports', `quality-${c.id}.json`));
        const o = readJson(join(dir, 'reports', `originality-${c.id}.json`));
        return {
          id: c.id,
          title: c.title ?? null,
          status: c.status,
          // From 0.5.0-rc.1: a wordmark-led concept (the word is the identity, the icon is cut from it).
          lead: c.lead ?? 'symbol',
          reviews: c.reviews ?? null,
          critic: avg !== undefined ? Math.round(avg * 100) / 100 : null,
          scores: Object.fromEntries(Object.entries(j).map(([k, v]) => [k, v.score])),
          // Before 0.4.0-rc.2 the critic's present-as-is answer was not recorded (present: null).
          present: c.critique?.present ?? null,
          // Same rule as Markilo's gate: from 0.4.0-rc.8 the critic's blind scores decide when it recorded them.
          blind: c.blind?.scores ?? null,
          // From 1.0: a first look on the edge of the bar is decided by the majority of three cold looks
          // (src/report/gate.ts, SECOND_LOOK); an edge case without its second looks has not passed.
          looks: c.looks?.length ? c.looks.length + 1 : null,
          gate: c.blind
            ? (() => {
                const passes = (s, p) => p === true && GATE.every((k) => (s[k] ?? 0) >= 6);
                const all = [
                  { s: c.blind.scores, p: c.critique?.present },
                  ...(c.looks ?? []).map((l) => ({ s: l.scores, p: l.present })),
                ];
                const low = Math.min(...GATE.map((k) => c.blind.scores[k] ?? 0));
                const first = passes(all[0].s, all[0].p);
                const edge = (first && low <= 6.5) || (c.critique?.present === true && !first && low >= 5.5);
                if (!edge) return first;
                return all.filter((l) => passes(l.s, l.p)).length >= 2;
              })()
            : avg !== undefined &&
              avg >= 6.5 &&
              GATE.every((k) => (j[k]?.score ?? 0) >= 6) &&
              c.critique?.present !== false,
          readsAs: c.readsAs ?? [],
          sketchPick: c.sketchReview?.pick ?? null,
          sketchNotes: c.sketchReview?.notes ?? null,
          checks: q?.summary ?? null,
          originality: o
            ? {
                verdict: o.verdict,
                confidence: o.confidence,
                topVisual: o.visual?.matches?.[0]?.visual ?? null,
              }
            : null,
        };
      });
    // From 1.0: the idea longlist (how many hooks, how many the critic kept, from how many sources).
    const ideaLog = readJson(join(dir, 'ideas.json'));
    const ideas = ideaLog
      ? {
          total: ideaLog.ideas.length,
          kept: ideaLog.ideas.filter((i) => i.review?.verdict === 'keep').length,
          struck: ideaLog.ideas.filter((i) => i.review?.verdict === 'strike').length,
          sources: [...new Set(ideaLog.ideas.map((i) => i.source))].length,
        }
      : null;
    const kit = readJson(join(dir, 'final', 'brand.json'));
    const exp = readJson(join(dir, 'exports', 'asset-manifest.json'));
    const byGroup = {};
    for (const a of exp?.assets ?? []) byGroup[a.group] = (byGroup[a.group] ?? 0) + 1;
    const final = kit ? concepts.find((c) => c.id === kit.concept) : undefined;
    return {
      slug: b.slug,
      name: b.name,
      role: b.role ?? null,
      locked: Boolean(kit?.locked),
      ideas,
      concepts,
      finalized: kit?.concept ?? null,
      exported: exp?.assets?.length ?? 0,
      byGroup,
      success: Boolean(final?.gate && (final.checks?.fail ?? 0) === 0 && exp?.assets?.length),
    };
  });
  return { workspace: true, family: manifest.family?.name ?? null, brands };
}

function usage(r) {
  const t = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const m of Object.values(r?.modelUsage ?? {})) {
    t.input += m.inputTokens ?? 0;
    t.output += m.outputTokens ?? 0;
    t.cacheRead += m.cacheReadInputTokens ?? 0;
    t.cacheWrite += m.cacheCreationInputTokens ?? 0;
  }
  return t;
}

/** Sub-agents the session started, counted from their transcripts. */
function subagents(sessionId) {
  const projects = join(homedir(), '.claude', 'projects');
  if (!existsSync(projects)) return null;
  for (const p of readdirSync(projects)) {
    const d = join(projects, p, sessionId, 'subagents');
    if (existsSync(d)) return readdirSync(d).filter((f) => f.endsWith('.jsonl')).length;
  }
  return 0;
}

function findWorkspace(dir) {
  if (existsSync(join(dir, 'markilo.json'))) return dir;
  for (const d of readdirSync(dir, { withFileTypes: true }))
    if (d.isDirectory() && existsSync(join(dir, d.name, 'markilo.json'))) return join(dir, d.name);
  return undefined;
}

/** Measures a finished run folder and keeps Markilo's own outputs (never research captures or reference marks). */
function collect(work, dest) {
  const ws = findWorkspace(work);
  const m = ws ? measure(ws) : { workspace: false, brands: [] };
  mkdirSync(dest, { recursive: true });
  for (const b of m.brands) {
    const bdir = join(ws, 'brands', b.slug);
    if (existsSync(join(bdir, 'final')))
      cpSync(join(bdir, 'final'), join(dest, b.slug, 'final'), { recursive: true });
    for (const c of b.concepts) {
      const cdir = join(bdir, 'concepts', c.id);
      for (const f of ['symbol.svg', 'wordmark.svg', 'review/symbol-sheet.png'])
        if (existsSync(join(cdir, f)))
          cpSync(join(cdir, f), join(dest, b.slug, 'concepts', c.id, f.replace('review/', '')));
    }
    if (existsSync(join(bdir, 'ideas.json')))
      cpSync(join(bdir, 'ideas.json'), join(dest, b.slug, 'ideas.json'));
    if (existsSync(join(bdir, 'decisions.md')))
      cpSync(join(bdir, 'decisions.md'), join(dest, b.slug, 'decisions.md'));
    if (existsSync(join(bdir, 'exports', 'logos', 'overview.png')))
      cpSync(join(bdir, 'exports', 'logos', 'overview.png'), join(dest, b.slug, 'overview.png'));
  }
  return m;
}

/** Re-measures a kept run folder with the current metrics, keeping the run's own figures (cost, tokens, time). */
function refresh(id, work, out) {
  const file = join(out, id, 'result.json');
  const rec = readJson(file);
  if (!rec) throw new Error(`No ${file}.`);
  const { workspace, family, brands } = collect(resolve(work), join(out, id));
  writeFileSync(file, `${JSON.stringify({ ...rec, workspace, family, brands }, null, 2)}\n`);
  console.log(JSON.stringify({ scenario: id, success: brands.map((b) => `${b.slug}:${b.success}`) }));
}

function run(ids, out) {
  const all = scenarios();
  const pick = ids.includes('all') ? all : all.filter((s) => ids.includes(s.id));
  if (!pick.length)
    throw new Error(`No scenario matches ${ids.join(', ')} (see "node scripts/bench.mjs list").`);
  const repeat = Math.max(1, Number(opts.repeat ?? 1));
  for (const s of pick)
    for (let k = 1; k <= repeat; k++) runOnce(s, out, k === 1 ? s.id : `${s.id}-r${k}`, k);
}

function runOnce(s, out, slot, attempt) {
  // --work keeps run folders somewhere that survives the OS clearing its temp folder (they hold research captures and
  // reference marks, so never point it inside this repository).
  const workRoot = opts.work ? resolve(opts.work) : tmpdir();
  if (workRoot === root || workRoot.startsWith(`${root}/`))
    throw new Error('--work must be outside this repository: run folders hold third-party research.');
  mkdirSync(workRoot, { recursive: true });
  const work = mkdtempSync(join(workRoot, `markilo-bench-${s.id}-`));
  if (existsSync(join(SCEN, s.id, 'project'))) cpSync(join(SCEN, s.id, 'project'), work, { recursive: true });
  const sessionId = randomUUID();
  const started = Date.now();
  const r = spawnSync(
    'claude',
    [
      '-p',
      '--session-id',
      sessionId,
      '--permission-mode',
      'auto',
      '--allowedTools',
      'WebSearch WebFetch',
      '--output-format',
      'json',
      '--max-budget-usd',
      String(budget(s)),
      ...model,
      ...isolation(),
    ],
    {
      cwd: work,
      input: prompt(s),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 3 * 60 * 60 * 1000,
    },
  );
  let result;
  try {
    result = JSON.parse(r.stdout);
  } catch {}
  const dest = join(out, slot);
  const m = collect(work, dest);
  const record = {
    scenario: s.id,
    attempt,
    holdout: Boolean(s.holdout),
    title: s.title,
    kind: s.kind,
    brief: { ask: s.ask, owner: s.owner },
    markilo: version,
    plugin: installed ? 'installed' : { version: pluginVersion ?? null, commit },
    ranAt: new Date(started).toISOString(),
    minutes: Math.round((Date.now() - started) / 600) / 100,
    exitCode: r.status,
    isError: result?.is_error ?? true,
    stopReason: result?.subtype ?? (r.error ? String(r.error.message) : null),
    costUsdApiEquivalent: result?.total_cost_usd ?? null,
    budgetUsd: budget(s),
    model: opts.model ?? 'default',
    models: Object.keys(result?.modelUsage ?? {}),
    tokens: usage(result),
    turns: result?.num_turns ?? null,
    subagents: subagents(sessionId),
    claim: lastJsonLine(result?.result),
    ...m,
    sessionId,
  };
  writeFileSync(join(dest, 'result.json'), `${JSON.stringify(record, null, 2)}\n`);
  console.log(
    JSON.stringify({
      scenario: slot,
      success: m.brands.map((b) => `${b.slug}:${b.success}`),
      cost: record.costUsdApiEquivalent,
      minutes: record.minutes,
      workdir: work,
    }),
  );
}

const JUDGE = (
  s,
  name,
  files,
  final,
  wordLed,
) => `You are an independent, demanding identity-design judge. You have not seen any rationale or score.
Brief: ${s.ask} ${s.owner}
Open these images with the Read tool: ${files.join(', ')} — ${final ? `the approved identity for ${name}` : `a logo concept for ${name}`}${wordLed ? ' (wordmark-led: the word is the identity and the icon is cut from it, so judge them together)' : ''}.
Answer with ONE line of JSON and nothing else, every value in English whatever language you usually answer in:
{"readsAs":["first impression","second","third"],"distinctiveness":0-10,"memorability":0-10,"brandFit":0-10,"craft":0-10,"versatility":0-10,"presentAsIs":true|false,"why":"one sentence"}
Calibration: 3 = clip art or a stock shape, 5 = competent but forgettable, 7 = strong and ownable, 9 = category-defining.`;

function judge(out) {
  for (const id of readdirSync(out).filter((d) => existsSync(join(out, d, 'result.json')))) {
    const rec = readJson(join(out, id, 'result.json'));
    const s = rec.brief ?? readJson(join(SCEN, id, 'scenario.json'));
    const verdicts = [];
    for (const b of rec.brands) {
      // Every concept that reached the critique, so the critic's own scores can be compared with a blind reading.
      for (const c of b.concepts.filter((x) => x.critic !== null)) {
        const cdir = join(out, id, b.slug, 'concepts', c.id);
        const final = b.finalized === c.id;
        const symbol = final ? join(out, id, b.slug, 'final', 'symbol.svg') : join(cdir, 'symbol.svg');
        if (!existsSync(symbol)) continue;
        const imgs = join(cdir, 'judge');
        mkdirSync(imgs, { recursive: true });
        spawnSync(process.execPath, [
          CLI,
          'render',
          symbol,
          '-o',
          join(imgs, 'symbol.png'),
          '--width',
          '512',
          '--bg',
          '#ffffff',
        ]);
        spawnSync(process.execPath, [CLI, 'render', symbol, '-o', join(imgs, 'sizes.png'), '--sheet']);
        const lockup = join(out, id, b.slug, 'final', 'lockup-horizontal.svg');
        // From 0.5.0-rc.1: a wordmark-led concept is its word, so the judge sees the word too.
        const wordLed = c.lead === 'wordmark' && existsSync(join(cdir, 'wordmark.svg'));
        if (wordLed && !(final && existsSync(lockup)))
          spawnSync(process.execPath, [
            CLI,
            'render',
            join(cdir, 'wordmark.svg'),
            '-o',
            join(imgs, 'wordmark.png'),
            '--width',
            '1200',
            '--bg',
            '#ffffff',
          ]);
        if (final && existsSync(lockup))
          spawnSync(process.execPath, [
            CLI,
            'render',
            lockup,
            '-o',
            join(imgs, 'lockup.png'),
            '--width',
            '1200',
            '--bg',
            '#ffffff',
          ]);
        const files = readdirSync(imgs)
          .filter((f) => f.endsWith('.png'))
          .map((f) => join(imgs, f));
        // One look at a borderline mark flips about half the time (rc.9 noise check), so --times N takes the
        // majority of N independent looks and averages their scores. --panel adds judges on other models, so the
        // verdict does not rest on one model's taste (the critic runs on Opus too).
        const members = opts.panel
          ? opts.panel.split(',').map((m) => {
              const [alias, n] = m.split(':');
              return { alias, times: Math.max(1, Number(n ?? 1)) };
            })
          : [{ alias: opts.model ?? null, times: Math.max(1, Number(opts.times ?? 1)) }];
        const looks = [];
        const panel = {};
        let cost = 0;
        let usedModel = null;
        for (const m of members)
          for (let k = 0; k < m.times; k++) {
            const r = spawnSync(
              'claude',
              [
                '-p',
                '--output-format',
                'json',
                '--allowedTools',
                'Read',
                '--setting-sources',
                'project,local',
                ...(m.alias ? ['--model', m.alias] : []),
              ],
              {
                input: JUDGE(s, b.name, files, final, c.lead === 'wordmark'),
                encoding: 'utf8',
                cwd: imgs,
                maxBuffer: 16 * 1024 * 1024,
              },
            );
            let res;
            try {
              res = JSON.parse(r.stdout);
            } catch {}
            cost += res?.total_cost_usd ?? 0;
            const used = Object.keys(res?.modelUsage ?? {})[0] ?? null;
            usedModel = usedModel ?? used;
            const v = lastJsonLine(res?.result);
            if (!v) continue;
            looks.push(v);
            const key = m.alias ?? used ?? 'default';
            panel[key] ??= { yes: 0, looks: 0, scores: [] };
            panel[key].looks++;
            if (v.presentAsIs) panel[key].yes++;
            panel[key].scores.push(judgeAvg(v));
          }
        const keys = ['distinctiveness', 'memorability', 'brandFit', 'craft', 'versatility'];
        const combined =
          looks.length > 1
            ? {
                ...looks[0],
                ...Object.fromEntries(
                  keys.map((k) => [
                    k,
                    Math.round((looks.reduce((a, x) => a + x[k], 0) / looks.length) * 10) / 10,
                  ]),
                ),
                presentAsIs: looks.filter((x) => x.presentAsIs).length * 2 > looks.length,
                votes: `${looks.filter((x) => x.presentAsIs).length}/${looks.length}`,
              }
            : (looks[0] ?? null);
        verdicts.push({
          brand: b.slug,
          concept: c.id,
          final,
          judge: combined,
          model: opts.panel ? `panel ${opts.panel}` : usedModel,
          ...(opts.panel ? { panel } : {}),
          costUsdApiEquivalent: cost,
        });
      }
    }
    writeFileSync(join(out, id, 'judge.json'), `${JSON.stringify(verdicts, null, 2)}\n`);
    console.log(JSON.stringify({ scenario: id, judged: verdicts.length }));
  }
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
const judgeAvg = (v) =>
  v ? (v.distinctiveness + v.memorability + v.brandFit + v.craft + v.versatility) / 5 : null;
const f1 = (n) => (n === null || n === undefined ? '—' : n.toFixed(1));

// Before rc.2 the critic's yes/no was not recorded; the run's own claim of what passed stands in for it.
const passed = (c, r) => c.gate && (c.present !== null || !r.claim || (r.claim.passed ?? []).includes(c.id));

function report(out) {
  const rows = [];
  const runs = [];
  const pairs = [];
  const detail = [];
  let measured = version;
  let runModel = 'default';
  const judgeModels = new Set();
  // Per scenario across repeated runs: how often an identity passed the gate and the blind judge.
  const perScenario = new Map();
  for (const id of readdirSync(out)
    .filter((d) => existsSync(join(out, d, 'result.json')))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
    const r = readJson(join(out, id, 'result.json'));
    const j = readJson(join(out, id, 'judge.json')) ?? [];
    for (const x of j) if (x.model) judgeModels.add(x.model);
    measured = r.markilo ?? measured;
    runModel = r.model ?? runModel;
    const agg = perScenario.get(r.scenario) ?? {
      title: r.title,
      holdout: Boolean(r.holdout),
      runs: 0,
      passed: 0,
      presented: 0,
      minutes: [],
      cost: [],
    };
    agg.runs++;
    agg.minutes.push(r.minutes);
    agg.cost.push(r.costUsdApiEquivalent ?? 0);
    const master = r.brands.find((b) => b.role === 'master') ?? r.brands[0];
    if (master?.success) agg.passed++;
    if (master?.success && j.find((x) => x.brand === master.slug && x.final)?.judge?.presentAsIs)
      agg.presented++;
    perScenario.set(r.scenario, agg);
    for (const b of r.brands) {
      for (const c of b.concepts) {
        const v = j.find((x) => x.brand === b.slug && x.concept === c.id)?.judge;
        const jv = j.find((x) => x.brand === b.slug && x.concept === c.id);
        if (v && c.critic !== null)
          pairs.push({
            critic: c.critic,
            judge: judgeAvg(v),
            gate: passed(c, r),
            present: v.presentAsIs,
            panel: jv?.panel ?? null,
          });
        const dropped = c.critic === null && c.sketchNotes !== null && !c.sketchPick;
        const sketchReading = /Reads as:\s*([^.]*)/.exec(c.sketchNotes ?? '')?.[1];
        if (c.critic !== null || c.sketchNotes !== null)
          detail.push(
            `| ${b.name} | ${c.id} | ${dropped ? 'dropped at sketch review' : c.status} | ${f1(c.critic)} | ${dropped ? '—' : passed(c, r) ? 'passed' : 'not passed'} | ${v ? `${f1(judgeAvg(v))} · ${v.presentAsIs ? 'present' : 'not as is'}` : '—'} | ${(c.readsAs ?? []).join('; ') || (sketchReading ? `sketches: ${sketchReading}` : '—')} | ${v?.readsAs?.join('; ') ?? '—'} |`,
          );
      }
      const final = b.concepts.find((c) => c.id === b.finalized);
      const v = j.find((x) => x.brand === b.slug && x.final)?.judge;
      rows.push(
        `| ${r.title} | ${b.name}${b.locked ? ' (locked)' : ''} | ${b.success ? 'yes' : 'no'} | ${b.concepts.filter((c) => c.critic !== null).length}/${b.concepts.length} | ${b.concepts.filter((c) => passed(c, r)).length}/${b.concepts.length} | ${final ? `${final.id} · ${f1(final.critic)}` : '—'} | ${v ? `${f1(judgeAvg(v))}${v.presentAsIs ? ' · present' : ' · not as is'}` : '—'} | ${final?.checks ? `${final.checks.pass}/${final.checks.warn}/${final.checks.fail}` : '—'} | ${final?.originality?.verdict ?? '—'} | ${b.exported} |`,
      );
    }
    const t = r.tokens;
    runs.push(
      `| ${r.title} | ${r.isError ? `error (${r.stopReason})` : 'ok'} | ${r.minutes} | ${r.turns ?? '—'} | ${r.subagents ?? '—'} | ${Math.round((t.input + t.cacheRead + t.cacheWrite) / 1000)}k / ${Math.round(t.output / 1000)}k | $${(r.costUsdApiEquivalent ?? 0).toFixed(2)} of $${r.budgetUsd} | ${r.models.join(', ')} |`,
    );
  }
  const agree = pairs.filter((p) => p.gate === p.present).length;
  // Gate precision and recall against the judge, with 95 % Wilson intervals: with few positives the interval, not
  // the point estimate, is the honest figure.
  const wilson = (k, n) => {
    if (!n) return '—';
    const z = 1.96;
    const p = k / n;
    const d = 1 + (z * z) / n;
    const c = (p + (z * z) / (2 * n)) / d;
    const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
    return `${k} of ${n} (95 % interval ${Math.round(Math.max(0, c - h) * 100)}–${Math.round(Math.min(1, c + h) * 100)} %)`;
  };
  const tp = pairs.filter((p) => p.gate && p.present).length;
  const gatePassed = pairs.filter((p) => p.gate).length;
  const judgeYes = pairs.filter((p) => p.present).length;
  const panelModels = [...new Set(pairs.flatMap((p) => Object.keys(p.panel ?? {})))];
  const majority = (m) => m.yes * 2 > m.looks;
  const panelLines = panelModels.map((name) => {
    const own = pairs.filter((p) => p.panel?.[name]);
    const withGate = own.filter((p) => majority(p.panel[name]) === p.gate).length;
    const yes = own.filter((p) => majority(p.panel[name])).length;
    return `| ${name} | ${own.length} | ${yes} | ${withGate} of ${own.length} |`;
  });
  const both = panelModels.length === 2 ? pairs.filter((p) => panelModels.every((m) => p.panel?.[m])) : [];
  const between = both.filter(
    (p) => majority(p.panel[panelModels[0]]) === majority(p.panel[panelModels[1]]),
  ).length;
  const md = `# ${opts.title ?? `Markilo ${measured} benchmark`}${runModel !== 'default' ? ` (--model ${runModel})` : ''}

${runs.length} end-to-end run${runs.length === 1 ? '' : 's'} of the installed plugin in headless Claude Code, with the product owner unavailable (Markilo
takes its own recommended answers). Scenario briefs and fixture projects are in \`bench/scenarios/\`; run them with
\`node scripts/bench.mjs run all\`, then \`judge\` and \`report\`.

## Per scenario

| Scenario | Runs | Passed the gate | Blind judge would present it | Minutes (median) | Cost per run (median) |
| --- | --- | --- | --- | --- | --- |
${[...perScenario.values()].map((a) => `| ${a.title}${a.holdout ? ' (holdout)' : ''} | ${a.runs} | ${a.passed} of ${a.runs} | ${a.presented} of ${a.runs} | ${median(a.minutes).toFixed(1)} | $${median(a.cost).toFixed(2)} |`).join('\n')}

Holdout scenarios were written before the changes being measured and never run while tuning. For a family, the
master brand counts.

## Results

| Scenario | Brand | Success | Developed | Passed gate | Finalized · critic | Blind judge | Checks pass/warn/fail | Originality | Files |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

Success means a concept passed the quality gate, was finalized with no failing check and exported. Developed means
the concept got past the sketch review and was critiqued. Critic is
Markilo's own design-critic agent (average of its judgment scores). The blind judge is a separate model call that saw
only the brief and rendered images of each concept, with no rationale or scores: the average of distinctiveness,
memorability, brand fit, craft and versatility (0–10), and whether it would present the mark as is. It sees the
symbol on white, its 16–256 px sheet and, for a finalized concept, the horizontal lockup — not the app-icon tile.
Judge model: ${judgeModels.size ? [...judgeModels].join(', ') : '—'}.

## Concepts

| Brand | Concept | Status | Critic | Gate | Blind judge | Critic's first readings | Judge's first readings |
| --- | --- | --- | --- | --- | --- | --- | --- |
${detail.join('\n')}

## Critic vs blind judge

${pairs.length ? `${pairs.length} concept${pairs.length === 1 ? '' : 's'} reached the critique. The gate and the blind judge agreed on ${agree} of them (gate passed ↔ judge would present as is). Mean critic score ${f1(pairs.reduce((a, p) => a + p.critic, 0) / pairs.length)}, mean judge score ${f1(pairs.reduce((a, p) => a + p.judge, 0) / pairs.length)}.` : 'Not judged yet.'}

## Gate precision and recall

${
  pairs.length
    ? `- Precision (gate passes the judge would present): ${wilson(tp, gatePassed)}
- Recall (judge-presentable concepts the gate passed): ${wilson(tp, judgeYes)}`
    : 'Not judged yet.'
}
${
  panelLines.length
    ? `
### Judge panel

| Judge | Concepts | Would present (majority of its looks) | Agrees with the gate |
| --- | --- | --- | --- |
${panelLines.join('\n')}
${both.length ? `\nThe two judges agree with each other on ${between} of ${both.length} concepts.` : ''}
`
    : ''
}
## Cost and effort

| Scenario | Run | Minutes | Turns | Sub-agents | Tokens in / out | Cost (API equivalent) | Models |
| --- | --- | --- | --- | --- | --- | --- | --- |
${runs.join('\n')}

Cost is the API list-price equivalent Claude Code reports (\`total_cost_usd\`, sub-agents included). On a Claude
subscription the same work counts against the plan's usage limits instead of being billed. Input tokens include cache
reads and writes.
`;
  writeFileSync(join(out, 'README.md'), md);
  console.log(md);
}

const [cmd, ...rest] = positional;
const outDir = (d) => resolve(d ?? opts.out ?? join(root, 'bench', 'results', version));
if (cmd === 'list')
  console.log(
    scenarios()
      .map((s) => `${s.id}\t${s.title}\t${s.name}`)
      .join('\n'),
  );
else if (cmd === 'run') run(rest, outDir());
else if (cmd === 'judge') judge(outDir(rest[0]));
else if (cmd === 'report') report(outDir(rest[0]));
else if (cmd === 'refresh') refresh(rest[0], rest[1], outDir());
else if (cmd === 'measure') console.log(JSON.stringify(measure(resolve(rest[0] ?? '.')), null, 2));
else
  console.log(
    'Usage: node scripts/bench.mjs list | run <id…|all> [--out dir] [--model m] | judge [dir] | report [dir] | measure <workspace>',
  );
