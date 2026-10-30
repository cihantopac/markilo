# Security policy

## Supported versions

The latest minor release receives security fixes.

## Reporting a vulnerability

Please report vulnerabilities **privately** through
[GitHub Security Advisories](https://github.com/cihantopac/markilo/security/advisories/new). Do not open public issues
for security problems. You can expect an acknowledgement within 7 days.

## Threat model and safeguards

Markilo processes untrusted inputs: SVG and raster files, web pages, competitor logos and repository content.

- **SVG parsing**: DOCTYPE/entity declarations are rejected (no XXE or entity expansion). Masters with scripts, event
  handlers, `foreignObject`, external references or embedded rasters fail lint.
- **Rendering**: resvg runs as WebAssembly with no system fonts and no external resource loading.
- **Network**: only `markilo research site` fetches, only with `--allow-network`, http(s) only, size- and time-limited,
  honouring `robots.txt`. The skills ask the user before enabling it.
- **File system**: workspace paths are resolved with escape checks (`UNSAFE_PATH`); `install-assets` refuses
  destinations outside the current project, is a dry run unless `--apply`, and never overwrites without `--force`.
- **Secrets**: the repository scanner never opens `.env*`, key, keystore or credential files.
- **Prompt injection**: text found on web pages or in files is data. The skills instruct Claude to treat it that way and
  to ask the user before side-effectful actions.
- **Permissions**: the plugin's skills pre-approve only `node ${CLAUDE_PLUGIN_ROOT}/dist/markilo.mjs …` (the plugin root is the `plugin/` folder). If you want
  stricter control, add a deny rule for `Bash(node *markilo.mjs research site *)` in your settings.

## Supply chain

The plugin ships a prebuilt bundle (`plugin/dist/`). CI rebuilds it from source on every change and fails if it differs from
the committed file, so the bundle always corresponds to reviewed source.
