# Markilo 0.4.0-rc.2 benchmark

3 end-to-end runs of the installed plugin in headless Claude Code, with the product owner unavailable (Markilo
takes its own recommended answers). Scenario briefs and fixture projects are in `bench/scenarios/`; run them with
`node scripts/bench.mjs run all`, then `judge` and `report`.

## Results

| Scenario | Brand | Success | Developed | Passed gate | Finalized · critic | Blind judge | Checks pass/warn/fail | Originality | Files |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Multi-product family | Lumenfold | no | 0/3 | 0/3 | — | — | — | — | 0 |
| Multi-product family | Lumenfold Docs | no | 0/0 | 0/0 | — | — | — | — | 0 |
| Multi-product family | Lumenfold Sheets | no | 0/0 | 0/0 | — | — | — | — | 0 |
| Multi-product family | Lumenfold Sign | no | 0/0 | 0/0 | — | — | — | — | 0 |
| Mobile app | Dozeline | yes | 1/3 | 1/3 | settling-line · 6.5 | 5.2 · not as is | 13/1/0 | insufficient-evidence | 116 |
| Independent SaaS | Tallyline | no | 0/3 | 0/3 | — | — | — | — | 0 |

Success means a concept passed the quality gate, was finalized with no failing check and exported. Developed means
the concept got past the sketch review and was critiqued. Critic is
Markilo's own design-critic agent (average of its judgment scores). The blind judge is a separate model call that saw
only the brief and rendered images of each concept, with no rationale or scores: the average of distinctiveness,
memorability, brand fit, craft and versatility (0–10), and whether it would present the mark as is. It sees the
symbol on white, its 16–256 px sheet and, for a finalized concept, the horizontal lockup — not the app-icon tile.

## Concepts

| Brand | Concept | Status | Critic | Gate | Blind judge | Critic's first readings | Judge's first readings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lumenfold | crease-light | dropped at sketch review | — | — | — | sketches: s1 toilet/boot; s2 open lid; s3 flag or boot; s4 clipboard with folded corner (page cliche); s5 hinged flap; s6 stacked drawers; s7 boot/hockey stick; s8 wallet or envelope | — |
| Lumenfold | folded-disc | dropped at sketch review | — | — | — | sketches: s1 peeling sticker; s2 swirl/yin-yang cookie; s3 peeled sticker or moon; s4 crescent moon with a slice; s5 smiley | — |
| Lumenfold | ribbon-l | dropped at sketch review | — | — | — | sketches: s1 brochure or map; s2 warning triangle or Delta; s3 flag or T; s4 open book; s5 play button on a book | — |
| Dozeline | ajar-light | dropped at sketch review | — | — | — | sketches: s1 broken shards (fail); s2 door/bottle silhouette; s3 ellipse with parallelogram (eye/pill/UI toggle); s4 d with misregistered stem (letter, glitchy); s5 L plus wedge (fail) | — |
| Dozeline | d-glow | dropped at sketch review | — | — | — | sketches: s1 d with play-button triangle counter; s2 lamp/bell/dome with post; s3 plain heavy bold d; s4 d cut by a stripe (glitch/clipped) | — |
| Dozeline | settling-line | approved | 6.5 | passed | 5.2 · not as is | person lying down with head resting on a bed; squiggle/worm with a dot; wave or hill flattening out | a thick wavy squiggle settling into a flat line with a ball nestled in a notch, like a head resting on a pillow or a worm; a person lying down or a rolling ball on a slide; an abstract ambiguous blob, possibly a generic wellness or fintech glyph |
| Tallyline | bridge | dropped at sketch review | — | — | — | sketches: s1 letter r/n plus block; s2 umbrella/fan with a block; s3 doorway or arch; s4 lowercase n (or m) / gate; s5 two blobs with a swoosh | — |
| Tallyline | cairn | dropped at sketch review | — | — | — | sketches: s1 sliced stone/macaron; s2 diagonal-striped squircle (candy or pill); s3 sliced pie or play-like wedge; s4 split egg/pebble | — |
| Tallyline | horizon | dropped at sketch review | — | — | — | sketches: s1 striped retro sunset; s2 striped dome/slabs; s3 half-disc with line; s4 pie chart wedge (growth-chart-adjacent); s5 striped sunset | — |

## Critic vs blind judge

1 concept reached the critique. The gate and the blind judge agreed on 0 of them (gate passed ↔ judge would present as is). Mean critic score 6.5, mean judge score 5.2.

## Cost and effort

| Scenario | Run | Minutes | Turns | Sub-agents | Tokens in / out | Cost (API equivalent) | Models |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Multi-product family | ok | 9.3 | 4 | 9 | 3591k / 75k | $1.82 of $25 | claude-sonnet-5-5, claude-haiku-5-5 |
| Mobile app | ok | 14.77 | 9 | 13 | 6882k / 96k | $2.68 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |
| Independent SaaS | ok | 8.14 | 5 | 9 | 3092k / 55k | $1.60 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |

Cost is the API list-price equivalent Claude Code reports (`total_cost_usd`, sub-agents included). On a Claude
subscription the same work counts against the plan's usage limits instead of being billed. Input tokens include cache
reads and writes.
