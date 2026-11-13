# Workflow details

## Stage gates

| Stage      | Done when                                                                                        | Saved in                          |
| ---------- | ------------------------------------------------------------------------------------------------ | --------------------------------- |
| Understand | Sources read, existing identity seen, concise brief, essential questions answered, references in | profile.json, brief.json, answers |
| Explore    | Three proposals in the round: word, icon, idea, strengths, weaknesses, rendered board            | concepts/<id>/, proposals/round-N |
| Choose     | The user selected, asked for changes, combined, or rejected the round with a note                | feedback/, concept status         |
| Develop    | The chosen concept refined: letterforms, spacing, icon, small version, lockups, colour           | concepts/<id>/                    |
| Verify     | No `fail` checks, originality not `redesign`, one independent critique applied, user approved    | reports/, final/                  |
| Export     | Export ran without skipped groups the user needs                                                 | exports/                          |

Rounds: at most two rounds of three proposals on Markilo's own initiative; a third needs the user's direction
(`concept new --round 3 --directed "<their words>"`). Track cost per phase with `markilo cost`; the default budget is
$12 per brand (`markilo cost --brand <slug> --budget <usd>` to change it); `--budget-minutes <m>` adds a time budget (agent minutes: parallel agents add up; `wallMinutes` shows the clock),
since waiting is often the cost the user feels.

Append one dated line per significant decision to `brand/brands/<slug>/decisions.md` (Edit the file):
what was decided, why, and the evidence.

## Choosing the mode

- **evaluate**: the user wants an opinion or the brand is locked. Run `markilo score` / `analyze` /
  `compare` on existing files, then report strengths, risks and recommendations without designing.
- **refresh**: equity is strong but craft is weak → keep the idea, rebuild geometry, wordmark, palette.
- **redesign**: the mark fails measurably or contradicts the strategy → new directions.
- **new**: no identity exists.

Recommend a mode with evidence (measurements of the current mark + findings) and let the user decide.

## Partial requests

- "Research X": Discover + Research + Brief, then stop with a summary of the profile.
- "Check this logo": evaluate mode (`score`, `analyze`, `compare` against references, `name check`).
- "Make variations of concept A": Develop (develop mode on that concept).
- "Show me three directions": Understand (briefly) + Explore, then stop for the user's choice.
- "Export / give me favicons": Export (+ `install-assets` dry run).
- "Show me": `markilo gallery`.

## Monorepos

1. `markilo research monorepo <repo>` lists packages with `kind` (site, app, client, library, service) and whether they
   are `brandable` (user-facing). Libraries and services are not brands.
2. Agree with the user on: the master brand, which packages get their own identity, which are locked (preserved), and
   the parent of each (e.g. apps living inside a platform product).
3. `markilo research monorepo <repo> --register --groups products,apps --parent <master> --lock <slugs> --scan` creates the
   brands, stores each package folder in the brief's `codePaths`, and scans each one into its own profile. Run it once
   per parent if different groups have different parents.
4. Read the design-system docs and icon sets the scans report before proposing anything — an existing system is
   equity.
5. Scale the work: master + family system first; sites one at a time; many apps (10+) are usually best served by a
   shared **app icon system** (one grid, one container shape, one color logic, a distinct glyph per app) rather than
   separate identities. Do apps in batches of 4–6 concept-designer agents.
6. To place exports back into the repo from a separate brand folder:
   `markilo install-assets --brand <slug> --group web --into public --project <repo>/<package>` (dry run, then `--apply`
   after the user agrees).

## Multi-product families

1. `markilo init --family "<Family>"`, then `brand add` for the master brand and each product
   (`--role product --parent <master>`). Locked members: `brand add "<Name>" --locked` then
   `markilo lock --brand <slug> --symbol … --primary …`.
2. Research the family once (master brand), then product-specific facts per product.
3. Propose the family as one system, not the master alone: each proposal shows the master and two or three members.
   With construction specs, a `members` block draws them from one parameter set (construction.md → Families;
   `markilo sketches` renders `sketches/family.png` and flags members that read as the same mark).
4. When the user has chosen the master, build each product from the same system: `markilo concept new --brand <product> …`,
   then `markilo construct <spec> --brand <product> --concept <id> --member <name>` (its parameters and colours),
   `markilo verify`, and show the family together. Record the system (construction, colour logic) in
   `shared/system.json`.
5. Products that need their own idea (an acquired brand, a different audience) are designed separately with the
   concept-designer agent, inside the shared system.

## A product joining an existing family

The family's rule lives in members that already exist, often on other sites; Markilo designs one new member.

1. Ask which members define the rule and which are out of date (first questions). Only the current ones are the rule.
2. `markilo research family --brand <slug> --member <url> --member <url> --allow-network` saves each current member's
   lockups and logos as `family` references and returns `takenColors`. `family` references count as family likeness in
   `originality`, never as an originality risk.
3. Draw the shared parts once, before any designer runs, in `work/family/`: the parent word or the family lettering,
   any suffix, and the lockup metrics (symbol height against cap height, gap). Measure them from the references.
   Every designer gets the same files and keeps them unchanged; when the word is locked, the round varies the icon and
   "at least one wordmark-led" does not apply.
4. Record lettering as what it is: `markilo concept update --lettering family` (or `custom`) with a
   `--supporting-font` only when a typeface is really used beside it. `typeset` is then skipped and the guidelines say
   "custom (family) lettering", never a stand-in font as the brand typeface.
5. Pick the product colour from outside `takenColors` unless the user asked for a shared one.

## Using Markilo from another project

The workspace lives in the user's project at `./brand` (add it to their VCS or not — their choice; raw
research captures are git-ignored automatically). Nothing outside `./brand` changes unless the user
approves `install-assets --apply`.
