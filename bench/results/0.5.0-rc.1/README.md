# Markilo 0.5.0-rc.1 benchmark

9 end-to-end runs of the installed plugin in headless Claude Code, with the product owner unavailable (Markilo
takes its own recommended answers). Scenario briefs and fixture projects are in `bench/scenarios/`; run them with
`node scripts/bench.mjs run all`, then `judge` and `report`.

## Per scenario

| Scenario | Runs | Passed the gate | Blind judge would present it | Minutes (median) | Cost per run (median) |
| --- | --- | --- | --- | --- | --- |
| B2B platform | 1 | 0 of 1 | 0 of 1 | 20.9 | $4.13 |
| Developer tool | 1 | 0 of 1 | 0 of 1 | 15.6 | $3.95 |
| Learning app | 1 | 1 of 1 | 1 of 1 | 23.0 | $5.86 |
| Developer platform (holdout) | 2 | 0 of 2 | 0 of 2 | 30.8 | $5.36 |
| Mobile app | 1 | 0 of 1 | 0 of 1 | 15.9 | $4.20 |
| Independent SaaS | 1 | 0 of 1 | 0 of 1 | 17.2 | $4.56 |
| Team security app (holdout) | 2 | 1 of 2 | 1 of 2 | 18.3 | $4.51 |

Holdout scenarios were written before the changes being measured and never run while tuning. For a family, the
master brand counts.

## Results

| Scenario | Brand | Success | Developed | Passed gate | Finalized · critic | Blind judge | Checks pass/warn/fail | Originality | Files |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B2B platform | Portwise | no | 2/5 | 0/5 | — | — | — | — | 0 |
| Developer tool | Seamline | no | 3/5 | 0/5 | — | — | — | — | 0 |
| Learning app | Quillnest | yes | 4/6 | 1/6 | q-cradle · 6.0 | 6.3 · present | 30/1/0 | insufficient-evidence | 105 |
| Developer platform | Stagewell | no | 3/5 | 0/5 | — | — | — | — | 0 |
| Developer platform | Stagewell | no | 3/5 | 0/5 | — | — | — | — | 0 |
| Mobile app | Dozeline | no | 3/3 | 0/3 | — | — | — | — | 0 |
| Independent SaaS | Tallyline | no | 3/6 | 0/6 | — | — | — | — | 0 |
| Team security app | Pinehold | no | 5/5 | 0/5 | — | — | — | — | 0 |
| Team security app | Pinehold | yes | 3/3 | 1/3 | held-word · 6.5 | 6.3 · present | 19/2/0 | insufficient-evidence | 155 |

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
| Portwise | arch | rejected | 4.4 | not passed | 5.4 · not as is | a plain lowercase w in a squared geometric font (or Greek omega); the wordmark reads 'partwise' because the flat-sided o looks like a single-storey a; techy squared signage lettering (DIN/Eurostile-like) | a heavy rounded lowercase w monogram, close to an omega; a monoline geometric wordmark with a slightly retro 1970s–80s display feel; arch or doorway shapes in the p and o, a loose nod to 'port' |
| Portwise | berth | dropped at sketch review | — | — | — | sketches: s1 a parking sign (P with a parked car); s2 a P with a slot / Pac-man mouth, still parking; s3 a lowercase 'a' or 'q' with a block in it, a different letter | — |
| Portwise | quay | dropped at sketch review | — | — | — | sketches: s1 a hamburger/burger bun or bread loaf over a tray (UI burger-adjacent; also 0 | — |
| Portwise | range | dropped at sketch review | — | — | — | sketches: s5 a horizontal bar chart / left-aligned-text icon (the brief explicitly bans the bar-chart look); s6 a toggle switch or battery, the same toggle reading that struck the first round, and the hollow lower pill reads as a D cut-out; s7 a list/menu icon or a loading-dots progress indicator, muddy at 16 px (86%), and it is still bars | — |
| Portwise | wordmark | rejected | 5.4 | not passed | 5.2 · not as is | a plain geometric-sans lowercase wordmark (Gilroy/Futura-like) with a slightly joined r-t; a squared 'P' like a parking sign; a shield or goblet silhouette (icon) | plain lowercase grotesk wordmark with an r–t crossbar ligature; the icon reads as a U-shaped cup or shield on a stem, not clearly a p; calm, enterprise-safe SaaS green |
| Seamline | dryrun | dropped at sketch review | — | — | — | sketches: s1 stop button / checked checkbox; s2 pagination or loading dots, 2x2 app grid; s3 pie chart (also a Mercedes/radiation-like tri-split); s4 pinwheel of four bars, a crop or fullscreen icon; s5 split diagonal square, the contrast icon | — |
| Seamline | handover | rejected | 5.5 | not passed | 6.1 · not as is | road lane-shift / lanes-merge traffic sign; two parallel lightning-bolt jogs (unfortunate: close to the paired sig-rune 'SS' silhouette); slanted closing double quotation mark or a 'layout shift' UI glyph | two parallel lines jogging sideways, like a lane-shift road sign; a seam or offset joint where two tracks are handed over; a stylised double S / pair of cables |
| Seamline | stitchplan | rejected | 5.2 | not passed | 5.3 · not as is | a dashed 'cut here' line crossed by one bar; a magic wand / sparkle stick at 16 px; amber-and-black caution/construction tape (unfortunate for a safety tool: reads as warning) | a dashed sewing stitch crossed by one perpendicular tack; a 'cut here' perforation line or a chain of pills; a Morse-code or progress-dash pattern |
| Seamline | wordcraft | rejected | 5.5 | not passed | 5.2 · not as is | the letters 'Li' (lithium) or 'Ui' as a monogram; a U-shaped cup/bracket with a dot beside it; in the word, 'seamUne'/'seamLine' with a capital-L glitch — unfortunate: 'UI' for a CLI tool, or a generic Li-ion battery label | an 'Li' ligature joined at the baseline; a squared U or cup shape with a dash; the lithium element symbol or 'LI' initials |
| Seamline | wordseam | dropped at sketch review | — | — | — | sketches: s5 a black m followed by an orange text cursor (m| typed in a terminal), the dev-tool caret cliche, the thread-through-cloth idea does not read and at 16 px it is just m plus a red bar; s6 the plain glyph pair 'ml' with a small orange tab, a lowercase abbreviation in a stock font with no hook; s7 the letters 'in', which reads as LinkedIn's 'in' at once (known-logo strike), and the shared stem is invisible because i+n always share it | — |
| Quillnest | double-l | rejected | 5.8 | not passed | 5.9 · not as is | a serif lowercase n; a doorway or arch with a dot / keyhole; a torii-like gate or pi sign | a heavy serif lowercase 'n' or 'Π' with a red dot, like a doorway with a ball inside; an 'll' ligature that makes the wordmark read as 'quinnest' or 'quiflnest'; a bookish editorial slab mark, like a literary magazine |
| Quillnest | loop-nest | rejected | 4.7 | not passed | 4.5 · not as is | a loading spinner / refresh icon; an apple or cherry with a stem; a power-button or letter C/G ring | power/standby button icon; loading spinner or refresh arrow; apple or fruit with a stem |
| Quillnest | next-step | rejected | 5.8 | not passed | 6.0 · not as is | a handwritten cursive lowercase l; a signature flourish or loose cursive e; a looped ribbon / swoosh | cursive handwritten letter l with an upswing; a check-mark-like stroke ending upward; a looping ribbon or signature flourish |
| Quillnest | pieces | dropped at sketch review | — | — | — | sketches: s1 a peeled sticker / folded page corner (document cliché); s2 toddler shape-sorter blocks (childish, against the brief); s3 a striped candy or flag, a block sliced on a slant (cut device); s4 an app-grid/widget or Microsoft-style tile cluster (UI icon) | — |
| Quillnest | q-cradle | approved | 6.0 | passed | 6.3 · present | a lowercase 'qu' ligature; a q beside a sideways smiley (dot eye over a smile curve); a little figure or egg held in a hammock/cradle — unfortunate: an emoji-like winking face, nudging it toward kid-app | a smiling face built from a q, with the orange dot as a nose or tongue; a nest cradling an egg, made from the q's descender; a lowercase q whose long tail sweeps under 'nest' in the lockup |
| Quillnest | swipe | dropped at sketch review | — | — | — | sketches: s1 a hamburger/sandwich (dark bun, cheese slice) or a label band on a box; s2 a list/menu UI icon with a sticky note; s3 a burger with cheese and tomato; s4 a dark tile split by a slash (the cut device, generic); s5 a yellow E/plug shape on a block | — |
| Stagewell | guarded-block | dropped at sketch review | — | — | — | sketches: s1 a square in code brackets [■] - camera focus box / code editor icon; struck | — |
| Stagewell | stepped-ll | rejected | 4.5 | not passed | 5.7 · not as is | the word 'stagewe' followed by a stray glyph (a 4, an h or a Cyrillic ch); a Z-shaped stair bracket or Tetris-like step piece; a Hebrew or Armenian letter -- worst case the audience reads the product name as misspelled or truncated | the word 'stagewe' followed by an odd glyph that reads more like a '4' or a Hebrew letter than 'll'; a stepped zigzag stroke that stands for a staged rollout; a calm deep-green geometric sans that looks like infrastructure branding |
| Stagewell | stepped-well | rejected | 4.6 | not passed | 5.5 · not as is | a descending stair/bar chart falling into a cup; a low-battery or fill-level indicator with an orange bar; a factory or building silhouette -- worst case a declining-metrics chart for a product whose job is protecting error rates | staircase descending into a rectangular pit or container; factory or building silhouette beside a U-shaped cutout holding a minus sign; stepped bar chart or progress meter with a slot |
| Stagewell | two-wells | rejected | 5.3 | not passed | 5.0 · not as is | a lowercase W monogram (two U cups joined); a shot glass or pint of beer dropped into a cup; a molar tooth / two rounded bowls | a rounded double-U 'w' with an orange cup or glass in its left bowl; two connected wells or containers, one partly filled, suggesting partial rollout; an odd custom glyph that sits apart from a generic geometric-sans wordmark |
| Stagewell | widening-field | dropped at sketch review | — | — | — | sketches: s1 a wifi/signal quarter-fan (radiating arcs from a corner), struck; s2 a volume/speaker or megaphone icon (small tip, taller slanted bars), also an ascending bar chart, struck; s3 a folding hand fan / bar-chart of growing blades from a pivot, struck | — |
| Stagewell | cohort | rejected | 5.1 | not passed | 5.2 · not as is | a hash/grid sign cut into a circle (window grille, drain grate); a crosshair or round cross-hatched waffle; a 3x3 window with one orange LED bar like a status indicator. Unfortunate: a manhole/drain cover or a Slack-style hashtag | a circle sliced into a grid of cells with one orange cell marked out; a hash or grid symbol inside a disc, like a window or a manhole cover; a segmented globe or crosshair |
| Stagewell | handover | dropped at sketch review | — | — | — | sketches: s1 a toggle switch in the on position (rounded frame with a knob at the right; forbidden by the brief), also a battery or record icon; s2 a rounded square cut by a slash, a stock sliced-square/prohibition shape, closest to Unleash; s3 the copy/duplicate UI icon (two offset squares), the XOR-overlap hole is a Pathfinder default; s4 a chain link / hyperlink UI icon, secondarily the letters G-S or C-5 | — |
| Stagewell | stagewell-word | rejected | 4.7 | not passed | 4.9 · not as is | the word Stagewell in a friendly geometric sans with a long t-crossbar running into the a; an 'St' typed in a stock (mono-ish) font, like a periodic-table tile; the abbreviation 'St' for Street/Saint (unfortunate: icon looks like a file-type or language badge in VS Code, terracotta reads coffee/craft brand rather than infrastructure) | Clean grotesk wordmark whose t crossbar stretches over the a like a level platform or stage; A long horizontal stroke that can also read as a strikethrough; An 'St' monogram that looks like a font sample, not a mark |
| Stagewell | steps | dropped at sketch review | — | — | — | sketches: s4 Pac-Man with a jagged mouth (also flagged review-risk vs the Statsig icon); s5 a loading spinner / progress ring, or a C inside a ring - a UI status icon; s6 a staircase in a circle, the generic 'stairs/progress' pictogram, a split disc at 85% stock-circle similarity and review-risk vs the Unleash icon | — |
| Stagewell | well | rejected | 5.5 | not passed | 6.0 · not as is | a Greek-key / square-spiral meander fragment; a lowercase 'lb' or 'b' boxed in a frame; a picture-in-picture / window-layout UI icon (unfortunate: reads as an editor layout or 'insert image' button inside VS Code) | a square spiral or Greek-key meander; a maze path that leads in to a centre square; a stylised lowercase 'b' or 'p' framed in a box |
| Dozeline | drawn-blind | rejected | 5.3 | not passed | 4.5 · not as is | wallet or purse with a snap tab; lidded box / bread bin / lunchbox; dripping paint tin or tote bag | a wallet or card holder with a clasp; a paint can or bucket dripping; a slanted drawer or envelope with a tab |
| Dozeline | last-light | rejected | 5.0 | not passed | 5.6 · not as is | euro sign (an e struck through by a bar); a sunset half-disc on a horizon inside an e; a strikethrough/delete on the final e of the wordmark | a lowercase e with a struck-through crossbar, close to a euro sign or a strikethrough glyph; a sun setting on a horizon line inside the e's counter; an e-brand or email/browser-style letter icon |
| Dozeline | settling-line | rejected | 5.7 | not passed | 5.0 · not as is | a ball bouncing down to rest; three elbow-macaroni or horseshoe shapes stepping down a stair; a question mark built of arcs (unfortunate: 'loading/thinking' or a pasta brand) | a ball bouncing down steps; three magnet or horseshoe arches with a dot; a stylised descending 'zzz' coming to rest |
| Tallyline | a-gate | rejected | 5.7 | not passed | 4.9 · not as is | a cursive lowercase l loop on a baseline; a signature flourish or pen stroke; a looped ribbon / hair tie (worst case: a scribbled 'l' in a 'T' brand) | a cursive looped letter l sitting on a baseline; an awareness ribbon or a pen signature flourish; a serif wordmark with one handwritten letter swapped in |
| Tallyline | b-stones | rejected | 5.2 | not passed | 4.9 · not as is | toes of a footprint / paw; moon phases or an eclipse sequence; a caterpillar or comet trail (worst case: toes) | three overlapping stepping stones or pebbles growing toward the lower right; a moon-phase or eclipse sequence ending in a full terracotta disc; footprints or a caterpillar, a loose nod to growing totals |
| Tallyline | c-horizon-t | rejected | 4.8 | not passed | 4.3 · not as is | a stepped-up line or rising chart (the ascending chart the brief bans, never a T); a hockey stick or pipe elbow; a ski-jump ramp | a rising S-curve line leveling into a flat bar, like a growth curve plateauing; a swash or brushstroke underline; an abstract italic T or a hockey-stick shape |
| Tallyline | d-double-rule | dropped at sketch review | — | — | — | sketches: s1 a t underlined twice (plain letter+underline); s2 a t sliced into bands (initial with a cut); s3 a currency sign - Turkish lira / tenge-like t with two bars, a money-symbol read the brief bans; s4 a document/page with a t and rule lines (the product's own object); s5 blackletter 'tt' / t split by a slit (initial with a cut) | — |
| Tallyline | e-pair | dropped at sketch review | — | — | — | sketches: s1 two interlocking L-blocks / Tetris-style step fit (stock geometry, stockShape 0 | — |
| Tallyline | f-fading-ticks | dropped at sketch review | — | — | — | sketches: s1 a battery/progress bar or pause+toggle; s2 a bulleted list UI icon; s3 an app-grid/menu icon or dice; s4 tally marks turning into an audio-level/loading dots column - tally marks are the product's own object for a brand literally named Tally(line), and the solid-to-dotted bars read as a chart/progress indicator the brief warns against | — |
| Pinehold | cradle | rejected | 5.8 | not passed | 4.6 · not as is | a little figure with raised arms sitting in a bowl or hot tub; a waving or flailing (drowning) person; a wifi/sound-wave signal from the trailing arc | a blob figure with arms raised, cheering or surrendering, inside a bowl; a sun or head setting into a cradle, with a wifi-like signal arc; a squid or octopus mascot |
| Pinehold | joined | verified | 5.6 | not passed | 5.3 · not as is | the letters Jh or Uh, a person's initials; a fish hook joined to an h; the wordmark reads 'pin hold' / 'pinchold' because the e has lost its eye (unfortunate: 'uh', a hesitation, for a trust product) | the letters 'Jh' or 'uh': a hook joined to a serif h; a warm, bookish serif wordmark where the e's tail swoops under to cradle the h; an editorial or publishing brand rather than software |
| Pinehold | overlap | verified | 5.5 | not passed | 4.8 · not as is | an eye or almond-shaped hole punched in a rounded blob; a speech bubble / guitar pick with a leaf cut-out; a fish or bitten shape facing right (unfortunate: a watching eye, surveillance, for a secrets product) | an eye or watching lens; two overlapping leaf or petal tiles; a fish or bird head |
| Pinehold | seed-o | rejected | 5.6 | not passed | 4.6 · not as is | a flame in a cup (chalice / torch / candle); a seed or sprout in a U; a drop of oil in a cradle (fuel brand) | a flame or match held in cupped green hands; a candle or a sprout in a bowl; a pin or sewing needle in a horseshoe |
| Pinehold | tiers | rejected | 4.1 | not passed | 4.1 · not as is | a carrot or pineapple top; a torch or spiky crown on a pedestal; a trident / spearheads | a crown or trident of spikes above a bar; a bundle of grass or carrot top tied with a band; a torch or award ribbon |
| Pinehold | held-word | approved | 6.5 | passed | 6.3 · present | an arch or shelter holding a seed; a lowercase n with a leaf inside; a greenhouse / eco 'home + leaf' badge — unfortunate: a tomb niche or mouse hole | an arch or doorway sheltering an orange seed or leaf; a lowercase n that holds something inside it; a friendly nature-tech wordmark in pine green and terracotta |
| Pinehold | huddle | rejected | 4.8 | not passed | 5.3 · not as is | a braided strand or Celtic knot; a stylised letter A / R / lambda; tongs or tweezers — unfortunate: a crossed-out or broken R glyph | interlaced strands or a braid of ribbons; a stylized letter R or the letter K; a DNA helix or a Celtic knot fragment |
| Pinehold | scales | rejected | 5.2 | not passed | 5.0 · not as is | the Hong Kong bauhinia flower (flag emblem); a pinwheel or fan; a five-petal flower — unfortunate: a political/regional emblem for an international software product | five-petal flower or blossom; spinning pinwheel; swirl logo for a wellness or garden brand |

## Critic vs blind judge

29 concepts reached the critique. The gate and the blind judge agreed on 29 of them (gate passed ↔ judge would present as is). Mean critic score 5.3, mean judge score 5.2.

## Cost and effort

| Scenario | Run | Minutes | Turns | Sub-agents | Tokens in / out | Cost (API equivalent) | Models |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B2B platform | ok | 20.86 | 3 | 14 | 9574k / 142k | $4.13 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |
| Developer tool | ok | 15.59 | 2 | 15 | 8597k / 129k | $3.95 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |
| Learning app | ok | 22.98 | 9 | 17 | 14456k / 203k | $5.86 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |
| Developer platform | ok | 36.3 | 1 | 16 | 16103k / 176k | $5.49 of $20 | claude-sonnet-5-5, claude-opus-5-5 |
| Developer platform | ok | 25.29 | 3 | 16 | 12134k / 180k | $5.22 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |
| Mobile app | ok | 15.88 | 3 | 13 | 10013k / 131k | $4.20 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |
| Independent SaaS | ok | 17.24 | 4 | 16 | 10198k / 152k | $4.56 of $20 | claude-sonnet-5-5, claude-opus-5-5 |
| Team security app | ok | 23.06 | 2 | 18 | 13004k / 195k | $5.64 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |
| Team security app | ok | 13.6 | 9 | 11 | 7323k / 118k | $3.37 of $20 | claude-sonnet-5-5, claude-haiku-5-5, claude-opus-5-5 |

Cost is the API list-price equivalent Claude Code reports (`total_cost_usd`, sub-agents included). On a Claude
subscription the same work counts against the plan's usage limits instead of being billed. Input tokens include cache
reads and writes.
