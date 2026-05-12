# Vault Passport

> Give your Obsidian notes a passport to the outside world.

Obsidian is a powerful knowledge base — but the moment you share a document with someone outside your vault, it falls apart. `[[wiki-links]]` are meaningless to any reader who does not have your vault. Embedded PDFs become broken references. Citations look like `[[Smith 2023]]` instead of proper bibliography entries.

**Vault Passport** solves this. It exports any Obsidian document to a polished, self-contained PDF by resolving every `[[wiki-link]]` into a real citation, building a proper BibTeX bibliography, and running Pandoc to produce output you can hand to a colleague, submit to a journal, or attach to a report — no vault required.

## How it works

Every `[[linked note]]` that exists in your vault becomes a `[@cite-key]` Pandoc citation. Vault Passport collects all citations, builds a `.bib` file on the fly, and passes everything to Pandoc with `--citeproc` so the final PDF has a proper reference list.

**No note metadata required.** If a linked note has a `cite-key` in its YAML front matter that value is used as-is. If not, a cite key is automatically derived from the note's name (`My Study` → `[@my-study]`) and the filename is used as the title. You can start with zero front matter and add proper bibliographic metadata later.

Notes that do not exist in the vault at all are replaced with readable plain text — no broken link is ever left in the output.

## Requirements

**Docker.** Vault Passport runs Pandoc inside the [`pandoc/extra`](https://hub.docker.com/r/pandoc/extra) container, which ships with XeLaTeX, citeproc, and the [Eisvogel](https://github.com/Wandmalfarbe/pandoc-latex-template) template. You do not need to install Pandoc or a TeX distribution separately — only Docker.

### Docker on Windows

Docker Desktop is available for Windows and a works with this plugin. The plugin and its Docker integration have been developed on Linux. **Windows and MacOS users — we'd love your feedback.** If you encounter any path or permission issues please [open an issue](https://github.com/one-wheeled-driver/obsidian-passport/issues).

## Roadmap
Today every linked note becomes a citation, including `![[transclusions]]`. The plan is to eventually inline-expand transclusions properly so `![[Note]]` pulls the linked note's content into the document (with `![[Note#Heading]]` and `![[Note#^block-id]]` doing the obvious thing for sections and blocks), while plain `[[wiki-links]]` remain citations. Feedback on this direction is welcome on the GitHub issue tracker.

## Installation

### Via the community plugins browser (once approved)

1. In Obsidian: **Settings → Community plugins → Browse**
2. Search for **Vault Passport**, install, then enable
3. Make sure Docker is running

### Via [BRAT](https://github.com/TfTHacker/obsidian42-brat) (before approval)

1. Install BRAT from the community plugins browser
2. BRAT settings → **Add Beta Plugin** → `https://github.com/one-wheeled-driver/obsidian-passport`
3. Enable Vault Passport under **Settings → Community plugins**

### Manual installation

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/one-wheeled-driver/obsidian-passport/releases/latest)
2. Place them in your vault's `.obsidian/plugins/vault-passport/`
3. Enable the plugin in Obsidian

## Quick start

1. Open any Markdown note in Obsidian.
2. Open the command palette (`Ctrl/Cmd + P`) and run **"Export document (Vault Passport)"**.
3. The PDF appears next to the original file.

## Plugin settings

| Setting | Default | Description |
|---|---|---|
| Strict mode | off | Abort export if any linked note is missing |
| Open PDF after export | on | Open the generated PDF automatically |
| Table of contents | off | Include a TOC in the PDF |
| Convert callouts to boxes | off | Convert Obsidian callouts to styled LaTeX boxes |
| Template name | *(empty)* | Pandoc template, e.g. `eisvogel` |
| Vault template folder | `templates` | Folder relative to vault root for shared templates |
| Extra pandoc variables | *(empty)* | One `key=value` per line, passed as `-V` flags |

## How notes become citations

Any `[[linked note]]` that resolves to a file in your vault becomes a citation in the output:

| Note has… | Result |
|---|---|
| `cite-key: smith2024` in front matter | `[@smith2024]` |
| No front matter at all | `[@my-linked-note]` (auto-derived) |
| A `title` field | Used in the bibliography |
| No `title` field | Filename stem used as the title |
| Note does not exist in vault | Replaced with readable plain text |

A note intended as a citable reference might look like this:

```yaml
---
cite-key: methods2023
author: "Johnson, Alice"
title: "Research Methods in Practice"
year: 2023
type: book
publisher: "Academic Press"
---
```

The `type` field maps to BibTeX entry types (`book`, `article`, `misc`, etc.). All fields except `cite-key` are optional. Supported BibTeX fields: `author`, `title`, `year`, `journal`, `publisher`, `url`, `note`.

## Obsidian link types

All wiki-link variants are handled so the output is readable without the vault:

| Syntax | Behavior |
|---|---|
| `[[Note]]` | Citation |
| `[[Note\|Display Text]]` | Citation (display text ignored in output) |
| `[[Note#Heading]]` | Citation |
| `[[Note#Heading\|Text]]` | Citation |
| `[[Note#^block-id]]` | Citation |
| `[[Note#^block-id\|Text]]` | Citation |
| `![[Note]]` | Citation |
| `![[Note#Heading]]` | Citation |
| `![[Note#^block-id]]` | Citation |
| `![[Image.png]]` | Standard Markdown image `![](Image.png)` |
| `![[file.pdf]]` | Citation via sidecar note, or `[Embedded file: file.pdf]` |

### Sidecar notes for embedded files

When a document embeds a non-Markdown file (e.g. `![[paper.pdf]]`), Vault Passport checks for a sidecar note with the same base name (`paper.md`). If found, the embed becomes a citation using that note's metadata. Otherwise it becomes `[Embedded file: paper.pdf]`.

## Templates

The **Template name** setting resolves in this order:

1. `<vault>/<vault-template-dir>/<name>` — shared vault template; commit here so everyone working on the vault uses the same one.
2. `.obsidian/plugins/vault-passport/templates/<name>` — per-user plugin template.
3. The bare name passed to Pandoc for resolution from its data directory (or the container's built-in templates).

### Eisvogel

[Eisvogel](https://github.com/Wandmalfarbe/pandoc-latex-template) is included in the `pandoc/extra` Docker image — **no separate installation needed.** Simply set the template name to `eisvogel` in the plugin settings.

### Template variables

Pandoc passes `--var` values to the template. These act as **defaults** — any matching key in the document's YAML front matter overrides them. Set global defaults in the **Extra pandoc variables** settings box (one `key=value` per line):

```
titlepage=true
titlepage-color=2c3e50
titlepage-text-color=FFFFFF
colorlinks=true
numbersections=true
```

Or put them directly in the document's front matter for per-document control:

```yaml
---
title: "Quarterly Review"
author: "Alice Johnson"
date: "2026-01-15"
titlepage: true
titlepage-color: "1a1a2e"
colorlinks: true
geometry: margin=2.5cm
---
```

**Eisvogel-specific variables:**

| Variable | Description |
|---|---|
| `titlepage=true` | Enable the cover page |
| `titlepage-color` | Cover background colour (hex, no `#`) |
| `titlepage-text-color` | Cover text colour |
| `titlepage-logo` | Path to logo image (relative to vault root) |
| `logo-width` | Logo width, e.g. `60mm` |
| `header-left` / `header-right` | Running header content |
| `footer-center` | Footer content, e.g. `\thepage` |
| `listings=true` | Syntax-highlighted code blocks |
| `numbersections=true` | Numbered section headings |

## Callout conversion

With **Convert callouts to boxes** enabled, Obsidian callouts are converted to styled LaTeX boxes in the PDF using the [awesomebox](https://ctan.org/pkg/awesomebox) package (included in `pandoc/extra`).

```markdown
> [!NOTE] Optional title
> Body text here.

> [!WARNING]
> No title — the type name is used automatically.
```

The `+`/`-` fold modifiers are silently stripped. Regular blockquotes without `[!TYPE]` are left untouched.

### Callout type mapping

| Obsidian type(s) | LaTeX environment | Colour |
|---|---|---|
| `note`, `info`, `todo`, `abstract`, `summary`, `tldr`, `question`, `help`, `faq`, `example`, `quote`, `cite`, `important` | `noteblock` | blue |
| `tip`, `hint`, `success`, `check`, `done` | `tipblock` | green |
| `warning`, `caution`, `attention` | `warningblock` | orange |
| `danger`, `error`, `bug`, `failure`, `fail`, `missing` | `cautionblock` | red |
| *(anything else)* | `noteblock` | blue |

## Strict mode

By default, links to notes that are missing from the vault are replaced with plain text and a warning is printed in the developer console. With **Strict mode** enabled, the export aborts on the first missing note. Useful when you want a broken link to be a hard error instead of silent plaintext fallback.

## Output

```
Input:  /vault/my-paper.md
Output: /vault/my-paper.pdf                                          ← PDF next to original
        .obsidian/plugins/vault-passport/build/my-paper.md          ← intermediate markdown
        .obsidian/plugins/vault-passport/build/references.bib       ← generated bibliography
```

## Development

```bash
npm install
npm test               # 270+ unit/integration tests with Vitest
npm run test:coverage  # coverage report
npm run build          # type-check + esbuild → main.js
npm run lint           # eslint
```

Pure logic (`src/lib/`) is 100% Obsidian-free and tested in plain Node. Services and pipeline modules use a small hand-rolled mock of the Obsidian API in `tests/helpers/obsidian-mocks.ts`.

A real-Docker smoke test that produces an actual PDF is available via `npm run test:manual` (gated separately because it spawns Docker and takes ~15s).

## Contributing

Bug reports and pull requests are welcome at [github.com/one-wheeled-driver/obsidian-passport](https://github.com/one-wheeled-driver/obsidian-passport).

## License

MIT — see [LICENSE](LICENSE).
