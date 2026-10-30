---

name: markilo
description: Markilo entry point (same as markilo:design). Use when the user types /markilo or asks Markilo for anything brand-related.
argument-hint: "[URL, repo path, brand name or task]"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" *) Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs *) Read Write Edit Glob Grep Skill
---

Request: $ARGUMENTS

Load the `markilo:design` skill (Skill tool) and follow it for this request. If you only need a quick toolchain
command, run it as `node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command>` — never as a bare `markilo` command, and never through shell variables, `cd` or `&&` chains (the plugin pre-approves exactly that form).
