import { describe, it, expect } from "vitest";
import { protectInlineCode } from "../../src/lib/inline-code.js";

// ----------------------------------------------------------------------------
// protectInlineCode mirrors _protect_inline_code (vault_passport.py:154-174):
//   - replaces inline code spans (`...`) with NUL-delimited placeholders
//   - returns the protected text + a restore() function that puts the spans
//     back after the caller has done whatever transformation it wanted
// ----------------------------------------------------------------------------

describe("protectInlineCode — round-trip", () => {
  it("restoring a protected text with no transformation reproduces the input", () => {
    const inputs = [
      "no code here at all",
      "one `simple` code span",
      "two `first` and `second` spans",
      "back-to-back `a``b` spans",
      "nothing but `code`",
      "empty input",
      "",
    ];
    for (const input of inputs) {
      const { protected: prot, restore } = protectInlineCode(input);
      expect(restore(prot)).toBe(input);
    }
  });
});

describe("protectInlineCode — placeholder semantics", () => {
  it("replaces single-backtick code spans with placeholders", () => {
    const { protected: prot, restore } = protectInlineCode("see `[[Link]]` here");
    expect(prot).not.toContain("[[Link]]");
    expect(prot).toContain("\x00CODE0\x00");
    expect(restore(prot)).toBe("see `[[Link]]` here");
  });

  it("preserves prose around the spans", () => {
    const { protected: prot } = protectInlineCode("alpha `code` beta `more` gamma");
    // The non-code text remains visible
    expect(prot.startsWith("alpha ")).toBe(true);
    expect(prot.includes(" beta ")).toBe(true);
    expect(prot.endsWith(" gamma")).toBe(true);
  });

  it("indexes placeholders 0, 1, 2 in document order", () => {
    const { protected: prot } = protectInlineCode("a `x` b `y` c `z` d");
    expect(prot).toContain("\x00CODE0\x00");
    expect(prot).toContain("\x00CODE1\x00");
    expect(prot).toContain("\x00CODE2\x00");
  });

  it("supports multi-backtick fences (e.g. ``code with `backtick` inside``)", () => {
    const input = "see ``a`b`` here";
    const { protected: prot, restore } = protectInlineCode(input);
    expect(prot).not.toContain("`b`");
    expect(restore(prot)).toBe(input);
  });

  it("does not match across newlines", () => {
    // Pythons regex was `[^`\n]+`+ — newlines in the body break the span.
    const input = "open `not\nclosed` end";
    const { protected: prot } = protectInlineCode(input);
    // Content with the embedded newline should NOT be replaced
    expect(prot).toContain("not\nclosed");
  });
});

describe("protectInlineCode — transformation safety", () => {
  it("transformations made on the protected text don't disturb code spans", () => {
    const { protected: prot, restore } = protectInlineCode(
      "live link [[A]] but `[[B]] in code` and [[C]]"
    );
    // Caller-style transform: replace [[X]] with X
    const transformed = prot.replace(/\[\[([^\]]+)\]\]/g, "$1");
    const restored = restore(transformed);
    // Code-span content is preserved verbatim
    expect(restored).toContain("`[[B]] in code`");
    // Live links were transformed
    expect(restored).toContain("live link A");
    expect(restored).toContain("and C");
  });
});

describe("protectInlineCode — adversarial / edge cases", () => {
  it("handles input with nothing but backticks gracefully", () => {
    const input = "```";
    // No valid inline code span (regex requires content between backticks).
    const { protected: prot, restore } = protectInlineCode(input);
    expect(restore(prot)).toBe(input);
  });

  it("does not match an empty span (`` ``)", () => {
    // Python regex `[^`\n]+ requires at least one non-backtick character.
    const input = "before `` after";
    const { protected: prot } = protectInlineCode(input);
    expect(prot).toBe(input);
  });

  it("treats unclosed backtick as literal text", () => {
    const { protected: prot } = protectInlineCode("dangling `unfinished");
    expect(prot).toBe("dangling `unfinished");
  });

  it("preserves Unicode content inside protected spans", () => {
    const input = "ref `café — naïve` end";
    const { protected: prot, restore } = protectInlineCode(input);
    expect(prot).not.toContain("café");
    expect(restore(prot)).toBe(input);
  });
});
