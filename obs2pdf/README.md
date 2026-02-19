# obs2pdf

Convert Obsidian wiki-links to Pandoc citations and export to PDF.

Obsidian `[[wiki-links]]` are meaningless outside the vault. **obs2pdf** replaces them with bibliography-style references (`[@cite-key]` citations) so the exported PDF is self-contained and readable.

## Dependencies

- Python 3.6+
- [pyyaml](https://pypi.org/project/PyYAML/)
- [Pandoc 3.x](https://pandoc.org/) (optional, for PDF generation)

## Installation

```bash
git clone <repo-url>
cd obs2pdf
pip install -r requirements.txt
```

## Usage

```bash
python3 obs2pdf.py <input_file> <vault_path> [--strict]
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

### Example

```bash
python3 obs2pdf.py ~/vault/my-paper.md ~/vault
```

## Output

Output is written to a subfolder next to the input file, named after the document stem:

```
Input:  /path/to/my-doc.md
Output: /path/to/my-doc/my-doc_pandoc.md    # converted markdown
        /path/to/my-doc/references.bib      # BibTeX references
        /path/to/my-doc/my-doc_pandoc.pdf   # PDF (if pandoc available)
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

## Strict mode

By default, missing notes and notes without a `cite-key` produce warnings on stderr and the link is replaced with plain text. With `--strict`, the script aborts on the first such issue with exit code 1.

## Running tests

```bash
pip install pytest
python3 -m pytest tests/ -v
```
