# SVG authoring rules for Markilo masters

`markilo svg lint --master` and `markilo verify` enforce these. Build symbols with `markilo construct`
(see `construction.md`): it produces masters that already follow these rules. Write SVG by hand only for parts no
construction shape can express.

## Required

- Root: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H" data-markilo-role="symbol">`.
  Symbols use a **square** viewBox (e.g. `0 0 120 120` or `0 0 48 48`). No `width`/`height` needed.
- Include `<title>Brand — symbol</title>` for accessibility.
- **Filled shapes only** in masters. If you sketch with strokes, convert them to filled outlines before
  delivery (rect/path geometry). Strokes are allowed in drafts but scale with the viewBox and can vanish
  at small sizes.
- Solid colors as `fill="#rrggbb"`. Every color must come from the concept palette.
- Pure vector: no `<image>`, no embedded PNG/JPEG/base64, no external references, no `<script>`,
  no `<foreignObject>`, no event handlers, no web fonts, no live `<text>` (use `markilo wordmark`).
- No filters (blur, drop shadow) and no opacity in masters. Gradients only if a flat version also works.
- Unique, meaningful ids only when referenced (masks, clip paths).

## Geometry

- Snap coordinates to the construction grid; use integers or one decimal where possible.
- Keep the mark inside the artboard with a small margin: ink should span 80–98% of the viewBox.
- Use `fill-rule="evenodd"` for counters (holes) inside one path when it keeps the path simple.
- Prefer arcs (`a`) and straight segments over many tiny curve segments; prefer a few precise cubic
  Béziers over auto-traced noise. Keep total path commands low (verify reports complexity).
- Round corners with arcs of consistent radius across the mark.
- For overlaps that should read as separate parts in one color, cut a real gap: ≥ 1/13 of the artboard (≥ 80 units
  on 1024), which is 1.2 px at 16 px — the verify threshold. Under 1/23 (~45 units) fails.

## Example (structure only — do not reuse the shape)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" data-markilo-role="symbol">
  <title>Example — symbol</title>
  <path fill="#2f4bd8" d="M22 24a6 6 0 0 1 6-6h16v84H28a6 6 0 0 1-6-6z"/>
  <path fill="#2f4bd8" fill-rule="evenodd" d="M60 30a30 30 0 1 1 0 60a30 30 0 1 1 0-60zm0 14a16 16 0 1 0 0 32a16 16 0 1 0 0-32z"/>
</svg>
```

## Wordmarks and lockups

- Generate with `markilo wordmark --text … --font … --weight … -o wordmark.svg`; it embeds cap-height and
  baseline metadata used by `markilo lockup` and `finalize`.
- Tune tracking in thousandths of an em (`--tracking=-15` tight display, `0` default, `+40` airy caps).
- Manual letter edits are allowed after generation: edit individual `<path data-char="…">` elements and
  keep the root attributes.
- Hand-made lockups are optional; `finalize` builds horizontal, stacked and compact lockups aligned to
  cap height with clear space = 1 cap height.
