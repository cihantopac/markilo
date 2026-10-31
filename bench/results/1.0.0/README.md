# Markilo 1.0.0 benchmark

The release evaluation, run once, unattended, in the isolated setup (only Markilo loaded, from a snapshot of the
plugin): five holdout briefs sealed at `241af5e` before any 1.0 change, run for the 0.5.0-rc.1 baseline and for 1.0.0,
and three real developer tools. Every critiqued concept was then judged blind by a panel — Opus 5.5 and Sonnet 5.5, two
looks each, from the brief and the images alone; "would present" is the majority of the four looks.

## Sealed holdouts

| Version    | Runs | Passed the gate | Panel would present | Developed / directions | Minutes   | Cost per run  | Ideas written / kept per run |
| ---------- | ---- | --------------- | ------------------- | ---------------------- | --------- | ------------- | ---------------------------- |
| 0.5.0-rc.1 | 5    | 0               | 0 of 21             | 21 / 32                | 23.5–29.8 | $6.63–9.59    | —                            |
| 1.0.0      | 5    | 1 (a false pass) | 0 of 20            | 20 / 25                | 20.9–31.7 | $7.69–10.31   | 19–22 / 5–7                  |

Per-run detail, every concept with the critic's and the judges' first readings, and cost: [holdouts-0.5.0-rc.1](holdouts-0.5.0-rc.1)
and [holdouts-1.0.0](holdouts-1.0.0). The briefs: an AI meeting assistant, a coffee roaster, a physiotherapy app, an
outdoor brand with a Turkish name (ö, ç) and a community solar cooperative.

## Real developer tools

Twelve runs on three of the maintainer's own CLIs (coined names, no existing logo), on disposable copies:
[real-projects.md](real-projects.md). One gate pass, rejected by the panel in all four looks; 0 of 40 judged concepts
presentable.

## What this shows

- **Release criterion 3 is not met.** Independently judged design quality did not improve measurably from 0.5.0-rc.1
  to 1.0.0: on fresh briefs neither version produced a concept the panel would present (0 of 21 and 0 of 20). Across
  everything judged for 1.0 — 81 concepts — the panel's majority would present none.
- **The gate errs at the edge, and only there.** Both 1.0 gate passes (one here, one on a real project) were first
  looks exactly at the bar, carried by second looks, and rejected by the panel. Of the 79 concepts the gate rejected,
  the panel's majority would have presented none. 1.0 labels such passes "passed at the edge" in the gallery and tells
  the user so; the bar itself did not move.
- **The judges disagree in one direction.** Opus as judge would present 0 of 81; Sonnet presented five concepts in
  both of its looks. The critic runs on Opus.
- **What 1.0 changed and could measure:** the critic struck 72 of 102 ideas from the words before anything was drawn;
  1.0 developed 20 of 25 directions (0.5: 21 of 32); misread letters and dots read as punctuation are now caught
  before review; the cost per run rose slightly (median $8.39 vs $8.14).
- **What it did not change:** marks still read as UI glyphs and household objects, and wordmarks as "a stock
  grotesque with one changed letter". Unattended, Markilo reliably refuses weak work; it does not yet reliably make
  strong work. It is built to be steered — ideas, sketches and concepts are all reviewable in the gallery — and that
  collaboration, not the unattended floor, is how it is meant to be used.

Cost of this evaluation (API-equivalent): holdout runs $84.40, holdout judging $13.79; real-project runs and judging
are listed in [real-projects.md](real-projects.md).
