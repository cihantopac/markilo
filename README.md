<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/cihantopac/markilo/markilo--v1.1.2/assets/logo-dark.svg">
    <img src="https://raw.githubusercontent.com/cihantopac/markilo/markilo--v1.1.2/assets/logo-light.svg" alt="Markilo" width="340">
  </picture>
</p>

<h3 align="center">A brand identity studio inside Claude Code.</h3>

<p align="center">
  Three original identities for your product, drawn as real SVG and checked for originality.<br>
  You compare them, choose or ask for changes — and get every file the product needs.
</p>

<p align="center">
  <a href="https://github.com/cihantopac/markilo/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/cihantopac/markilo/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/markilo"><img alt="npm" src="https://img.shields.io/npm/v/markilo?color=7e1d2a&label=npm"></a>
  <a href="https://github.com/cihantopac/markilo/blob/main/LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-16120f"></a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/cihantopac/markilo/markilo--v1.1.2/assets/screens/gallery.png" alt="The Markilo Gallery showing three proposals, A Hallmark, B Inktrap and C Seal, side by side" width="100%">
</p>
<p align="center"><sub>The Gallery with Markilo's own round of three proposals (from <a href="https://github.com/cihantopac/markilo/tree/main/branding">branding/</a>; the chosen one, A, already shows its finished icon).</sub></p>

## Three proposals → Compare → Select or request changes → Finalize → Export

Markilo reads your product, writes a short brief and draws **three genuinely different identities**. In the Gallery you
see each one on light and dark, as an app icon and at 16 px, with its idea, its strengths and its honest weaknesses.
Nothing is finalized without your choice.

<table>
  <tr>
    <td width="34%" valign="top"><img src="https://raw.githubusercontent.com/cihantopac/markilo/markilo--v1.1.2/assets/screens/gallery-request.png" alt="A proposal with Request changes chosen: chips for simpler and better at small sizes, a note, and a pin on the mark"></td>
    <td valign="top"><img src="https://raw.githubusercontent.com/cihantopac/markilo/markilo--v1.1.2/assets/screens/gallery-compare.png" alt="Two proposals compared side by side, each with a Prefer this button"></td>
  </tr>
  <tr>
    <td><sub><b>Request changes</b> in your words: pick what to change, add a note, or pin a spot on the mark.</sub></td>
    <td><sub><b>Compare</b> any two side by side and say which you prefer and why. Your decisions go straight back to Claude.</sub></td>
  </tr>
</table>

## Made with Markilo

Real products, each from one round of three proposals with its owner choosing. These are the files Markilo exported,
unedited.

<table>
  <tr>
    <td width="33%"><a href="https://github.com/cihantopac/relivaro"><img src="https://raw.githubusercontent.com/cihantopac/markilo/markilo--v1.1.2/assets/made-with/relivaro-og.png" alt="Relivaro identity: a cairn of stones and the word Relivaro"></a></td>
    <td width="33%"><a href="https://github.com/cihantopac/searvex"><img src="https://raw.githubusercontent.com/cihantopac/markilo/markilo--v1.1.2/assets/made-with/searvex-og.png" alt="Searvex identity: a broad-nib V and the word searvex"></a></td>
    <td width="33%"><a href="https://github.com/cihantopac/jourilo"><img src="https://raw.githubusercontent.com/cihantopac/markilo/markilo--v1.1.2/assets/made-with/jourilo-og.png" alt="Jourilo identity: a book serif with a hanging J"></a></td>
  </tr>
  <tr>
    <td><sub><b>Relivaro</b> — release engineering. ≈ $15, seven runs while the 1.1 process was being corrected.</sub></td>
    <td><sub><b>Searvex</b> — search intelligence. $11.27: one round, one development, one direct change.</sub></td>
    <td><sub><b>Jourilo</b> — product experience. $5.29: one round, finished as chosen.</sub></td>
  </tr>
</table>

Markilo's own identity came out of the same process: $13.68 for one round and three icon options.

## The kit you get

<p align="center">
  <img src="https://raw.githubusercontent.com/cihantopac/markilo/markilo--v1.1.2/assets/kit-overview.png" alt="Every Markilo logo file: primary, secondary, compact, symbol and wordmark in color, reversed, black and white" width="100%">
</p>

Logos in color, reversed, black and white (SVG + PNG) · favicons, PWA and maskable icons · iOS, macOS, Android and
Windows app icons · Open Graph and social images · design tokens · brand guidelines · a manifest with sizes and
checksums. Each kit opens with a preview page that shows every file on the background it is made for:

<p align="center">
  <img src="https://raw.githubusercontent.com/cihantopac/markilo/markilo--v1.1.2/assets/screens/kit-preview.png" alt="The asset kit preview page for Markilo: the primary logo on paper and on dark, the palette and a Start here table" width="100%">
</p>

The Gallery, the kit preview and the guidelines work offline from a single file, in **English or Turkish**, in
**light, dark or system** theme — on a phone too.

<p align="center">
  <img src="https://raw.githubusercontent.com/cihantopac/markilo/markilo--v1.1.2/assets/screens/gallery-mobile-tr-dark.png" alt="The Gallery on a phone, in Turkish and dark theme" width="300">
</p>

## Install

In Claude Code:

```text
/plugin marketplace add cihantopac/markilo
/plugin install markilo@markilo
```

Then: `/markilo <your repo, URL or product name>`.

Without Claude Code — for other coding agents and scripts — the same toolchain is on npm (Node.js ≥ 20.10, macOS,
Linux and Windows):

```bash
npm install -g markilo
```

## What it costs, and what it has shown

- **The toolchain is free.** It runs locally — rendering, measuring, originality checks, export — with no account,
  server or paid service.
- **The design work is done by the AI model and uses your Claude Code usage.** In validation, one round of three
  proposals cost $5–10 and a finished identity $5–15 (API-equivalent, measured by Claude Code; on a subscription it
  counts against your plan instead). `markilo cost` tracks it against a budget you set (default $12) and stops paid
  work when it is reached.
- **Steered, it works; unattended, it does not yet.** With their owner choosing, all three real products above reached
  an identity the owner approved — three products and one owner's judgment, not a benchmark. Unattended, 1.0 produced
  no identity a blind judge panel would present. The full record, with every run and image:
  [benchmarks](https://github.com/cihantopac/markilo/blob/main/docs/BENCHMARKS.md) ·
  [1.1 validation log](https://github.com/cihantopac/markilo/blob/main/docs/RELEASE-1.1.md).
- **Not legal advice.** The originality checks compare against the marks Markilo collected; they cannot prove a mark is
  unique or registrable. No trademark registry search is done for you.

## Learn more

[Usage and commands](https://github.com/cihantopac/markilo/blob/main/docs/USAGE.md) ·
[Asset outputs](https://github.com/cihantopac/markilo/blob/main/docs/OUTPUTS.md) ·
[Originality](https://github.com/cihantopac/markilo/blob/main/docs/ORIGINALITY.md) ·
[Architecture](https://github.com/cihantopac/markilo/blob/main/docs/ARCHITECTURE.md) ·
[Other coding agents](https://github.com/cihantopac/markilo/blob/main/docs/INTEGRATIONS.md) ·
[Privacy](https://github.com/cihantopac/markilo/blob/main/docs/PRIVACY.md) ·
[Security](https://github.com/cihantopac/markilo/blob/main/SECURITY.md) ·
[Changelog](https://github.com/cihantopac/markilo/blob/main/CHANGELOG.md) ·
[Contributing](https://github.com/cihantopac/markilo/blob/main/CONTRIBUTING.md)

## License

[Apache-2.0](https://github.com/cihantopac/markilo/blob/main/LICENSE). Bundled fonts are SIL OFL 1.1; see
[THIRD_PARTY_NOTICES.md](https://github.com/cihantopac/markilo/blob/main/THIRD_PARTY_NOTICES.md).
