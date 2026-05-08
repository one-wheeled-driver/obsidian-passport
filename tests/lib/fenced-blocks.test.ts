import { describe, it, expect } from "vitest";
import { splitFencedBlocks } from "../../src/lib/fenced-blocks.js";

// ----------------------------------------------------------------------------
// splitFencedBlocks: returns [[inCode, chunk], ...] preserving original text
// when re-joined. Mirrors _split_fenced_blocks (vault_passport.py:17-65).
// ----------------------------------------------------------------------------

describe("splitFencedBlocks — round-trip property", () => {
  // Joining all chunks back together must reconstruct the input exactly.
  it.each([
    "plain text without any fences\n",
    "text\n```\ncode\n```\nmore text\n",
    "```python\ncode block\n```\n",
    "~~~\ntilde-fenced\n~~~\n",
    "````\nfour-backtick fence\n````\n",
    "no trailing newline",
    "",
    "\n\n\n",
    "```\nunclosed fence at EOF",
  ])("preserves the input verbatim when re-joined", (input) => {
    const segments = splitFencedBlocks(input);
    const rejoined = segments.map(([, chunk]) => chunk).join("");
    expect(rejoined).toBe(input);
  });
});

describe("splitFencedBlocks — basic cases", () => {
  it("returns a single non-code segment for fence-free text", () => {
    const segs = splitFencedBlocks("just prose\nwith no fences\n");
    expect(segs).toEqual([[false, "just prose\nwith no fences\n"]]);
  });

  it("identifies a triple-backtick code block", () => {
    const input = "before\n```\ninside\n```\nafter\n";
    const segs = splitFencedBlocks(input);
    expect(segs).toHaveLength(3);
    expect(segs[0]).toEqual([false, "before\n"]);
    expect(segs[1]?.[0]).toBe(true);
    expect(segs[1]?.[1]).toContain("inside");
    expect(segs[2]).toEqual([false, "after\n"]);
  });

  it("identifies tilde-fenced blocks", () => {
    const input = "before\n~~~\ninside\n~~~\nafter\n";
    const segs = splitFencedBlocks(input);
    expect(segs).toHaveLength(3);
    expect(segs[1]?.[0]).toBe(true);
    expect(segs[1]?.[1]).toContain("inside");
  });

  it("preserves a code-fence language tag", () => {
    const input = "```python\nx = 1\n```\n";
    const segs = splitFencedBlocks(input);
    const code = segs.find(([inCode]) => inCode);
    expect(code?.[1]).toContain("python");
    expect(code?.[1]).toContain("x = 1");
  });
});

describe("splitFencedBlocks — fence-length matching", () => {
  it("requires the closing fence to be at least as long as the opening", () => {
    // 4-backtick opening with 3-backtick line inside should NOT close it
    const input = "````\n```\nstill in code\n````\nafter\n";
    const segs = splitFencedBlocks(input);
    const codeSegments = segs.filter(([inCode]) => inCode);
    expect(codeSegments).toHaveLength(1);
    expect(codeSegments[0]?.[1]).toContain("still in code");
  });

  it("does not let a tilde fence close a backtick fence (and vice versa)", () => {
    const input = "```\n~~~\nstill in backtick code\n```\n";
    const segs = splitFencedBlocks(input);
    const codeSegments = segs.filter(([inCode]) => inCode);
    expect(codeSegments).toHaveLength(1);
    expect(codeSegments[0]?.[1]).toContain("still in backtick code");
  });
});

describe("splitFencedBlocks — unclosed fences", () => {
  it("includes everything from the opening fence to EOF when never closed", () => {
    const input = "before\n```\nnever closed";
    const segs = splitFencedBlocks(input);
    const codeSegments = segs.filter(([inCode]) => inCode);
    expect(codeSegments).toHaveLength(1);
    expect(codeSegments[0]?.[1]).toContain("never closed");
  });

  it("re-joins to the original input even with an unclosed fence", () => {
    const input = "p1\n```\ncode\nmore code without close";
    expect(splitFencedBlocks(input).map(([, c]) => c).join("")).toBe(input);
  });
});

describe("splitFencedBlocks — multiple consecutive fences", () => {
  it("handles two adjacent fenced blocks separated by prose", () => {
    const input = "```\nA\n```\nbetween\n```\nB\n```\n";
    const segs = splitFencedBlocks(input);
    const codes = segs.filter(([inCode]) => inCode);
    expect(codes).toHaveLength(2);
    expect(codes[0]?.[1]).toContain("A");
    expect(codes[1]?.[1]).toContain("B");
    const proseBetween = segs.filter(([inCode]) => !inCode);
    expect(proseBetween.some((s) => s[1].includes("between"))).toBe(true);
  });

  it("handles back-to-back fences with no prose between", () => {
    const input = "```\nA\n```\n```\nB\n```\n";
    const segs = splitFencedBlocks(input);
    const codes = segs.filter(([inCode]) => inCode);
    expect(codes).toHaveLength(2);
  });
});

describe("splitFencedBlocks — adversarial / edge cases", () => {
  it("returns an empty list for empty input", () => {
    expect(splitFencedBlocks("")).toEqual([]);
  });

  it("does not treat indented fences (4 leading spaces) as opening fences", () => {
    // Indented code blocks are a different markdown construct; the Python
    // implementation only matches `^(`{3,}|~{3,})` at the very start of a line.
    const input = "    ```\n    not a fence\n    ```\n";
    const segs = splitFencedBlocks(input);
    expect(segs.every(([inCode]) => !inCode)).toBe(true);
  });

  it("treats wikilinks inside a fenced block as part of the code (not prose)", () => {
    const input = "before [[Link]]\n```\ninside [[Inner]]\n```\nafter\n";
    const segs = splitFencedBlocks(input);
    const code = segs.find(([inCode]) => inCode);
    const proseChunks = segs
      .filter(([inCode]) => !inCode)
      .map(([, c]) => c)
      .join("");
    expect(code?.[1]).toContain("[[Inner]]");
    expect(proseChunks).toContain("[[Link]]");
    expect(proseChunks).not.toContain("[[Inner]]");
  });

  it("preserves trailing whitespace on the closing fence line", () => {
    // Closing-fence regex allows optional trailing whitespace after the fence.
    const input = "```\ncode\n```   \nafter\n";
    const segs = splitFencedBlocks(input);
    const codes = segs.filter(([inCode]) => inCode);
    expect(codes).toHaveLength(1);
  });

  it("preserves CRLF line endings in re-join", () => {
    const input = "p1\r\n```\r\ncode\r\n```\r\np2\r\n";
    const rejoined = splitFencedBlocks(input).map(([, c]) => c).join("");
    expect(rejoined).toBe(input);
  });
});
