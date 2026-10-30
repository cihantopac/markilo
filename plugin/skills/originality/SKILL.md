---

name: originality
description: Markilo market intelligence and originality check — compare a logo concept or existing mark against competitor and category marks (silhouette, perceptual hash, structure, color), check name confusion and plan trademark pre-screening, and write an Originality & Similarity Report. Use when the user asks whether a logo or name is original, similar to others, or safe to use.
argument-hint: "[brand slug, concept id, or path to a logo file]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs *) Read Write Edit Glob Grep WebSearch WebFetch
---

# Markilo · Originality

Request: $ARGUMENTS

Toolchain: `node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command>` (written `markilo`). Policy: `${CLAUDE_PLUGIN_ROOT}/skills/design/references/originality.md`.

- **A concept in the workspace**: make sure references exist (`markilo reference list --brand <slug>`); if fewer than ~5,
  collect more (competitors, category leaders, famous marks with a similar form) and add them with `markilo reference add`
  — ask before web searches that reveal unreleased names. Then `markilo originality --brand <slug> --concept <id>` and
  `markilo diversity --brand <slug>`.
- **A loose file** (any SVG/PNG): `markilo analyze <file>` and `markilo compare <file> <reference>` for each reference.
- **A name**: `markilo name check "<Name>" --against <competitors>` and `markilo name trademark "<Name>" --describe "<product>"`.
  If the user agrees, run registry searches via the links and log each with `markilo profile add-source --type registry`.

Report in plain language: the verdict, the top matches with their numbers and reasons, what was and was not compared,
and the limits (not legal advice; no results ≠ unique). Recommend redesign for high risk instead of small tweaks.
Open the report file path for the user: `brand/brands/<slug>/reports/originality-<id>.md`.
