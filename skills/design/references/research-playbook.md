# Research playbook

Goal: a Brand Intelligence Profile that a designer can trust. Every claim has a source and a date, or is
labeled as inference, or is listed as a gap.

## Evidence levels (`--status`)

| Status          | Meaning                                                                                                    | Needs source |
| --------------- | ---------------------------------------------------------------------------------------------------------- | ------------ |
| `observed`      | Seen directly in a source (page text, repo file, screenshot, registry record).                             | yes          |
| `verified`      | Confirmed by an authoritative source (official registry, the company itself) or by the user with evidence. | yes          |
| `user-provided` | The user told you. Log the answer with `markilo answers`.                                                  | no           |
| `inferred`      | Your reasoning from observations. Say what it is based on.                                                 | optional     |

Never upgrade an inference to observed. When sources disagree, record both findings and the conflict.

## What to cover

1. **Product**: what it does, for whom, the core mechanism or promise, platforms, pricing model.
2. **Audience & markets**: primary/secondary users, countries and languages, B2B/B2C, technical depth.
3. **Existing identity**: logos (look at them), colors, type, UI style, tone of voice, equity worth keeping.
4. **Competitors**: 5–10 direct and indirect, plus 3–5 admired brands from adjacent categories and other
   regions. For each: name, URL, positioning in one line, identity notes (form, color, type).
5. **Category conventions**: the visual codes most players use (colors, shapes, type). Identify where the
   brand should conform (trust) and where it should break away (distinctiveness).
6. **Trends**: current and durable vs. fashionable. Prefer timeless; note anything that will date.
7. **Culture & language**: name meaning and pronunciation in target languages (including slang and
   negative meanings), color and symbol meanings, script support (Turkish, Cyrillic, Arabic if relevant).
8. **Naming & trademarks**: `markilo name check` against competitor names; `markilo name trademark` for
   the registry plan; run searches where you can, log each as `--type registry` with what you searched and
   found. "No results" is not clearance.

## Sources and how to use them

- **The user's own material** first: repo (`markilo research repo`), files they give you, their answers.
- **The brand's website**: `markilo research site <url> --allow-network` — only after the user agrees.
- **Web search / fetch** (Claude's WebSearch/WebFetch): competitor sites, press, app store listings,
  design case studies. Log each useful page with `profile add-source --type url` and its date.
- **Official registries**: WIPO Global Brand Database, TMview, USPTO, TÜRKPATENT, UKIPO (links in
  `markilo name trademark`). Respect their terms: interactive searching only, no scraping.

## Reference marks for similarity

- For each important competitor, save its logo (SVG preferred, else PNG) to a temporary folder and add
  it with `markilo reference add --brand s --file … --name … --source <url>`. These are stored in the
  workspace's git-ignored `research/references/` and are used only for comparison.
- Also add marks that the concept might _accidentally_ resemble: famous marks in the same form family
  (e.g. if the concept is a stylised bird, add major bird logos).

## Privacy and permissions

- Ask before sending private names, unreleased product details or internal repo content to any external
  service (including web searches). Prefer generic queries.
- Never record secrets, API keys or personal data in the profile. The repo scanner skips secret-like files.
- Research captures belong to the user's workspace, never to the Markilo repository.

## Questions to the user

Ask only what changes the design and cannot be found or reasonably inferred. Batch them (2–5), give your
suggested answer for each, and log them with `markilo answers`. Typical gaps: ambition and personality
trade-offs (e.g. "playful vs. serious"), must-keep elements, markets/languages, deadlines, what they
dislike in competitors.
