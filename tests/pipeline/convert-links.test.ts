import { describe, it, expect } from "vitest";
import { convertLinks } from "../../src/pipeline/convert-links.js";

describe("convertLinks — citable [[Note]] variants → [@cite-key]", () => {
  const metadata = { "My Note": { "cite-key": "smith2024", title: "T" } };

  it.each([
    ["See [[My Note]] for details.", "[@smith2024]"],
    ["[[My Note|the study]]", "[@smith2024]"],
    ["[[My Note#Methods]]", "[@smith2024]"],
    ["[[My Note#Methods|m]]", "[@smith2024]"],
    ["[[My Note#^block-id]]", "[@smith2024]"],
    ["[[My Note#^block-id|alias]]", "[@smith2024]"],
    ["![[My Note]]", "[@smith2024]"],
    ["![[My Note#Heading]]", "[@smith2024]"],
    ["![[My Note#^blk]]", "[@smith2024]"],
  ])("%s → contains %s", (input, expected) => {
    const out = convertLinks(input, metadata);
    expect(out).toContain(expected);
    expect(out).not.toContain("[[");
  });
});

describe("convertLinks — missing notes (no metadata)", () => {
  it("uses display text as the fallback when present", () => {
    expect(convertLinks("[[Ghost|phantom]]", {})).toBe("phantom");
  });

  it("falls back to bare note name when no other info available", () => {
    expect(convertLinks("[[Ghost]]", {})).toBe("Ghost");
  });

  it("falls back to 'Note, section Heading' for [[Ghost#Heading]]", () => {
    expect(convertLinks("[[Ghost#Intro]]", {})).toBe("Ghost, section Intro");
  });

  it("falls back to 'Note, block id' for [[Ghost#^blk]]", () => {
    expect(convertLinks("[[Ghost#^xyz]]", {})).toBe("Ghost, block xyz");
  });
});

describe("convertLinks — image embeds", () => {
  it("converts ![[file.png]] to ![](file.png)", () => {
    expect(convertLinks("Here: ![[photo.png]]", {})).toBe(
      "Here: ![](photo.png)"
    );
  });

  it("preserves image extension casing as-is", () => {
    expect(convertLinks("![[diagram.SVG]]", {})).toBe("![](diagram.SVG)");
  });
});

describe("convertLinks — non-image, non-markdown embeds", () => {
  it("uses the sidecar metadata when present", () => {
    const out = convertLinks("![[paper.pdf]]", {
      "paper.pdf": { "cite-key": "sidecar2023", title: "S" },
    });
    expect(out).toBe("[@sidecar2023]");
  });

  it("emits [Embedded file: …] when no sidecar metadata is registered", () => {
    expect(convertLinks("![[orphan.pdf]]", {})).toBe(
      "[Embedded file: orphan.pdf]"
    );
  });
});

describe("convertLinks — code-block protection", () => {
  it("does not transform wikilinks inside fenced code blocks", () => {
    const input = "[[Note]]\n```\n[[Inside]]\n```\n";
    const out = convertLinks(input, {
      Note: { "cite-key": "k", title: "T" },
    });
    expect(out).toContain("[@k]");
    expect(out).toContain("[[Inside]]");
  });

  it("does not transform wikilinks inside inline code spans", () => {
    const out = convertLinks(
      "[[Note]] but `[[Code]]` stays.",
      { Note: { "cite-key": "k", title: "T" } }
    );
    expect(out).toContain("[@k]");
    expect(out).toContain("`[[Code]]`");
  });
});

describe("convertLinks — no-raw-wikilinks property (Python TestNoRawWikiLinks)", () => {
  it("a comprehensive document with all 11 link types contains zero raw [[", () => {
    const metadata = {
      "Citable Note": { "cite-key": "citable2024", title: "T" },
      "No Cite Note": { "cite-key": "no-cite-note", title: "Just a Note" },
      "Sidecar Paper.pdf": { "cite-key": "sidecar2023", title: "S" },
    };
    const input = `Basic citable: [[Citable Note]]
Alias citable: [[Citable Note|study]]
Heading citable: [[Citable Note#Methods]]
Heading alias citable: [[Citable Note#Methods|m]]
Block citable: [[Citable Note#^b1]]
Block alias citable: [[Citable Note#^b1|ref]]
Basic noncite (auto-key): [[No Cite Note]]
Heading noncite: [[No Cite Note#Intro]]
Block noncite: [[No Cite Note#^x]]
Transclusion cite: ![[Citable Note]]
Image embed: ![[test_image.png]]
PDF sidecar: ![[Sidecar Paper.pdf]]
PDF orphan: ![[Orphan File.pdf]]`;
    const out = convertLinks(input, metadata);
    expect(out).not.toContain("[[");
  });
});
