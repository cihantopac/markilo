---

name: refine
description: Markilo refinement — iterate on a chosen logo concept (geometry, optical corrections, wordmark spacing, palette, small-size version) with verification after every change, then finalize it as the approved identity. Use when the user picks a concept or asks for changes to one.
argument-hint: "[brand slug, concept id and the feedback]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs *) Read Write Edit Glob Grep
---

# Markilo · Refine and finalize

Request: $ARGUMENTS

Toolchain: `node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command>` (written `markilo`). Craft rules: `${CLAUDE_PLUGIN_ROOT}/skills/design/references/design-principles.md`, `${CLAUDE_PLUGIN_ROOT}/skills/design/references/svg-authoring.md`.

1. Read the concept (`concepts/<id>/concept.json`, `symbol.svg`, `wordmark.svg`) and its reports. Collect the user's
   feedback (gallery notes may be pasted in) and log it with `markilo answers`.
2. Decide whether the change is a refinement (edit in place) or a new variant (copy to a new concept id, e.g. `<id>-b`,
   with `markilo concept new`). Keep the original for comparison.
3. Apply professional refinements: snap to the grid, unify radii and stroke weights, optical overshoot, ink traps,
   open counters for 16 px, real gaps instead of color-only separation, balanced artboard fit. Regenerate the
   wordmark with adjusted tracking or weight if needed; hand-edit individual letters when the idea calls for it.
4. After every change: `markilo verify --brand <slug> --concept <id>` and `Read` the review sheet. Stop when there are
   no fails and the warnings are understood.
5. When the user approves: `markilo finalize --brand <slug> --concept <id> --tagline "<tagline>"`, append the decision to
   `decisions.md`, then offer the export.
