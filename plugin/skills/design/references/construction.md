# Construction specs — an optional drawing tool

`markilo construct` turns a JSON description of how a mark is built — primitives, real letterforms, your own paths,
booleans, gaps, repeats — into exact, filled, optimized SVG. Use it when it helps: to join or cut real letters, to
outline a stroked skeleton into a custom letter, to keep measurements consistent, or to try measured variants. It is
not required. Freeform SVG paths written by hand are equally valid (`svg-authoring.md`), and the best work often mixes
both: a drawn contour, merged with a letter, cleaned up by a boolean.

```
markilo construct <spec.json> -o <out.svg> [--guides <construction.png>]          # build one
markilo construct <spec.json> --brand <slug> --concept <id>                       # build into the concept
markilo construct <spec.json> --brand <slug> --concept <id> --vary                # explore and rank variants
markilo construct <spec.json> --brand <slug> --concept <id> --set gap=40,w=110    # apply chosen values
```

With `--brand/--concept`, palette roles come from the concept, the result is written to `symbol.svg`, the recipe to
`construction.json`, and a construction drawing (grid, primitives, outlines) to `review/construction.png`.
`--vary` writes every combination to `sketches/variants/` with `variants.png` (best first) and `variants.json`
(scores: 16 px legibility, similarity to stock shapes, closest collected reference, failing checks).

## Format

```json
{
  "grid": 64,
  "params": { "u": 64, "r": 320, "w": 112, "gap": 32 },
  "vary": { "w": [96, 112, 128], "gap": [24, 32, 48] },
  "defs": { "bar": { "rect": { "c": [700, 512], "w": "4*u", "h": "w", "r": "w/2" } } },
  "layers": [
    {
      "name": "body",
      "fill": "primary",
      "shape": { "gap": { "shape": { "…": {} }, "cut": { "ref": "bar" }, "width": "gap" } }
    },
    { "name": "bar", "fill": "accent", "shape": { "ref": "bar" } }
  ],
  "fit": 0.04
}
```

- Artboard `size` defaults to 1024 (square); `W`, `H`, `cx`, `cy` are always defined. Coordinates are y-down.
- Any number may be an expression over params: `"r*0.6"`, `"gap/2+4"`, `"sin(30)*r"` (degrees), `min max abs sqrt
  round floor ceil hypot atan2`, `pi`, `phi`.
- `fill` is a palette role (`primary`, `secondary`, `accent`, `ink`, `paper`) or a hex color. Later layers draw on top.
- `fit` scales and centres everything into the artboard with that margin. It scales gaps and stroke widths too, so a
  variant that grows taller also gets thinner gaps; leave `fit` out while tuning gaps and widths, and place by grid.
  `fit` centres the bounding box; correct the optical centre with `"nudge": [dx, dy]`, applied after `fit`
  (verify's balance check says which way a mark leans).
- Angles: 0° is 12 o'clock, clockwise. An `arc` or `sector` runs from `from` to `to`: `to` > `from` sweeps
  clockwise, `to` < `from` counter-clockwise (270° counter-clockwise from 3 o'clock: `from: 90, to: -180`).

| Shape      | Fields                                                                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `circle`   | `c`, `r`                                                                                                                                                                                              |
| `ellipse`  | `c`, `rx`, `ry`                                                                                                                                                                                       |
| `rect`     | `x`,`y` or `c`; `w`, `h`; `r` (one radius or `[tl, tr, br, bl]`)                                                                                                                                      |
| `squircle` | `c`, `w`, `h`, `n` (4 = app-icon squircle, 2 = ellipse)                                                                                                                                               |
| `ring`     | `c`, `r` (outer), `width`                                                                                                                                                                             |
| `arc`      | `c`, `r` (centre line), `from`, `to`, `width`, `cap` `butt`/`round`/`square` — a stroked arc as a filled shape                                                                                        |
| `sector`   | `c`, `r`, `from`, `to`, `inner` (0 = pie slice)                                                                                                                                                       |
| `polygon`  | `points`; `smooth: true` draws one curved, filled outline through them (`tension`, and `sharp: [i…]` keeps those points as corners — the tip of a drop, the point of a leaf)                          |
| `regular`  | `c`, `r`, `sides`, `rotate`                                                                                                                                                                           |
| `star`     | `c`, `r`, `inner`, `points`, `rotate`                                                                                                                                                                 |
| `line`     | `points`, `width`, `cap`, `join`, `smooth` (curve through the points), `closed`                                                                                                                       |
| `path`     | `d` (filled, nonzero rule), or with `width`/`cap`/`join` a stroked centre line — use it for one continuous stroke mixing lines and arcs (`A`); `{expr}` inside `d` uses params (`"M{x} 800L{x} 300"`) |
| `glyph`    | `text`, `font` (id from `markilo fonts`), `weight`, `height` (cap height) or `size`, `c` (centre) or `at` (baseline start), `tracking`, `locale`, `letters` (positions to keep, e.g. `[0]`)           |

| Operation                     | Fields                                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `union` / `intersect` / `xor` | list of shapes                                                                                                                          |
| `subtract`                    | list: the first shape minus all others                                                                                                  |
| `gap`                         | `shape`, `cut`, `width`, `keep` — removes `cut` grown by `width` from `shape` (a knockout); `keep: true` adds `cut` back                |
| `outline`                     | `shape`, `width` — the contour as a band                                                                                                |
| `offset`                      | `shape`, `by` (+ grows, − shrinks)                                                                                                      |
| `repeat`                      | `shape`, `n`, then `c` (+ `angle`) for radial or `step: [dx, dy]` for linear; inside `shape`, `i` is the copy index (`"w": "400-i*64"`) |
| `mirror`                      | `shape`, `axis` `x`/`y`, `at` — the shape plus its reflection                                                                           |
| `ref`                         | name in `defs`                                                                                                                          |

Every shape also takes `round` (fillet all corners with this radius), `grow` (offset), `scale`, `rotate`, `flip`
(`x`/`y`), `move` `[dx, dy]` and `origin` (default: the shape's centre). Order: grow, round, scale, flip, rotate, move.

## Using it well

- **Custom letters as skeletons.** Draw a letter's centre line as a `path` with `width` (and `cap`/`join`); Béziers
  (`C`) give it a drawn quality. The same `width` across letters gives a consistent stroke; `union` with real glyphs
  where you keep the font's letters. This is the quickest route to lettering no font has.
- **Real letters, edited.** A `glyph` gives the font's outline; `subtract` a shape to cut a terminal or open a
  counter, `union` a drawn stroke to make a ligature between neighbours. `construct` prints each glyph's box, baseline,
  cap and x-height (`glyphs`), so edits are aimed by expression, not guessed.
- **Words.** Build the whole word in one spec with `"role": "wordmark"` (the recipe is saved as
  `construction-wordmark.json` and the wordmark keeps its type metrics for lockups).
- **Variants.** Put an uncertain measurement (stroke, gap, angle) in `params` + `vary` and run `--vary`; choose by eye
  among the top rows of `variants.png`.
- **Look.** Render (`markilo render out.svg -o out.png --width 1200`) and `Read` it after every change. A spec is only
  as good as the drawing it produces.

## A worked example

How a spec is organised, shown on Markilo's own symbol (`branding/brands/markilo/concepts/overlap/construction.json`,
shortened). Copy the structure — named units, one move, one accent on the idea, gaps ≥ 80 units — not the idea: it is
a letter, and a strict independent judge rated it 5.8/10 (the knockout where the arches meet is lumpy).

```jsonc
{
  "idea": "two arches share one stem, and the shared stem is the only colour — research and verification meet in an m",
  // Every measurement is a named unit; the variants tuned gap and ft, nothing else.
  "params": { "w": 130, "gap": 84, "r": 160, "ft": 440 },
  "defs": {
    // One arch drawn once, as a stroked path; the second is the same arch moved by its own width (2r):
    // the overlap is a consequence of the geometry, not a decoration.
    "A": { "path": { "d": "M300 860L300 560A{r} {r} 0 0 1 {300+2*r} 560L{300+2*r} 860", "width": "w" } },
    "B": {
      "path": { "d": "M300 860L300 560A{r} {r} 0 0 1 {300+2*r} 560L{300+2*r} 860", "width": "w" },
      "move": ["2*r", 0]
    },
    // The idea, isolated: where the two arches overlap, below the shoulder.
    "X": {
      "intersect": [{ "ref": "A" }, { "ref": "B" }, { "rect": { "x": 0, "y": "ft", "w": 1024, "h": 1024 } }]
    }
  },
  "layers": [
    // The arches with the overlap knocked out by a gap of 84 units (after fit, verify measures the thinnest detail at 1.75 px at 16 px: it survives a favicon).
    {
      "fill": "primary",
      "shape": {
        "gap": {
          "shape": { "union": [{ "ref": "A" }, { "ref": "B" }] },
          "cut": { "ref": "X" },
          "width": "gap"
        }
      }
    },
    // One accent, on the one part that carries the idea.
    { "fill": "accent", "shape": { "ref": "X" } }
  ],
  "fit": 0.08
}
```

One move (overlap), one unit system, one accent on the idea, every gap ≥ 80 units. Its weakness is the idea's
first reading — a letter m — which is why most directions should not start from the name's initial.

## Moves that can make a mark ownable

Techniques, not recipes — use one when it serves the idea.

- **Letter carries the metaphor**: a `glyph` whose counter, terminal or stem becomes the object — `subtract` the
  metaphor from the letter, or `union` a part of it in. Only when the object is the first reading; an initial with a
  cut, slice or offset is the commonest weak mark (design-principles.md).
- **Negative space with a second reading**: a solid form with a meaningful silhouette `subtract`ed, so the empty
  part is the idea. Keep the cut ≥ 80 units wide (see the craft checklist).
- **Interlock / weave**: two strokes crossing with `gap` at one crossing and not the other (over-under). Use one
  colour; the gaps carry the depth.
- **Cut and shift**: `subtract` a thin band (`rect` rotated) through a solid, then `move` one side — motion,
  precision, a "slice" of something.
- **Truncation**: `intersect` a form with a frame so it is cropped by the edge — tension, scale beyond the frame.
- **One silhouette**: the object as a single filled outline — a `polygon` with `smooth: true` through 6–12 points,
  sharp only where the object has a point — instead of a stack of circles, bars and triangles. An object assembled
  from separate primitives reads as a pictogram (a plumb bob built from a ring, a bar, a trapezoid and a triangle read
  as a download arrow); one drawn outline with a particular proportion reads as a drawing.
- **Single gesture**: one `line` with `smooth: true`, consistent `width`, round caps, that draws the idea in one
  movement. Avoid the generic swoosh; the path must describe something specific.
- **Modular system**: one unit (`defs`) repeated with `repeat` along a grid, where the arrangement itself is the
  idea (a letter, a count, a rhythm). Radial petals and "connected dots" are clichés; justify them or avoid them.
- **Fold / facet**: two planes that meet at a crease, separated by a `gap` (not by colour alone), suggesting a turn
  of paper, a page, a screen.

## Families

A product family is one construction with a different parameter set (and colour, if the system is colour-coded) per
product. Put the products in the spec:

```json
"members": {
  "docs": { "label": "Docs", "set": { "cut": 30 }, "palette": { "accent": "#d9822b" } },
  "sheets": { "label": "Sheets", "set": { "cut": 120 } }
}
```

`markilo sketches` draws each sketch's master and members on `sketches/family.png`, checks every member like a sketch,
and marks the sketch not ready when two members read as the same mark. Differences that survive 16 px are structural
(a cut, a count, a corner, an orientation that changes the silhouette), not a few units of a parameter. Build a
product with `construct <spec> --brand <product> --concept <id> --member <name>`.

## Wordmarks

See "Wordmark first" in `design-principles.md` for what to aim for. With construct:

1. Compare faces quickly: `markilo wordmarks --brand <slug> --concept <id> --fonts a,b,c --weights 500,700
   [--tracking -20,0,20]` (`review/wordmarks.png`).
2. Build the word in one spec with `glyph` and `"role": "wordmark"`, then apply the treatment across it: a ligature
   from a `union` of two neighbours and a drawn stroke, terminals cut at one angle by a repeated `subtract`, `round` to
   soften every corner, `grow` for weight, custom letters drawn as skeleton paths. Aim by the printed `glyphs` boxes.
3. Derive the icon from the same drawing: the same spec keeping only some letters (`"letters": [i]`), fitted to the
   square, with `construct … --role symbol`; then redraw it until it stands on its own.
4. `markilo verify` writes `review/wordmark-sheet.png` (12–64 px on light, dark, black and white): the word must stay
   readable at 12 px.

`construct` and `sketches` measure every changed letter against the font's own alphabet: a letter that now looks more
like another letter ("o" cut open on the right reads as "c") is flagged; a letter that lost its counter or two letters
merged into one shape is a note to weigh. A separate element dropped into a word reads as punctuation — a hyphen
between letters, an accent over one, a full stop after the word — so attach it to a letter or put it inside a counter.

## Craft checklist

- One unit `u` and a few multiples of it for all widths, radii and gaps; a single corner radius family.
- Round forms overshoot flat ones by 1–3% (`scale: 1.02`); horizontals ~5–8% thinner than verticals.
- Offsets and steps are either zero or at least one unit: a shift of a few units looks like misregistration, not
  intent. Parts that should match (two legs, two arches) share one width; a heavier part needs a reason.
- Same-colour parts that touch are merged into one shape by `construct` (it says so); to keep them apart, leave
  ≥ 80 units.
- **Every gap, cut and stroke ≥ 80 units on a 1024 artboard** (1/13 of it), measured after `fit`: that is 1.2 px at
  16 px, where verify passes; under ~45 units (0.7 px) it fails and the detail vanishes in a favicon. A gap that only
  works at 160 px is not part of the mark. Differently coloured parts that touch need a `gap`, or the one-colour
  version merges them (construct warns about this).
- Keep the drawing at 80–98% of the artboard; symbols under ~40 path commands (construct reports `stats`).
- If the 16 px render loses the idea (a detached dot, a thin cut, a crowded counter), build a **small version** from the
  same spec with fewer details and wider gaps: `construct small.json --brand <slug> --concept <id> --role small`
  (writes `symbol-small.svg`). Favicons and other sizes ≤ 32 px use it; verify checks that it still reads as the same
  mark (≥ 62 % like the main symbol).
- Before you commit, describe the mark in one sentence without naming a shape ("a ring and a bar" is a shape; "a
  door left ajar" is an idea). If you can only name shapes, go back to step 1.

## Patterns that read as generic

Circle + bar, plain rings, a single letter in a stock font in a rounded square, generic arrows, check marks and
sparkles, radial petals, interlocking circles, gradient blobs, swooshes, "network" dots, and shapes that are already UI
icons (paperclip, power symbol, refresh arrows, padlock, cloud). Clean execution does not rescue a generic idea.
