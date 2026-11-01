---

name: export
description: Markilo asset export — generate the complete brand asset kit from the approved identity (logo variants, favicons, PWA, iOS, Android, macOS, Windows icons, social and marketing images, tokens, guidelines) and optionally install web assets into the project. Use when the user wants logo files, favicons, app icons or a brand kit.
argument-hint: "[brand slug] [groups, e.g. web,ios]"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" *) Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs *) Read Write Edit Glob Grep
---

# Markilo · Export

Request: $ARGUMENTS

Toolchain: `node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command>` (written `markilo`). Run every toolchain command as its own Bash call, written out in full (`node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command> …`). Do not wrap it in shell variables, `cd`, `&&` chains or pipes: the plugin pre-approves exactly that form, so anything else triggers permission prompts.

1. `markilo status`. If the brand has no approved kit: for a designed concept run `markilo finalize`; for an existing
   identity the user wants to keep as-is, use `markilo lock --brand <slug> --symbol … --primary …` (exact copy).
2. **Choose the package once.** Run `markilo deliverables --brand <slug>`. If `source` is `brief`, the user already
   chose; go on. If it is `suggested`, tell the user in one short message what you will prepare, in plain words, and
   offer the left-out groups in the same message as one question, for example: "For a web app I'll prepare the logo
   files, web icons, link-preview images, color/type tokens and the guidelines. Should I add mobile app icons, desktop
   app icons or print items (business card, email signature)?" Save the answer with
   `markilo deliverables --brand <slug> --set …` (or `--add` / `--remove`) and record it with `markilo answers`.
   If the user already said "everything" or "just do it", keep the suggestion and don't ask.
3. `markilo export --brand <slug>` (it exports the chosen groups; `--only web,ios,…` or `--all` override). Read the
   summary: files per group, `notIncluded`, skipped groups, warnings.
4. Spot-check a few outputs visually with `Read` (e.g. `exports/web/icon-maskable-512.png`,
   `exports/ios/AppIcon.appiconset/AppIcon-1024.png`, `exports/social/og-image.png`).
5. `markilo gallery` to refresh the preview.
6. To place assets in the user's project, plan first: `markilo install-assets --brand <slug> --framework auto
   [--project <dir>]`. It detects Next.js, Laravel, Flutter or a static site and lists where each file goes and what
   (if anything) the user must add by hand (a head snippet). Show the plan; only with the user's OK re-run with
   `--apply --expect <planId>` (the dry run's `planId`: the apply refuses if the project changed after the user saw
   the plan), and `--force` only if they want existing icons replaced — those are backed up to `.markilo-backup/`.
   Applying is all-or-nothing; `markilo install-assets --undo [--project <dir>]` previews reversing it, `--apply`
   does it (files the user edited since are kept). Do not edit their source files; give them the snippet instead.
7. Tell the user where everything is: open `exports/index.html` first (every file previewed on its own background,
   with links); `exports/README.md` lists the files most people need; `guidelines/index.html` explains usage. Say that more groups
   can be added any time (`markilo deliverables --add ios` then `markilo export`), and mention that
   X (Twitter) header sizes could not be verified against x.com documentation.
