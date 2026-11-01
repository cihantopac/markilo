# Benchmarks and validation

How Markilo's design quality has been measured, release by release. The short version is in the README; this page keeps
the full record, including what did not work.

**1.1, steered (validation on three real products).** The 1.1 workflow was validated on three real developer tools
with their owner choosing at each step, and measured with Claude Code's own cost report. All three reached an identity
the owner accepted. The first took about $15 across seven runs while the process was being corrected; with its lessons
adopted, the second took $11.27 (one round, one development, one change made directly) and the third $5.29 (one round,
finished as chosen). Every step, its cost and what it taught is in [RELEASE-1.1.md](RELEASE-1.1.md). 1.0
spent $6.85 on the first product unattended and showed nothing. This is three products and one owner's judgment, not a
benchmark.

**1.0 and earlier, unattended (benchmark).** Markilo is benchmarked end to end with nobody steering, on nine realistic products (an independent SaaS, a mobile
app, a multi-product family, a developer tool, an online shop, a B2B platform, a learning app, a feature-flag service
and a team secrets manager). Six of them were **holdouts** for a while: written before the changes they test and
never used for tuning until those results were in. The plugin researches, writes the brief, designs, critiques, and
finalizes only what passes its own gate. Blind judges then rate every critiqued concept from the brief and the images
alone. Every run, image and score is in [bench/](../bench).

| Version      | Runs                                        | Passed the gate          | Opus 5.5 judge would present (of concepts it judged) | Time per run | Cost per run (API equivalent) |
| ------------ | ------------------------------------------- | ------------------------ | ---------------------------------------------------- | ------------ | ----------------------------- |
| 0.4.0-rc.1   | 3                                           | 0                        | —                                                    | 11–21 min    | $2.61–3.67                    |
| 0.4.0-rc.2   | 3                                           | 1                        | —                                                    | 8–15 min     | $1.60–2.68                    |
| 0.4.0-rc.3   | 3                                           | 2                        | 0 of 2 (the two that passed)                         | 14–24 min    | $3.15–4.37                    |
| 0.4.0-rc.5   | 9 (6 on holdouts)                           | 2                        | 0 of 12                                              | 10–19 min    | $2.29–4.41                    |
| 0.4.0-rc.7   | 11 (2 new holdouts)                         | 0                        | 2 of 5 — both rejected by the gate                   | 6–16 min     | $1.66–3.30                    |
| 0.4.0-rc.8   | 9                                           | 0                        | 0 of 3 — the recalibrated gate agreed on all 3       | 8–18 min     | $1.91–3.48                    |
| 0.4.0 (rc.9) | 9                                           | 2                        | Portwise 2 of 4 looks, Dozeline 0 of 4               | 14–28 min    | $3.00–7.13                    |
| 0.5.0-rc.1   | 9 (4 on new holdouts)                       | 2                        | 2 of 29, the two that passed (3/3 and 2/3 looks)     | 14–36 min    | $3.37–5.86                    |
| **1.0.0**    | **14 (5 sealed holdouts, 9 on real tools)** | **2, both false passes** | **0 of 43 (Opus + Sonnet panel)**                    | 21–35 min    | $6.85–13.87                   |

What this shows, plainly:

- **1.0 did not make unattended work better, and says so.** On five briefs sealed before any 1.0 change and on three
  real developer tools, an independent panel (Opus and Sonnet, blind) would present none of the 1.0 concepts; it would
  not have presented the 0.5.0-rc.1 ones either. The two 1.0 gate passes were edge passes the panel rejected; the
  gallery now marks such passes "at the edge". What 1.0 did improve is everything around the design: safety, the
  install transaction, letter checks, typefaces, the critique process and the evidence. See
  [bench/results/1.0.0](../bench/results/1.0.0).

- **Unattended, Markilo still rarely reaches its own gate** — 6 of the 47 validation runs since rc.5, 2 of 12 on
  briefs that were still untouched holdouts when they ran.
- **For the first time, what passes is what a strict judge would present.** In 0.5.0-rc.1 the gate and the Opus judge
  (the majority of three looks per concept) agreed on all 29 critiqued concepts, and both identities that passed —
  Quillnest, and Pinehold on a brief written for this round — were presentable to the judge. In 0.4.0 the two that
  passed split it 2 of 4 and 0 of 4.
- **Words beat invented symbols.** Both passes were wordmark-led: the name drawn from a real typeface with one letter
  changed, the icon cut from it (2 of 13 judged presentable; invented symbols 0 of 16). Symbols assembled from
  rectangles, circles and polygons keep reading as UI icons or objects — a power button, a wallet, an eye.
- **Reworking a failed idea does not work, so Markilo stopped doing it.** Of 34 concepts sent back after a failed gate
  in earlier rounds, one passed later, after three rounds. The gate now says `fix` once or `reject`; in rc.1 one
  concept got a fix round, and the budget went to more directions instead (43, up from 27).
- **How the gate got here was measured.** The critic's scores given after reading the rationale barely tracked the
  strict judge (Spearman 0.20 on 32 concepts), a cold look did much better (0.51); the gate rests on the cold look.
  Across all runs the gate and the judges agreed on 77 of 86 critiqued concepts. When nothing passes, Markilo says
  so and nothing is finalized or exported.
- **What moved the needle was measured, not guessed.** Hairline gaps came from Markilo's own guide; clichés reached
  development because the sketch review picked the best of weak boards; the name's initial with a cut became the
  default move once objects were ruled out; same-colour layers left seams. Each was found in the runs and fixed in
  the plugin. The model was not the bottleneck (Opus 5.5 as designer did no better on the SaaS brief).

Markilo is built to work with you: you pick the sketch to develop, react in the gallery and decide. Unattended runs
measure the floor. The two that passed in 0.5.0-rc.1, as exported (fictional products, no human edits):

<table>
  <tr>
    <td><img src="../bench/results/0.5.0-rc.1/edu-app/quillnest/overview.png" alt="Quillnest logo files made by Markilo unattended"></td>
    <td><img src="../bench/results/0.5.0-rc.1/secrets-team-r2/pinehold/overview.png" alt="Pinehold logo files made by Markilo unattended"></td>
  </tr>
  <tr>
    <td><sub>Quillnest (writing coach for teenagers): passed the gate; Opus judge "present" in 3 of 3 looks, 6.3 — "a
    smiling face built from a q, with the orange dot as a nose".</sub></td>
    <td><sub>Pinehold (secrets manager for small teams, a fresh holdout): passed the gate; Opus judge "present" in 2 of 3
    looks, 6.3 — "an arch or doorway sheltering an orange seed".</sub></td>
  </tr>
</table>
