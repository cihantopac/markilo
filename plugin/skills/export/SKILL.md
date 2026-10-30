---

name: export
description: Markilo asset export — generate the complete brand asset kit from the approved identity (logo variants, favicons, PWA, iOS, Android, macOS, Windows icons, social and marketing images, tokens, guidelines) and optionally install web assets into the project. Use when the user wants logo files, favicons, app icons or a brand kit.
argument-hint: "[brand slug] [groups, e.g. web,ios]"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" *) Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs *) Read Write Edit Glob Grep
---

# Markilo · Export

Request: $ARGUMENTS

Toolchain: `node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command>` (written `markilo`). Run every toolchain command as its own Bash call, written out in full (`node "${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs" <command> …`). Do not wrap it in shell variables, `cd`, `&&` chains or pipes: the plugin pre-approves exactly that form, so anything else triggers permission prompts.

1. `markilo brand list`. If the brand has no approved kit: for a designed concept run `markilo finalize`; for an existing
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
6. To place web assets in the user's project, run a dry run first:
   `markilo install-assets --brand <slug> --group web --into <public dir>`, show the plan, and only with the user's OK
   re-run with `--apply`. Show `exports/web/head-snippet.html` for the HTML tags; do not edit their HTML without asking.
7. Tell the user where everything is (`exports/`, `asset-manifest.json`, `guidelines/index.html`), that more groups
   can be added any time (`markilo deliverables --add ios` then `markilo export`), and mention that
   X (Twitter) header sizes could not be verified against x.com documentation.
