"""Comprehensive tests for obs2pdf.py."""
import os
import sys
import shutil
import textwrap
from pathlib import Path
from unittest import mock

import pytest

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import obs2pdf as po


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


def _process(vault, content, strict=False):
    """Helper: write a doc, process it, return (output_text, bib_text, md_path, bib_path, pdf_path)."""
    doc = _write_doc(vault, content)
    with mock.patch("obs2pdf.run_pandoc", return_value=None):
        md_path, bib_path, pdf_path = po.process_document(str(doc), str(vault), strict=strict)
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
# TestOutputLocation — subfolder name, _pandoc filename, bib in same dir
# ---------------------------------------------------------------------------

class TestOutputLocation:
    def test_subfolder_name(self, vault):
        doc = _write_doc(vault, "[[Citable Note]]")
        with mock.patch("obs2pdf.run_pandoc", return_value=None):
            md_path, bib_path, _ = po.process_document(str(doc), str(vault))
        assert Path(md_path).parent.name == "test-doc"

    def test_pandoc_suffix(self, vault):
        doc = _write_doc(vault, "[[Citable Note]]")
        with mock.patch("obs2pdf.run_pandoc", return_value=None):
            md_path, _, _ = po.process_document(str(doc), str(vault))
        assert Path(md_path).name == "test-doc_pandoc.md"

    def test_bib_in_same_dir(self, vault):
        doc = _write_doc(vault, "[[Citable Note]]")
        with mock.patch("obs2pdf.run_pandoc", return_value=None):
            md_path, bib_path, _ = po.process_document(str(doc), str(vault))
        assert Path(md_path).parent == Path(bib_path).parent


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
                po.process_document(str(doc), str(vault), strict=True)

    def test_strict_no_cite_key(self, vault):
        doc = _write_doc(vault, "[[No Cite Note]]")
        with pytest.raises(SystemExit):
            with mock.patch("obs2pdf.run_pandoc", return_value=None):
                po.process_document(str(doc), str(vault), strict=True)


# ---------------------------------------------------------------------------
# TestPandocIntegration — graceful handling when pandoc missing or fails
# ---------------------------------------------------------------------------

class TestPandocIntegration:
    def test_pandoc_not_found(self, vault, capsys):
        doc = _write_doc(vault, "[[Citable Note]]")
        with mock.patch("shutil.which", return_value=None):
            md_path, bib_path, pdf_path = po.process_document(str(doc), str(vault))
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
            md_path, bib_path, pdf_path = po.process_document(str(doc), str(vault))

        assert pdf_path is not None
        assert call_count["n"] == 2
