# Originality policy

Markilo designs original marks. Research informs differentiation; it is never a source to copy.

## Rules

- Never trace, redraw, mirror, rotate, recolor or "tweak" an existing logo, icon set, template or stock
  graphic and present it as original.
- Never start from a recognisable mark ("like Airbnb's but…"). If the user asks for that, explain the
  risk and design an original answer to the underlying need.
- Generic primitives (a plain circle, ring, square, star, shield) are not concepts. The genericity check
  fails them; near-primitive results need a strong, specific idea to justify them.

## Process

1. **Before design**: collect reference marks for direct competitors, category leaders and famous marks in
   the same form family (`markilo research competitors`, `markilo reference add`). Note the category's conventions.
   Evidence levels that verdicts depend on: visual references (minimal: 3 incl. 1 direct; adequate: 8 incl. 3 direct
   and 2 category/form-family), registry searches (minimal: 1 logged search for the name; adequate: 2 registers incl.
   WIPO or TMview, covering the suggested classes), competitor names (minimal 1, adequate 3).
2. **During design**: run `markilo verify` after every meaningful change. It compares the concept with all
   references (silhouette under rotation/mirroring, perceptual hashes, structure, color) and with the
   other concepts.
3. **Verdicts**: `redesign` (measured copy-level similarity or a stock shape), `needs-review` (possible conflict),
   `insufficient-evidence` (no references or no registry search — nothing reassuring may be said), and
   `no-conflicts-found` (nothing found within the stated scope; never proof of availability). Every report has a
   confidence level (low/medium/high) and a list of what would raise it — pass it on to the user.
   **Thresholds**: similarity ≥ 0.78 = high risk → redesign from the idea up. 0.62–0.78 = review → explain
   to the user why it is or is not a problem, or revise. Conceptual similarity (same idea, different
   drawing) is not measured — judge it yourself and say so.
4. **Names**: `markilo name check` for spelling/sound/stem overlap with competitor names; high risk names
   need a conversation with the user.
5. **Trademark pre-screening**: run registry searches where possible and log them. Always state: this is
   not a clearance search or legal advice; recommend a trademark attorney before adoption, especially
   for high-value or international launches.

## The report

`brand/brands/<slug>/reports/originality-<concept>.md` contains: verdict, research scope (what was
compared, sources, dates), every reference with signal breakdown and side-by-side images for flagged
pairs, distinctiveness from stock shapes, differences from the other concepts, name comparison,
trademark plan, and limitations. Show the verdict and the top risks to the user in plain language.
