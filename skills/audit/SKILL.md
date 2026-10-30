---

name: audit
description: Markilo brand audit — evaluate an existing logo or identity (small-size legibility, balance, monochrome, contrast, genericity, similarity to competitors, name confusion) and recommend keep, refresh or redesign with evidence. Use when the user asks for feedback on, or an assessment of, an existing logo or brand.
argument-hint: "[logo file, URL, repo path or brand slug]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs *) Read Write Edit Glob Grep
---

# Markilo · Audit

Request: $ARGUMENTS

Toolchain: `node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command>` (written `markilo`). Read `${CLAUDE_PLUGIN_ROOT}/skills/design/references/design-principles.md` (refresh vs. redesign).

1. Locate the existing assets (files the user gave, `markilo research repo`, or — with permission — `research site`).
   `Read` them.
2. Measure: `markilo score <file> --role symbol|wordmark|lockup`, `markilo analyze <file>`,
   `markilo render <file> -o <tmp>.png --sheet` and `Read` the sheet.
3. Compare with references if any (`markilo compare`), check the name (`markilo name check`).
4. Report: what works (equity worth keeping), measured problems, judgment-based problems (labeled), and a
   recommendation — keep, refresh or redesign — with the evidence. Do not redesign during an audit; offer it.
5. Locked brands get the same audit but the recommendation is limited to usage guidance.
