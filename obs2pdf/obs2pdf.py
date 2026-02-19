#!/usr/bin/python3
import re
import sys
import yaml
import os
import argparse
import subprocess
import shutil
from pathlib import Path

IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.svg', '.bmp', '.webp'}
CSL_FILE = Path(__file__).resolve().parent / 'numbered-title.csl'


def parse_link(raw):
    """Parse the content inside [[ ]] into components.

    Returns a dict with:
      note_name   - filename part (before # or |)
      heading     - heading fragment if #Heading present (None otherwise)
      block_id    - block ID if #^block-id present (None otherwise)
      display_text - alias if |Text present (None otherwise)
    """
    display_text = None
    if '|' in raw:
        left, display_text = raw.split('|', 1)
        display_text = display_text.strip()
    else:
        left = raw

    heading = None
    block_id = None
    if '#' in left:
        note_name, fragment = left.split('#', 1)
        note_name = note_name.strip()
        fragment = fragment.strip()
        if fragment.startswith('^'):
            block_id = fragment[1:]
        else:
            heading = fragment
    else:
        note_name = left.strip()

    return {
        'note_name': note_name,
        'heading': heading,
        'block_id': block_id,
        'display_text': display_text,
    }


def is_image(filename):
    """Check if a filename has an image extension."""
    return Path(filename).suffix.lower() in IMAGE_EXTENSIONS


def extract_yaml_from_note(note_path):
    """Extract YAML front matter from a note."""
    with open(note_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Match YAML front matter
    match = re.match(r'^---\n(.*?)\n---\n', content, re.DOTALL)
    if match:
        return yaml.safe_load(match.group(1))
    return None


def build_vault_index(vault_path):
    """Walk the vault and build a dict mapping each .md file's stem to its full path(s).

    Skips the .obsidian/ directory (internal Obsidian config).
    Returns e.g. {"Research Methods": [Path(".../Research Methods.md")]}
    """
    index = {}
    vault = Path(vault_path)
    for md_file in vault.rglob("*.md"):
        # Skip .obsidian internal directory
        try:
            md_file.relative_to(vault / ".obsidian")
            continue
        except ValueError:
            pass
        stem = md_file.stem
        index.setdefault(stem, []).append(md_file)
    return index


def resolve_note_path(note_name, vault_path, vault_index):
    """Resolve a note name to a full path using Obsidian's resolution logic.

    Resolution order:
    1. Direct path — vault_path / "{note_name}.md" (absolute-from-root or root-level)
    2. Vault-wide search — look up note_name (or its stem if it contains /) in vault_index
    3. Return None if not found

    Warns if multiple matches exist in the index.
    """
    vault = Path(vault_path)

    # 1. Direct path from vault root
    direct = vault / f"{note_name}.md"
    if direct.exists():
        return direct

    # 2. Vault-wide search (shortest-path mode)
    # If note_name contains a path separator, use just the stem for lookup
    lookup_key = Path(note_name).stem if '/' in note_name or '\\' in note_name else note_name
    matches = vault_index.get(lookup_key, [])
    if matches:
        if len(matches) > 1:
            print(f"Warning: multiple notes named '{lookup_key}' found — using {matches[0]}",
                  file=sys.stderr)
        return matches[0]

    return None


def find_linked_notes(content, vault_path, strict=False):
    """Find all [[wiki-links]] (including transclusions) and return their metadata.

    Returns (metadata_dict, issues_list).
    Issues are dicts with 'type' ('file_not_found' or 'no_cite_key') and 'note'.
    """
    # Build vault index once for efficient lookups
    vault_index = build_vault_index(vault_path)

    # Match both [[...]] and ![[...]]
    links = re.findall(r'!?\[\[([^\]]+)\]\]', content)
    metadata = {}
    issues = []
    seen = set()

    for raw_link in links:
        parsed = parse_link(raw_link)
        note_name = parsed['note_name']

        if note_name in seen:
            continue
        seen.add(note_name)

        # Skip images and non-markdown embedded files — handle them in conversion
        if '.' in note_name:
            ext = Path(note_name).suffix.lower()
            if ext and ext != '.md':
                # Check for sidecar note (e.g. paper.pdf → paper.md)
                sidecar = resolve_note_path(Path(note_name).stem, vault_path, vault_index)
                if sidecar:
                    yaml_data = extract_yaml_from_note(sidecar)
                    if yaml_data and 'cite-key' in yaml_data:
                        metadata[note_name] = yaml_data
                continue

        # Look up the markdown note
        note_path = resolve_note_path(note_name, vault_path, vault_index)
        if note_path:
            yaml_data = extract_yaml_from_note(note_path)
            if yaml_data and 'cite-key' in yaml_data:
                metadata[note_name] = yaml_data
            else:
                issue = {'type': 'no_cite_key', 'note': note_name}
                issues.append(issue)
                msg = f"Warning: '{note_name}.md' has no cite-key — will use plain text"
                if strict:
                    print(msg, file=sys.stderr)
                    print("Aborting (--strict mode).", file=sys.stderr)
                    sys.exit(1)
                else:
                    print(msg, file=sys.stderr)
        else:
            issue = {'type': 'file_not_found', 'note': note_name}
            issues.append(issue)
            msg = f"Warning: '{note_name}.md' not found in vault"
            if strict:
                print(msg, file=sys.stderr)
                print("Aborting (--strict mode).", file=sys.stderr)
                sys.exit(1)
            else:
                print(msg, file=sys.stderr)

    return metadata, issues


def yaml_to_bibtex(yaml_data):
    """Convert YAML metadata to BibTeX entry."""
    cite_key = yaml_data.get('cite-key', 'unknown')
    entry_type = yaml_data.get('type', 'misc')

    bib_entry = f"@{entry_type}{{{cite_key},\n"

    field_mapping = {
        'author': 'author',
        'title': 'title',
        'year': 'year',
        'journal': 'journal',
        'publisher': 'publisher',
        'url': 'url',
        'note': 'note'
    }

    for yaml_key, bib_key in field_mapping.items():
        if yaml_key in yaml_data:
            value = yaml_data[yaml_key]
            bib_entry += f"  {bib_key} = {{{value}}},\n"

    bib_entry += "}\n\n"
    return bib_entry


def convert_links_to_citations(content, metadata, vault_path):
    """Replace [[wiki-links]] and ![[transclusions]] with citations or plain text."""
    def replace_link(match):
        prefix = match.group(1)  # '!' or ''
        raw = match.group(2)
        is_embed = prefix == '!'

        parsed = parse_link(raw)
        note_name = parsed['note_name']
        heading = parsed['heading']
        block_id = parsed['block_id']
        display_text = parsed['display_text']

        # --- Embedded files (images, PDFs, etc.) ---
        if is_embed and '.' in note_name:
            ext = Path(note_name).suffix.lower()
            if ext and ext != '.md':
                if is_image(note_name):
                    return f"![]({note_name})"
                # Non-image file embed — check sidecar note
                if note_name in metadata:
                    cite_key = metadata[note_name]['cite-key']
                    return f"[@{cite_key}]"
                return f"[Embedded file: {note_name}]"

        # --- Regular links and note transclusions ---
        if note_name in metadata:
            cite_key = metadata[note_name]['cite-key']
            return f"[@{cite_key}]"

        # No cite-key fallbacks
        if display_text:
            return display_text
        if heading:
            return f"{note_name}, section {heading}"
        if block_id:
            return f"{note_name}, block {block_id}"
        return note_name

    return re.sub(r'(!?)\[\[([^\]]+)\]\]', replace_link, content)


def run_pandoc(md_path, bib_path, pdf_path):
    """Run pandoc to produce a PDF. Try with --citeproc first, fall back without."""
    if not shutil.which('pandoc'):
        print("Warning: pandoc not found — skipping PDF generation", file=sys.stderr)
        return None

    # Try with citeproc + bibliography
    cmd_cite = [
        'pandoc', str(md_path),
        '-o', str(pdf_path),
        '--citeproc',
        f'--bibliography={bib_path}',
    ]
    result = subprocess.run(cmd_cite, capture_output=True, text=True)
    if result.returncode == 0:
        return pdf_path

    # Citeproc failed — retry without bibliography
    print("Warning: pandoc --citeproc failed — generating PDF without resolved citations",
          file=sys.stderr)
    cmd_plain = ['pandoc', str(md_path), '-o', str(pdf_path)]
    result = subprocess.run(cmd_plain, capture_output=True, text=True)
    if result.returncode == 0:
        return pdf_path

    print(f"Warning: pandoc failed — {result.stderr.strip()}", file=sys.stderr)
    return None


def process_document(input_file, vault_path, strict=False):
    """Main processing function."""
    input_path = Path(input_file).resolve()
    stem = input_path.stem
    output_dir = input_path.parent / stem
    os.makedirs(output_dir, exist_ok=True)

    # Read the main document
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find all linked notes and their metadata
    metadata, issues = find_linked_notes(content, vault_path, strict=strict)

    # Generate BibTeX file
    bib_path = output_dir / 'references.bib'
    with open(bib_path, 'w', encoding='utf-8') as f:
        for note_name, yaml_data in metadata.items():
            f.write(yaml_to_bibtex(yaml_data))

    # Convert wiki-links to citations
    converted_content = convert_links_to_citations(content, metadata, vault_path)

    # Add bibliography reference to YAML if not present
    yaml_match = re.match(r'^---\n(.*?)\n---\n', converted_content, re.DOTALL)
    if yaml_match:
        yaml_content = yaml.safe_load(yaml_match.group(1))
        if 'bibliography' not in yaml_content:
            yaml_content['bibliography'] = 'references.bib'
        if 'reference-section-title' not in yaml_content:
            yaml_content['reference-section-title'] = 'References'
        if 'csl' not in yaml_content and CSL_FILE.exists():
            csl_dest = output_dir / CSL_FILE.name
            shutil.copy2(CSL_FILE, csl_dest)
            yaml_content['csl'] = CSL_FILE.name

        # Rebuild document with updated YAML
        new_yaml = yaml.dump(yaml_content, default_flow_style=False)
        converted_content = f"---\n{new_yaml}---\n" + converted_content[yaml_match.end():]

    # Write processed markdown
    output_path = output_dir / f'{stem}_pandoc.md'
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(converted_content)

    # Generate PDF via pandoc
    pdf_path = output_dir / f'{stem}_pandoc.pdf'
    pdf_result = run_pandoc(output_path, bib_path, pdf_path)

    print(f"Generated {bib_path}")
    print(f"Generated {output_path}")
    if pdf_result:
        print(f"Generated {pdf_result}")
    print(f"Found {len(metadata)} citable references")
    if issues:
        print(f"{len(issues)} link(s) resolved as plain text (see warnings above)")

    return output_path, bib_path, pdf_result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Convert Obsidian wiki-links to Pandoc citations for PDF export."
    )
    parser.add_argument('input_file', help="Path to the main document (markdown)")
    parser.add_argument('vault_path', help="Path to the Obsidian vault root")
    parser.add_argument('--strict', action='store_true',
                        help="Abort on missing notes or notes without cite-key")

    args = parser.parse_args()
    process_document(args.input_file, args.vault_path, strict=args.strict)
