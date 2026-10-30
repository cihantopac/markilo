---

name: wordmark-outlined
description: Produces an outlined, kerned wordmark through the toolchain instead of live SVG text.
tags: [design]
plugins: ["../.."]
runs: 1
max_turns: 14
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: A Markilo workspace exists and an outlined wordmark SVG for "Velora" was generated with the wordmark command.
---

/markilo:design Set up a Markilo workspace here for a fictional brand called "Velora" (a travel journal app). For now I only need a wordmark: lowercase, Sora 600, slightly tight tracking, ink color #1b1f2a. Save it in the workspace and tell me where it is. Do not design a symbol yet and do not research anything online.
