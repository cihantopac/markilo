# Integrations

## Claude Code (primary)

Markilo is built for Claude Code: skills (`/markilo`, `/markilo:design`, …), sub-agents (researcher, concept designer,
critic) and pre-approved toolchain calls. Install it as a plugin (see the README). Everything below reuses the same
toolchain without Claude Code (Node ≥ 20.10): `npm install -g markilo` and call `markilo`, `npx markilo`, or
`node plugin/dist/markilo.mjs` from a clone, as in the examples.

## Other coding agents (Codex, Cursor, others)

```bash
node plugin/dist/markilo.mjs agent-setup --target codex      # AGENTS.md section between markilo markers
node plugin/dist/markilo.mjs agent-setup --target cursor     # .cursor/rules/markilo.mdc
node plugin/dist/markilo.mjs agent-setup --target generic    # MARKILO.md
```

It is a dry run until `--apply`. The file holds the workflow, the rules (measured vs judged, no invented facts, ask
before network use, locked brands, originality) and the exact CLI calls, and points to the reference docs
(construction specs, design principles, originality policy). In `AGENTS.md` only Markilo's marked section is added or
replaced; a `MARKILO.md` or Cursor rule that Markilo did not write is never overwritten without `--force`.

The generated text names paths on your computer. Before committing it to a shared repository, pass a command and a
docs path that work for everyone, for example with Markilo vendored in the repository:

```bash
node tools/markilo/plugin/dist/markilo.mjs agent-setup --target codex --cli "node tools/markilo/plugin/dist/markilo.mjs" --references tools/markilo/plugin/skills/design/references --apply
```

or with Markilo as a dev dependency (`npm install -D markilo`):

```bash
npx markilo agent-setup --target codex --cli "npx markilo" --references node_modules/markilo/plugin/skills/design/references --apply
```

What other agents do not get: Claude Code's sub-agents. The guide asks them to run the sketch review and the critique as
separate, deliberately critical passes, starting with a blind look at the context sheet.

## Installing assets into a project

`install-assets --framework auto` detects the project (pubspec.yaml → Flutter, composer.json with laravel/framework →
Laravel, package.json with next → Next.js, otherwise static) and places every exported file where that framework
expects it. It is a plan until `--apply`; existing files are kept unless `--force`, and replaced files are copied to
`.markilo-backup/<time>/` first.

| Framework            | Where files go                                                                                                                                    | What you add by hand                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Next.js App Router   | `app/favicon.ico`, `app/icon.svg`, `app/apple-icon.png`, `app/opengraph-image.png`, `app/manifest.webmanifest`; PWA icons in `public/`            | Nothing: Next.js writes the head tags. Remove older favicons from `public/` and any `metadata.icons` override. |
| Next.js Pages Router | `public/`                                                                                                                                         | The head snippet in `pages/_document`.                                                                         |
| Laravel              | `public/`                                                                                                                                         | The Blade head snippet (uses `asset()`), in your main layout.                                                  |
| Flutter              | `android/app/src/main/res/mipmap-*` (+ adaptive icon), `ios/Runner/Assets.xcassets/AppIcon.appiconset`, `web/favicon.png`, `web/icons/Icon-*.png` | Nothing. Export `ios` and `android` groups first (`markilo deliverables --add ios,android`).                   |
| Static / Vite        | `public/` (or `--into <dir>`)                                                                                                                     | The head snippet in your HTML.                                                                                 |

```bash
node plugin/dist/markilo.mjs install-assets --brand acme --framework auto --project ../acme-app
node plugin/dist/markilo.mjs install-assets --brand acme --framework auto --project ../acme-app --apply
```
