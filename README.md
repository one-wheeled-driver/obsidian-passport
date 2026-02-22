# obs2pdf

Convert Obsidian wiki-links to Pandoc citations and export to PDF.

Obsidian `[[wiki-links]]` are meaningless outside the vault. **obs2pdf** replaces them with bibliography-style references (`[@cite-key]` citations) so the exported PDF is self-contained and readable.

## Dependencies

- Python 3.6+
- [pyyaml](https://pypi.org/project/PyYAML/)
- [Pandoc 3.x](https://pandoc.org/) (optional, for PDF generation)

## Installation

The plugin lives in `.obsidian/plugins/obs2pdf/` inside the vault. No separate install step is needed — the repo root **is** the vault root.

```bash
git clone <repo-url>
cd obs2pdf
pip install -r requirements.txt
```

## Usage

```bash
python3 .obsidian/plugins/obs2pdf/obs2pdf.py <input_file> <vault_path> [options]
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
| `--vault-template-dir DIR` | Folder relative to vault root to search for templates (default: `templates`) |
| `--var KEY=VALUE` | Extra pandoc template variable; can be given multiple times |

### Basic examples

```bash
# Basic export
python3 .obsidian/plugins/obs2pdf/obs2pdf.py ~/vault/my-paper.md ~/vault

# With table of contents
python3 .obsidian/plugins/obs2pdf/obs2pdf.py ~/vault/my-paper.md ~/vault --toc
```

## Output

The PDF is placed next to the original input file. Intermediate build files go to `.obsidian/plugins/obs2pdf/build/`:

```
Input:  /path/to/my-doc.md
Output: /path/to/my-doc.pdf                                      # PDF next to original
        .obsidian/plugins/obs2pdf/build/my-doc.md                 # intermediate markdown
        .obsidian/plugins/obs2pdf/build/references.bib            # BibTeX references
```

## Obsidian Link Types

All wiki-link types are resolved so the output works without a vault:

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

## Note Format

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

Notes without a `cite-key` are not errors — their links become readable plain text.

### Sidecar notes

When the document embeds a non-markdown file (e.g. `![[paper.pdf]]`), the tool checks for a sidecar note with the same base name (`paper.md`). If that sidecar has a `cite-key`, the embed becomes a citation. Otherwise it becomes `[Embedded file: paper.pdf]`.

## Templates

The `--template` option accepts a name that is resolved in this order:

1. **Vault template folder** — `<vault>/<vault-template-dir>/<name>` (default folder: `templates/`). Put templates here to share them across everyone working on the vault via git or Obsidian Sync.
2. **Plugin templates directory** — `.obsidian/plugins/obs2pdf/templates/<name>`. For per-user templates that are not committed to the vault.
3. **System-wide pandoc install** — if the name is not found locally, it is passed as-is to pandoc, which looks in its own data directory (e.g. `~/.local/share/pandoc/templates/` on Linux, `~/Library/Pandoc/` on macOS). This is how named templates like `eisvogel` work after a system install.

### Using eisvogel

[Eisvogel](https://github.com/Wandmalfarbe/pandoc-latex-template) is a popular pandoc LaTeX template that produces polished PDFs with cover pages, headers, and footers.

**Option A — system-wide install (recommended for solo use)**

Follow the [eisvogel install instructions](https://github.com/Wandmalfarbe/pandoc-latex-template#installation) to place `eisvogel.latex` in your pandoc data directory, then pass the bare name:

```bash
python3 .obsidian/plugins/obs2pdf/obs2pdf.py my-paper.md . --template eisvogel
```

**Option B — vault-level install (recommended for shared vaults)**

Place `eisvogel.latex` in the vault's `templates/` folder. Everyone cloning the vault gets the same template automatically:

```
vault/
├── templates/
│   └── eisvogel.latex   ← committed to the repo
├── my-paper.md
└── ...
```

```bash
python3 .obsidian/plugins/obs2pdf/obs2pdf.py my-paper.md . --template eisvogel.latex
```

### Template variables with `--var`

Pandoc passes `--var` values to the template as variables. These act as **defaults** — any matching key in the document's YAML front matter overrides them.

**General pandoc variables** (work with any LaTeX template):

```bash
# Set paper size and margins
python3 obs2pdf.py my-paper.md . --template eisvogel \
  --var papersize=a4 \
  --var geometry=margin=2.5cm

# Use a specific font (requires the font to be installed)
python3 obs2pdf.py my-paper.md . --template eisvogel \
  --var mainfont="Source Serif 4" \
  --var monofont="JetBrains Mono"

# Coloured hyperlinks
python3 obs2pdf.py my-paper.md . --template eisvogel \
  --var colorlinks=true \
  --var linkcolor=blue \
  --var urlcolor=cyan
```

**Eisvogel-specific variables:**

```bash
# Cover page with a coloured title block
python3 obs2pdf.py my-paper.md . --template eisvogel \
  --var titlepage=true \
  --var titlepage-color=2c3e50 \
  --var titlepage-text-color=FFFFFF \
  --var titlepage-rule-color=FFFFFF \
  --var titlepage-rule-height=4

# Cover page with a logo
python3 obs2pdf.py my-paper.md . --template eisvogel \
  --var titlepage=true \
  --var logo=assets/logo.png \
  --var logo-width=100

# Custom header and footer text
python3 obs2pdf.py my-paper.md . --template eisvogel \
  --var header-left="Project Report" \
  --var header-right="Confidential" \
  --var footer-center="\thepage"

# Syntax-highlighted code blocks using the listings package
python3 obs2pdf.py my-paper.md . --template eisvogel \
  --var listings=true \
  --var "code-block-font-size=\small"
```

### Setting defaults via YAML front matter

Instead of passing `--var` flags every time, you can put the same keys directly in the document's YAML front matter. This is convenient for per-document settings that rarely change:

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

Front matter always takes precedence over `--var` flags, so you can set organisation-wide defaults with `--var` in the Obsidian plugin settings and override them per document in front matter.

### Obsidian plugin settings

The same options are available in the plugin settings tab without touching the command line:

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

Obsidian callouts (`> [!TYPE]`) can be automatically converted to **awesomebox** LaTeX environments using the `--callouts` flag. This is the box package used in eisvogel's official examples.

```bash
python3 .obsidian/plugins/obs2pdf/obs2pdf.py my-paper.md . --template eisvogel --callouts
```

`\usepackage{awesomebox}` is injected into the document preamble automatically — no manual front matter entry is needed.

### Syntax supported

All standard Obsidian callout variants are handled:

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

All standard Obsidian callout types are mapped to one of the five awesomebox environments. **Custom or unknown types always fall back to `noteblock`** — a LaTeX error is never produced.

| Obsidian type(s) | awesomebox environment | Colour |
|---|---|---|
| `note`, `info`, `todo`, `abstract`, `summary`, `tldr`, `question`, `help`, `faq`, `example`, `quote`, `cite` | `noteblock` | blue |
| `tip`, `hint`, `success`, `check`, `done` | `tipblock` | green |
| `warning`, `caution`, `attention` | `warningblock` | orange |
| `danger`, `error`, `bug`, `failure`, `fail`, `missing` | `cautionblock` | red |
| `important` | `importblock` | red (radiation icon) |
| *(anything else)* | `noteblock` | blue |

### Enabling in Obsidian plugin settings

Toggle **"Convert callouts to boxes"** in the plugin settings tab. This is equivalent to always passing `--callouts` on the command line.

## Strict mode

By default, missing notes and notes without a `cite-key` produce warnings on stderr and the link is replaced with plain text. With `--strict`, the script aborts on the first such issue with exit code 1.

## Running tests

```bash
pip install pytest pyyaml
python3 -m pytest tests/ -v
```
