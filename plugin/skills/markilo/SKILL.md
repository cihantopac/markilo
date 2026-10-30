---

name: markilo
description: Markilo entry point (same as markilo:design). Use when the user types /markilo or asks Markilo for anything brand-related.
argument-hint: "[URL, repo path, brand name or task]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs *) Read Write Edit Glob Grep
---

Invoke the `markilo:design` skill with this request and follow it: $ARGUMENTS
