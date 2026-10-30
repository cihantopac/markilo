# Markilo 0.4.0-rc.5 benchmark

9 end-to-end runs of the installed plugin in headless Claude Code, with the product owner unavailable (Markilo
takes its own recommended answers). Scenario briefs and fixture projects are in `bench/scenarios/`; run them with
`node scripts/bench.mjs run all`, then `judge` and `report`.

## Per scenario

| Scenario | Runs | Passed the gate | Blind judge would present it | Minutes (median) | Cost per run (median) |
| --- | --- | --- | --- | --- | --- |
| Developer tool (holdout) | 3 | 1 of 3 | 0 of 3 | 17.0 | $3.32 |
| Online shop (holdout) | 3 | 0 of 3 | 0 of 3 | 16.2 | $3.51 |
| Multi-product family | 1 | 0 of 1 | 0 of 1 | 18.2 | $4.41 |
| Mobile app | 1 | 0 of 1 | 0 of 1 | 13.6 | $2.98 |
| Independent SaaS | 1 | 1 of 1 | 0 of 1 | 10.8 | $3.07 |

Holdout scenarios were written before the changes being measured and never run while tuning. For a family, the
master brand counts.

## Results

| Scenario | Brand | Success | Developed | Passed gate | Finalized · critic | Blind judge | Checks pass/warn/fail | Originality | Files |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Developer tool | Seamline | no | 1/3 | 0/3 | — | — | — | — | 0 |
| Developer tool | Seamline | yes | 1/3 | 1/3 | mirror-s · 6.8 | 5.8 · not as is | 16/0/0 | insufficient-evidence | 81 |
| Developer tool | Seamline | no | 2/3 | 0/3 | — | — | — | — | 0 |
| Online shop | Kilnroom | no | 1/3 | 0/3 | — | — | — | — | 0 |
| Online shop | Kilnroom | no | 1/3 | 0/3 | — | — | — | — | 0 |
| Online shop | Kilnroom | no | 1/3 | 0/3 | — | — | — | — | 0 |
| Multi-product family | Lumenfold | no | 1/3 | 0/3 | — | — | — | — | 0 |
| Multi-product family | Lumenfold Docs | no | 0/1 | 0/1 | — | — | — | — | 0 |
| Multi-product family | Lumenfold Sheets | no | 0/1 | 0/1 | — | — | — | — | 0 |
| Multi-product family | Lumenfold Sign | no | 0/1 | 0/1 | — | — | — | — | 0 |
| Mobile app | Dozeline | no | 1/3 | 0/3 | — | — | — | — | 0 |
| Independent SaaS | Tallyline | yes | 3/3 | 1/3 | round-trip · 6.6 | 5.8 · not as is | 16/0/0 | insufficient-evidence | 81 |

Success means a concept passed the quality gate, was finalized with no failing check and exported. Developed means
the concept got past the sketch review and was critiqued. Critic is
Markilo's own design-critic agent (average of its judgment scores). The blind judge is a separate model call that saw
only the brief and rendered images of each concept, with no rationale or scores: the average of distinctiveness,
memorability, brand fit, craft and versatility (0–10), and whether it would present the mark as is. It sees the
symbol on white, its 16–256 px sheet and, for a finalized concept, the horizontal lockup — not the app-icon tile.
Judge model: claude-opus-5-5.

## Concepts

| Brand | Concept | Status | Critic | Gate | Blind judge | Critic's first readings | Judge's first readings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Seamline | offset-s | rejected | 5.8 | not passed | 5.4 · not as is | heavy S/3 with a slash through it; glitch or censored letter (dollar-sign-like); a Pac-Man style chopped C/G | an S sliced into three horizontal bands with the middle band shifted; a glitched or misregistered letterform, like an S with a strike-through; a reversed 3 or a currency-like sign at small sizes |
| Seamline | stepped-path | dropped at sketch review | — | — | — | sketches: s1 blocky Z/S letter or flag; s2 prohibited sign/coffee bean/pill; s3 letter X or hourglass; s4 C+D letter pair or yin-yang | — |
| Seamline | through-line | dropped at sketch review | — | — | — | sketches: s1 speed bump/arch/tilde-caret; s2 stair-step or pipe bend (forbidden stairs); s3 pill capsule or 'i', gone at 16px; s4 letter O/6; s5 letter S | — |
| Seamline | mirror-s | approved | 6.8 | passed | 5.8 · not as is | letter S built from two hooks; horseshoe magnets / cable clips; a stylised 5 or c-over-u | a stylized S split into two mirrored hooks; two paperclip or staple halves about to interlock; a pair of magnets or connectors with a gap between them |
| Seamline | overlap | dropped at sketch review | — | — | — | sketches: s1 pie chart; s2 chat bubble/app tile; s3 leaf/flag shapes; s4 tadpole/sperm; s5 pizza slice with eclipse or Pac-Man | — |
| Seamline | shift | dropped at sketch review | — | — | — | sketches: s1 digit 2 or S/5; s2 division sign; s3 easing-curve/S icon; s4 prohibited/no-sign | — |
| Seamline | live-through | rejected | 6.4 | not passed | 6.0 · not as is | hamburger / menu icon; three stacked bars (list or equals sign); a toggle or stacked-layers UI glyph | two offset blocks split by a green line — a seam or cut; stylized hamburger / stacked-layers icon; abstract 'S' or equal-sign / strikethrough glyph |
| Seamline | offset-seam | dropped at sketch review | — | — | — | sketches: s1 a stair step or L-block; s2 a square with a swirl or Z cut, near a pinwheel or Liquibase-like block; s3 the letter S or 5 in a pixel font; s4 a rounded app tile with a squiggle slit | — |
| Seamline | stepped-s | rejected | 5.9 | not passed | 5.8 · not as is | Internet Explorer / Edge style 'e'; blue disc with a slot cut (app-icon badge); pause or toggle glyph | a solid disc split by a stepped seam with offset halves; a stylized numeral 2 or lowercase e; a broken or rotated power/toggle glyph |
| Kilnroom | door | dropped at sketch review | — | — | — | sketches: s1 arch/doorway icon; s2 arch-in-arch portal/app icon; s3 split tombstone; s4 arch with notch, keyhole/lock-ish | — |
| Kilnroom | pair | rejected | 5.7 | not passed | 5.0 · not as is | double zero / two ovals side by side; letters 'oo' or 'OD'; a pair of eyes or a toggle/infinity-like glasses shape | the letters 'ad' or 'oo' / 'ab'; a pair of googly eyes or binoculars; an infinity loop or ligature monogram cut in half |
| Kilnroom | shelf | dropped at sketch review | — | — | — | sketches: s1 coffee bean/pill/cut disc; s2 dot cluster, bubbles or a molecule; s3 play-button triangles in a ring, recycle-ish; s4 letter N | — |
| Kilnroom | pool | dropped at sketch review | — | — | — | sketches: s6 paint drop or speech bubble with a tail; s7 plug or tangled noodle on a disc; s8 magnifier or search icon; s9 ball-and-bulb, a metaball or male symbol | — |
| Kilnroom | stack | rejected | 5.9 | not passed | 6.0 · not as is | a stack of H/I-beam slabs (工 or Ξ-like glyph); a bookshelf or shelving unit with one drawer pulled out; a stylised letter E or Hebrew-like character | an abstract stacked glyph like a Ξ or the kanji 王; a shelving or kiln-furniture stack of slabs and posts; a pill-shaped toggle or UI icon |
| Kilnroom | threshold | dropped at sketch review | — | — | — | sketches: s6 sliced donut or broken arch, two fragments; s7 sliced coin or ball; s8 folding fan or open scissors; s5 K-flag | — |
| Kilnroom | chop | dropped at sketch review | — | — | — | sketches: s5 camera lens/target; s6 power/recycle/gear ring; s7 fingerprint (biometric UI icon); s4 K node tile duplicates glaze s8; s1-s3 dice/faces/blobs | — |
| Kilnroom | door | dropped at sketch review | — | — | — | sketches: s5 magnet/horseshoe on a bar; s6 target/bullseye/eye; s7 Hangul letter or shelf-stack glyph; s8 parentheses in an app tile | — |
| Kilnroom | glaze | rejected | 5.6 | not passed | 4.6 · not as is | rewind / skip-back media glyph (|< plus chevron); stylised K or double back-arrow; folded paper / tag shapes | geometric K monogram; rewind / skip-back media chevrons; angular arrow pointing left |
| Lumenfold | crease | rejected | 6.6 | not passed | 5.6 · not as is | letter L with a diagonal slash; boot or flag with a gold wedge; cut-off corner or folded paper | a heavy letter L monogram cut by a diagonal slash; a folded paper corner, with the gold triangle as the turned-back flap; a road or railway sign glyph |
| Lumenfold | ribbon | dropped at sketch review | — | — | — | sketches: s4 two floating shards, a caret or broken stick; at 16 px two specks, no hook; s5 a digit 9/S or a snail/curl with a brass blob (cliché trio), sign member reads as a comma-blob | — |
| Lumenfold | slit | dropped at sketch review | — | — | — | sketches: s5 a clipped dark tile with two brass bars (circuit chip / bandage; sheets and sign members collapse to generic diagonal stripes); s6 a dark quarter-disc with brass ticks (pie wedge, protractor, fan) | — |
| Dozeline | dimmer | dropped at sketch review | — | — | — | sketches: a1 rounded blob/UI tile; a2 barcode or pill toggle; a3 slashed circle (prohibited sign); a4 striped retro sun/no-entry | — |
| Dozeline | lid | dropped at sketch review | — | — | — | sketches: a1 hamburger/bun or sunset; a2 pill box or clapperboard; a3 Stonehenge/trousers; a4 door/arch UI icon | — |
| Dozeline | settle | rejected | 5.9 | not passed | 5.8 · not as is | the letters 'I / _' or 'IL' typed as a slash and underscore; a bar chart or progress/sort glyph; a tipping domino sequence | three bars tipping from upright to lying flat, a body settling down to sleep; the letters 'I/_' or a loading/progress glyph; a falling-domino or volume-level indicator |
| Tallyline | ahead | rejected | 4.8 | not passed | 4.0 · not as is | T with quotation marks; a T plus two slashes; a quote/citation glyph | letter T followed by a closing quotation mark or ditto/inch symbol; a T with forward speed slashes; a typographic monogram, not a finance mark |
| Tallyline | round-trip | approved | 6.6 | passed | 5.8 · not as is | letter C and D / S-shape; two offset brackets or parentheses; dollar/cycle UI icon | a chain-link or 'connected' icon made of two offset half-rings; a 'CD' or 'CO' monogram; two brackets passing something back and forth, like money going out and coming back in |
| Tallyline | twin-l | rejected | 6.0 | not passed | 5.4 · not as is | The letter L; nested stair steps / corner brackets; a bar-chart or layers icon | two nested letter L shapes; a chart's corner axes with a block inside; a Tetris-like block piece |

## Critic vs blind judge

12 concepts reached the critique. The gate and the blind judge agreed on 10 of them (gate passed ↔ judge would present as is). Mean critic score 6.0, mean judge score 5.4.

## Cost and effort

| Scenario | Run | Minutes | Turns | Sub-agents | Tokens in / out | Cost (API equivalent) | Models |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Developer tool | ok | 10.17 | 3 | 12 | 5385k / 81k | $2.29 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |
| Developer tool | ok | 18.99 | 11 | 15 | 9881k / 131k | $3.65 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |
| Developer tool | ok | 17.04 | 4 | 14 | 8532k / 122k | $3.32 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |
| Online shop | ok | 15.98 | 3 | 13 | 7312k / 115k | $2.99 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |
| Online shop | ok | 16.19 | 2 | 14 | 9711k / 137k | $3.70 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |
| Online shop | ok | 18.11 | 3 | 13 | 8995k / 136k | $3.51 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |
| Multi-product family | ok | 18.24 | 2 | 12 | 10205k / 178k | $4.41 of $25 | claude-sonnet-5-5, claude-haiku-5-5 |
| Mobile app | ok | 13.56 | 3 | 13 | 7651k / 110k | $2.98 of $20 | claude-sonnet-5-5, claude-haiku-5-5 |
| Independent SaaS | ok | 10.79 | 10 | 16 | 7859k / 106k | $3.07 of $20 | claude-sonnet-5-5 |

Cost is the API list-price equivalent Claude Code reports (`total_cost_usd`, sub-agents included). On a Claude
subscription the same work counts against the plan's usage limits instead of being billed. Input tokens include cache
reads and writes.
