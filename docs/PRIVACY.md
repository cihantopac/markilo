# Privacy and data handling

- **Local by default.** The toolchain reads and writes files on your machine and makes no network requests, except
  `markilo research site`, which requires `--allow-network` and is only used after you agree.
- **What is stored.** Everything lives in your project's `brand/` workspace: briefs, research findings with their
  sources, answers you gave, concepts, reports and exports. Raw captures (`research/cache/`) and competitor references
  (`research/references/`) are git-ignored by the workspace's own `.gitignore`.
- **Secrets.** The repository scanner never opens `.env*`, private keys, keystores, `.npmrc`, `.netrc` or credential
  files; it only counts that it skipped them. Findings store relative paths, not absolute ones.
- **External services.** Web searches and fetches done by Claude (WebSearch/WebFetch) are governed by your Claude Code
  settings. Markilo's skills ask before searching with private or unreleased names.
- **Your project.** Markilo writes outside `brand/` only through `install-assets --apply`, never overwriting existing
  files unless you pass `--force`. The optional `/markilo` shortcut writes one file to `~/.claude/skills/markilo/` only
  with `--yes`.
- **This repository.** Never commit real client research or unreleased brand material to Markilo itself. Tests and
  examples use synthetic brands.
