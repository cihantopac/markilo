# Real-project validation (1.0.0)

Markilo was run, unattended, on three real developer tools of its maintainer — each a CLI plus a Claude Code plugin,
with a coined name and no existing logo. They were test subjects, not branding assignments: every run used a
disposable copy outside all repositories, nothing was written to the products, and no concept from these runs is an
approved identity. Names, briefs and images stay private; only these aggregates are published.

| Version under test                                  | Runs | Passed the gate | Concepts / critiqued | Mean blind distinctiveness | Panel would present | Minutes (median) | Cost per run (median) |
| --------------------------------------------------- | ---- | --------------- | -------------------- | -------------------------- | ------------------- | ---------------- | --------------------- |
| 0.5.0-rc.1 (+ the install fix; loaded a live checkout) | 3    | 0               | 18 / 17              | 4.6                        | 0 of 17             | 28               | $7.66                 |
| + idea longlist                                     | 3    | 0               | 15 / 12              | 4.3                        | 0 of 12             | 30               | $8.99                 |
| + one-silhouette construction, Sonnet designer      | 3    | 0               | 16 / 9               | 4.7                        | not judged          | 25               | $8.75                 |
| same, Opus designer                                 | 3    | 1               | 13 / 11              | 5.2                        | 0 of 11             | 31               | $13.14                |

The judge panel is Opus 5.5 and Sonnet 5.5, two blind looks each, from the brief and the images alone; "would present"
is the majority of the four looks.

What this shows:

- **On coined names for developer tools, unattended Markilo does not yet produce a presentable identity.** Twelve
  runs, one gate pass, and that pass was false: both judges rejected it in all four looks. Its deciding second look
  had seen the designer's direction through `concept list`; second-look critics now run no command that prints it.
- **The gate is not the problem.** Where the panel judged, its majority agreed with the gate on 39 of 40 concepts (the
  exception is the false pass above); the two judges agreed with each other on 38 of 40. Sonnet is the more lenient
  judge: two concepts got a "yes" from both of its looks, none from Opus.
- **What did not help, measured:** the idea longlist (the critic struck 49 of 66 ideas with sensible readings, yet
  the kept ones still became icon-like drawings), one-silhouette construction (designers used it in 0–4 of ~25
  sketches per run) and an Opus designer (slightly higher blind distinctiveness, no presentable concept, ~50 % higher
  cost). Markilo 1.0 keeps the longlist and the silhouette tool as capabilities and the designer on Sonnet.
- **Installation was tested on copies of all three projects:** framework detection (static), dry run, apply with
  the plan id, undo — each copy was byte-identical to the original after undo.

Every symbol direction across these runs came from a mechanism metaphor drawn with primitives (a round trip, a
keystone, a plumb bob, a caliper) and was read as a UI glyph or a household object; every wordmark that failed did so
on distinctiveness ("a stock grotesque with one changed letter") or on a misread letter. These are the open design
problems Markilo reports instead of hiding.
