import { describe, it, expect } from "vitest";
import { renderBib } from "../../src/pipeline/render-bib.js";

describe("renderBib", () => {
  it("emits one entry per note", () => {
    const out = renderBib({
      "Note A": { "cite-key": "a", type: "article", title: "A", year: 2024 },
      "Note B": { "cite-key": "b", type: "book", title: "B" },
    });
    expect(out).toContain("@article{a,");
    expect(out).toContain("@book{b,");
  });

  it("does not duplicate entries when the same cite-key appears twice", () => {
    const out = renderBib({
      "Note A": { "cite-key": "a", title: "A" },
      "Note A duplicate-key": { "cite-key": "a", title: "Different title" },
    });
    // Both notes share the same cite-key — only the first (in iteration order) wins
    const aMatches = out.match(/@misc{a,/g) ?? [];
    expect(aMatches.length).toBe(1);
  });

  it("returns an empty string for empty metadata", () => {
    expect(renderBib({})).toBe("");
  });

  it("preserves user fields and applies LaTeX escaping (sanity check via integration)", () => {
    const out = renderBib({
      "Note": {
        "cite-key": "k",
        type: "article",
        title: "Cats & Dogs",
        author: "O'Reilly, Pat",
      },
    });
    expect(out).toContain("title = {Cats \\& Dogs}");
    expect(out).toContain("author = {O'Reilly, Pat}");
  });
});
