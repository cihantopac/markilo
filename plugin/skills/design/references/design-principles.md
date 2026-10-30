# Designing marks that last

This is the craft standard Markilo holds itself to. Use it when exploring directions, drawing SVGs and
critiquing.

## Start from an idea, not a shape

A strong mark compresses one true, specific idea about the brand into a form simple enough to remember
after one look. Before drawing, write the idea in one sentence: _"A folded page that reads as an N —
notes that become structure."_ If you cannot write that sentence, you do not have a concept yet.

Good sources of ideas, in order of strength:
1. **What the product uniquely does** (its mechanism, its transformation, its promise).
2. **The name** — its letters, its meaning, its sound, its etymology. Monograms work when the letter is
   transformed by the idea, not just set in a font.
3. **The audience's world** — a tool, gesture or artifact they recognise, used unexpectedly.
4. **Abstract character** — rhythm, tension, motion, balance — when the product is too broad for literal
   imagery (holding companies, platforms, families).

Avoid category clichés unless you subvert them knowingly: lightbulbs for ideas, globes for "global",
speech bubbles for chat, shields for security, rockets for growth, generic leaves for "green", swooshes,
brain/circuit hybrids for AI, interlocking rings, abstract "connected dots" networks, and default
gradient blobs. Markilo's genericity check flags marks that collapse to a stock primitive.

## Directions must be genuinely different

Three to five directions, each a different _idea_ and form language — e.g. a letterform-led monogram, a
pictorial metaphor, an abstract geometric system, a typographic-only wordmark, an emblem. Two
directions that share the same idea are one direction. `markilo diversity` must report `low` risk between
directions at the explore stage.

## Form

- **Simplicity**: as few elements as the idea allows. Aim for something a child could redraw from memory.
  Under ~40 path commands for a symbol is a healthy target; complexity needs a reason.
- **Silhouette first**: the mark must work as a solid black shape. Color is added after the form works.
- **Construction**: build on a grid (e.g. 24 or 48 units) with a consistent set of radii and stroke
  weights. Repeat measurements. Build with `markilo construct` so the recipe is saved as `construction.json`
  (see `construction.md`).
- **Optical corrections** (what separates professional marks):
  - Round and pointed forms overshoot flat ones by ~1–3% to look the same size.
  - Horizontal strokes are drawn slightly thinner than vertical ones to look equal.
  - The optical center sits slightly above the geometric center; the verify balance check reports a
    small upward offset as intentional.
  - Where strokes meet at acute angles, open the joint (ink traps) or thin the stroke to avoid dark blobs
    at small sizes.
  - Circles next to squares need to be slightly larger.
- **Negative space**: use it on purpose; counters must stay open at 16 px (verify reports closed
  counter-spaces). Gaps under 1.2 px at 16 px disappear.
- **Small sizes**: the symbol must survive at 16 px. If a detail matters only at large sizes, it is
  decoration; drop it or create a deliberately simplified small-size variant.
- **Balance**: visual weight near the optical center, with breathing room in the artboard (80–98% of the
  artboard; verify reports it).
- **Monochrome**: the mark must read in one color with no internal color-only boundaries. Separate parts
  with real gaps (knockouts), not just different shades.

## Color

- One dominant brand color, one optional supporting color, plus ink and paper. More colors need a system
  reason (a product family, a data palette).
- Check meaning across markets: red (luck in China, danger/discount elsewhere), green (finance, health,
  Islam), white (mourning in parts of East Asia), purple (mourning in parts of Latin America and
  Thailand). Note any risk in the brief.
- Contrast: the mark needs ≥ 3:1 against its background (WCAG 1.4.11); provide reversed variants for dark
  grounds. The palette command reports WCAG pairs and semantic clashes (brand color too close to error red
  or success green).
- Prefer colors that still work in grayscale (vary lightness, not only hue) for color-vision deficiencies.

## Typography

- The wordmark is drawn from a typeface, then _edited_: tracking, specific letter adjustments, joined or
  cut strokes when the idea calls for it. Always outlined (`markilo wordmark`), never live text.
- Match the symbol's construction: geometric symbols pair with geometric sans; humanist forms with
  humanist sans; editorial or heritage positioning can use a serif (fraunces, ibm-plex-serif).
- Lowercase reads friendlier and more modern; uppercase reads institutional and stable; title case is
  neutral.
- Check every letter of the name for awkward pairs (rn → m, cl → d, Il1) and for diacritics in target
  markets (Turkish İ/ı, ş, ğ; German ß; Nordic å/ø). Use `--locale tr` for Turkish casing.
- Licenses: bundled fonts are SIL OFL 1.1 (commercial use allowed; outlined logos carry no font
  obligations). Record any user-supplied font and its license.

## Refresh vs. redesign

Keep equity that exists. Before changing a working identity, list what people already recognise (shape,
color, letter, sound). A **refresh** keeps the core idea and improves craft (geometry, small sizes,
contrast, a modern wordmark). A **redesign** is justified when the current mark fails measurably
(legibility, originality conflict, scalability), contradicts the positioning, or the business changed.
State which one you recommend and why, with evidence.

## Families (multi-product brands)

- Define the shared system first: grid, corner radii, stroke weight, color logic, type, and a shared
  structural motif. Write it to `brand/shared/system.json` (tokens) and the brief notes.
- Each product gets its own idea expressed in the shared language. Family members should be clearly
  related at a glance and clearly distinguishable at 16 px. Check both with `markilo diversity` per brand
  and by comparing members with `markilo compare`.
- Architecture: decide master brand vs. endorsed vs. independent per product, and record it (`--role`,
  `--parent`).
- Preserved (locked) members are inputs to the system, not things to change.

## Judgment criteria (scored 0–10 by the critic, with one-line reasons)

brand-fit, semantic-relevance, distinctiveness, memorability, simplicity, balance, craft (geometry and
optical alignment), typography, color, cultural-fit, timelessness, premium-perception, versatility.
