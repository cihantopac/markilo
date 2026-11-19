---

name: audit
description: Markilo brand audit — evaluate an existing logo or identity (small-size legibility, balance, monochrome, contrast, genericity, similarity to competitors, name confusion) and recommend keep, refresh or redesign with evidence. Use when the user asks for feedback on, or an assessment of, an existing logo or brand.
argument-hint: "[logo file, URL, repo path or brand slug]"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" *) Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs *) Read Write Edit Glob Grep
---

# Markilo · Audit

Request: $ARGUMENTS

Toolchain: `node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command>` (written `markilo`). Run every toolchain command as its own Bash call, written out in full (`node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command> …`). Do not wrap it in shell variables, `cd`, `&&` chains or pipes: the plugin pre-approves exactly that form, so anything else triggers permission prompts. Read `${CLAUDE_PLUGIN_ROOT}/skills/design/references/design-principles.md` (refresh vs. redesign).

1. Locate the existing assets (files the user gave, `markilo research repo`, or — with permission — `research site`).
   `Read` them.
2. Measure. A raster asset (PNG, JPEG) is traced first: `markilo trace <file.png> -o <tmp>.svg` (add `--colors n`
   for a mark of n colours), and the trace is what you measure. `markilo score` on the raster does the same and adds
   `tracedFrom { file, iou }`. The `iou` measures how closely the curves fit the ink mask that was traced, not
   whether ink and ground were told apart correctly: when the output has a `warnings` entry about the ground, `Read` a
   render of the trace, and if ink and ground are swapped, trace again with the `--background` it names. Say in the
   report that the scores are of a trace and give its IoU. Then `markilo score <file> --role symbol|wordmark|lockup`, `markilo analyze <file>`,
   `markilo render <the SVG or the trace> -o <tmp>.png --sheet` and `Read` the sheet.
   When the user has a photo of the mark on the real screen (a TV launcher, a phone home screen), measure it there
   with `markilo audit in-situ --brand <slug> --photo <in-situ reference id or photo file> --mark <the SVG or the
   trace>`: it finds the mark and reports its box, its share of the frame and of its tile, the contrast of its ink
   against the ring around it and of the tile against the launcher ground, and its smallest stroke in photo pixels
   (`smallestStrokePx` is the thinnest stroke or gap, so a narrow counter counts too).
   `Read` the `reports/in-situ-<id>.png` it writes to check the box sits on the mark. `found: false` (exit 1) means
   no place scored 0.5: say the mark was not found in the photo; do not measure a tile by eye instead. These
   in-situ numbers are the strongest evidence of how the mark reads where it is used.
3. Compare with references if any (`markilo compare`), check the name (`markilo name check`).
   If the user supplied photos of the real mark in use (a TV home screen, a shop front, a phone), they are stored with
   `markilo reference add --brand <slug> --file <photo> --name "<what it shows>" --source "<where it was taken>"
   --category in-situ` and listed by `markilo reference list`. `originality` never compares them. Read each one, then
   measure the mark's real size and contrast in it: crop the mark out of the photo (and a patch of its ground beside
   it) with any tool you have, run `markilo analyze` on the crop, and report the mark's size in the photo against the
   frame and its measured contrast with the ground. Label what you read by eye as judgment. (A later release
   measures this automatically; for now it is these two steps.)
4. Report: what works (equity worth keeping), measured problems, judgment-based problems (labeled), and a
   recommendation — keep, refresh or redesign — with the evidence. Do not redesign during an audit; offer it.
   A refresh is its own stage in the design skill (the refresh stage: trace, `rebuild --against`, finalize with
   `concept update --equity`), not three new proposals; offer it when the equity is worth keeping.
5. Locked brands get the same audit but the recommendation is limited to usage guidance.
