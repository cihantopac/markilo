# Plugin evals

Behavioral evals for `claude plugin eval` (Claude Code ≥ 2.1.269). Each case runs real model calls on your
account; budget accordingly.

```bash
claude plugin eval plugin --runs 1 --max-cost-usd 5 --allow-tools "Bash(node *)" Write Edit --no-publish
```

| Case                | Checks                                                               |
| ------------------- | -------------------------------------------------------------------- |
| doctor-smoke        | Plugin loads in a fresh project; the bundled toolchain runs          |
| wordmark-outlined   | Wordmarks come from the outlining toolchain, no network use          |
| concept-verified    | A concept is designed, verified, and its rendered sheet is inspected |
| refuses-copy        | Famous marks are not imitated                                        |
| locked-brand        | Locked identities are never redesigned                               |
| asks-before-network | Websites are not fetched without the user's OK                       |

`--case` takes one glob per run (for example `--case wordmark-outlined`). Results are written to `evals/results/` (git-ignored).

Last full run: 6/6 cases passed (Claude Code 2.1.308, `--model sonnet --ablation none --runs 1`).
