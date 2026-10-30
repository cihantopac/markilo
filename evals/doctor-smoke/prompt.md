---

name: doctor-smoke
description: The plugin loads from another project and its bundled toolchain runs.
tags: [smoke]
plugins: ["../.."]
runs: 1
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: The design skill runs the markilo doctor command and reports that the toolchain works.
---

/markilo:design Before we start anything, check that the Markilo toolchain works on this machine and tell me the result in one sentence.
