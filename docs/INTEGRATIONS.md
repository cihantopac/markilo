# Integrations

## Claude Code (primary)

Markilo is built for Claude Code: skills (`/markilo`, `/markilo:design`, …), sub-agents (researcher, concept designer,
critic) and pre-approved toolchain calls. Install it as a plugin (see the README). Everything below reuses the same
toolchain without Claude Code (Node ≥ 20.10): `npm install -g markilo` and call `markilo`, `npx markilo`, or
`node plugin/dist/markilo.mjs` from a clone, as in the examples.

## Other coding agents (VS Code with Copilot, Codex, Cursor, others)

Nothing in Markilo needs Claude: the toolchain is a plain CLI, and the researcher, the concept designer and the critic
are instructions. `agent-setup` writes them for the agent you use:

```bash
npx markilo agent-setup --target vscode    # .github/agents/markilo.agent.md + markilo-researcher|designer|critic.agent.md
npx markilo agent-setup --target codex     # AGENTS.md section + .codex/agents/markilo-*.toml
npx markilo agent-setup --target cursor    # .cursor/rules/markilo.mdc + .cursor/agents/markilo-*.md
npx markilo agent-setup --target generic   # MARKILO.md (one agent, no sub-agents)
```

It is a dry run until `--apply`. The orchestrating file holds the workflow, the rules (measured vs judged, no invented
facts, ask before network use, locked brands, originality) and the exact CLI calls, and points to the reference docs.
The three role files are the plugin's own agent instructions, with the Claude Code specifics replaced by your CLI
command and paths, so every agent follows the same procedure: the critic runs in its own context and judges cold,
before it reads the designer's rationale. In `AGENTS.md` only Markilo's marked section is added or replaced; any
other file Markilo did not write is never overwritten without `--force`. In VS Code, pick **markilo** in the agent
list; it calls the three roles as sub-agents.

### Which model for which role

| Role       | What it needs                                                              | Claude Code plugin | Elsewhere                                           |
| ---------- | -------------------------------------------------------------------------- | ------------------ | --------------------------------------------------- |
| researcher | web search and reading pages                                               | Sonnet             | a fast general model                                |
| designer   | a shell, file editing, looking at PNGs                                     | Sonnet             | a capable general model                             |
| critic     | image input, a fresh context, the strongest judgment you have; high effort | Opus               | your strongest model that reads images, high effort |

Name them with `--model role=<id>` (repeatable); without one, a sub-agent runs on the model of the chat. Use the ids
your agent shows:

```bash
# VS Code: the names in the model picker, "<model> (<vendor>)"; a comma-separated list is a preference order
npx markilo agent-setup --target vscode --model "critic=<strongest model> (copilot),<fallback> (copilot)" --model "designer=<fast model> (copilot)" --apply
# Codex: model ids from `codex` /model; the critic also gets model_reasoning_effort = "high"
npx markilo agent-setup --target codex --model critic=<model id> --apply
# Cursor: model ids from the model picker (Cursor accepts parameters such as <model id>[effort=high])
npx markilo agent-setup --target cursor --model "critic=<model id>[effort=high]" --apply
```

Why the critic matters most: the quality gate rests on the critic's cold scores, and it was calibrated against an
independent Claude Opus judge (`bench/results/calibration-rc.7/`). The critic names its model with
`concept update --reviewer <model id>`; with any other model, `concept list`, the gate output and the gallery say
"reviewer not calibrated" — the rule still applies, but how well it predicts the judge has not been measured. Notes
from each agent's documentation (October 2026): Cursor runs sub-agents on its own Composer model on legacy
request-based plans without Max Mode, and falls back to a compatible model when the named one is unavailable; VS Code
skips a sub-agent model above the chat's cost tier.

The generated files name paths on your computer. Before committing them to a shared repository, pass a command and a
docs path that work for everyone, for example with Markilo as a dev dependency (`npm install -D markilo`):

```bash
npx markilo agent-setup --target codex --cli "npx markilo" --references node_modules/markilo/plugin/skills/design/references --apply
```

or with Markilo vendored in the repository:

```bash
node tools/markilo/plugin/dist/markilo.mjs agent-setup --target codex --cli "node tools/markilo/plugin/dist/markilo.mjs" --references tools/markilo/plugin/skills/design/references --apply
```

## Installing assets into a project

`install-assets --framework auto` detects the project (pubspec.yaml → Flutter, composer.json with laravel/framework →
Laravel, package.json with next → Next.js, otherwise static) and places every exported file where that framework
expects it. It is a plan until `--apply`; existing files are kept unless `--force`, files already identical are left
alone, and replaced files are copied to `.markilo-backup/<time>/` first. Applying is one transaction: each file is
written through a temp file and a rename, a journal records every change, and a failure halfway puts every file back.
Pass the dry run's `planId` with `--expect` and the apply refuses if anything in the project changed since the plan
was shown. `install-assets --undo` reverses the last installation (a dry run until `--apply`); files you edited after
the installation are kept, never deleted or restored over.

| Framework            | Where files go                                                                                                                                    | What you add by hand                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Next.js App Router   | `app/favicon.ico`, `app/icon.svg`, `app/apple-icon.png`, `app/opengraph-image.png`, `app/manifest.webmanifest`; PWA icons in `public/`            | Nothing: Next.js writes the head tags. Remove older favicons from `public/` and any `metadata.icons` override. |
| Next.js Pages Router | `public/`                                                                                                                                         | The head snippet in `pages/_document`.                                                                         |
| Laravel              | `public/`                                                                                                                                         | The Blade head snippet (uses `asset()`), in your main layout.                                                  |
| Flutter              | `android/app/src/main/res/mipmap-*` (+ adaptive icon), `ios/Runner/Assets.xcassets/AppIcon.appiconset`, `web/favicon.png`, `web/icons/Icon-*.png` | Nothing. Export `ios` and `android` groups first (`markilo deliverables --add ios,android`).                   |
| Static / Vite        | `public/` (or `--into <dir>`)                                                                                                                     | The head snippet in your HTML.                                                                                 |

```bash
node plugin/dist/markilo.mjs install-assets --brand acme --framework auto --project ../acme-app
node plugin/dist/markilo.mjs install-assets --brand acme --framework auto --project ../acme-app --apply --expect <planId>
node plugin/dist/markilo.mjs install-assets --undo --project ../acme-app --apply
```
