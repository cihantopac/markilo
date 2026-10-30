# Markilo 0.4.0-rc.3 benchmark

3 end-to-end runs of the installed plugin in headless Claude Code, with the product owner unavailable (Markilo
takes its own recommended answers). Scenario briefs and fixture projects are in `bench/scenarios/`; run them with
`node scripts/bench.mjs run all`, then `judge` and `report`.

## Per scenario

| Scenario | Runs | Passed the gate | Blind judge would present it | Minutes (median) | Cost per run (median) |
| --- | --- | --- | --- | --- | --- |
| Multi-product family | 1 | 0 of 1 | 0 of 1 | 24.2 | $4.37 |
| Mobile app | 1 | 1 of 1 | 1 of 1 | 15.2 | $3.15 |
| Independent SaaS | 1 | 1 of 1 | 1 of 1 | 14.1 | $3.34 |

Holdout scenarios were written before the changes being measured and never run while tuning. For a family, the
master brand counts.

## Results

| Scenario | Brand | Success | Developed | Passed gate | Finalized · critic | Blind judge | Checks pass/warn/fail | Originality | Files |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Multi-product family | Lumenfold | no | 2/3 | 0/3 | — | — | — | — | 0 |
| Multi-product family | Lumenfold Docs | no | 0/0 | 0/0 | — | — | — | — | 0 |
| Multi-product family | Lumenfold Sheets | no | 0/0 | 0/0 | — | — | — | — | 0 |
| Multi-product family | Lumenfold Sign | no | 0/0 | 0/0 | — | — | — | — | 0 |
| Mobile app | Dozeline | yes | 2/3 | 1/3 | dusk-arch · 6.8 | 6.8 · present | 15/2/0 | insufficient-evidence | 105 |
| Independent SaaS | Tallyline | yes | 2/3 | 1/3 | horizon · 6.8 | 6.4 · present | 17/1/0 | insufficient-evidence | 81 |

Success means a concept passed the quality gate, was finalized with no failing check and exported. Developed means
the concept got past the sketch review and was critiqued. Critic is
Markilo's own design-critic agent (average of its judgment scores). The blind judge is a separate model call that saw
only the brief and rendered images of each concept, with no rationale or scores: the average of distinctiveness,
memorability, brand fit, craft and versatility (0–10), and whether it would present the mark as is. It sees the
symbol on white, its 16–256 px sheet and, for a finalized concept, the horizontal lockup — not the app-icon tile.
Judge model: claude-sonnet-5-5.

## Concepts

| Brand | Concept | Status | Critic | Gate | Blind judge | Critic's first readings | Judge's first readings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lumenfold | facet | rejected | 6.4 | not passed | 5.6 · not as is | letter L split by a diagonal slash; set square / drafting triangle; cut-corner page fragment | an L monogram, which fits Lumenfold; a folded corner or set square; a corner bracket with a diagonal cut |
| Lumenfold | hinge | dropped at sketch review | — | — | — | sketches: s1 a letter K/B in a rounded tile with a bar through it; s2 a V or checkmark with a ball (also a wine glass/pin); s3 a Ǝ/E-like three-bar glyph or menu/align icon | — |
| Lumenfold | horizon | rejected | 5.3 | not passed | 5.4 · not as is | letter S; a split or sliced block (two-part shape); a shifted-slab / broken bookmark | a folded sheet of paper split into two offset halves, amber and teal; an abstract letter S or a stepped, diagonal cut block; a generic fintech or productivity app mark |
| Dozeline | dusk-arch | approved | 6.8 | passed | 6.8 · present | doorway / arched window; letter n; tunnel or rainbow arch | a nested arch or doorway in plum and amber, like a lowercase n; a warm, calm dusk window or shelter; a friendly rounded wordmark with a simple icon |
| Dozeline | settling-line | dropped at sketch review | — | — | — | sketches: s1 arch/n/horseshoe handle; s2 mouth or bow tie; s3 cinnamon roll/hypnosis spiral/G; s4 music note | — |
| Dozeline | tucked-d | rejected | 5.7 | not passed | 5.8 · not as is | letter D; rounded bold D (Dropbox/Duolingo-like app initial); Pac-Man-ish hook | a bold rounded letter D; a D with the stem tucked under an overhanging top arm, like a blanket or tab; a generic rounded sans monogram |
| Tallyline | horizon | approved | 6.8 | passed | 6.4 · present | a T with a bent arm and a ball (person kicking / sun over a ridge); a T-shaped signpost or branch; a letter T with a dot | A stylized letter T whose right arm bends upward toward a gold sun or dot; A rising forecast line pointing at a target, set in plum and gold; A person or figure reaching up toward a ball |
| Tallyline | split-stick | rejected | 6.8 | not passed | 6.6 · present | a rounded block with an interlocking notch (Tetris-like piece); two nested L shapes / a toggle or battery UI icon; a split folder or brick | a rounded rectangle split into two interlocking L-shaped pieces, terracotta and sand; an abstract stepped block like a stylized 'L' or 'LJ' monogram; a tally stick or split ledger tally, two halves fitting together |
| Tallyline | tl-ligature | dropped at sketch review | — | — | — | sketches: s1 exclamation mark or broken 'i'/'l' (different letter, alert icon); s2 loading spinner/progress ring; s3 plain tally-mark icon (the product's own object, cliche); s4 a U or checkmark with a hook | — |

## Critic vs blind judge

6 concepts reached the critique. The gate and the blind judge agreed on 5 of them (gate passed ↔ judge would present as is). Mean critic score 6.3, mean judge score 6.1.

## Cost and effort

| Scenario | Run | Minutes | Turns | Sub-agents | Tokens in / out | Cost (API equivalent) | Models |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Multi-product family | ok | 24.2 | 3 | 12 | 12661k / 168k | $4.37 of $25 | claude-sonnet-5-5, claude-haiku-5-5 |
| Mobile app | ok | 15.15 | 10 | 14 | 8120k / 113k | $3.15 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |
| Independent SaaS | ok | 14.14 | 9 | 13 | 9113k / 119k | $3.34 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |

Cost is the API list-price equivalent Claude Code reports (`total_cost_usd`, sub-agents included). On a Claude
subscription the same work counts against the plan's usage limits instead of being billed. Input tokens include cache
reads and writes.
