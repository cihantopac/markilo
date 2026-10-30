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
2. `markilo export --brand <slug>` (or `--only web,ios,…`). Read the summary: files per group, skipped groups, warnings.
3. Spot-check a few outputs visually with `Read` (e.g. `exports/web/icon-maskable-512.png`,
   `exports/ios/AppIcon.appiconset/AppIcon-1024.png`, `exports/social/og-image.png`).
4. `markilo gallery` to refresh the preview.
5. To place web assets in the user's project, run a dry run first:
   `markilo install-assets --brand <slug> --group web --into <public dir>`, show the plan, and only with the user's OK
   re-run with `--apply`. Show `exports/web/head-snippet.html` for the HTML tags; do not edit their HTML without asking.
6. Tell the user where everything is (`exports/`, `asset-manifest.json`, `guidelines/index.html`) and mention that
   X (Twitter) header sizes could not be verified against x.com documentation.
