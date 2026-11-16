# Gallery redesign, desktop gallery and README showcase — design

Date: 2026-11-16 · Status: proposed

## Why

The review gallery is the first thing a user sees of their identity, and the README is Markilo's shop window on
GitHub. Today the gallery reads as a wall of text: a step bar, three instruction boxes, and on each card four logo
panels, five status pills, a pitch paragraph and six bullet lines before any decision control. The owner wants it
clean, visual and ordered — the calm of apple.com or stripe.com — with every detail still available on demand.

Separately, in Claude Code's desktop app the agents never show the gallery: `design` and `gallery` skills say "send
`proposals/round-<n>.png` into the chat; the gallery is optional" (added in 1.4 after `gallery --serve` closed with
the session). Users therefore never see the page this design improves.

## Goals

1. **Three colours, 60 / 30 / 10.** The interface uses Markilo's own palette only:
   - 60 % paper `#f2ece1` (page, surfaces; cards a lighter paper `#fbf8f2`),
   - 30 % ink `#16120f` (text, dark icon grounds, the dark band, primary outline),
   - 10 % oxblood `#7e1d2a` (primary buttons, hover, focus, the active state, the selected proposal).
   Greys are tints of ink, not new hues. Green/amber status colours go: a problem is shown in oxblood with a word,
   "all good" in muted ink. Dark theme inverts paper and ink and keeps oxblood (lifted for contrast).
   Brand artwork keeps the brand's own colours — the rule is for Markilo's interface.
2. **Visual first, words on demand.** Say it in three words, not ten. On the page by default: the marks, the proposal
   letter and title, one short line for the idea (the pitch's first sentence), and the decision buttons. Everything
   else — strengths and weaknesses, checks, originality, critic, rationale, palette codes, surfaces — sits behind one
   "Details" disclosure per proposal. Nothing is removed from the file.
3. **Presentation layout.** Proposal board on top: A, B, C as large clean tiles (word mark on paper, icon on ink),
   letter + title underneath, nothing else. Below it, one proposal at a time, large: hero mark, icon on dark, lockup,
   size ladder, the one-line idea, decision buttons; "Details" folds open beneath. A/B/C switches with the board or
   arrow keys. Compare shows two or three side by side with the same restraint.
4. **Less chrome.** The three instruction boxes become one quiet sentence. The workflow steps stay as a thin line in
   the top bar.
5. **The gallery appears in the desktop app.** The skills open the self-contained `brand/gallery/index.html` for the
   user (in the desktop app: send the file so it renders in the side panel; in a terminal: the `file://` link or
   `--serve`), and still send the round PNG for a quick look. Decisions come back by **Copy decisions** (text the
   user pastes into chat; it carries a JSON block `markilo feedback --import` reads) — no server needed. When the
   clipboard is blocked the text is shown selectable.
6. **README as a showcase.** Rewritten top to bottom: the hero, one large gallery screenshot from the new page,
   a short three-step story (proposals → choose → kit), Made with Markilo, the kit, install, honest costs and limits.
   Shorter sentences. Every screenshot retaken from the new pages (light, dark, mobile TR) with Markilo's own
   branding workspace; image links pinned to the release tag. GitHub social preview image redone to match.

## Non-goals

- No change to what the toolchain measures, to feedback semantics or to the `feedback` file format beyond accepting
  pasted text.
- No new fonts or network resources: the pages stay offline single files.
- The kit preview and the guidelines are not re-laid out; they inherit the new chrome tokens (three colours, quieter
  top bar) only.

## Anti-goals (failure even if it works)

- A pretty page that hides a weakness the user needs to choose well: the details stay one click away, and a failing
  check or a high originality risk shows as a single oxblood word on the proposal, never hidden.
- A fourth interface colour creeping back (status greens, blue links).
- Marketing copy in the README that the benchmarks do not support.

## Approaches considered

- **Presentation layout (chosen).** Board of three + one large proposal. Closest to apple/stripe calm, best
  screenshots, the mark is the hero. Costs a bigger rewrite of `gallery.ts` markup and script.
- **Clean three columns.** Today's grid with text folded. Smaller change, but three dense columns stay busy at
  laptop width and in screenshots.
- **Separate static "showcase" page plus today's review page.** Two pages to maintain; the review page users actually
  use would stay cluttered. Rejected.

## What is decided

- Palette and proportions as in Goal 1; tokens live in `src/ui/chrome.ts` and apply to gallery, kit preview and
  guidelines.
- Typography: the existing serif for titles, system sans for interface; larger titles, more whitespace, fewer
  borders (surfaces separated by space and tone, not lines). Rounded corners kept modest.
- Sketch rounds, the approved (finalized) panel, rejected proposals and the family view keep working in the new
  layout.
- EN/TR, light/dark/system, mobile and print keep working. Accessibility: keyboard reachable, focus visible in
  oxblood, contrast AA.
- Skill text changes: `design` (C. The user chooses), `gallery`, `concepts` step 5 — gallery shown by default.

## Settled after the builder check (designer's calls)

- **Showing the gallery in the desktop app.** The skills run in the main Claude Code session. When that session has a
  tool that sends a file to the user for display (the desktop app's file sender with inline rendering), the skill sends
  `brand/gallery/index.html` with it; otherwise it gives the `file://` link, or the `--serve` URL in a terminal. The
  page is already one self-contained file. The round PNG is still sent for a quick look. Whether scripts and the
  clipboard run in the side panel is checked by hand once the new page exists (a short spike before the skill text
  is final); if the clipboard is blocked the page shows the text selectable, so the flow never depends on it.
- **Copy decisions.** Replaces today's "Copy request": a short readable summary plus a fenced `markilo-feedback`
  JSON block. "Download decisions" (file) and the served "Send to your agent" stay. The agent saves pasted text to a
  file and runs `markilo feedback --import <file>`; `--import` learns to take the JSON block out of such text (one
  small parser, tested).
- **Release.** The README's image links point at the next release tag; screenshots and README are committed before
  the tag. Tagging, GitHub release and npm publish still wait for the owner's approval. The social preview PNG is
  committed in `assets/`; uploading it in the GitHub repository settings is the owner's one manual step.
- **README claims.** Only numbers already recorded in `docs/BENCHMARKS.md` and the release validation logs; the
  existing cost and limits section keeps its substance, shortened.
- **Oxblood for selection vs. problems.** Selected/active: oxblood fill or ring. A problem: a small "!" glyph plus a
  word ("1 check failing", "originality: review") in oxblood text, never only colour.
- **Other views.** Compare: two or three proposals side by side in the same restrained style. Sketch rounds: the
  board shows the sketch grid, picking stays as today. Finalized: the large view shows the approved identity with its
  kit links. Family: one board per member. All use the new styling.

## Left to the builder

Exact spacing scale, component markup, how the board tiles are sized for two or four proposals, translation strings
for new labels (TR added to `src/ui/tr.ts`), test updates for the new markup, screenshot tooling.
