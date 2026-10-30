---

name: concept-verified
description: Designs one original SVG concept, verifies it with the toolchain and looks at the rendered review sheet before reporting.
tags: [design, verify]
plugins: ["../.."]
runs: 1
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Agent]
expected_outcome: One concept with symbol.svg, verified; the review sheet PNG was read; the reply separates measured results from judgment.
---

/markilo:concepts Create a Markilo workspace for a fictional brand "Tidepool" — a calm, minimal weather app for sailors. Primary color #0f6e8c. Skip research and the brief questions: I approve one direction of your choice. Design exactly one concept (symbol + wordmark), verify it, fix any failing checks, and summarize the result. Do not build the gallery and do not use the network.
