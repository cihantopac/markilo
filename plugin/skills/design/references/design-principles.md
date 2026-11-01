# Designing identities worth choosing

This is how Markilo designs. It describes what good work looks like, not a recipe: use judgment, and break a
recommendation when the work is better for it. Only the technical rules (SVG validity, legibility, safety, originality)
are fixed — see `svg-authoring.md` and `originality.md`.

## What Markilo 1.0 got wrong, so you don't repeat it

An independent panel looked at 81 concepts from Markilo 1.0 and would present none. They were not sloppy; they were
mechanical. The process asked designers to assemble marks from primitives (rings, bars, cuts), to start from what a
stranger sees in a 32 px favicon, to change "one or two letters" of a stock typeface, and to avoid a long list of
rejected patterns. The results were what those instructions produce:

- **UI icons** — a metaphor (a round trip, a keystone, a gauge) drawn with uniform strokes on an icon grid reads as a
  button, not a brand.
- **Primitive geometry** — a circle, a bar and a gap, however clean, is a shape, not a drawing.
- **Weak monograms** — the initial with a slice, offset or step.
- **Stock wordmarks** — a neutral grotesque with one letter tweaked or a coloured dot added.
- **Literal metaphors** — the product's mechanism drawn as a diagram.

The fix is not more rules. It is designing the way identity designers do: a point of view first, then drawing with
intent, then craft.

## Start from a point of view

Before drawing, decide what the identity should _feel_ like to the people who will see it every day — and what it must
not feel like. Write it as a stance, not a metaphor: "quiet authority — a tool that is sure of itself and never
shouts", "editorial precision, like a well-set technical book", "warm, hand-made confidence". The stance chooses the
typeface, the weight, the proportions, the colour and the kind of form; the metaphor, if there is one, comes second.

A strong identity usually has **one distinctive idea, executed with consistency**: a particular letter construction
carried through the word, a contour that is unmistakably drawn, a rhythm, a proportion. It does not need to explain
the product. Most identities people remember say almost nothing literal.

## Wordmark first, especially for coined names

For a coined or distinctive name (most software products), the word itself is usually the strongest identity: it says
the name every time, it cannot be mistaken for a UI icon, and type is where character is easiest to make ownable.
Default to a wordmark-led proposal unless the brief calls for a symbol above all; a separate symbol is never mandatory.
The compact icon (favicon, app icon, avatar) is then derived from the word — a letter, a pair, a ligature or a detail of
the drawing — not invented separately.

**A wordmark is designed, not typeset.** Typing the name in a font is the starting point. Then make it yours:

- **Choose the face for character, not neutrality.** Inter, Manrope and DM Sans are excellent for interfaces and
  forgettable as logos. Look for a face whose construction already says the stance (`markilo fonts` lists traits);
  then push it.
- **Work the whole word, not one letter.** A treatment that runs through every letter reads as intent; a single
  modified letter on a stock word reads as a gimmick. Examples of whole-word decisions: one terminal shape repeated on
  every stroke ending; a consistent cut angle; stroke contrast (thick verticals, thin joins); a unified x-height and
  counter shape; a width (condensed, extended) that gives the word a silhouette.
- **Find the word's own opportunities.** Look at the actual letters: which pairs could share a stroke or form a
  ligature (rl, li, va, ar, ex), which counters could be reshaped consistently, where an ascender or descender could
  extend, where the word's rhythm (stems and rounds) creates a pattern worth emphasising. These moves are specific to
  this name, which is what makes them ownable.
- **Draw custom letters when the face cannot say it.** Build letters from the font's outlines and your own Bézier
  paths (`construct` with `glyph` and `path`, booleans to join or cut), or draw them fully custom. A custom `R`, `a` or
  `x` with a distinctive construction, repeated logic in the other letters, beats any off-the-shelf face.
- **Space it by eye.** Tight, even colour across the word; open the pairs that clump (rn, ri), close the ones that gap
  (Va, ro). Optical kerning is the difference between "set in a font" and "a logo".
- **Case is a decision.** Lowercase is approachable and modern; capitals are institutional; mixed case keeps a coined
  name readable.
- **Stay readable.** Every letter must still be the letter it is — at 12 px and in a header. A wordmark that has to be
  explained has failed.

## Symbols: drawn, not assembled

When a proposal is symbol-led, draw a form, not a diagram:

- **Use freeform paths and Bézier curves.** Write the `d` attribute directly in a 1024-unit square, or construct parts
  and then redraw the contour. Curves with deliberate tension — a contour that speeds up and slows down — read as
  drawn; arcs of one radius joined to straight bars read as an icon set.
- **Prefer solid, filled silhouettes** with a distinctive outline and purposeful negative space over outlined line
  icons. Uniform strokes with round caps on a square grid are the visual language of interface icons; avoid it unless
  the stance demands it.
- **Abstract is allowed.** An abstract form with the right energy (balanced, tense, organic, asymmetric, heavy, light)
  can carry an identity better than a literal picture. It must still be specific: a form you could recognise again,
  not a generic blob or swoosh.
- **Asymmetry and organic geometry are tools**, not mistakes. Perfect symmetry and primitive geometry are tools too —
  choose them on purpose.
- **If there is a metaphor, transform it.** The product's own object (a document, a chart, a check mark, a shield, a
  magnifying glass, a funnel) drawn plainly is what every competitor already uses. Use an idea only when the drawing
  adds something the obvious version does not have.

## Three proposals that are genuinely different

A round is three proposals that differ in kind, not three variations of one shape. Vary at least two of: what leads
(word or symbol), the stance, the typeface family (grotesque, humanist, geometric, serif, custom), the form language
(geometric, organic, calligraphic, engineered), and colour. A useful default mix:

1. **A wordmark-led identity** with a fully worked word and an icon derived from it.
2. **A symbol + wordmark** where the symbol is a drawn, ownable form and the word is set with care to match it.
3. **A bolder or unexpected route** — a typographic emblem, an abstract system, an editorial serif, a monogram so well
   drawn it becomes a mark — something the user might not have asked for and might love.

Adapt the mix to the brief. If the user's references point somewhere, at least one proposal should go there.

## Craft

- **Optical corrections.** Round forms overshoot flat ones by 1–3 %; horizontals are slightly thinner than verticals;
  the optical centre sits a little above the geometric one; acute joins need opening (ink traps) at small sizes.
- **Consistency.** One stroke-contrast logic, one corner logic, one terminal logic across word and icon.
- **Small sizes are a check, not the starting point.** Design at display size; then confirm the icon still reads at
  16–32 px. If a detail matters only large, make a simplified small version rather than coarsening the main mark.
- **Monochrome first.** The identity must work in one colour; colour is added to a form that already works.
- **Restraint.** Every element earns its place. Decoration is not character.

## Colour

One confident primary, an optional supporting colour, ink and paper. Pick colour from the stance and the product's
existing interface (an existing UI palette is equity), check contrast (≥ 3:1 for the mark, `markilo palette` reports
WCAG pairs) and cultural meaning in the target markets. Prefer a palette that still works in greyscale.

## User references

When the user shares logos, screenshots, mood boards, sketches or identities they like or dislike
(`markilo reference add --category inspiration|dislike|existing`), read them for **characteristics**: proportion,
weight, contrast, typeface classification, case, spacing, corner and terminal shapes, density, energy, colour
temperature. Write those down and design from them. Never reproduce a referenced mark or its distinctive device;
references are compared in the originality check like any competitor mark. A sketch from the user is an idea to
develop, credited to them. Without references, design from the brief — references help, they are never required.

## Avoid (short list)

The category's clichés named in the brief; the product's object drawn plainly; outlined line icons; a stock face
untouched; one tweaked letter or a coloured dot on an otherwise stock word; the initial with a slice or offset as the
whole idea; gradient blobs, swooshes, connected dots, generic arrows and check marks.

## Typography notes

- Bundled faces are SIL OFL 1.1 (commercial use allowed; outlined logos carry no font obligations). `markilo fonts`
  lists them with traits; with network approval `markilo fonts search` / `fonts add` reach ~1,800 open-licensed
  families. Record any user-supplied font and its license.
- Check every letter pair for confusion (rn → m, cl → d, Il1) and diacritics in target markets (Turkish İ/ı, ş, ğ;
  German ß; Nordic å/ø). Use `--locale tr` for Turkish casing.
- Wordmarks are always outlined (no live `<text>`).

## Refresh vs. redesign

Keep equity that exists: list what people already recognise (shape, colour, letter, sound) before changing it. A
refresh keeps the idea and improves craft; a redesign is justified when the current mark fails measurably, contradicts
the positioning, or the business changed. Recommend one with evidence.

## Families

Define the shared system first (type, stroke and corner logic, colour logic, one structural motif), then give each
product its own expression inside it. Members must be related at a glance and distinct at 16 px.

## Judgment criteria (used in the final review)

brand-fit, semantic-relevance, distinctiveness, memorability, simplicity, balance, craft (geometry and optical
alignment), typography, color, cultural-fit, timelessness, premium-perception, versatility. Scores inform; the user
decides.
