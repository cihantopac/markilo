# Contributing to Markilo

Thanks for helping build an honest, high-craft brand identity studio. This guide covers setup, the project
layout and the bar a change needs to clear.

## Setup

```bash
git clone https://github.com/cihantopac/markilo.git && cd markilo
npm ci
npm run ci          # lint, types, tests, build, dist check
```

Try the plugin from source in any other project:

```bash
claude --plugin-dir /path/to/markilo
```

Inside the session run `/reload-plugins` after editing skills or agents.

## Layout

| Path                 | What lives there                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/`               | TypeScript toolchain (bundled to `dist/markilo.mjs`)                                                    |
| `skills/`, `agents/` | Claude Code skills and subagents (process and judgment)                                                 |
| `fonts/`             | Vendored OFL fonts (`npm run fonts` regenerates)                                                        |
| `tests/`             | Vitest unit, integration and bundled-CLI tests; `tests/fixtures/` holds synthetic marks and a fake repo |
| `evals/`             | `claude plugin eval` behavioral cases                                                                   |
| `branding/`          | Markilo's own identity workspace (made with Markilo)                                                    |
| `docs/`              | Architecture, outputs, originality method, privacy, maintenance                                         |

## Principles for changes

1. **Measured vs. judged.** New checks belong in the toolchain with tests and calibrated thresholds; the skills only
   interpret them. Don't add a "score" that is really a guess.
2. **Cite platform rules.** Any size, safe zone or format rule goes in `src/export/specs.ts` with the official URL.
3. **No new runtime services.** Everything must run offline on macOS, Linux and Windows with Node ≥ 20.10. New
   dependencies must be pure JS/WASM, permissively licensed, and bundle cleanly (`npm run build`).
4. **Safe by default.** No network without an explicit flag, no writes outside the workspace without an explicit
   `--apply`, never overwrite without `--force`.
5. **Synthetic data only.** Fixtures, tests and examples use invented brands. Never commit real client material.
6. **Keep `dist/` in sync.** CI fails if `dist/` differs from a fresh build. Run `npm run build` and commit the result.

## Tests

- `npm test` runs everything (~5 s). Similarity and quality thresholds are calibrated on `tests/fixtures/marks/`; if you
  change a metric, add fixtures that show why.
- Skill behavior changes should come with an eval case in `evals/` (see `evals/README.md`).

## Commits and pull requests

- Small, focused PRs with a clear "why". Update `CHANGELOG.md` under _Unreleased_.
- Use conventional prefixes when you can (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
- By contributing you agree that your contribution is licensed under Apache-2.0.

## Good first contributions

New export targets (with official specs), more fixture marks for calibration, translations of skill guidance into
better prompts for non-English requests, additional OFL fonts with clear roles, and gallery mockups.
