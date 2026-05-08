import { describe, it, expect } from "vitest";
import { parseLink } from "../../src/lib/parse-link.js";

// ----------------------------------------------------------------------------
// Behavior ports of TestParseLink (tests/test_vault_passport.py:111-144)
// ----------------------------------------------------------------------------

describe("parseLink — Python TestParseLink parity", () => {
  it("parses a basic link with no anchors or alias", () => {
    expect(parseLink("My Note")).toEqual({
      noteName: "My Note",
      heading: null,
      blockId: null,
      displayText: null,
    });
  });

  it("parses a link with an alias", () => {
    expect(parseLink("My Note|Display")).toEqual({
      noteName: "My Note",
      heading: null,
      blockId: null,
      displayText: "Display",
    });
  });

  it("parses a link with a heading", () => {
    expect(parseLink("Note#Section One")).toEqual({
      noteName: "Note",
      heading: "Section One",
      blockId: null,
      displayText: null,
    });
  });

  it("parses a link with a block id", () => {
    expect(parseLink("Note#^abc123")).toEqual({
      noteName: "Note",
      heading: null,
      blockId: "abc123",
      displayText: null,
    });
  });

  it("parses heading + alias", () => {
    expect(parseLink("Note#Heading|Text")).toEqual({
      noteName: "Note",
      heading: "Heading",
      blockId: null,
      displayText: "Text",
    });
  });

  it("parses block id + alias", () => {
    expect(parseLink("Note#^blk|Alias")).toEqual({
      noteName: "Note",
      heading: null,
      blockId: "blk",
      displayText: "Alias",
    });
  });
});

// ----------------------------------------------------------------------------
// Adversarial cases — added during the TS port
// ----------------------------------------------------------------------------

describe("parseLink — adversarial / edge cases", () => {
  it("returns empty noteName on completely empty input", () => {
    expect(parseLink("")).toEqual({
      noteName: "",
      heading: null,
      blockId: null,
      displayText: null,
    });
  });

  it("trims surrounding whitespace from all components", () => {
    expect(parseLink("  My Note  #  Section  |  Display  ")).toEqual({
      noteName: "My Note",
      heading: "Section",
      blockId: null,
      displayText: "Display",
    });
  });

  it("treats only the first | as the alias delimiter (display text may contain pipes)", () => {
    // Python behaviour: `.split('|', 1)` splits at the first pipe only
    expect(parseLink("Note|a|b|c")).toEqual({
      noteName: "Note",
      heading: null,
      blockId: null,
      displayText: "a|b|c",
    });
  });

  it("treats only the first # as the anchor delimiter (heading text may contain hashes)", () => {
    expect(parseLink("Note#h#more|Alias")).toEqual({
      noteName: "Note",
      heading: "h#more",
      blockId: null,
      displayText: "Alias",
    });
  });

  it("preserves Unicode characters in note names verbatim", () => {
    expect(parseLink("Müller 2023")).toEqual({
      noteName: "Müller 2023",
      heading: null,
      blockId: null,
      displayText: null,
    });
    expect(parseLink("北京#章節")).toEqual({
      noteName: "北京",
      heading: "章節",
      blockId: null,
      displayText: null,
    });
  });

  it("preserves forward-slash paths in note names", () => {
    expect(parseLink("folder/subfolder/Note#Heading")).toEqual({
      noteName: "folder/subfolder/Note",
      heading: "Heading",
      blockId: null,
      displayText: null,
    });
  });

  it("preserves backslash paths in note names (Windows-style)", () => {
    expect(parseLink("folder\\Note")).toEqual({
      noteName: "folder\\Note",
      heading: null,
      blockId: null,
      displayText: null,
    });
  });

  it("treats only the first ^ as the block-id marker", () => {
    // Anchor parses as block-id when it starts with ^; the rest of the anchor stays raw
    expect(parseLink("Note#^blk-id-with-^caret")).toEqual({
      noteName: "Note",
      heading: null,
      blockId: "blk-id-with-^caret",
      displayText: null,
    });
  });

  it("anchor starting with anything other than ^ is treated as a heading even when it contains ^", () => {
    expect(parseLink("Note#Section^Two")).toEqual({
      noteName: "Note",
      heading: "Section^Two",
      blockId: null,
      displayText: null,
    });
  });

  it("returns empty noteName when only an alias is given", () => {
    expect(parseLink("|just an alias")).toEqual({
      noteName: "",
      heading: null,
      blockId: null,
      displayText: "just an alias",
    });
  });

  it("returns empty noteName when only a heading is given", () => {
    expect(parseLink("#Heading")).toEqual({
      noteName: "",
      heading: "Heading",
      blockId: null,
      displayText: null,
    });
  });

  it("treats ![[Note|text]] alias parsing identically to [[Note|text]]", () => {
    // parseLink works on the raw inner content; the leading ! is stripped by
    // the caller. So the behaviour shouldn't change for that case.
    expect(parseLink("Note|alias")).toEqual({
      noteName: "Note",
      heading: null,
      blockId: null,
      displayText: "alias",
    });
  });
});
