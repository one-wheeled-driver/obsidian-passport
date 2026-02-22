"""Comprehensive tests for vault_passport.py."""
import os
import sys
import shutil
import textwrap
from pathlib import Path
from unittest import mock

import pytest

# Add plugin directory to path
PLUGIN_DIR = Path(__file__).resolve().parent.parent / '.obsidian' / 'plugins' / 'vault-passport'
sys.path.insert(0, str(PLUGIN_DIR))

import vault_passport as po


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def vault(tmp_path):
    """Create an isolated test vault with citable/non-citable notes and files."""
    v = tmp_path / "vault"
    v.mkdir()

    # Citable note
    (v / "Citable Note.md").write_text(textwrap.dedent("""\
        ---
        cite-key: citable2024
        author: "Doe, Jane"
        title: "A Citable Study"
        year: 2024
        type: article
        journal: "Test Journal"
        ---

        Content of citable note.
    """))

    # Second citable note (for multi-ref tests)
    (v / "Another Citable.md").write_text(textwrap.dedent("""\
        ---
        cite-key: another2025
        author: "Park, Sam"
        title: "Another Study"
        year: 2025
        type: book
        publisher: "Pub House"
        ---

        More content.
    """))

    # Non-citable note (has YAML but no cite-key)
    (v / "No Cite Note.md").write_text(textwrap.dedent("""\
        ---
        title: "Just a Regular Note"
        author: "Smith, Bob"
        ---

        No cite-key here.
    """))

    # Sidecar note for a PDF
    (v / "Sidecar Paper.md").write_text(textwrap.dedent("""\
        ---
        cite-key: sidecar2023
        author: "Lee, Chris"
        title: "Sidecar Paper Reference"
        year: 2023
        type: misc
        url: "https://example.com/paper"
        ---

        Sidecar content.
    """))

    # Dummy files
    (v / "Sidecar Paper.pdf").write_bytes(b"%PDF-1.0 dummy")
    (v / "Orphan File.pdf").write_bytes(b"%PDF-1.0 dummy")
    (v / "test_image.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 20)

    return v


def _write_doc(vault, content):
    """Write a test document inside the vault and return its path."""
    doc = vault / "test-doc.md"
    doc.write_text(content)
    return doc


def _process(vault, content, strict=False, **kwargs):
    """Helper: write a doc, process it, return (output_text, bib_text, md_path, bib_path, pdf_path)."""
    doc = _write_doc(vault, content)
    kwargs.setdefault('build_dir', vault.parent / 'build')
    with mock.patch("obs2pdf.run_pandoc", return_value=None):
        md_path, bib_path, pdf_path = po.process_document(
            str(doc), str(vault), strict=strict, **kwargs)
    output_text = Path(md_path).read_text()
    bib_text = Path(bib_path).read_text()
    return output_text, bib_text, md_path, bib_path, pdf_path


# ---------------------------------------------------------------------------
# TestParseLink — unit tests for parse_link()
# ---------------------------------------------------------------------------

class TestParseLink:
    def test_basic(self):
        result = po.parse_link("My Note")
        assert result == {"note_name": "My Note", "heading": None, "block_id": None, "display_text": None}

    def test_alias(self):
        result = po.parse_link("My Note|Display")
        assert result["note_name"] == "My Note"
        assert result["display_text"] == "Display"

    def test_heading(self):
        result = po.parse_link("Note#Section One")
        assert result["note_name"] == "Note"
        assert result["heading"] == "Section One"
        assert result["block_id"] is None

    def test_block_id(self):
        result = po.parse_link("Note#^abc123")
        assert result["note_name"] == "Note"
        assert result["block_id"] == "abc123"
        assert result["heading"] is None

    def test_heading_with_alias(self):
        result = po.parse_link("Note#Heading|Text")
        assert result["note_name"] == "Note"
        assert result["heading"] == "Heading"
        assert result["display_text"] == "Text"

    def test_block_with_alias(self):
        result = po.parse_link("Note#^blk|Alias")
        assert result["note_name"] == "Note"
        assert result["block_id"] == "blk"
        assert result["display_text"] == "Alias"


# ---------------------------------------------------------------------------
# TestLinksCitable — all link types where destination has a cite-key
# ---------------------------------------------------------------------------

class TestLinksCitable:
    def test_basic_wikilink(self, vault):
        out, *_ = _process(vault, "See [[Citable Note]] for details.")
        assert "[@citable2024]" in out
        assert "[[" not in out

    def test_alias_wikilink(self, vault):
        out, *_ = _process(vault, "See [[Citable Note|the study]] here.")
        assert "[@citable2024]" in out

    def test_heading_link(self, vault):
        out, *_ = _process(vault, "See [[Citable Note#Methods]].")
        assert "[@citable2024]" in out

    def test_heading_alias_link(self, vault):
        out, *_ = _process(vault, "See [[Citable Note#Methods|method section]].")
        assert "[@citable2024]" in out

    def test_block_link(self, vault):
        out, *_ = _process(vault, "See [[Citable Note#^def456]].")
        assert "[@citable2024]" in out

    def test_block_alias_link(self, vault):
        out, *_ = _process(vault, "See [[Citable Note#^def456|that block]].")
        assert "[@citable2024]" in out

    def test_transclusion(self, vault):
        out, *_ = _process(vault, "Embed: ![[Citable Note]]")
        assert "[@citable2024]" in out

    def test_transclusion_heading(self, vault):
        out, *_ = _process(vault, "Embed: ![[Citable Note#Results]]")
        assert "[@citable2024]" in out

    def test_transclusion_block(self, vault):
        out, *_ = _process(vault, "Embed: ![[Citable Note#^xyz]]")
        assert "[@citable2024]" in out


# ---------------------------------------------------------------------------
# TestLinksNonCitable — all link types where destination has no cite-key
# ---------------------------------------------------------------------------

class TestLinksNonCitable:
    def test_basic_wikilink(self, vault):
        out, *_ = _process(vault, "See [[No Cite Note]] for info.")
        assert "No Cite Note" in out
        assert "[@" not in out
        assert "[[" not in out

    def test_alias_wikilink(self, vault):
        out, *_ = _process(vault, "See [[No Cite Note|my note]] here.")
        assert "my note" in out
        assert "[[" not in out

    def test_heading_link(self, vault):
        out, *_ = _process(vault, "See [[No Cite Note#Intro]].")
        assert "No Cite Note, section Intro" in out

    def test_heading_alias_link(self, vault):
        out, *_ = _process(vault, "See [[No Cite Note#Intro|intro text]].")
        assert "intro text" in out

    def test_block_link(self, vault):
        out, *_ = _process(vault, "See [[No Cite Note#^blk1]].")
        assert "No Cite Note, block blk1" in out

    def test_block_alias_link(self, vault):
        out, *_ = _process(vault, "See [[No Cite Note#^blk1|ref]].")
        assert "ref" in out

    def test_transclusion(self, vault):
        out, *_ = _process(vault, "Embed: ![[No Cite Note]]")
        assert "No Cite Note" in out
        assert "[[" not in out

    def test_transclusion_heading(self, vault):
        out, *_ = _process(vault, "Embed: ![[No Cite Note#Intro]]")
        assert "No Cite Note, section Intro" in out

    def test_transclusion_block(self, vault):
        out, *_ = _process(vault, "Embed: ![[No Cite Note#^blk1]]")
        assert "No Cite Note, block blk1" in out


# ---------------------------------------------------------------------------
# TestLinksMissing — links to notes that don't exist
# ---------------------------------------------------------------------------

class TestLinksMissing:
    def test_missing_basic(self, vault):
        out, *_ = _process(vault, "See [[Ghost Note]] here.")
        assert "Ghost Note" in out
        assert "[[" not in out

    def test_missing_with_alias(self, vault):
        out, *_ = _process(vault, "See [[Ghost Note|phantom]] here.")
        assert "phantom" in out
        assert "[[" not in out


# ---------------------------------------------------------------------------
# TestEmbeddedFiles — images, PDFs with/without sidecar
# ---------------------------------------------------------------------------

class TestEmbeddedFiles:
    def test_image_embed(self, vault):
        out, *_ = _process(vault, "Here: ![[test_image.png]]")
        assert "![](test_image.png)" in out
        assert "[[" not in out

    def test_pdf_with_sidecar(self, vault):
        out, *_ = _process(vault, "Paper: ![[Sidecar Paper.pdf]]")
        assert "[@sidecar2023]" in out

    def test_pdf_without_sidecar(self, vault):
        out, *_ = _process(vault, "File: ![[Orphan File.pdf]]")
        assert "[Embedded file: Orphan File.pdf]" in out


# ---------------------------------------------------------------------------
# TestMultipleRefs — same note linked multiple times
# ---------------------------------------------------------------------------

class TestMultipleRefs:
    def test_no_duplicate_bib(self, vault):
        content = "A [[Citable Note]], B [[Citable Note]], C [[Citable Note]]."
        _, bib, *_ = _process(vault, content)
        assert bib.count("@article{citable2024") == 1

    def test_all_resolved(self, vault):
        content = "A [[Citable Note]], B [[Citable Note]], C [[Citable Note]]."
        out, *_ = _process(vault, content)
        assert out.count("[@citable2024]") == 3
        assert "[[" not in out


# ---------------------------------------------------------------------------
# TestNoRawWikiLinks — comprehensive: all 16 link types, zero [[ in output
# ---------------------------------------------------------------------------

class TestNoRawWikiLinks:
    def test_all_link_types(self, vault):
        content = textwrap.dedent("""\
            Basic citable: [[Citable Note]]
            Alias citable: [[Citable Note|study]]
            Heading citable: [[Citable Note#Methods]]
            Heading alias citable: [[Citable Note#Methods|m]]
            Block citable: [[Citable Note#^b1]]
            Block alias citable: [[Citable Note#^b1|ref]]
            Basic noncite: [[No Cite Note]]
            Alias noncite: [[No Cite Note|plain]]
            Heading noncite: [[No Cite Note#Intro]]
            Block noncite: [[No Cite Note#^x]]
            Transclusion cite: ![[Citable Note]]
            Transclusion heading: ![[Citable Note#Results]]
            Transclusion block: ![[Citable Note#^abc]]
            Image embed: ![[test_image.png]]
            PDF sidecar: ![[Sidecar Paper.pdf]]
            PDF orphan: ![[Orphan File.pdf]]
        """)
        out, *_ = _process(vault, content)
        assert "[[" not in out, f"Raw wiki-link found in output:\n{out}"


# ---------------------------------------------------------------------------
# TestBibTeX — correct fields, sidecar included, non-citable excluded
# ---------------------------------------------------------------------------

class TestBibTeX:
    def test_cite_key_present(self, vault):
        _, bib, *_ = _process(vault, "[[Citable Note]]")
        assert "@article{citable2024" in bib

    def test_fields_present(self, vault):
        _, bib, *_ = _process(vault, "[[Citable Note]]")
        assert "author = {Doe, Jane}" in bib
        assert "title = {A Citable Study}" in bib
        assert "year = {2024}" in bib
        assert "journal = {Test Journal}" in bib

    def test_sidecar_in_bib(self, vault):
        _, bib, *_ = _process(vault, "![[Sidecar Paper.pdf]]")
        assert "@misc{sidecar2023" in bib

    def test_noncitable_excluded(self, vault):
        _, bib, *_ = _process(vault, "[[No Cite Note]]")
        assert "No Cite Note" not in bib
        assert "Smith" not in bib


# ---------------------------------------------------------------------------
# TestOutputLocation — intermediates in build dir, PDF next to input, no CSL copy
# ---------------------------------------------------------------------------

class TestOutputLocation:
    def test_intermediates_in_build_dir(self, vault):
        doc = _write_doc(vault, "[[Citable Note]]")
        build_dir = vault.parent / "build"
        with mock.patch("obs2pdf.run_pandoc", return_value=None):
            md_path, bib_path, _ = po.process_document(
                str(doc), str(vault), build_dir=build_dir)
        assert Path(md_path).parent == build_dir
        assert Path(bib_path).parent == build_dir

    def test_md_filename_no_pandoc_suffix(self, vault):
        doc = _write_doc(vault, "[[Citable Note]]")
        build_dir = vault.parent / "build"
        with mock.patch("obs2pdf.run_pandoc", return_value=None):
            md_path, _, _ = po.process_document(
                str(doc), str(vault), build_dir=build_dir)
        assert Path(md_path).name == "test-doc.md"

    def test_pdf_next_to_input(self, vault):
        """PDF path should be next to the original input, not in a subfolder."""
        doc = _write_doc(vault, "[[Citable Note]]")
        build_dir = vault.parent / "build"
        pdf_calls = []
        def capture_pandoc(md_path, bib_path, pdf_path, **kw):
            pdf_calls.append(pdf_path)
            return None
        with mock.patch("obs2pdf.run_pandoc", side_effect=capture_pandoc):
            po.process_document(str(doc), str(vault), build_dir=build_dir)
        assert len(pdf_calls) == 1
        assert Path(pdf_calls[0]).parent == doc.parent
        assert Path(pdf_calls[0]).name == "test-doc.pdf"

    def test_no_csl_copy(self, vault):
        """CSL file should never be copied to the output directory."""
        doc = _write_doc(vault, "[[Citable Note]]")
        build_dir = vault.parent / "build"
        with mock.patch("obs2pdf.run_pandoc", return_value=None):
            po.process_document(str(doc), str(vault), build_dir=build_dir)
        # No numbered-title.csl should appear in build_dir or next to input
        assert not (build_dir / "numbered-title.csl").exists()
        assert not (doc.parent / "numbered-title.csl").exists()


# ---------------------------------------------------------------------------
# TestWarnings — stderr messages for missing and uncited notes
# ---------------------------------------------------------------------------

class TestWarnings:
    def test_missing_note_warning(self, vault, capsys):
        _process(vault, "[[Nonexistent]]")
        err = capsys.readouterr().err
        assert "not found in vault" in err

    def test_no_cite_key_warning(self, vault, capsys):
        _process(vault, "[[No Cite Note]]")
        err = capsys.readouterr().err
        assert "no cite-key" in err


# ---------------------------------------------------------------------------
# TestStrictMode — SystemExit on missing note, SystemExit on no cite-key
# ---------------------------------------------------------------------------

class TestStrictMode:
    def test_strict_missing_note(self, vault):
        doc = _write_doc(vault, "[[Ghost]]")
        with pytest.raises(SystemExit):
            with mock.patch("obs2pdf.run_pandoc", return_value=None):
                po.process_document(str(doc), str(vault), strict=True,
                                    build_dir=vault.parent / 'build')

    def test_strict_no_cite_key(self, vault):
        doc = _write_doc(vault, "[[No Cite Note]]")
        with pytest.raises(SystemExit):
            with mock.patch("obs2pdf.run_pandoc", return_value=None):
                po.process_document(str(doc), str(vault), strict=True,
                                    build_dir=vault.parent / 'build')


# ---------------------------------------------------------------------------
# TestPandocIntegration — graceful handling when pandoc missing or fails
# ---------------------------------------------------------------------------

class TestPandocIntegration:
    def test_pandoc_not_found(self, vault, capsys):
        doc = _write_doc(vault, "[[Citable Note]]")
        with mock.patch("shutil.which", return_value=None):
            md_path, bib_path, pdf_path = po.process_document(
                str(doc), str(vault), build_dir=vault.parent / 'build')
        assert pdf_path is None
        err = capsys.readouterr().err
        assert "pandoc not found" in err

    def test_pandoc_citeproc_fallback(self, vault):
        """When --citeproc fails, pandoc retries without it."""
        doc = _write_doc(vault, "[[Citable Note]]")

        call_count = {"n": 0}
        def fake_run(cmd, **kwargs):
            call_count["n"] += 1
            rc = mock.MagicMock()
            if call_count["n"] == 1:
                # First call (with --citeproc) fails
                rc.returncode = 1
                rc.stderr = "citeproc not available"
            else:
                # Second call (plain) succeeds
                rc.returncode = 0
                rc.stderr = ""
            return rc

        with mock.patch("shutil.which", return_value="/usr/bin/pandoc"), \
             mock.patch("subprocess.run", side_effect=fake_run):
            md_path, bib_path, pdf_path = po.process_document(
                str(doc), str(vault), build_dir=vault.parent / 'build')

        assert pdf_path is not None
        assert call_count["n"] == 2


# ---------------------------------------------------------------------------
# TestSubdirectoryResolution — notes in subfolders resolve via vault index
# ---------------------------------------------------------------------------

@pytest.fixture
def nested_vault(tmp_path):
    """Create a test vault with notes inside subdirectories."""
    v = tmp_path / "vault"
    v.mkdir()

    # Citable note in a subfolder
    sub = v / "references"
    sub.mkdir()
    (sub / "Citable Note.md").write_text(textwrap.dedent("""\
        ---
        cite-key: citable2024
        author: "Doe, Jane"
        title: "A Citable Study"
        year: 2024
        type: article
        journal: "Test Journal"
        ---

        Content of citable note.
    """))

    # Non-citable note in a different subfolder
    sub2 = v / "notes"
    sub2.mkdir()
    (sub2 / "No Cite Note.md").write_text(textwrap.dedent("""\
        ---
        title: "Just a Regular Note"
        author: "Smith, Bob"
        ---

        No cite-key here.
    """))

    # Sidecar note in subfolder for a PDF
    (sub / "Sidecar Paper.md").write_text(textwrap.dedent("""\
        ---
        cite-key: sidecar2023
        author: "Lee, Chris"
        title: "Sidecar Paper Reference"
        year: 2023
        type: misc
        url: "https://example.com/paper"
        ---

        Sidecar content.
    """))

    # Dummy files at vault root (where embeds are typically referenced)
    (v / "Sidecar Paper.pdf").write_bytes(b"%PDF-1.0 dummy")
    (v / "Orphan File.pdf").write_bytes(b"%PDF-1.0 dummy")
    (v / "test_image.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 20)

    # .obsidian directory should be ignored
    obs_dir = v / ".obsidian"
    obs_dir.mkdir()
    (obs_dir / "Some Config.md").write_text("---\ncite-key: shouldignore\n---\n")

    return v


def _process_nested(vault, content, strict=False, **kwargs):
    """Helper for nested vault tests."""
    doc = vault / "test-doc.md"
    doc.write_text(content)
    kwargs.setdefault('build_dir', vault.parent / 'build')
    with mock.patch("obs2pdf.run_pandoc", return_value=None):
        md_path, bib_path, pdf_path = po.process_document(
            str(doc), str(vault), strict=strict, **kwargs)
    output_text = Path(md_path).read_text()
    bib_text = Path(bib_path).read_text()
    return output_text, bib_text, md_path, bib_path, pdf_path


class TestSubdirectoryResolution:
    def test_citable_in_subfolder(self, nested_vault):
        """[[Citable Note]] resolves even when note is in references/ subfolder."""
        out, bib, *_ = _process_nested(nested_vault, "See [[Citable Note]] for details.")
        assert "[@citable2024]" in out
        assert "[[" not in out
        assert "@article{citable2024" in bib

    def test_noncitable_in_subfolder(self, nested_vault):
        """[[No Cite Note]] in subfolder resolves to plain text."""
        out, *_ = _process_nested(nested_vault, "See [[No Cite Note]] for info.")
        assert "No Cite Note" in out
        assert "[@" not in out
        assert "[[" not in out

    def test_sidecar_in_subfolder(self, nested_vault):
        """Sidecar note in subfolder is found for ![[Sidecar Paper.pdf]]."""
        out, bib, *_ = _process_nested(nested_vault, "Paper: ![[Sidecar Paper.pdf]]")
        assert "[@sidecar2023]" in out
        assert "@misc{sidecar2023" in bib

    def test_missing_note_still_warns(self, nested_vault, capsys):
        """Notes that don't exist anywhere still produce warnings."""
        out, *_ = _process_nested(nested_vault, "See [[Ghost Note]] here.")
        assert "Ghost Note" in out
        assert "[[" not in out
        err = capsys.readouterr().err
        assert "not found in vault" in err

    def test_obsidian_dir_ignored(self, nested_vault):
        """Notes inside .obsidian/ should not be indexed."""
        vault_index = po.build_vault_index(str(nested_vault))
        assert "Some Config" not in vault_index

    def test_heading_link_in_subfolder(self, nested_vault):
        """[[Citable Note#Methods]] resolves from subfolder."""
        out, *_ = _process_nested(nested_vault, "See [[Citable Note#Methods]].")
        assert "[@citable2024]" in out

    def test_alias_link_in_subfolder(self, nested_vault):
        """[[Citable Note|the study]] resolves from subfolder."""
        out, *_ = _process_nested(nested_vault, "See [[Citable Note|the study]].")
        assert "[@citable2024]" in out


class TestAmbiguousNoteWarning:
    def test_multiple_matches_warns(self, tmp_path, capsys):
        """When multiple notes share the same name, a warning is emitted."""
        v = tmp_path / "vault"
        v.mkdir()
        (v / "folderA").mkdir()
        (v / "folderB").mkdir()
        (v / "folderA" / "Dup Note.md").write_text(textwrap.dedent("""\
            ---
            cite-key: dup2024
            author: "A, Author"
            title: "Dup"
            year: 2024
            type: misc
            ---
        """))
        (v / "folderB" / "Dup Note.md").write_text(textwrap.dedent("""\
            ---
            cite-key: dup2024b
            author: "B, Author"
            title: "Dup B"
            year: 2024
            type: misc
            ---
        """))

        doc = v / "test-doc.md"
        doc.write_text("See [[Dup Note]].")
        with mock.patch("obs2pdf.run_pandoc", return_value=None):
            po.process_document(str(doc), str(v), build_dir=tmp_path / 'build')
        err = capsys.readouterr().err
        assert "multiple notes named" in err.lower()


# ---------------------------------------------------------------------------
# TestCallouts — Obsidian callout → pandoc fenced div conversion
# ---------------------------------------------------------------------------

class TestCallouts:
    def test_basic_with_title(self):
        content = "> [!NOTE] My Note\n> This is content\n"
        result = po.convert_callouts(content)
        assert "\\begin{noteblock}" in result
        assert "**My Note**" in result
        assert "This is content" in result
        assert "\\end{noteblock}" in result
        assert "> [!" not in result

    def test_default_title_from_type(self):
        """No explicit title → capitalised type name is used."""
        result = po.convert_callouts("> [!WARNING]\n> Watch out!\n")
        assert "\\begin{warningblock}" in result
        assert "**Warning**" in result
        assert "Watch out!" in result

    def test_type_mapping(self):
        """Each standard Obsidian type maps to the correct awesomebox env."""
        cases = [
            ("NOTE",      "noteblock"),
            ("TIP",       "tipblock"),
            ("WARNING",   "warningblock"),
            ("DANGER",    "cautionblock"),
            ("IMPORTANT", "importblock"),
            ("SUCCESS",   "tipblock"),
            ("BUG",       "cautionblock"),
            ("QUESTION",  "noteblock"),
        ]
        for obsidian_type, expected_env in cases:
            result = po.convert_callouts(f"> [!{obsidian_type}] Title\n> body\n")
            assert f"\\begin{{{expected_env}}}" in result, \
                f"[!{obsidian_type}] should map to {expected_env}"

    def test_unknown_type_falls_back_to_noteblock(self):
        """Custom / unknown callout types fall back to noteblock — no LaTeX error."""
        result = po.convert_callouts("> [!MYCUSTOMTYPE] Title\n> body\n")
        assert "\\begin{noteblock}" in result
        assert "\\begin{mycustomtype}" not in result

    def test_fold_modifier_plus_ignored(self):
        result = po.convert_callouts("> [!TIP]+ Tip title\n> content\n")
        assert "\\begin{tipblock}" in result
        assert "**Tip title**" in result
        assert "[!TIP]+" not in result

    def test_fold_modifier_minus_ignored(self):
        result = po.convert_callouts("> [!TIP]- Tip title\n> content\n")
        assert "\\begin{tipblock}" in result
        assert "**Tip title**" in result

    def test_multiline_body(self):
        content = "> [!INFO] Details\n> Line one\n> Line two\n> Line three\n"
        result = po.convert_callouts(content)
        assert "Line one" in result
        assert "Line two" in result
        assert "Line three" in result

    def test_empty_body(self):
        """Callout with header only and no body lines."""
        result = po.convert_callouts("> [!NOTE] Just a header\n")
        assert "\\begin{noteblock}" in result
        assert "**Just a header**" in result
        assert "\\end{noteblock}" in result

    def test_blank_line_in_body(self):
        """A bare '>' line inside the body becomes a blank line."""
        content = "> [!NOTE] Title\n> First paragraph\n>\n> Second paragraph\n"
        result = po.convert_callouts(content)
        assert "First paragraph" in result
        assert "Second paragraph" in result

    def test_regular_blockquote_untouched(self):
        """Regular blockquotes without [!TYPE] are not converted."""
        content = "> This is a regular quote\n> Second line\n"
        result = po.convert_callouts(content)
        assert "> This is a regular quote" in result
        assert "\\begin{" not in result

    def test_multiple_callouts(self):
        content = (
            "> [!NOTE] First\n> Note content\n"
            "\n"
            "> [!WARNING] Second\n> Warning content\n"
        )
        result = po.convert_callouts(content)
        assert "\\begin{noteblock}" in result
        assert "\\begin{warningblock}" in result
        assert "Note content" in result
        assert "Warning content" in result

    def test_callouts_disabled_by_default(self, vault):
        """process_document leaves callouts untouched unless callouts=True."""
        content = "> [!NOTE] A Note\n> Content here\n"
        out, *_ = _process(vault, content)
        assert "> [!NOTE]" in out
        assert "\\begin{" not in out

    def test_callouts_enabled_in_process(self, vault):
        """With callouts=True, callouts are converted in the output document."""
        content = "> [!NOTE] A Note\n> Content here\n"
        out, *_ = _process(vault, content, callouts=True)
        assert "\\begin{noteblock}" in out
        assert "**A Note**" in out
        assert "> [!NOTE]" not in out

    def test_awesomebox_injected_into_yaml(self, vault):
        """When callouts=True, \\usepackage{awesomebox} is added to header-includes."""
        content = "---\ntitle: Test\n---\n\n> [!NOTE] Box\n> body\n"
        out, *_ = _process(vault, content, callouts=True)
        assert "awesomebox" in out

    def test_awesomebox_injected_without_yaml(self, vault):
        """When callouts=True and there is no front matter, a YAML block is prepended."""
        content = "> [!NOTE] Box\n> body\n"
        out, *_ = _process(vault, content, callouts=True)
        assert "awesomebox" in out

    def test_wikilinks_inside_callout_resolved(self, vault):
        """[[wiki-links]] inside callout bodies are still resolved."""
        content = "> [!NOTE] References\n> See [[Citable Note]] for details\n"
        out, *_ = _process(vault, content, callouts=True)
        assert "[@citable2024]" in out
        assert "[[" not in out


# ---------------------------------------------------------------------------
# TestTocFlag — --toc is forwarded to pandoc
# ---------------------------------------------------------------------------

class TestTocFlag:
    def test_toc_passed_to_pandoc(self, vault):
        """When toc=True, --toc appears in the pandoc command."""
        doc = _write_doc(vault, "[[Citable Note]]")
        pandoc_cmds = []

        def capture_run(cmd, **kwargs):
            pandoc_cmds.append(cmd)
            rc = mock.MagicMock()
            rc.returncode = 0
            rc.stderr = ""
            return rc

        with mock.patch("shutil.which", return_value="/usr/bin/pandoc"), \
             mock.patch("subprocess.run", side_effect=capture_run):
            po.process_document(str(doc), str(vault), toc=True,
                                build_dir=vault.parent / 'build')

        assert any("--toc" in cmd for cmd in pandoc_cmds)

    def test_no_toc_by_default(self, vault):
        """When toc is not set, --toc should not appear in the pandoc command."""
        doc = _write_doc(vault, "[[Citable Note]]")
        pandoc_cmds = []

        def capture_run(cmd, **kwargs):
            pandoc_cmds.append(cmd)
            rc = mock.MagicMock()
            rc.returncode = 0
            rc.stderr = ""
            return rc

        with mock.patch("shutil.which", return_value="/usr/bin/pandoc"), \
             mock.patch("subprocess.run", side_effect=capture_run):
            po.process_document(str(doc), str(vault),
                                build_dir=vault.parent / 'build')

        assert all("--toc" not in cmd for cmd in pandoc_cmds)


# ---------------------------------------------------------------------------
# TestTemplateSupport — template resolution (vault → plugin → system-wide)
# ---------------------------------------------------------------------------

class TestTemplateSupport:
    def test_plugin_template_passed_to_pandoc(self, vault):
        """Template in plugin templates/ dir is resolved to an absolute path."""
        templates_dir = po.TEMPLATES_DIR
        templates_dir.mkdir(parents=True, exist_ok=True)
        template_file = templates_dir / "custom.latex"
        template_file.write_text("% dummy template")

        doc = _write_doc(vault, "[[Citable Note]]")
        pandoc_cmds = []

        def capture_run(cmd, **kwargs):
            pandoc_cmds.append(cmd)
            rc = mock.MagicMock()
            rc.returncode = 0
            rc.stderr = ""
            return rc

        try:
            with mock.patch("shutil.which", return_value="/usr/bin/pandoc"), \
                 mock.patch("subprocess.run", side_effect=capture_run):
                po.process_document(str(doc), str(vault), template="custom.latex",
                                    build_dir=vault.parent / 'build')

            assert any(any("--template=" in arg for arg in cmd) for cmd in pandoc_cmds)
        finally:
            template_file.unlink(missing_ok=True)

    def test_vault_template_takes_priority(self, vault):
        """Vault-level template takes priority over plugin templates/ dir."""
        vault_templates = vault / "templates"
        vault_templates.mkdir()
        vault_tmpl = vault_templates / "shared.latex"
        vault_tmpl.write_text("% vault template")

        plugin_tmpl = po.TEMPLATES_DIR / "shared.latex"
        po.TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
        plugin_tmpl.write_text("% plugin template")

        pandoc_calls = []

        def capture_pandoc(md_path, bib_path, pdf_path, **kw):
            pandoc_calls.append(kw)
            return None

        doc = _write_doc(vault, "[[Citable Note]]")
        try:
            with mock.patch("obs2pdf.run_pandoc", side_effect=capture_pandoc):
                po.process_document(str(doc), str(vault), template="shared.latex",
                                    build_dir=vault.parent / 'build')
            assert pandoc_calls[0]["template"] == vault_tmpl
        finally:
            vault_tmpl.unlink(missing_ok=True)
            plugin_tmpl.unlink(missing_ok=True)

    def test_custom_vault_template_dir(self, vault):
        """Custom vault_template_dir is respected."""
        custom_dir = vault / "pandoc-templates"
        custom_dir.mkdir()
        tmpl = custom_dir / "mytemplate.latex"
        tmpl.write_text("% custom dir template")

        pandoc_calls = []

        def capture_pandoc(md_path, bib_path, pdf_path, **kw):
            pandoc_calls.append(kw)
            return None

        doc = _write_doc(vault, "[[Citable Note]]")
        try:
            with mock.patch("obs2pdf.run_pandoc", side_effect=capture_pandoc):
                po.process_document(str(doc), str(vault), template="mytemplate.latex",
                                    vault_template_dir="pandoc-templates",
                                    build_dir=vault.parent / 'build')
            assert pandoc_calls[0]["template"] == tmpl
        finally:
            tmpl.unlink(missing_ok=True)

    def test_unresolved_template_passed_as_bare_name(self, vault):
        """Template not found locally is passed as bare name to pandoc (system-wide lookup)."""
        pandoc_calls = []

        def capture_pandoc(md_path, bib_path, pdf_path, **kw):
            pandoc_calls.append(kw)
            return None

        doc = _write_doc(vault, "[[Citable Note]]")
        with mock.patch("obs2pdf.run_pandoc", side_effect=capture_pandoc):
            po.process_document(str(doc), str(vault), template="eisvogel",
                                build_dir=vault.parent / 'build')
        assert pandoc_calls[0]["template"] == "eisvogel"

    def test_extra_vars_passed_to_pandoc(self, vault):
        """Extra vars appear as -V key=value in the pandoc command."""
        doc = _write_doc(vault, "[[Citable Note]]")
        pandoc_cmds = []

        def capture_run(cmd, **kwargs):
            pandoc_cmds.append(cmd)
            rc = mock.MagicMock()
            rc.returncode = 0
            rc.stderr = ""
            return rc

        with mock.patch("shutil.which", return_value="/usr/bin/pandoc"), \
             mock.patch("subprocess.run", side_effect=capture_run):
            po.process_document(str(doc), str(vault),
                                extra_vars=["colorlinks=true", "geometry=margin=2cm"],
                                build_dir=vault.parent / 'build')

        flat = [arg for cmd in pandoc_cmds for arg in cmd]
        assert "-V" in flat
        assert "colorlinks=true" in flat
        assert "geometry=margin=2cm" in flat
