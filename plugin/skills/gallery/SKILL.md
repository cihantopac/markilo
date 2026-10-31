---

name: gallery
description: Markilo Brand Preview Gallery — build and open the local HTML gallery that compares concepts and shows every variant on realistic surfaces (browser tab, app icons, dock, store listing, social preview, business card) with quality and originality results. Use when the user wants to see, compare or review designs.
argument-hint: "[brand slug]"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" *) Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs *) Read Write Edit Glob Grep
---

# Markilo · Gallery

Request: $ARGUMENTS

Toolchain: `node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command>` (written `markilo`). Run every toolchain command as its own Bash call, written out in full (`node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command> …`). Do not wrap it in shell variables, `cd`, `&&` chains or pipes: the plugin pre-approves exactly that form, so anything else triggers permission prompts.

1. Preferred: start `markilo gallery --serve` as a **background** Bash command (it keeps running). Its first output
   line has `serving`: a `http://127.0.0.1:<port>/…?t=<token>` URL. Give the user that URL. The server only listens
   on this computer, needs the token, serves only the gallery and exported artwork, and stops by itself when idle.
   Without a background shell, run `markilo gallery` instead: it writes `brand/gallery/index.html`, a self-contained
   file that works offline; give the user its `file://` URL.
2. Explain the review flow in two lines: at the sketch stage, pick one sketch per direction to develop (or "None of
   these"); on each developed concept choose Keep / Refine / Drop, add revision tags or a note, click on the big mark
   to pin what should change at that spot, tick "Compare" on two or more concepts to see them side by side and mark
   one "Prefer this". Then press **Send to your agent** (served) or **Download decisions** (file) and tell you when
   done.
3. Read the decisions: `markilo feedback --brand <slug>` (after a download: `markilo feedback --import <file>`). It
   returns each decision with tags, notes and pinned spots (e.g. "at top-right: thicker stem"), the preferred concept
   and ready-to-act requests. Repeat them back to the user in one short summary.
4. Act: `markilo feedback --brand <slug> --apply` records sketch picks (the user's pick wins over the critic's) and
   marks dropped concepts rejected and kept ones shortlisted (only after the user confirmed the summary). Log what was decided (`markilo answers`) and continue with the refine skill for
   each "refine" request — pinned spots tell you where on the mark the change belongs.
