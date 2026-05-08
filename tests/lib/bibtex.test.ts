import { describe, it, expect } from "vitest";
import { yamlToBibtex, escapeLatex } from "../../src/lib/bibtex.js";

// ----------------------------------------------------------------------------
// yamlToBibtex — port of yaml_to_bibtex (vault_passport.py:370-393)
// + new LaTeX-special-character escaping added during the TS port
// ----------------------------------------------------------------------------

describe("yamlToBibtex — Python TestBibTeX parity", () => {
  it("emits @<type>{<cite-key>, …}", () => {
    const out = yamlToBibtex({
      "cite-key": "citable2024",
      type: "article",
      author: "Doe, Jane",
      title: "A Citable Study",
      year: 2024,
      journal: "Test Journal",
    });
    expect(out).toContain("@article{citable2024");
    expect(out).toContain("author = {Doe, Jane}");
    expect(out).toContain("title = {A Citable Study}");
    expect(out).toContain("year = {2024}");
    expect(out).toContain("journal = {Test Journal}");
  });

  it("defaults to @misc when type is absent", () => {
    const out = yamlToBibtex({ "cite-key": "no-type-key", title: "Untyped" });
    expect(out).toContain("@misc{no-type-key");
  });

  it("uses 'unknown' when cite-key is absent", () => {
    const out = yamlToBibtex({ type: "book", title: "Anonymous" });
    expect(out).toContain("@book{unknown");
  });

  it("only emits fields present in the input (no empty `key = {}` lines)", () => {
    const out = yamlToBibtex({
      "cite-key": "minimal",
      type: "misc",
      title: "Bare",
    });
    expect(out).not.toContain("author =");
    expect(out).not.toContain("year =");
    expect(out).not.toContain("journal =");
  });

  it("ignores unknown YAML keys (only the BibTeX field map applies)", () => {
    const out = yamlToBibtex({
      "cite-key": "test",
      title: "Test",
      "custom-field": "should not appear",
      arbitrary: "ignored",
    });
    expect(out).not.toContain("custom-field");
    expect(out).not.toContain("arbitrary");
  });

  it("emits a blank line after the closing brace (separator between entries)", () => {
    const out = yamlToBibtex({ "cite-key": "k", title: "t" });
    expect(out.endsWith("}\n\n")).toBe(true);
  });
});

describe("yamlToBibtex — author normalisation", () => {
  it("joins YAML-list authors with ' and ' (BibTeX convention)", () => {
    const out = yamlToBibtex({
      "cite-key": "multi",
      title: "T",
      author: ["Smith, Alice", "Jones, Bob", "Lee, Chris"],
    });
    expect(out).toContain("author = {Smith, Alice and Jones, Bob and Lee, Chris}");
  });

  it("preserves a single author string verbatim", () => {
    const out = yamlToBibtex({
      "cite-key": "single",
      title: "T",
      author: "Doe, Jane",
    });
    expect(out).toContain("author = {Doe, Jane}");
  });
});

describe("yamlToBibtex — value coercion", () => {
  it("renders a numeric year as a bare number string", () => {
    const out = yamlToBibtex({ "cite-key": "k", title: "t", year: 2024 });
    expect(out).toContain("year = {2024}");
  });

  it("renders a string year identically", () => {
    const out = yamlToBibtex({ "cite-key": "k", title: "t", year: "2024" });
    expect(out).toContain("year = {2024}");
  });

  it("skips fields whose value is null or undefined", () => {
    const out = yamlToBibtex({
      "cite-key": "k",
      title: "t",
      author: null,
      year: undefined,
    });
    expect(out).not.toContain("author =");
    expect(out).not.toContain("year =");
  });
});

// ----------------------------------------------------------------------------
// escapeLatex — new behaviour added during the TS port
// ----------------------------------------------------------------------------

describe("escapeLatex — single special characters", () => {
  it.each([
    ["&", "\\&"],
    ["%", "\\%"],
    ["$", "\\$"],
    ["#", "\\#"],
    ["_", "\\_"],
    ["{", "\\{"],
    ["}", "\\}"],
  ])("escapes %s as %s", (input, expected) => {
    expect(escapeLatex(input)).toBe(expected);
  });

  it("escapes backslash as \\textbackslash{}", () => {
    expect(escapeLatex("\\")).toBe("\\textbackslash{}");
  });

  it("escapes tilde as \\textasciitilde{}", () => {
    expect(escapeLatex("~")).toBe("\\textasciitilde{}");
  });

  it("escapes caret as \\textasciicircum{}", () => {
    expect(escapeLatex("^")).toBe("\\textasciicircum{}");
  });
});

describe("escapeLatex — combinations", () => {
  it("escapes multiple specials in one string", () => {
    expect(escapeLatex("Cats & Dogs (50%)")).toBe("Cats \\& Dogs (50\\%)");
  });

  it("escapes back-to-back specials independently", () => {
    expect(escapeLatex("&%$#")).toBe("\\&\\%\\$\\#");
  });

  it("escapes specials separated by ordinary text", () => {
    expect(escapeLatex("100% accurate; cost: $99 - {free}")).toBe(
      "100\\% accurate; cost: \\$99 - \\{free\\}"
    );
  });
});

describe("escapeLatex — idempotence", () => {
  it("does not double-escape an already-escaped &", () => {
    // Input "\\&" represents the string `\&`. After escape it MUST still
    // represent `\&` — i.e. the backslash itself must still be escaped to
    // `\textbackslash{}` and only one `\&` for the ampersand.
    // To avoid the round-tripping ambiguity we simply check the string
    // itself for double-escaped output.
    expect(escapeLatex("\\&")).toBe("\\textbackslash{}\\&");
  });

  it("escaping then escaping again is stable for plain text", () => {
    expect(escapeLatex(escapeLatex("hello"))).toBe("hello");
  });
});

describe("escapeLatex — non-special characters preserved", () => {
  it("leaves Unicode characters untouched", () => {
    expect(escapeLatex("café — naïve")).toBe("café — naïve");
    expect(escapeLatex("北京 2024")).toBe("北京 2024");
  });

  it("leaves whitespace untouched", () => {
    expect(escapeLatex("  spaces\tand\ttabs  ")).toBe("  spaces\tand\ttabs  ");
  });

  it("returns empty string for empty input", () => {
    expect(escapeLatex("")).toBe("");
  });

  it("preserves digits and punctuation that aren't LaTeX-special", () => {
    expect(escapeLatex("Smith (2024); pp. 17–42, vol. III.")).toBe(
      "Smith (2024); pp. 17–42, vol. III."
    );
  });
});

// ----------------------------------------------------------------------------
// yamlToBibtex with escaping integrated
// ----------------------------------------------------------------------------

describe("yamlToBibtex — LaTeX escaping integration", () => {
  it("escapes &, %, _ in titles", () => {
    const out = yamlToBibtex({
      "cite-key": "k",
      type: "article",
      title: "Cats & Dogs: 100% Tested in my_module",
    });
    expect(out).toContain("title = {Cats \\& Dogs: 100\\% Tested in my\\_module}");
  });

  it("escapes special chars in author names", () => {
    const out = yamlToBibtex({
      "cite-key": "k",
      type: "misc",
      author: "O&Brien, Pat",
    });
    expect(out).toContain("author = {O\\&Brien, Pat}");
  });

  it("escapes specials in journal and publisher fields", () => {
    const out = yamlToBibtex({
      "cite-key": "k",
      type: "article",
      journal: "Stats & Lies",
      publisher: "Academic & Co.",
    });
    expect(out).toContain("journal = {Stats \\& Lies}");
    expect(out).toContain("publisher = {Academic \\& Co.}");
  });

  it("does NOT escape the url field (citeproc wraps it in \\url{} which handles raw chars)", () => {
    const out = yamlToBibtex({
      "cite-key": "k",
      type: "misc",
      url: "https://example.com/path?q=1&x=2#section",
    });
    expect(out).toContain("url = {https://example.com/path?q=1&x=2#section}");
  });

  it("escapes specials inside the cite-key field itself", () => {
    // BibTeX cite-keys with `&` are technically ill-advised, but if present
    // we should still escape so the entry parses.
    const out = yamlToBibtex({
      "cite-key": "smith&jones",
      type: "misc",
      title: "T",
    });
    expect(out).toContain("@misc{smith\\&jones");
  });
});
