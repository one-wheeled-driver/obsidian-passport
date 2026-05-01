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
PLUGIN_DIR = Path(__file__).resolve().parent
CSL_FILE = PLUGIN_DIR / 'numbered-title.csl'
TEMPLATES_DIR = PLUGIN_DIR / 'templates'


def _split_fenced_blocks(content):
    """Split content into (in_code, chunk) pairs.

    Chunks where in_code=True are fenced code blocks (``` or ~~~) that should
    be left untouched.  Chunks where in_code=False are regular prose that can
    be processed freely.

    Handles opening fences of any length (``` vs ``````) and ensures the
    closing fence uses the same character and is at least as long.
    """
    lines = content.splitlines(keepends=True)
    segments = []
    i = 0
    plain_start = 0

    while i < len(lines):
        open_m = re.match(r'^(`{3,}|~{3,})', lines[i])
        if open_m:
            fence_char = open_m.group(1)[0]
            fence_len = len(open_m.group(1))

            # Emit accumulated plain text before this fence
            plain = ''.join(lines[plain_start:i])
            if plain:
                segments.append((False, plain))

            # Find the matching closing fence
            j = i + 1
            while j < len(lines):
                close_m = re.match(r'^(`{3,}|~{3,})\s*$', lines[j])
                if (close_m and close_m.group(1)[0] == fence_char
                        and len(close_m.group(1)) >= fence_len):
                    break
                j += 1
            # j is the closing fence line (or end-of-file if unclosed)

            code_block = ''.join(lines[i:j + 1])
            segments.append((True, code_block))
            i = j + 1
            plain_start = i
        else:
            i += 1

    # Remaining plain text after the last fence
    plain = ''.join(lines[plain_start:])
    if plain:
        segments.append((False, plain))

    return segments

# Matches an Obsidian callout block:
#   > [!TYPE][+-]? Optional title
#   > body line one
#   > body line two
CALLOUT_RE = re.compile(
    r'^> \[!(\w+)\][+\-]?[ \t]*(.*)\n'  # header: type + optional title
    r'((?:^>.*\n)*)',                     # body: zero or more lines starting with >
    re.MULTILINE
)

# Maps every standard Obsidian callout type (lowercased) to one of the five
# awesomebox environments shipped with eisvogel.  Unknown / custom types fall
# back to noteblock so they always render without a LaTeX error.
_AWESOMEBOX = {
    # note / info family ──────────────────────────── noteblock (blue)
    'note': 'noteblock', 'info': 'noteblock', 'todo': 'noteblock',
    'abstract': 'noteblock', 'summary': 'noteblock', 'tldr': 'noteblock',
    'question': 'noteblock', 'help': 'noteblock', 'faq': 'noteblock',
    'example': 'noteblock', 'quote': 'noteblock', 'cite': 'noteblock',
    # tip / success family ────────────────────────── tipblock (green)
    'tip': 'tipblock', 'hint': 'tipblock',
    'success': 'tipblock', 'check': 'tipblock', 'done': 'tipblock',
    # warning family ──────────────────────────────── warningblock (orange)
    'warning': 'warningblock', 'caution': 'warningblock', 'attention': 'warningblock',
    # danger / error / failure family ─────────────── cautionblock (red)
    'danger': 'cautionblock', 'error': 'cautionblock', 'bug': 'cautionblock',
    'failure': 'cautionblock', 'fail': 'cautionblock', 'missing': 'cautionblock',
    # important ───────────────────────────────────── falls back to noteblock (blue)
    # importantblock/importblock exists in some awesomebox versions but not all
}
_AWESOMEBOX_FALLBACK = 'noteblock'


def convert_callouts(content):
    """Convert Obsidian callouts to awesomebox LaTeX environments.

    Each callout is replaced with a pair of raw LaTeX fences understood by
    pandoc, with the markdown body content left in between so pandoc still
    processes inline formatting, citations, etc.

    > [!NOTE] Title          becomes     ```{=latex}
    > body                               \\begin{noteblock}
                                         ```
                                         **Title**

                                         body

                                         ```{=latex}
                                         \\end{noteblock}
                                         ```

    The callout type is mapped to an awesomebox environment (see _AWESOMEBOX).
    Unknown types fall back to noteblock — no LaTeX error is ever produced.
    The +/- fold modifier is ignored.  Regular blockquotes are left untouched.
    """
    def replace_callout(match):
        callout_type = match.group(1).lower()
        explicit_title = match.group(2).strip()
        raw_body = match.group(3)

        # Strip the leading "> " or ">" prefix from each body line
        body_lines = []
        for line in raw_body.splitlines():
            if line.startswith('> '):
                body_lines.append(line[2:])
            elif line.startswith('>'):
                body_lines.append(line[1:])
            else:
                body_lines.append(line)

        body = '\n'.join(body_lines).strip()
        title = explicit_title if explicit_title else callout_type.title()
        env = _AWESOMEBOX.get(callout_type, _AWESOMEBOX_FALLBACK)

        result = f'```{{=latex}}\n\\begin{{{env}}}\n```\n'
        result += f'**{title}**\n'
        if body:
            result += f'\n{body}\n'
        result += f'\n```{{=latex}}\n\\end{{{env}}}\n```\n'
        return result

    parts = []
    for in_code, chunk in _split_fenced_blocks(content):
        parts.append(chunk if in_code else CALLOUT_RE.sub(replace_callout, chunk))
    return ''.join(parts)


def _protect_inline_code(text):
    """Replace inline code spans with NUL-delimited placeholders.

    Returns (protected_text, restore_fn).  Call restore_fn on the processed
    text to put the original code spans back.  This prevents wiki-link
    substitution from touching content inside backticks.
    """
    spans = []

    def _replace(m):
        spans.append(m.group(0))
        return f'\x00CODE{len(spans) - 1}\x00'

    protected = re.sub(r'`+[^`\n]+`+', _replace, text)

    def _restore(s):
        for i, span in enumerate(spans):
            s = s.replace(f'\x00CODE{i}\x00', span)
        return s

    return protected, _restore


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


def _note_name_to_cite_key(note_name):
    """Derive a BibTeX-safe cite key from a note's display name.

    'Behavioral Economics Review' → 'behavioral-economics-review'
    'Urban Mobility (2024)'       → 'urban-mobility-2024'
    """
    key = note_name.lower()
    key = re.sub(r'[^a-z0-9]+', '-', key)
    key = key.strip('-')
    return key or 'note'


def _ensure_citable(yaml_data, note_name):
    """Return yaml_data with cite-key and title guaranteed present.

    Leaves explicit values untouched; derives cite-key from note_name when
    absent, and uses note_name as the title fallback.
    """
    data = dict(yaml_data) if yaml_data else {}
    if 'cite-key' not in data:
        data['cite-key'] = _note_name_to_cite_key(note_name)
    if 'title' not in data:
        data['title'] = note_name
    return data


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

    Every note found in the vault is made citable: if the note has an explicit
    cite-key in its front matter that value is used; otherwise a cite key is
    derived from the note name and the file stem is used as the title fallback.

    Returns (metadata_dict, issues_list).
    Issues are dicts with 'type' 'file_not_found' and 'note'.
    """
    # Build vault index once for efficient lookups
    vault_index = build_vault_index(vault_path)

    # Match both [[...]] and ![[...]], skipping fenced code blocks and
    # inline code spans (e.g. `[[Note]]`) to avoid false wiki-link matches.
    prose = ''.join(
        chunk for in_code, chunk in _split_fenced_blocks(content) if not in_code
    )
    # Strip inline code spans before scanning for links
    prose_no_inline = re.sub(r'`+[^`]+`+', '', prose)
    links = re.findall(r'!?\[\[([^\]]+)\]\]', prose_no_inline)
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
                    metadata[note_name] = _ensure_citable(yaml_data, Path(note_name).stem)
                continue

        # Look up the markdown note
        note_path = resolve_note_path(note_name, vault_path, vault_index)
        if note_path:
            yaml_data = extract_yaml_from_note(note_path)
            metadata[note_name] = _ensure_citable(yaml_data, note_name)
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

    parts = []
    for in_code, chunk in _split_fenced_blocks(content):
        if in_code:
            parts.append(chunk)
        else:
            protected, restore = _protect_inline_code(chunk)
            replaced = re.sub(r'(!?)\[\[([^\]]+)\]\]', replace_link, protected)
            parts.append(restore(replaced))
    return ''.join(parts)


def _inject_awesomebox(yaml_content):
    """Add \\usepackage{awesomebox} to header-includes if not already present.

    Mutates yaml_content in-place.  LaTeX silently ignores a duplicate
    \\usepackage for a package that is already loaded, so calling this on a
    document that already includes the package is harmless.
    """
    pkg = '\\usepackage{awesomebox}'
    existing = yaml_content.get('header-includes', [])
    if not isinstance(existing, list):
        existing = [existing] if existing else []
    if pkg not in existing:
        existing.append(pkg)
    yaml_content['header-includes'] = existing


def resolve_template(template_name, vault_path, vault_template_dir="templates"):
    """Resolve a template name to an absolute path or bare name for pandoc.

    Resolution order:
    1. <vault>/<vault_template_dir>/<name>  — shared vault template (syncs with vault)
    2. <plugin>/templates/<name>            — per-user plugin template
    3. <name> as-is                         — pandoc resolves from its user data dir

    Returns a Path (for local files) or str (bare name), or None if template_name
    is empty/None.
    """
    if not template_name:
        return None

    # 1. Vault-level template folder (shared across vault users)
    vault_tmpl = Path(vault_path) / vault_template_dir / template_name
    if vault_tmpl.exists():
        return vault_tmpl

    # 2. Plugin templates dir (per-user)
    plugin_tmpl = TEMPLATES_DIR / template_name
    if plugin_tmpl.exists():
        return plugin_tmpl

    # 3. Fall through to pandoc's own template resolution (e.g. system-wide install)
    return template_name


def run_pandoc(md_path, bib_path, pdf_path, csl_path=None, toc=False,
               template=None, extra_vars=None, vault_path=None):
    """Run pandoc via the pandoc/extra Docker image to produce a PDF.

    The entire vault (or a common ancestor of all input paths) is mounted as
    /vault inside the container so all local files are reachable.  The
    pandoc/extra image ships with eisvogel and other common templates, so bare
    template names like 'eisvogel' resolve without any local file needed.

    Try with --citeproc first; fall back to a plain run without citations if
    citeproc is unavailable.
    """
    if not shutil.which('docker'):
        print("Warning: docker not found — skipping PDF generation", file=sys.stderr)
        return None

    md_path = Path(md_path).resolve()
    bib_path = Path(bib_path).resolve()
    pdf_path = Path(pdf_path).resolve()

    # Primary mount: vault root (or computed common ancestor of md/bib/pdf)
    if vault_path:
        mount_root = Path(vault_path).resolve()
    else:
        mount_root = md_path.parent
        for p in (bib_path, pdf_path):
            while mount_root not in p.parents and p.parent != mount_root:
                mount_root = mount_root.parent

    # Extra volume mounts for files outside mount_root (e.g. shared CSL or
    # templates that live outside the vault during testing).
    extra_mounts = {}   # host_dir_str → container_prefix
    _ext_idx = [0]

    def host_to_container(path):
        """Map a host path to its /vault/… container path, registering extra mounts as needed."""
        path = Path(path).resolve()
        try:
            return '/vault/' + str(path.relative_to(mount_root))
        except ValueError:
            host_dir = str(path.parent)
            if host_dir not in extra_mounts:
                extra_mounts[host_dir] = f'/ext{_ext_idx[0]}'
                _ext_idx[0] += 1
            return extra_mounts[host_dir] + '/' + path.name

    # Build pandoc flags (host_to_container() calls populate extra_mounts as a side effect)
    extra = []
    if csl_path and Path(csl_path).exists():
        extra.append(f'--csl={host_to_container(csl_path)}')
    if toc:
        extra.append('--toc')
    if template is not None:
        if isinstance(template, Path):
            extra.append(f'--template={host_to_container(template)}')
        else:
            # Bare name (e.g. 'eisvogel') — pandoc/extra resolves from its data dir
            extra.append(f'--template={template}')
    if extra_vars:
        for var in extra_vars:
            extra.extend(['-V', var])
    if not extra_vars or not any(v.startswith('pdf-engine=') for v in extra_vars):
        extra.append('--pdf-engine=xelatex')

    # Assemble volume args (primary mount + any extra mounts for external files)
    volume_args = ['-v', f'{mount_root}:/vault']
    for host_dir, container_prefix in extra_mounts.items():
        volume_args += ['-v', f'{host_dir}:{container_prefix}:ro']

    base_cmd = [
        'docker', 'run', '--rm',
    ] + volume_args + [
        'pandoc/extra',
        host_to_container(md_path), '-o', host_to_container(pdf_path),
    ]

    # Try with citeproc + bibliography
    result = subprocess.run(
        base_cmd + ['--citeproc', f'--bibliography={host_to_container(bib_path)}'] + extra,
        capture_output=True, text=True,
    )
    if result.returncode == 0:
        return pdf_path

    # Citeproc failed — retry without bibliography
    print("Warning: pandoc --citeproc failed — generating PDF without resolved citations",
          file=sys.stderr)
    print(f"  pandoc said: {result.stderr.strip()}", file=sys.stderr)
    result = subprocess.run(base_cmd + extra, capture_output=True, text=True)
    if result.returncode == 0:
        return pdf_path

    print(f"Error: pandoc (docker) failed — {result.stderr.strip()}", file=sys.stderr)
    return None


def process_document(input_file, vault_path, strict=False, toc=False,
                     template=None, vault_template_dir="templates",
                     extra_vars=None, callouts=False, build_dir=None):
    """Main processing function.

    Intermediates (markdown, bib) go to build_dir.  PDF is placed next to the
    original input file.  If build_dir is None the default plugin build
    directory is used.
    """
    input_path = Path(input_file).resolve()
    stem = input_path.stem

    # Intermediate build directory
    if build_dir is None:
        build_dir = PLUGIN_DIR / 'build'
    build_dir = Path(build_dir)
    os.makedirs(build_dir, exist_ok=True)

    # Read the main document
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Optionally convert Obsidian callouts to pandoc fenced divs
    if callouts:
        content = convert_callouts(content)

    # Find all linked notes and their metadata
    metadata, issues = find_linked_notes(content, vault_path, strict=strict)

    # Generate BibTeX file
    bib_path = build_dir / 'references.bib'
    with open(bib_path, 'w', encoding='utf-8') as f:
        for note_name, yaml_data in metadata.items():
            f.write(yaml_to_bibtex(yaml_data))

    # Convert wiki-links to citations
    converted_content = convert_links_to_citations(content, metadata, vault_path)

    # Add bibliography reference to YAML if not present; inject awesomebox
    # package when callout conversion is active.
    yaml_match = re.match(r'^---\n(.*?)\n---\n', converted_content, re.DOTALL)
    if yaml_match:
        yaml_content = yaml.safe_load(yaml_match.group(1))
        if 'bibliography' not in yaml_content:
            yaml_content['bibliography'] = str(bib_path)
        if 'reference-section-title' not in yaml_content:
            yaml_content['reference-section-title'] = 'References'
        if callouts:
            _inject_awesomebox(yaml_content)

        # Resolve titlepage-logo to an absolute path so xelatex can find it
        # regardless of which temp directory pandoc compiles in.
        for logo_key in ('titlepage-logo', 'logo'):
            if logo_key in yaml_content:
                logo_path = Path(yaml_content[logo_key])
                if not logo_path.is_absolute():
                    yaml_content[logo_key] = str(
                        (Path(vault_path) / logo_path).resolve()
                    )

        # Rebuild document with updated YAML
        new_yaml = yaml.dump(yaml_content, default_flow_style=False)
        converted_content = f"---\n{new_yaml}---\n" + converted_content[yaml_match.end():]
    elif callouts:
        # No front matter — prepend a minimal block to load awesomebox
        yaml_content = {}
        _inject_awesomebox(yaml_content)
        new_yaml = yaml.dump(yaml_content, default_flow_style=False)
        converted_content = f"---\n{new_yaml}---\n" + converted_content

    # Write processed markdown
    output_md_path = build_dir / f'{stem}.md'
    with open(output_md_path, 'w', encoding='utf-8') as f:
        f.write(converted_content)

    # Resolve template: vault folder → plugin folder → bare name for pandoc
    resolved_template = resolve_template(template, vault_path, vault_template_dir)

    # CSL path (absolute, never copied)
    csl_path = CSL_FILE if CSL_FILE.exists() else None

    # PDF goes next to the original document
    pdf_path = input_path.parent / f'{stem}.pdf'

    pdf_result = run_pandoc(output_md_path, bib_path, pdf_path, csl_path=csl_path,
                            toc=toc, template=resolved_template, extra_vars=extra_vars,
                            vault_path=vault_path)

    print(f"Generated {bib_path}")
    print(f"Generated {output_md_path}")
    if pdf_result:
        print(f"Generated {pdf_result}")
    print(f"Found {len(metadata)} citable references")
    if issues:
        print(f"{len(issues)} link(s) resolved as plain text (see warnings above)")

    return output_md_path, bib_path, pdf_result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Vault Passport — export Obsidian documents as self-contained PDFs "
                    "with [[wiki-links]] resolved into proper citations."
    )
    parser.add_argument('input_file', help="Path to the main document (markdown)")
    parser.add_argument('vault_path', help="Path to the Obsidian vault root")
    parser.add_argument('--strict', action='store_true',
                        help="Abort on missing notes or notes without cite-key")
    parser.add_argument('--toc', action='store_true',
                        help="Include a table of contents in the PDF")
    parser.add_argument('--template', type=str, default=None,
                        help="Template name or filename. Resolved from vault template "
                             "folder, then plugin templates/, then passed as-is to pandoc "
                             "(e.g. a system-wide install like 'eisvogel')")
    parser.add_argument('--vault-template-dir', type=str, default='templates',
                        dest='vault_template_dir',
                        help="Folder relative to vault root to search for templates "
                             "(default: templates)")
    parser.add_argument('--var', action='append', dest='extra_vars', default=[],
                        metavar='KEY=VALUE',
                        help="Extra pandoc template variable, e.g. --var colorlinks=true "
                             "(can be given multiple times; document frontmatter overrides)")
    parser.add_argument('--callouts', action='store_true',
                        help="Convert Obsidian callouts (> [!NOTE]) to pandoc fenced divs "
                             "(::: {.note}) for template-styled boxes")

    args = parser.parse_args()
    _, _, pdf_result = process_document(
        args.input_file, args.vault_path, strict=args.strict,
        toc=args.toc, template=args.template,
        vault_template_dir=args.vault_template_dir,
        extra_vars=args.extra_vars or None,
        callouts=args.callouts,
    )
    if not pdf_result:
        sys.exit(1)
