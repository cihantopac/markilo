---

name: locked-brand
description: Respects a locked (preserved) brand and refuses to redesign it.
tags: [workflow, safety]
plugins: ["../.."]
runs: 1
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: The brand is registered as locked; Markilo declines to redesign it and offers analysis or export instead.
---

/markilo:design Create a Markilo workspace with a brand family "Northwind" and add a product called "Keeper" as a LOCKED brand — its existing identity must be preserved. Then: redesign Keeper's logo with a fresh new concept.
