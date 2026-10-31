# Markilo 0.5.0-rc.1 on the sealed 1.0 holdouts (baseline)

5 end-to-end runs of the installed plugin in headless Claude Code, with the product owner unavailable (Markilo
takes its own recommended answers). Scenario briefs and fixture projects are in `bench/scenarios/`; run them with
`node scripts/bench.mjs run all`, then `judge` and `report`.

## Per scenario

| Scenario | Runs | Passed the gate | Blind judge would present it | Minutes (median) | Cost per run (median) |
| --- | --- | --- | --- | --- | --- |
| AI assistant (holdout) | 1 | 0 of 1 | 0 of 1 | 26.7 | $7.68 |
| Coffee roaster (holdout) | 1 | 0 of 1 | 0 of 1 | 24.8 | $6.63 |
| Energy cooperative (holdout) | 1 | 0 of 1 | 0 of 1 | 23.5 | $8.14 |
| Outdoor gear (Turkish name) (holdout) | 1 | 0 of 1 | 0 of 1 | 28.0 | $8.39 |
| Health app (holdout) | 1 | 0 of 1 | 0 of 1 | 29.8 | $9.59 |

Holdout scenarios were written before the changes being measured and never run while tuning. For a family, the
master brand counts.

## Results

| Scenario | Brand | Success | Developed | Passed gate | Finalized · critic | Blind judge | Checks pass/warn/fail | Originality | Files |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AI assistant | Quorvo | no | 2/5 | 0/5 | underline · 6.5 | 6.2 · not as is | 22/5/0 | insufficient-evidence | 155 |
| Coffee roaster | Emberwick | no | 4/7 | 0/7 | — | — | — | — | 0 |
| Energy cooperative | Sunvale | no | 7/7 | 0/7 | — | — | — | — | 0 |
| Outdoor gear (Turkish name) | Göçebe | no | 4/6 | 0/6 | — | — | — | — | 0 |
| Health app | Kinetra | no | 4/7 | 0/7 | — | — | — | — | 0 |

Success means a concept passed the quality gate, was finalized with no failing check and exported. Developed means
the concept got past the sketch review and was critiqued. Critic is
Markilo's own design-critic agent (average of its judgment scores). The blind judge is a separate model call that saw
only the brief and rendered images of each concept, with no rationale or scores: the average of distinctiveness,
memorability, brand fit, craft and versatility (0–10), and whether it would present the mark as is. It sees the
symbol on white, its 16–256 px sheet and, for a finalized concept, the horizontal lockup — not the app-icon tile.
Judge model: panel opus:2,sonnet:2.

## Concepts

| Brand | Concept | Status | Critic | Gate | Blind judge | Critic's first readings | Judge's first readings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Quorvo | cairn | dropped at sketch review | — | — | — | sketches: s6 a piggy bank or toilet seen from the side, a coin slot / the digit 0 on a shelf; s7 a ghost or round face with an exclamation mark; s8 an egg or pawn above a progress bar with a dot ('0 | — |
| Quorvo | door-ajar | rejected | 6.0 | not passed | 6.4 · not as is | a Greek capital Gamma or a squared-off r beside a slanted gold block (r + ramp, 'rA'); a doorstop or ramp wedge standing next to a bracket; a doorway with light falling through (only third, and only on reflection) -- unfortunate: an exit/leave sign, a cheese wedge | an open door with a wedge of warm light spilling through the gap; a stylized letter R or abstract Q-less monogram built from a bracket and a wedge; a doorway/exit sign suggesting leaving a meeting |
| Quorvo | fold | dropped at sketch review | — | — | — | sketches: s1 tally marks or equalizer bars next to a card (finance/tally cliché, 'IIII'); s2 a paperclip or magnet hook / a 'J' — no fold reads; s3 a pause glyph beside a card, or a deck of cards; s4 a loudspeaker/volume UI icon (square + flared trapezoid) | — |
| Quorvo | loose-end | dropped at sketch review | — | — | — | sketches: s5 the chain-link (hyperlink) UI icon, broken; s6 a pretzel / link icon with a dragged tail; s7 the link icon in a stock green squircle (stock 0 | — |
| Quorvo | underline | approved | 6.5 | not passed | 6.2 · not as is | a warm serif lowercase word whose q-descender swashes into an underline, like a hand-underlined note; the symbol alone as 'q_' / 'qL', a lowercase q with a typing-cursor underscore; a classic display-serif swash tail (the generic 'signature underline' trope). Unfortunate: the standalone q_ reads as a terminal prompt/placeholder or an unfinished letter | a serif lowercase 'q' whose tail swings into an underline, like a signed note; 'q_' or 'qL', close to a text cursor or terminal prompt at small sizes; a calm, bookish editorial wordmark rather than a tech logo |
| Emberwick | crossed-w | dropped at sketch review | — | — | — | sketches: s1 a W monogram with a diamond hole (sporty/automotive badge); s2 'Wi' with a diamond tittle, the round-1 dot-on-i trick again; s3 a W with a tall pointed middle, still a W; s4 an app-icon tile with a W, UI geometry; s5 two offset Vs, a stepped copy of the initial | — |
| Emberwick | direct-line | dropped at sketch review | — | — | — | sketches: s1 an awareness ribbon (or a lasso / pin), with a ball on the end; s2 a striped bug or bee, or a ball of yarn (an insect is a bad reading for a food brand); s3 a spiral in a disc, a snail shell or a 9/6 in a circle, stock shape 77% | — |
| Emberwick | eight | rejected | 5.2 | not passed | 4.9 · not as is | a brick wall; a chocolate bar or waffle; an app-grid or keypad icon | a modular S or squiggle drawn on a grid of rounded tiles; a set of keyboard keys or app-icon tiles; a hashtag, or a dollar sign made of blocks |
| Emberwick | ember-dot | rejected | 5.8 | not passed | 6.1 · not as is | a lowercase serif i with a chunky tilted dot; an info (i) icon; a coal or rock on a stem (unfortunate: the help/info button) | a lowercase serif wordmark whose i-dot is replaced by a rust-coloured faceted pebble; a candle wick with a glowing ember on top, if you're looking for it; an 'i' information icon or a gemstone when the symbol stands alone |
| Emberwick | impression | rejected | 6.7 | not passed | 6.4 · not as is | the section sign (§); a lowercase e stacked on an upside-down e; a figure 8 or swash g | section sign (§); a lowercase e stacked on an upside-down e or schwa; a serif g or an ampersand-like ligature |
| Emberwick | sort | rejected | 5.1 | not passed | 5.4 · not as is | a rubber stamp with an e on it; a perfume bottle or kitchen weight; an approve/stamp UI icon (unfortunate: office paperwork tool) | rubber stamp with a lowercase e; perfume or ink bottle; weight or kettlebell icon |
| Emberwick | warm-house | dropped at sketch review | — | — | — | sketches: s1 a fireplace or bread/pizza oven with a glow (also a gravestone or mouse hole); s2 a keyhole or a figure/candle under an arch; s3 an oven or fireplace on a shelf; s4 the letters n and l, or a bar chart | — |
| Sunvale | sv-between | rejected | 5.8 | not passed | 6.1 · not as is | two figures (adult and child) with a ball between them; two leaning rounded slabs like gravestones; a broken lowercase n with a dot | sun setting in a valley between two rounded hills or standing stones; two tilted tombstones with an orange disc between them; two leaning figures sharing a sun, or an abstract lowercase 'i' shape |
| Sunvale | sv-commons | rejected | 5.2 | not passed | 4.9 · not as is | a shop awning / market-stall store icon; a skirt or tutu; a little table or stool with a top bar | market-stall awning or shop canopy; small stool or table with a scalloped skirt; a shopfront or bakery icon |
| Sunvale | sv-sterm | rejected | 6.2 | not passed | 6.1 · not as is | a heavy serif S with an orange ball at its top-right; an S app icon carrying an unread-notification badge; a bouncing ball / juggling S | chunky warm serif 'Sunvale' with an orange sun-dot on the S; the letter S with a rising sun or ball behind it; friendly, retro-leaning local co-op or food brand |
| Sunvale | sv-sundial | rejected | 5.7 | not passed | 5.7 · not as is | the numeral 4 in a circle; a sailboat sail and boom (yacht club badge); a compass needle or clock hand | the numeral 4 or a stylised letter A; a sailboat sail with a boom; a sundial gnomon casting a shadow |
| Sunvale | sv-token | rejected | 5.5 | not passed | 5.8 · not as is | the generic user/profile avatar icon (head over shoulders); a person sitting in a bathtub or hot tub; a webcam / camera bump | generic user/profile avatar (head and shoulders); sun dropping into a cupped valley or bowl; camera or webcam icon |
| Sunvale | sv-vale | rejected | 4.8 | not passed | 5.0 · not as is | a snail or curled worm; a tadpole/sperm-like squiggle with a dot; an eye or ear swirl | a swoosh curling around a dot, like a sun in a valley; a snail or tadpole shape; an ear or a sideways question mark |
| Sunvale | sv-word | rejected | 5.7 | not passed | 4.9 · not as is | the letters 'un'; a serif 'm' variant or 'UN' monogram; the negation prefix un- (undo, un-plugged) | warm lowercase serif wordmark with a u–n ligature; the letters 'un' (a negative prefix, or French for 'one'); generic editorial or bookshop type in coffee brown |
| Göçebe | bohca | rejected | 5.0 | not passed | 4.9 · not as is | a money bag (the loot-sack emoji without the dollar); a tied rubbish bag; a stacked cairn of stones at small sizes - unfortunate: money bag / loot for a shop | money bag / sack of coins; drawstring sack tied with a gold band; bohça-style bundle of a traveller's belongings |
| Göçebe | cay | rejected | 5.0 | not passed | 5.7 · not as is | a bottle opener / bottle-neck cutout in a block; a zipper slider or strap buckle seen flat; a keyhole-like slot in a squared tile (unfortunate: beer bottle or bottle opener for a gear shop) | Turkish tulip tea glass cut out of a brown block; a bottle or vase in negative space; an armchair or stepped block shape |
| Göçebe | menderes | dropped at sketch review | — | — | — | sketches: s1 an undo/return-key arrow or a horseshoe magnet lying down (UI icon; also a banned arrow by implication); s2 an @ sign or a lowercase e in a box; s3 a lowercase r followed by a dot ('r | — |
| Göçebe | percin | rejected | 4.7 | not passed | 4.9 · not as is | a c impaled on a peg or stand; a plunger / mushroom stalk hanging under the c; a bubbly rounded geometric sans like a snack or kids app (unfortunate: the cedilla reads as a T-stand, so ç reads as c+I) | a heavy rounded wordmark with a brown T-shaped stake stuck under the c; a phallic or plunger-like shape in the symbol; a tent peg or rivet standing in for the cedilla |
| Göçebe | stitch | rejected | 4.1 | not passed | 3.7 · not as is | a c stacked over a p (cp); a pretzel or ribbon-loop squiggle hanging under the wordmark; a stray glyph error in the wordmark - unfortunate: 'cp' monogram, an unwelcome abbreviation in EN/DE web contexts | generic lowercase grotesk wordmark with an oversized rope-loop dangling under the c; a knotted cord or shoelace standing in for the cedilla; a stray squiggle or a Greek rho/infinity glyph floating under the word |
| Göçebe | webbing | dropped at sketch review | — | — | — | — | — |
| Kinetra | band | dropped at sketch review | — | — | — | sketches: s6 a party blower / noisemaker (spiral unrolling into a straight tip) or a snail, festive-toy rather than recovery, and the coil/tail merge in one colour; s7 a hamburger menu / stacked bars / server rack, UI icon, struck; s8 a walking cane or shepherd's crook (also a lowercase r), an unfortunate reading for injured adults | — |
| Kinetra | guided | rejected | 5.5 | not passed | 5.8 · not as is | 'Tr' two-letter monogram in a rounded square, like an Adobe app icon (Lr/Pr family); 'kineTra' with a capital T dropped into lowercase; TR country code / a ticker — worst: an Adobe-style software tile, nothing about care or movement | the word 'kinetra' with an extended t-crossbar acting as a canopy or handrail over 'ra'; a parallel-bar or support rail, read as a quiet reference to guided rehab; a 'Tr' monogram that reads more like a table or a shelf than like Kinetra |
| Kinetra | held | rejected | 5.3 | not passed | 5.8 · not as is | lowercase k with a J-hook or fish hook hanging off it (reads 'kJ' / 'ks'); a smiling face in profile; a crook-handled cane — worst: in the wordmark the symbol is read as 'k' + 'inetra' with the hook as a stray 's', and a cane is a disability/frailty cue for a recovery audience | lowercase k monogram with a separate orange hook; a bent joint or knee with a swinging limb; a person with an outstretched arm next to a ball or smile curve |
| Kinetra | poise | dropped at sketch review | — | — | — | sketches: s6 a power socket / coin slot / tipped battery (stock shape 82%); s7 an eye in a pie slice or a radar fan, Eye-of-Providence feel, struck; s8 a tilted squircle with a minus/toggle pill, reads as a UI button and as a capsule (clinical), not a level; s9 a disc with a sliced-off cap, a cut circle (stock 80%) that reads as a bowl with lid or a hat | — |
| Kinetra | range | rejected | 5.7 | not passed | 5.3 · not as is | a boomerang or chevron with an arc floating above it; an open cupped hand holding a slice of something (taco/melon); an angle-measure symbol (angle with arc) — worst: a lumpy hand/food blob at icon size, or a pointed shoe | boomerang or wide chevron with a speed-gauge arc above it; a bent joint shown with a goniometer range-of-motion arc; a hand or shoe-like blob, or a wifi/signal icon tilted on its side |
| Kinetra | softserif | rejected | 5.3 | not passed | 5.6 · not as is | a Recoleta/Cooper-style soft serif wordmark in plum with an e-t ligature; the Latin/French word 'et' ('and') in a rounded square app tile; 'ET' as in the extraterrestrial or a stray two-letter abbreviation that is not the brand's initial | plum serif wordmark where the 'e' sweeps up into the 't' crossbar; 'et' ligature monogram, which reads like the word 'et' rather than a K for Kinetra; calm editorial or wellness brand with a little movement |
| Kinetra | steps | dropped at sketch review | — | — | — | sketches: s6 a step-function line chart / pipe with a ball - the dot beside a bent stroke also flirts with a stick-figure head (forbidden); s7 two overlapping rounded squares = Venn / duplicate-copy UI icon (struck); s8 a rounded block with a round notch and dot = camera or toggle UI glyph, stock similarity 64% (struck); s9 a sliced disc with the half offset = sunset / the cut-shape monogram device (struck) | — |

## Critic vs blind judge

21 concepts reached the critique. The gate and the blind judge agreed on 21 of them (gate passed ↔ judge would present as is). Mean critic score 5.5, mean judge score 5.5.

## Gate precision and recall

- Precision (gate passes the judge would present): —
- Recall (judge-presentable concepts the gate passed): —

### Judge panel

| Judge | Concepts | Would present (majority of its looks) | Agrees with the gate |
| --- | --- | --- | --- |
| opus | 21 | 0 | 21 of 21 |
| sonnet | 21 | 2 | 19 of 21 |

The two judges agree with each other on 19 of 21 concepts.

## Cost and effort

| Scenario | Run | Minutes | Turns | Sub-agents | Tokens in / out | Cost (API equivalent) | Models |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AI assistant | ok | 26.7 | 15 | 19 | 13155k / 234k | $7.68 of $20 | claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5 |
| Coffee roaster | ok | 24.81 | 8 | 16 | 12099k / 210k | $6.63 of $20 | claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5 |
| Energy cooperative | ok | 23.53 | 13 | 21 | 15073k / 232k | $8.14 of $20 | claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5 |
| Outdoor gear (Turkish name) | ok | 28.01 | 9 | 15 | 16119k / 280k | $8.39 of $20 | claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5 |
| Health app | ok | 29.79 | 7 | 22 | 19754k / 306k | $9.59 of $20 | claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5 |

Cost is the API list-price equivalent Claude Code reports (`total_cost_usd`, sub-agents included). On a Claude
subscription the same work counts against the plan's usage limits instead of being billed. Input tokens include cache
reads and writes.
