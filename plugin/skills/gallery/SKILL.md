---

name: gallery
description: Markilo Brand Preview Gallery — build and open the local HTML gallery that compares concepts and shows every variant on realistic surfaces (browser tab, app icons, dock, store listing, social preview, business card) with quality and originality results. Use when the user wants to see, compare or review designs.
argument-hint: "[brand slug]"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" *) Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs *) Read Write Edit Glob Grep
---

# Markilo · Gallery

Request: $ARGUMENTS

Toolchain: `node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command>` (written `markilo`). Run every toolchain command as its own Bash call, written out in full (`node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command> …`). Do not wrap it in shell variables, `cd`, `&&` chains or pipes: the plugin pre-approves exactly that form, so anything else triggers permission prompts.

1. `markilo gallery` (optionally `--brand <slug>`). It writes `brand/gallery/index.html` — a single self-contained file
   that works offline.
2. Give the user the path (and the `file://` URL from the output). If a browser tool is available, you may open it to
   check the layout.
3. Explain the review flow: each concept card has Keep / Refine / Drop, revision tags (bolder, simpler, more
   distinctive, different color, different typeface, …) and a short note; "Copy request for Claude" produces lines
   such as `/markilo:refine <brand> <concept>: bolder; different typeface` and a Keep/Drop summary to paste back.
4. When feedback arrives, log it (`markilo answers`), update statuses (`markilo concept update --status`), and continue
   with the refine skill.
