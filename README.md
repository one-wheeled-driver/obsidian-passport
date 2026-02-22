# Vault Passport

> Give your Obsidian notes a passport to the outside world.

Obsidian is a powerful knowledge base — but the moment you try to share a document with someone outside your vault, it falls apart. `[[wiki-links]]` are meaningless to any reader who does not have your vault. Embedded PDFs become broken references. Citations look like `[[Smith 2023]]` instead of proper bibliography entries.

**Vault Passport** solves this. It exports any Obsidian document to a polished, self-contained PDF by resolving every `[[wiki-link]]` into a real citation, building a proper BibTeX bibliography, and running Pandoc to produce output you can hand to a colleague, submit to a journal, or attach to a report — no vault required.

## How it works

Each linked note that has a `cite-key` in its YAML front matter becomes a `[@cite-key]` Pandoc citation. Vault Passport collects all those citations, builds a `.bib` file on the fly, and passes everything to Pandoc with `--citeproc` so the final PDF has a proper reference list. Notes without a `cite-key` are replaced with readable plain text so no link is ever left dangling.

## Dependencies

- Python 3.6+
- [pyyaml](https://pypi.org/project/PyYAML/)
- [Pandoc 3.x](https://pandoc.org/) (optional — required for PDF generation)
- A LaTeX distribution (optional — required for PDF generation via Pandoc)

## Installation

The plugin lives inside the vault at `.obsidian/plugins/vault-passport/`. The repo root **is** the vault root — no separate install step is needed.

```bash
git clone <repo-url>
cd vault-passport-vault
pip install -r requirements.txt
```

Inside Obsidian, enable the plugin under **Settings → Community plugins → Vault Passport**.

## Usage

Export is triggered from the Obsidian command palette: **"Export document (Vault Passport)"**. The active markdown file is exported to a PDF placed next to it in the vault.

You can also run the script directly from the command line:

```bash
python3 .obsidian/plugins/vault-passport/vault_passport.py <input_file> <vault_path> [options]
```

**Positional arguments:**

| Argument | Description |
|---|---|
| `input_file` | Path to the main Obsidian document (markdown) |
| `vault_path` | Path to the Obsidian vault root |

**Options:**

| Flag | Description |
|---|---|
| `--strict` | Abort on first missing note or note without `cite-key` (exit code 1) |
| `--toc` | Include a table of contents in the PDF |
| `--template NAME` | Template name or filename (see [Templates](#templates) below) |
| `--vault-template-dir DIR` | Folder relative to vault root for shared templates (default: `templates`) |
| `--var KEY=VALUE` | Extra pandoc template variable; can be given multiple times |
| `--callouts` | Convert Obsidian callouts to styled awesomebox environments |

### Quick examples

```bash
# Basic export
python3 .obsidian/plugins/vault-passport/vault_passport.py ~/vault/my-paper.md ~/vault

# With table of contents
python3 .obsidian/plugins/vault-passport/vault_passport.py ~/vault/my-paper.md ~/vault --toc

# With the eisvogel template and callout conversion
python3 .obsidian/plugins/vault-passport/vault_passport.py ~/vault/my-paper.md ~/vault \
  --template eisvogel --callouts
```

## Output

The PDF is placed next to the original file. Intermediate build files go to `.obsidian/plugins/vault-passport/build/`:

```
Input:  /path/to/my-doc.md
Output: /path/to/my-doc.pdf                                           # PDF next to original
        .obsidian/plugins/vault-passport/build/my-doc.md             # intermediate markdown
        .obsidian/plugins/vault-passport/build/references.bib        # BibTeX references
```

## Note format

Notes that serve as citable references need YAML front matter with a `cite-key`:

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

The `type` field maps to BibTeX entry types (`book`, `article`, `misc`, etc.). Supported BibTeX fields: `author`, `title`, `year`, `journal`, `publisher`, `url`, `note`.

Notes without a `cite-key` are not errors — their links become readable plain text instead of citations.

## Obsidian link types

All wiki-link variants are resolved so the output is readable without the vault:

| Syntax | Description | Behavior |
|---|---|---|
| `[[Note]]` | Basic wiki-link | Citation if note has cite-key, otherwise plain text |
| `[[Note\|Display Text]]` | Wiki-link with alias | Citation or display text fallback |
| `[[Note#Heading]]` | Link to heading | Citation or "Note, section Heading" |
| `[[Note#Heading\|Text]]` | Heading link with alias | Citation or display text fallback |
| `[[Note#^block-id]]` | Block link | Citation or "Note, block block-id" |
| `[[Note#^block-id\|Text]]` | Block link with alias | Citation or display text fallback |
| `![[Note]]` | Transclusion | Citation or plain text |
| `![[Note#Heading]]` | Transclude section | Citation or plain text reference |
| `![[Note#^block-id]]` | Transclude block | Citation or plain text reference |
| `![[Image.png]]` | Image embed | Standard markdown `![](Image.png)` |
| `![[file.pdf]]` | File embed | Citation (via sidecar note) or `[Embedded file: file.pdf]` |

### Sidecar notes for embedded files

When a document embeds a non-markdown file (e.g. `![[paper.pdf]]`), Vault Passport checks for a sidecar note with the same base name (`paper.md`). If that sidecar has a `cite-key`, the embed becomes a citation. Otherwise it becomes `[Embedded file: paper.pdf]`.

## Templates

The `--template` option accepts a name resolved in this order:

1. **Vault template folder** — `<vault>/<vault-template-dir>/<name>` (default folder: `templates/`). Commit templates here so everyone working on the vault uses the same one automatically.
2. **Plugin templates directory** — `.obsidian/plugins/vault-passport/templates/<name>`. For per-user templates not committed to the vault.
3. **System-wide pandoc install** — the name is passed as-is to pandoc, which looks in its own data directory (`~/.local/share/pandoc/templates/` on Linux, `~/Library/Pandoc/` on macOS). This is how named templates like `eisvogel` work after a system install.

### Using eisvogel

[Eisvogel](https://github.com/Wandmalfarbe/pandoc-latex-template) is a polished pandoc LaTeX template that produces professional PDFs with cover pages, running headers, syntax-highlighted code, and more. It pairs naturally with Vault Passport.

**Option A — system-wide install (recommended for solo use)**

Follow the [eisvogel install instructions](https://github.com/Wandmalfarbe/pandoc-latex-template#installation) to place `eisvogel.latex` in your pandoc data directory, then use the bare name:

```bash
python3 .obsidian/plugins/vault-passport/vault_passport.py my-paper.md . --template eisvogel
```

**Option B — vault-level install (recommended for shared vaults)**

Place `eisvogel.latex` in the vault's `templates/` folder and commit it. Everyone cloning the vault gets the same template automatically:

```
vault/
├── templates/
│   └── eisvogel.latex   ← committed to the repo
├── my-paper.md
└── ...
```

```bash
python3 .obsidian/plugins/vault-passport/vault_passport.py my-paper.md . --template eisvogel.latex
```

### Template variables

Pandoc passes `--var` values to the template. These act as **defaults** — any matching key in the document's YAML front matter overrides them.

**General pandoc variables** (work with any LaTeX template):

```bash
python3 vault_passport.py my-paper.md . --template eisvogel \
  --var papersize=a4 \
  --var geometry=margin=2.5cm \
  --var mainfont="Source Serif 4" \
  --var colorlinks=true
```

**Eisvogel-specific variables:**

```bash
# Cover page with a coloured title block
python3 vault_passport.py my-paper.md . --template eisvogel \
  --var titlepage=true \
  --var titlepage-color=2c3e50 \
  --var titlepage-text-color=FFFFFF \
  --var titlepage-rule-color=FFFFFF \
  --var titlepage-rule-height=4

# Cover page with a logo
python3 vault_passport.py my-paper.md . --template eisvogel \
  --var titlepage=true \
  --var logo=assets/logo.png \
  --var logo-width=100

# Custom header and footer
python3 vault_passport.py my-paper.md . --template eisvogel \
  --var header-left="Project Report" \
  --var header-right="Confidential" \
  --var footer-center="\thepage"

# Syntax-highlighted code blocks
python3 vault_passport.py my-paper.md . --template eisvogel \
  --var listings=true \
  --var "code-block-font-size=\small"
```

### Setting defaults in YAML front matter

Put the same keys directly in the document's front matter to set per-document defaults without touching the command line:

```yaml
---
title: "Quarterly Review"
author: "Alice Johnson"
date: "2026-02-22"
titlepage: true
titlepage-color: "1a1a2e"
titlepage-text-color: "FFFFFF"
colorlinks: true
linkcolor: blue
geometry: margin=2.5cm
---
```

Front matter always takes precedence over `--var` flags, so you can set organisation-wide defaults in the Obsidian plugin settings and override them per document in front matter.

### Obsidian plugin settings for templates

The plugin settings tab exposes all template options without the command line:

- **Template name** — equivalent to `--template`
- **Vault template folder** — equivalent to `--vault-template-dir` (default: `templates`)
- **Extra pandoc variables** — equivalent to repeated `--var`; one `key=value` per line

Example content for the "Extra pandoc variables" box:

```
titlepage=true
titlepage-color=2c3e50
titlepage-text-color=FFFFFF
colorlinks=true
geometry=margin=2.5cm
```

## Callout conversion

Obsidian callouts (`> [!TYPE]`) can be automatically converted to styled LaTeX boxes in the exported PDF using the `--callouts` flag. Vault Passport uses the **awesomebox** package — the same one used in eisvogel's official examples.

```bash
python3 .obsidian/plugins/vault-passport/vault_passport.py my-paper.md . \
  --template eisvogel --callouts
```

`\usepackage{awesomebox}` is injected into the document preamble automatically — no manual front matter entry is needed.

### Syntax supported

```markdown
> [!NOTE] Optional title
> Body text here.
> More body text.
```

```markdown
> [!WARNING]
> No explicit title — the type name ("Warning") is used automatically.
```

```markdown
> [!TIP]+ Expanded by default    ← the +/- fold modifier is stripped
> Tip content.
```

Regular blockquotes without `[!TYPE]` are left completely untouched.

### Type mapping

All standard Obsidian callout types map to one of the five awesomebox environments. **Custom or unknown types always fall back to `noteblock`** — a LaTeX error is never produced.

| Obsidian type(s) | awesomebox environment | Colour |
|---|---|---|
| `note`, `info`, `todo`, `abstract`, `summary`, `tldr`, `question`, `help`, `faq`, `example`, `quote`, `cite` | `noteblock` | blue |
| `tip`, `hint`, `success`, `check`, `done` | `tipblock` | green |
| `warning`, `caution`, `attention` | `warningblock` | orange |
| `danger`, `error`, `bug`, `failure`, `fail`, `missing` | `cautionblock` | red |
| `important` | `importblock` | red (radiation icon) |
| *(anything else)* | `noteblock` | blue |

Toggle **"Convert callouts to boxes"** in the plugin settings tab to enable this globally without the command-line flag.

## Strict mode

By default, missing notes and notes without a `cite-key` produce warnings on stderr and the link is replaced with plain text. With `--strict`, the script aborts on the first such issue with exit code 1. This is useful in CI pipelines where a broken link should be a hard error.

## Running tests

```bash
pip install pytest pyyaml
python3 -m pytest tests/ -v
```

## License

MIT
