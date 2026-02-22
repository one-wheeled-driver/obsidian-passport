# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Goal

**Vault Passport** — the first complete solution for professionally exporting Obsidian documents for use outside the vault. Obsidian `[[wiki-links]]` are meaningless to anyone who does not have your vault. Vault Passport resolves them into bibliography-style references (Pandoc `[@cite-key]` citations) so the exported PDF is self-contained, properly cited, and readable by anyone.

## Repository Layout

The vault root is the repo root. The Python script lives permanently in the Obsidian plugin directory — no install script, no copying.

```
.obsidian/plugins/vault-passport/  # THE plugin (source of truth)
├── main.js                        # Obsidian plugin JS
├── manifest.json                  # Plugin metadata
├── vault_passport.py              # Main Python script
├── numbered-title.csl             # Citation style — permanent home, never copied
├── templates/                     # User LaTeX templates for Pandoc
│   └── .gitkeep
└── build/                         # Intermediate files (gitignored)
    └── .gitkeep
tests/                             # Test suite
├── test_vault_passport.py
└── vault/                         # Test fixtures
showcase_documents/                # Example documents
CLAUDE.md
README.md
requirements.txt
.gitignore
```

## What the Tool Does

Processes the currently active document and:

1. Resolves all Obsidian link types into Pandoc-compatible output
2. For linked notes with `cite-key` YAML front matter: converts the link to a `[@cite-key]` citation
3. For linked notes without a cite-key: replaces the wiki-link with readable plain text
4. Generates a BibTeX file in `.obsidian/plugins/vault-passport/build/references.bib`
5. Writes the converted markdown to `.obsidian/plugins/vault-passport/build/<stem>.md`
6. Runs pandoc to produce `<stem>.pdf` next to the original document (falls back gracefully if citeproc is unavailable)

The tool works as an Obsidian plugin — it receives the vault path and active file from the Obsidian API, with no hardcoded paths.

## Obsidian Link Types to Handle

All of these must be resolved so the output works in PDF without a vault:

| Syntax | Description | Expected behavior |
|---|---|---|
| `[[Note]]` | Basic wiki-link | Citation if note has cite-key, otherwise plain text note title |
| `[[Note\|Display Text]]` | Wiki-link with alias | Citation if cite-key exists; use display text as fallback |
| `[[Note#Heading]]` | Link to heading | Citation with context, or "Note, section Heading" as plain text |
| `[[Note#Heading\|Text]]` | Heading link with alias | Citation or display text fallback |
| `[[Note#^block-id]]` | Link to specific block | Citation or plain text reference |
| `[[Note#^block-id\|Text]]` | Block link with alias | Citation or display text fallback |
| `![[Note]]` | Transclusion (embed note) | Citation if note has cite-key, otherwise plain text note title |
| `![[Note#Heading]]` | Transclude section | Citation if note has cite-key, otherwise plain text reference |
| `![[Note#^block-id]]` | Transclude block | Citation if note has cite-key, otherwise plain text reference |
| `![[Image.png]]` | Embed image | Keep as standard markdown image `![](Image.png)` |
| `![[file.pdf]]` | Embed PDF/other file | Descriptive placeholder text |

## Running

```bash
python3 .obsidian/plugins/vault-passport/vault_passport.py <input_file> <vault_path> [--strict] [--toc] [--template NAME] [--vault-template-dir DIR] [--var KEY=VALUE] [--callouts]
```

Positional arguments:
- `input_file` — path to the main document (markdown)
- `vault_path` — path to the Obsidian vault root

Options:
- `--strict` — abort on first missing note or note without `cite-key` (exit code 1)
- `--toc` — include a table of contents in the PDF
- `--template NAME` — template name resolved from vault folder → plugin folder → pandoc system install
- `--vault-template-dir DIR` — folder relative to vault root to search for templates (default: `templates`)
- `--var KEY=VALUE` — extra pandoc template variable (repeatable; frontmatter overrides)
- `--callouts` — convert Obsidian callouts to awesomebox LaTeX environments

Requires `pyyaml`. Output:

```
Input:  /path/to/my-doc.md
Output: /path/to/my-doc.pdf                                              # PDF next to original
        .obsidian/plugins/vault-passport/build/my-doc.md                 # intermediate markdown
        .obsidian/plugins/vault-passport/build/references.bib            # BibTeX references
```

Pandoc PDF generation tries `--citeproc` first. If citeproc is unavailable, it falls back to a PDF without resolved citations. If pandoc itself is not installed, PDF generation is skipped with a warning. The CSL file is referenced by absolute path and never copied.

### `--strict` mode

By default, missing notes and notes without a `cite-key` produce **warnings** on stderr and the link is replaced with readable plain text. With `--strict`, the script aborts on the first such issue with a non-zero exit code.

### Sidecar notes for embedded files

When the document embeds a non-markdown file (e.g. `![[paper.pdf]]`), the tool checks for a **sidecar note** with the same base name (`paper.md`). If that sidecar has a `cite-key` in its YAML front matter, the embed is converted to a citation. Otherwise it becomes `[Embedded file: paper.pdf]`.

### Custom LaTeX templates

Place `.latex` template files in `.obsidian/plugins/vault-passport/templates/`. Pass the filename via `--template mytemplate.latex`. The plugin settings tab also exposes this option. Templates placed in the vault-level `templates/` folder are shared across everyone working on the vault.

## Note Format Conventions

Notes that serve as citable references must have YAML front matter with at least a `cite-key` field:

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

Notes **without** a `cite-key` are not errors — their links are simply converted to readable plain text instead of citations.

## Running Tests

```bash
pip install pytest pyyaml
python3 -m pytest tests/ -v
```
