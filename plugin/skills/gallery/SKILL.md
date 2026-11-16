---

name: gallery
description: Markilo Brand Preview Gallery — build and open the local HTML gallery that compares concepts and shows every variant on realistic surfaces (browser tab, app icons, dock, store listing, social preview, business card) with quality and originality results. Use when the user wants to see, compare or review designs.
argument-hint: "[brand slug]"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" *) Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs *) Read Write Edit Glob Grep
---

# Markilo · Gallery

Request: $ARGUMENTS

Toolchain: `node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command>` (written `markilo`). Run every toolchain command as its own Bash call, written out in full (`node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command> …`). Do not wrap it in shell variables, `cd`, `&&` chains or pipes: the plugin pre-approves exactly that form, so anything else triggers permission prompts.

Show the gallery every round: it is where the user sees each proposal large, its icon on dark, the small sizes and
the surfaces. Regenerate it each round. Name proposals by their board letter and title (`A · <title>`), as
`proposals.order` lists them.

1. Run `markilo gallery`: it writes `brand/gallery/index.html`, one self-contained file that works offline.
   - When you have a tool that sends a file to the user for display (the Claude desktop app renders HTML in its side
     panel), send `brand/gallery/index.html` with it.
   - Otherwise give the user its `file://` URL. In a terminal session you may instead start `markilo gallery --serve`
     as a **background** Bash command; its first output line has `serving`: a `http://127.0.0.1:<port>/…?t=<token>`
     URL. The server only listens on this computer, needs the token, serves only the gallery and exported artwork, and
     stops by itself when idle or when the session ends.
   - Also send `proposals/round-<n>.png` into the chat for a quick look.
2. Explain the review flow in two lines: the board at the top shows the round's proposals (A, B, C); choosing one shows
   it large. **Select** one, **Request changes** on one (add tags or a note, or click on the big mark to pin what should
   change at that spot), tick **combine with another** on two to mix them, or **Reject all three** with a note on what
   is missing. **Add to comparison** on two or more, then **Compare** shows them side by side. Then press **Copy
   decisions** and paste the text into the chat (served: **Send to your agent**; a file: **Download decisions**). The
   choice is theirs; no critic score decides it. The page has EN/TR and light/dark/system switches at the top; if the
   user writes in Turkish, mention the TR switch. They may also just answer in chat.
3. Read the decisions. Pasted text from **Copy decisions** (it ends in a fenced `markilo-feedback` block): save it to a
   file with Write and run `markilo feedback --brand <slug> --import <file>`; a downloaded file: `markilo feedback
   --import <file>`; served: `markilo feedback --brand <slug>`. An answer in chat without that text: record it yourself
   (`concept update --status`, `answers`). It
   returns each decision with tags, notes and pinned spots (e.g. "at top-right: thicker stem"), the preferred concept
   and ready-to-act requests. Repeat them back to the user in one short summary.
4. Act, after the user confirmed your summary: `markilo feedback --brand <slug> --apply` marks selected concepts
   shortlisted and dropped or round-rejected ones rejected. Log what was decided (`markilo answers`). Then: a selection
   or change request → the refine skill (develop the chosen concept; pinned spots tell you where the change belongs);
   a combination → a new concept developed from the named parts; a rejected round → the concepts skill for the next
   round, with the user's note.
