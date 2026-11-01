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
2. Explain the review flow in two lines: the round's three proposals (A, B, C) are side by side; **Select** one,
   **Request changes** on one (add tags or a note, or click on the big mark to pin what should change at that spot),
   tick **combine with another** on two to mix them, or **Reject all three** with a note on what is missing. **Add to
   comparison** on two or more, then **Compare** shows them side by side. Then press **Send to your agent** (served)
   or **Download decisions** (file) and tell you when done. The choice is theirs; no critic score decides it. The page
   has EN/TR and light/dark/system switches at the top; if the user writes in Turkish, mention the TR switch.
3. Read the decisions: `markilo feedback --brand <slug>` (after a download: `markilo feedback --import <file>`). It
   returns each decision with tags, notes and pinned spots (e.g. "at top-right: thicker stem"), the preferred concept
   and ready-to-act requests. Repeat them back to the user in one short summary.
4. Act, after the user confirmed your summary: `markilo feedback --brand <slug> --apply` marks selected concepts
   shortlisted and dropped or round-rejected ones rejected. Log what was decided (`markilo answers`). Then: a selection
   or change request → the refine skill (develop the chosen concept; pinned spots tell you where the change belongs);
   a combination → a new concept developed from the named parts; a rejected round → the concepts skill for the next
   round, with the user's note.
