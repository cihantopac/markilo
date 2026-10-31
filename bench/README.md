# Benchmark

End-to-end runs of the installed Markilo plugin on realistic products, to measure design quality, success rate,
effort and cost release by release. Each scenario is a fixture project (a README, manifests and screens, no real
company) plus the owner's preferences:

| Scenario                                                        | Product                                                                                 | What it tests                                                                                       |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [saas-invoicing](scenarios/saas-invoicing)                      | Tallyline — invoicing and cash-flow forecasting for freelancers (Next.js)               | A crowded category (fintech blue and green), web-only deliverables                                  |
| [mobile-sleep](scenarios/mobile-sleep)                          | Dozeline — wind-down and sleep journal app (Flutter, iOS + Android, EN + TR)            | Clichés to avoid (moons, stars), home-screen legibility, mobile exports                             |
| [family-workspace](scenarios/family-workspace)                  | Lumenfold — office suite with Docs, Sheets and Sign (monorepo)                          | A master brand and three product icons that belong together                                         |
| [devtool-cli](scenarios/devtool-cli) (holdout until rc.5)       | Seamline — zero-downtime PostgreSQL migrations, an open-source CLI (Rust, docs site)    | A developer audience, GitHub avatar and README, no category clichés (cylinders, elephants, prompts) |
| [ecommerce-shop](scenarios/ecommerce-shop) (holdout until rc.5) | Kilnroom — online shop for small-batch ceramics (Laravel, TR + EU)                      | Warm without folksy, labels and stickers, Laravel asset install                                     |
| [b2b-logistics](scenarios/b2b-logistics) (holdout until rc.7)   | Portwise — freight visibility for mid-size shippers (Django)                            | An enterprise audience, a category full of globes, ships and arrows                                 |
| [edu-app](scenarios/edu-app) (holdout until rc.7)               | Quillnest — a writing coach for teenagers (Expo, iOS, Android, web)                     | Bold but not childish, app icons, a category full of owls and pencils                               |
| [feature-flags](scenarios/feature-flags) (holdout)              | Stagewell — feature flags and gradual rollouts, open core (TypeScript SDKs, dashboard)  | A category of toggles and flags; developer audience, VS Code extension icon                         |
| [secrets-team](scenarios/secrets-team) (holdout)                | Pinehold — secrets and passwords for small teams (Rust CLI, browser extension, desktop) | Padlocks, keys and shields ruled out; warm, not militaristic; app icons                             |

## Results

| Run                                                        | Model      | Passed the gate | Blind judge would present                                | Developed / directions | Gate agrees with the judge | Minutes (total) | Cost (API equivalent) |
| ---------------------------------------------------------- | ---------- | --------------- | -------------------------------------------------------- | ---------------------- | -------------------------- | --------------- | --------------------- |
| [0.4.0-rc.1](results/0.4.0-rc.1)                           | Sonnet 5.5 | 0 of 3          | —                                                        | 7 / 9                  | 7 of 7                     | 48              | $9.76                 |
| [0.4.0-rc.2](results/0.4.0-rc.2)                           | Sonnet 5.5 | 1 of 3          | 0 of 1                                                   | 1 / 9                  | 0 of 1                     | 32              | $6.10                 |
| [0.4.0-rc.2, Opus](results/0.4.0-rc.2-opus)                | Opus 5.5   | 0 of 1          | —                                                        | 1 / 3                  | 1 of 1                     | 17              | $5.23                 |
| [0.4.0-rc.3](results/0.4.0-rc.3)                           | Sonnet 5.5 | 2 of 3          | 2 of 2                                                   | 6 / 9                  | 5 of 6                     | 54              | $10.85                |
| [0.4.0-rc.5](results/0.4.0-rc.5) (9 runs, 6 holdout)       | Sonnet 5.5 | 2 of 9          | 0 of 2 (Opus judge)                                      | 12 / 27                | 10 of 12                   | 139             | $29.93                |
| [0.4.0-rc.7](results/0.4.0-rc.7) (11 runs, 2 new holdouts) | Sonnet 5.5 | 0 of 11         | 2 of 5 developed (Opus judge), both rejected by the gate | 5 / 33                 | 3 of 5                     | 129             | $26.81                |
| [0.4.0-rc.8](results/0.4.0-rc.8) (9 runs, Opus critic)     | Sonnet 5.5 | 0 of 9          | 0 of 3 (Opus judge)                                      | 3 / 27                 | 3 of 3                     | 105             | $23.79                |
| [0.4.0-rc.9](results/0.4.0-rc.9) (9 runs)                  | Sonnet 5.5 | 2 of 9          | Portwise 2/4 looks, Dozeline 0/4 (Opus)                  | 22 / 27                | 19 of 22                   | 155             | $37.75                |

What changed, and why:

- **rc.1 → rc.2.** In rc.1 every concept the gate rejected had passed the sketch review with a cliché the critic had
  named itself ("may read as a barcode", "a folded page corner"), and the critic's "would not present it" had nowhere
  to be recorded. rc.2 made the sketch review a procedure that strikes such sketches, counted the product's own
  object as a cliché and applied the gate in code. Runs that could not succeed stopped at the sketch review — 8 of 9
  directions — and the one identity that passed was marginal; the blind judge would not present it. Opus 5.5 on the
  SaaS brief did no better, so the model was not the bottleneck.
- **rc.2 → rc.3.** 69 % of the sketches the critic had struck (22 % of the picked ones) failed verify's 16 px
  thinnest-detail check: the construction guide asked for gaps of 1/24 of the artboard, below verify's own failing
  threshold. rc.3 fixed the rule (≥ 80 units on 1024), made `markilo sketches` say which sketches are not ready and
  how to fix them in construction units, had the designer redraw before handing over and name the visual hook a
  stranger sees at 32 px, and gave the construction guide a worked example. Developed concepts went from 1 to 6 of 9;
  the SaaS and mobile app identities passed the gate and the blind judge. The family brief is still unsolved.

- **rc.3 → rc.5 (validation).** Two holdout briefs were written before the next changes (decisions logged by the
  toolchain, `markilo status`, near misses, families sketched as one system, a wordmark board, a small version of the
  symbol for favicons) and never run while tuning. Each holdout ran three times, each known brief once, and the judge
  was switched to Opus 5.5 to reduce shared bias with the Sonnet critic. Two of nine runs passed the gate (developer
  tool once, SaaS once; holdouts 1 of 6); the Opus judge would present neither. Re-judging rc.3's two identities and
  Markilo's own with Opus gave 5.8–6.2 and "not as is" for all three: the Opus judge is stricter across the board,
  and by its standard nothing Markilo has made is finished yet. rc.3's 2 of 3 was partly luck on the briefs it was
  tuned on.

- **rc.5 → rc.7.** The Opus judge's objections were sorted: 11 of 15 rejected marks were the name's initial with a cut,
  four had a form language that contradicted the brief (UI geometry for a handmade shop), several had seams or
  misregistration. rc.7 struck initial-with-a-cut sketches, tied form language to the brief's adjectives, capped brand
  fit for unfortunate misreadings, merged touching same-colour layers and flagged marks too wide for square icons. The
  rc.5 holdouts became known briefs; two fresh holdouts were written first and never run while tuning. Result: no run
  passed the gate (0 of 11) and the sketch review stopped 28 of 33 directions, but two of the five developed marks
  are the first the Opus judge would present (6.2 and 6.6) — and the stricter critic rejected both (5.9 and 6.3). The
  designer side improved; the critic is now stricter than the judge on borderline marks.

- **Critic calibration (rc.7 → rc.8).** Every concept that reached the critique so far (32) was judged blind by both
  Opus 5.5 and Sonnet 5.5 ([data](results/calibration-rc.7/data.json)). The critic's own scores, given after reading
  the designer's rationale and applying its caps, barely track the Opus judge (Spearman 0.20; the minimum of its gate
  criteria −0.02), while a blind look on the same model does much better (0.51). No threshold on Sonnet's scores
  separates the two marks Opus accepts from the 30 it rejects: rules that keep both pass 8–10 weak ones; the gate as it
  was kept neither and passed 5. So rc.8 changes the reviewer rather than a threshold: the critic scores every concept
  cold, from the brief and the images, before reading the rationale (`--blind`), and the gate rests on those scores and
  its cold yes or no; informed scores stay as feedback. The critic runs on Opus (`model: opus`).

- **rc.8 (calibrated critic).** Nine runs with the cold-look gate and the critic on Opus. The three concepts that
  reached the gate were rejected by it and by the Opus judge alike (3 of 3; the Sonnet judge would have presented
  one). But the Opus critic's sketch review stopped 24 of 27 directions before development (rc.7, Sonnet critic: 28 of
  33). With the gate calibrated, the bottleneck is plainly the designer's sketches.

- **rc.9 (sketch review strikes only clear failures).** Developed directions rose from 3 of 27 to 22 of 27 and two
  identities passed the gate (Portwise, Dozeline). The Opus judge agreed with the gate on 19 of 22 concepts, and the
  three disagreements were all borderline, so each was judged four times ([noise check](results/0.4.0-rc.9/noise-check.json)):
  Portwise was presentable in 2 of 4 looks, Dozeline in 0 of 4 (a clear false pass), q-caret (rejected by the gate)
  in 2 of 4; rc.7's doorway in 3 of 4 and stitched-join in 1 of 4. Around 6.0–6.4 a single look flips about half the
  time: the gate now errs about as often as the judge disagrees with itself. `bench.mjs judge --times N` takes the
  majority of N looks for future runs.

Benchmarking so far (four runs of the three briefs plus judging) cost $33.80 in API-equivalent terms, the rc.5 validation another $33 (runs $29.93, Opus judging $2.61, calibration about $0.66) the rc.7 validation $27.90 (runs $26.81, judging $1.09) the critic calibration about $30 (judging 30 concepts again about $5, rc.8 runs $23.79, judging $1.50) and rc.9 about $48 (runs $37.75, judging $7.28, noise check about $3.30). Each run counts
against a Claude subscription's usage limits instead of being billed; the costs are what the same tokens would cost
on the API.

Holdout scenarios were written before the changes they test and were never run while Markilo was being tuned;
they show whether an improvement generalizes beyond the briefs it was found on. A holdout stops being one once its
results have shaped a change: the rc.5 holdouts after rc.5, the rc.7 holdouts after rc.7, since their concepts were in
the rc.8 calibration set. The rc.8 and rc.9 reports still label them holdouts, as they were recorded at run time; by
this rule they were known briefs, and 0.4.0 has no untouched holdout left. The next change gets fresh ones.

## Run

```bash
node scripts/bench.mjs run all          # or one id; each run uses a temporary copy of the project
node scripts/bench.mjs judge            # blind judge for every concept that reached the critique
node scripts/bench.mjs report           # bench/results/<version>/README.md
```

Runs use headless Claude Code (`claude -p`) with the plugin installed, web search and fetch allowed and a budget cap
per scenario (`budgetUsd`). The owner is not available: Markilo records its own recommended answers and continues.
`node scripts/bench.mjs measure <workspace>` prints the same metrics for any Markilo workspace.

## What is measured

- **Success**: a concept passed the quality gate, was finalized with no failing check and exported.
- **Gate**: concepts that passed Markilo's critic gate (brand fit, distinctiveness and memorability ≥ 6, average ≥ 6.5).
- **Checks**: Markilo's automated checks on the finalized concept (pass / warn / fail).
- **Originality**: the verdict of the Originality & Similarity Report.
- **Blind judge**: a separate model call that sees only the brief and rendered images — no rationale, no scores — and
  rates distinctiveness, memorability, brand fit, craft and versatility. Agreement with the gate shows whether the
  critic is calibrated.
- **Effort and cost**: minutes, turns, sub-agents, tokens and the API-price equivalent Claude Code reports. On a Claude
  subscription the work counts against the plan's usage limits instead of being billed.

Results keep Markilo's own outputs (final masters, symbol sheets, decisions) and metrics only; research captures and
third-party reference marks never leave the temporary run folder.
