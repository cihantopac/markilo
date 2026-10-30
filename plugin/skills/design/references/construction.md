# Building marks with construction specs

Do not hand-type path coordinates for a symbol. Describe how the mark is **built** — primitives, cuts, gaps,
offsets, repeats, real letterforms — in a JSON construction spec, and let `markilo construct` turn it into exact,
filled, optimized SVG. A spec is how a designer thinks ("a 300-unit ring, cut open at 2 o'clock, with a bar
crossing it and a 32-unit gap where they meet"). Every measurement is a named parameter, so one spec gives many
measured variants.

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
- Angles: 0° is 12 o'clock, clockwise. An `arc` or `sector` runs from `from` to `to`: `to` > `from` sweeps
  clockwise, `to` < `from` counter-clockwise (270° counter-clockwise from 3 o'clock: `from: 90, to: -180`).

| Shape      | Fields                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `circle`   | `c`, `r`                                                                                                                                                                                    |
| `ellipse`  | `c`, `rx`, `ry`                                                                                                                                                                             |
| `rect`     | `x`,`y` or `c`; `w`, `h`; `r` (one radius or `[tl, tr, br, bl]`)                                                                                                                            |
| `squircle` | `c`, `w`, `h`, `n` (4 = app-icon squircle, 2 = ellipse)                                                                                                                                     |
| `ring`     | `c`, `r` (outer), `width`                                                                                                                                                                   |
| `arc`      | `c`, `r` (centre line), `from`, `to`, `width`, `cap` `butt`/`round`/`square` — a stroked arc as a filled shape                                                                              |
| `sector`   | `c`, `r`, `from`, `to`, `inner` (0 = pie slice)                                                                                                                                             |
| `polygon`  | `points`                                                                                                                                                                                    |
| `regular`  | `c`, `r`, `sides`, `rotate`                                                                                                                                                                 |
| `star`     | `c`, `r`, `inner`, `points`, `rotate`                                                                                                                                                       |
| `line`     | `points`, `width`, `cap`, `join`, `smooth` (curve through the points), `closed`                                                                                                             |
| `path`     | `d` (filled, nonzero rule), or with `width`/`cap`/`join` a stroked centre line — use it for one continuous stroke mixing lines and arcs (`A`)                                               |
| `glyph`    | `text`, `font` (id from `markilo fonts`), `weight`, `height` (cap height) or `size`, `c` (centre) or `at` (baseline start), `tracking`, `locale`, `letters` (positions to keep, e.g. `[0]`) |

| Operation                     | Fields                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `union` / `intersect` / `xor` | list of shapes                                                                                                           |
| `subtract`                    | list: the first shape minus all others                                                                                   |
| `gap`                         | `shape`, `cut`, `width`, `keep` — removes `cut` grown by `width` from `shape` (a knockout); `keep: true` adds `cut` back |
| `outline`                     | `shape`, `width` — the contour as a band                                                                                 |
| `offset`                      | `shape`, `by` (+ grows, − shrinks)                                                                                       |
| `repeat`                      | `shape`, `n`, then `c` (+ `angle`) for radial or `step: [dx, dy]` for linear                                             |
| `mirror`                      | `shape`, `axis` `x`/`y`, `at` — the shape plus its reflection                                                            |
| `ref`                         | name in `defs`                                                                                                           |

Every shape also takes `round` (fillet all corners with this radius), `grow` (offset), `scale`, `rotate`, `flip`
(`x`/`y`), `move` `[dx, dy]` and `origin` (default: the shape's centre). Order: grow, round, scale, flip, rotate, move.

## Process

1. **Write the idea sentence first** (design-principles.md). Then pick the _move_ that makes it ownable (below).
2. **Sketch wide**: 3–5 specs (`sketches/s1.json …`), each a different move, not a nudge. Build each with
   `construct sN.json -o sN.svg --brand <slug> --concept <id>` (with `-o` the concept's palette is used and nothing
   in the concept changes), compare with `markilo render s1.svg s2.svg … --compare --paper <paper> -o
   compare.png`, `Read` it. Keep one; say why the others lost.
3. **Tune by measurement**: put the uncertain measurements (stroke weight, gap, cut angle, overlap) in `vary`, run
   `--vary`, `Read` `variants.png`. The score is a guide, not the judge: pick by eye among the top rows. A red
   label names the first failing check; `variants.json` has every check's message.
4. **Commit**: `construct … --brand --concept --set …` → `symbol.svg`, `construction.json`, `construction.png`.
5. **Verify** (`markilo verify`) and look at the 16 px, dark and one-color rows. Fix in the spec, not the SVG.
6. For wordmarks, start from `markilo wordmark`; for a custom letter (a cut, a ligature, a terminal that carries
   the idea) build that letter as a `glyph` with booleans and compose it with `lockup`, or build the whole word
   with `glyph` and `"role": "wordmark"` (its recipe is saved as `construction-wordmark.json`). `construct` prints
   each letter's box, baseline, cap and x-height (`glyphs`), so cuts can be aimed at a stem or a bar by expression
   rather than by reading path data. Judge wordmarks with `markilo render wordmark.svg -o wm.png --width 1200`.

## Moves that make a mark ownable

Each is a construction technique, not a shape to copy. Combine at most two.

- **Letter carries the metaphor**: a `glyph` whose counter, terminal or stem becomes the object — `subtract` the
  metaphor from the letter, or `union` a part of it in. The letter must still read at 16 px.
- **Negative space with a second reading**: a solid form with a meaningful silhouette `subtract`ed, so the empty
  part is the idea. Keep the cut ≥ 1/16 of the artboard wide.
- **Interlock / weave**: two strokes crossing with `gap` at one crossing and not the other (over-under). Use one
  colour; the gaps carry the depth.
- **Cut and shift**: `subtract` a thin band (`rect` rotated) through a solid, then `move` one side — motion,
  precision, a "slice" of something.
- **Truncation**: `intersect` a form with a frame so it is cropped by the edge — tension, scale beyond the frame.
- **Single gesture**: one `line` with `smooth: true`, consistent `width`, round caps, that draws the idea in one
  movement. Avoid the generic swoosh; the path must describe something specific.
- **Modular system**: one unit (`defs`) repeated with `repeat` along a grid, where the arrangement itself is the
  idea (a letter, a count, a rhythm). Radial petals and "connected dots" are clichés; justify them or avoid them.
- **Fold / facet**: two planes that meet at a crease, separated by a `gap` (not by colour alone), suggesting a turn
  of paper, a page, a screen.

## Craft checklist

- One unit `u` and a few multiples of it for all widths, radii and gaps; a single corner radius family.
- Round forms overshoot flat ones by 1–3% (`scale: 1.02`); horizontals ~5–8% thinner than verticals.
- Gaps between same-colour parts ≥ 1/24 of the artboard; differently coloured parts that touch need a `gap`, or the
  one-colour version merges them (construct warns about this).
- Keep the drawing at 80–98% of the artboard; symbols under ~40 path commands (construct reports `stats`).
- Before you commit, describe the mark in one sentence without naming a shape ("a ring and a bar" is a shape; "a
  door left ajar" is an idea). If you can only name shapes, go back to step 1.

## Patterns the critic scores low

Circle + bar, plain rings, a single letter in a stock font in a rounded square, generic arrows/checkmarks/sparkles,
radial petals, interlocking circles, gradient blobs, swooshes, abstract "network" dots. Clean execution does not
rescue a generic idea.
