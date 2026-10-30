---

name: research
description: Markilo brand research only — scan a repository or website, research the market, audience, competitors, category conventions, culture and trademarks, and build a sourced Brand Intelligence Profile and brief. Use when the user asks to research or analyze a brand before any design.
argument-hint: "[URL, repo path or brand name]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs *) Read Write Edit Glob Grep WebSearch WebFetch
---

# Markilo · Research

Request: $ARGUMENTS

Toolchain: `node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command>` (written `markilo`). Read `${CLAUDE_PLUGIN_ROOT}/skills/design/references/research-playbook.md` and `${CLAUDE_PLUGIN_ROOT}/skills/design/references/cli.md` first.

1. Find or create the workspace: `markilo brand list` — else `markilo init` and `markilo brand add "<Name>"`.
2. Check what is already known: `markilo profile show --brand <slug>` and `markilo answers --brand <slug>`.
   Do not repeat finished research; extend it.
3. Local sources: `markilo research repo <path> --brand <slug>` for repositories. `Read` the existing logo files it lists.
4. Website: ask the user before fetching. Then `markilo research site <url> --brand <slug> --allow-network`.
5. Market research: delegate to the `markilo:brand-researcher` agent with the brand slug, what is known, and which
   topics are missing. For a small brand, do it yourself following the playbook.
6. Write the brief: `markilo brief update --brand <slug> --file <patch.json>` (write the patch to a temp file first).
7. Ask the user only the open questions that change the design (batched, each with your suggested answer), and log them.
8. Finish with a short summary: what the brand is, who it is for, the competitive landscape and category codes,
   opportunities for distinctiveness, risks, and open gaps. Mark inferences as inferences.
