# Maintaining Markilo

## Versioning

Markilo follows [Semantic Versioning](https://semver.org). The public API is: skill and agent names, CLI commands,
flags, JSON output fields, error codes, workspace file formats (`markilo/*@1` schemas) and export paths.

- **Patch**: fixes, calibration that does not change verdict thresholds, docs.
- **Minor**: new commands, flags, export targets, checks, skills; additive schema fields.
- **Major**: removed/renamed commands, flags, fields or export paths; schema version bumps (`@2`), threshold changes
  that alter existing verdicts.

The version appears in `package.json`, `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`; a test fails
if they disagree. Setting `version` in the plugin manifest means users receive updates only when it changes.

## Release checklist

1. Move _Unreleased_ notes in `CHANGELOG.md` to a new version section with today's date.
2. Bump the version in the three manifests.
3. `npm run ci` and `claude plugin validate . --strict`.
4. Optional but recommended: `claude plugin eval . --runs 1 --max-cost-usd 5 --allow-tools "Bash(node *)" Write Edit --no-publish`.
5. Commit, then `claude plugin tag --push` (creates `markilo--v<version>`). The release workflow runs CI and publishes
   GitHub release notes from the changelog.

## Platform specs

Re-verify `src/export/specs.ts` against the cited sources at least twice a year and when Apple, Google or Microsoft
ship major OS releases. Update the "Verified" date and tests in the same PR.

## Dependencies

Dependabot opens monthly grouped updates. Every dependency is bundled, so review changelogs for behavior changes,
rebuild `dist/`, regenerate `THIRD_PARTY_NOTICES.md` (`node scripts/notices.mjs`) and rerun the tests.

## Branding

Markilo's own identity is in `branding/`. After changing it, run
`node dist/markilo.mjs export -w branding --brand markilo --clean` and `node scripts/readme-assets.mjs`.
