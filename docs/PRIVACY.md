# Privacy and data handling

- **Local by default.** The toolchain reads and writes files on your machine and makes no network requests, except
  the research commands (`research site`, `research competitors`, `research app`, `fonts search/add`), which require
  `--allow-network` and are only used after you agree.
- **Gallery server.** `markilo gallery --serve` listens on `127.0.0.1` only (never on your network), requires a random
  token in the URL, rejects other host names (DNS rebinding), serves only the gallery page and approved/exported
  artwork (never research, profiles, answers or feedback), accepts at most 512 KB of validated decisions and stops when
  idle. Decisions are stored in the workspace's `feedback/` folder and nowhere else.
- **What is stored.** Everything lives in your project's `brand/` workspace: briefs, research findings with their
  sources, answers you gave, concepts, reports and exports. Raw captures (`research/cache/`) and competitor references
  (`research/references/`), including the context sheets that show your mark next to competitors, are git-ignored by
  the workspace's own `.gitignore`; older workspaces get new ignore rules the next time Markilo opens them.
- **Secrets.** The repository scanner never opens `.env*`, private keys, keystores, `.npmrc`, `.netrc` or credential
  files; it only counts that it skipped them. Findings and sources store paths relative to the project, never absolute
  paths (they would reveal your user name and folder layout); `markilo profile tidy` rewrites older profiles.
- **External services.** Web searches and fetches done by Claude (WebSearch/WebFetch) are governed by your Claude Code
  settings. Markilo's skills ask before searching with private or unreleased names.
- **Your project.** Markilo writes outside `brand/` only through `install-assets --apply` (never overwriting existing
  files unless you pass `--force`, and backing them up to `.markilo-backup/` first) and `agent-setup --apply` (one
  instruction file for another coding agent; it names paths on your computer unless you pass `--cli` and
  `--references`, so check it before committing). The optional `/markilo` shortcut writes one file to
  `~/.claude/skills/markilo/` only with `--yes`.
- **Optional embedder.** `MARKILO_EMBEDDER` runs a local command you choose to compare marks; Markilo sends it two image
  paths and nothing else, and nothing is downloaded for it.
- **This repository.** Never commit real client research or unreleased brand material to Markilo itself. Tests and
  examples use synthetic brands. Benchmark results (`bench/results/`) keep only Markilo's own outputs and metrics, never
  research captures or third-party reference marks.
