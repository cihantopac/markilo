# Maintaining Markilo

## Versioning

Markilo follows [Semantic Versioning](https://semver.org). The public API is: skill and agent names, CLI commands,
flags, JSON output fields, error codes, workspace file formats (`markilo/*@1` schemas) and export paths.

- **Patch**: fixes, calibration that does not change verdict thresholds, docs.
- **Minor**: new commands, flags, export targets, checks, skills; additive schema fields.
- **Major**: removed/renamed commands, flags, fields or export paths; schema version bumps (`@2`), threshold changes
  that alter existing verdicts.

The version appears in `package.json`, `plugin/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`; a test
fails if they disagree. Setting `version` in the plugin manifest means users receive updates only when it changes.

## Release checklist

1. Move _Unreleased_ notes in `CHANGELOG.md` to a new version section with today's date.
2. Bump the version in the three manifests.
3. `npm run ci`, `node scripts/smoke.mjs` and `claude plugin validate . --strict`.
4. For releases that change the design workflow, skills or checks: update the installed plugin and run the benchmark
   (`node scripts/bench.mjs run all`, then `judge` and `report`; see [bench/README.md](../bench/README.md)). Commit
   `bench/results/<version>/` and update the README's numbers. Optional: `claude plugin eval . --runs 1 --max-cost-usd 5
   --allow-tools "Bash(node *)" Write Edit --no-publish`.
5. Commit, then `claude plugin tag --push` (creates `markilo--v<version>`). The release workflow runs CI and publishes
   GitHub release notes from the changelog.
6. `npm publish` from the tagged commit, by a maintainer (`prepublishOnly` runs CI and the smoke test; npm asks for
   two-factor approval). The package installs nothing besides itself: keep bundled libraries in `devDependencies`.

## Platform specs

Re-verify `src/export/specs.ts` against the cited sources at least twice a year and when Apple, Google or Microsoft
ship major OS releases. Update the "Verified" date and tests in the same PR.

## Dependencies

Dependabot opens monthly grouped updates. Every dependency is bundled, so review changelogs for behavior changes,
rebuild `dist/`, regenerate `THIRD_PARTY_NOTICES.md` (`node scripts/notices.mjs`) and rerun the tests.

## Branding

Markilo's own identity is in `branding/`. After changing it, run
`node plugin/dist/markilo.mjs export --workspace branding --brand markilo --only logos,web,social,tokens,guidelines --clean`
and `node scripts/readme-assets.mjs` (it only copies exported files into `assets/` and the plugin icon; nothing is drawn
by hand). After a change to the gallery or export pages only, the same export rewrites `index.html`,
`guidelines/index.html` and the manifest and leaves every logo file byte-for-byte unchanged; rebuild
`branding/gallery/index.html` with `node plugin/dist/markilo.mjs gallery --workspace branding`.

## README images

The README is also the npm page, so its images use absolute `raw.githubusercontent.com` URLs pinned to the release tag
(`markilo--v<version>`): relative paths do not render on npmjs.com. Bump the tag in the URLs with each release that
changes an image; they resolve once the tag is pushed.

- `assets/logo-*.svg`, `assets/kit-overview.png`, `assets/social-preview.png`: Markilo's own exports
  (`scripts/readme-assets.mjs`).
- `assets/made-with/*`: the exported `logos/primary` and `social/og-image.png` files of Relivaro, Searvex and Jourilo,
  copied unedited from their kits.
- `assets/screens/*`: screenshots of real pages, never mockups. `gallery*.png` show the Gallery built from a copy of
  `branding/` with `final/` and `exports/` removed and the Hallmark concept set back to `verified`, so its round of
  three is waiting for a decision (the decisions in `gallery-request.png` and `gallery-compare.png` were clicked in
  the page); `kit-preview.png` is `branding/brands/markilo/exports/index.html`. Taken at 1280 px (390 px for the phone
  view) with device scale 2 in headless Chromium.

## Public presentation

- GitHub About: the description matches `package.json`; topics cover brand identity, logo, SVG, Claude Code and the
  asset kit.
- Social preview: GitHub has no API for it. In **Settings → General → Social preview**, upload
  `assets/social-preview.png` (1280×640, Markilo's exported `social/github-social-preview.png`). `gh repo view --json
  usesCustomOpenGraphImage` shows whether one is set.
