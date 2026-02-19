# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Goal

Export Obsidian documents to PDF for sharing with external partners. The core problem is that Obsidian `[[wiki-links]]` break when exported — they are meaningless outside the vault. The solution is to replace them with bibliography-style references (Pandoc `[@cite-key]` citations) so the exported PDF is self-contained and readable.

## What the Tool Does

Processes the currently active document and:

1. Resolves all Obsidian link types into Pandoc-compatible output
2. For linked notes with `cite-key` YAML front matter: converts the link to a `[@cite-key]` citation
3. For linked notes without a cite-key: replaces the wiki-link with readable plain text
4. Generates a BibTeX file (`<stem>/references.bib`) from collected metadata
5. Writes the converted markdown to `<stem>/<stem>_pandoc.md`
6. Runs pandoc to produce `<stem>/<stem>_pandoc.pdf` (falls back gracefully if citeproc is unavailable)

The tool should work as an Obsidian plugin — it receives the vault path and active file from the Obsidian API, with no hardcoded paths.

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
python3 process_obsidian.py <input_file> <vault_path> [--strict]
```

Positional arguments:
- `input_file` — path to the main document (markdown)
- `vault_path` — path to the Obsidian vault root

Options:
- `--strict` — abort on first missing note or note without `cite-key` (exit code 1)

Requires `pyyaml`. Output is written to a subfolder next to the input file, named after the document stem:

```
Input:  /path/to/my-doc.md
Output: /path/to/my-doc/my-doc_pandoc.md    # converted markdown
        /path/to/my-doc/references.bib      # BibTeX references
        /path/to/my-doc/my-doc_pandoc.pdf   # PDF (if pandoc available)
```

Pandoc PDF generation tries `--citeproc` first. If citeproc is unavailable, it falls back to a PDF without resolved citations. If pandoc itself is not installed, PDF generation is skipped with a warning.

### `--strict` mode

By default, missing notes and notes without a `cite-key` produce **warnings** on stderr and the link is replaced with readable plain text. With `--strict`, the script aborts on the first such issue with a non-zero exit code.

### Sidecar notes for embedded files

When the document embeds a non-markdown file (e.g. `![[paper.pdf]]`), the tool checks for a **sidecar note** with the same base name (`paper.md`). If that sidecar has a `cite-key` in its YAML front matter, the embed is converted to a citation. Otherwise it becomes `[Embedded file: paper.pdf]`.

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
