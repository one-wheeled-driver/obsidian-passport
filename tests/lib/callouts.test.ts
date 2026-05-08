import { describe, it, expect } from "vitest";
import { convertCallouts } from "../../src/lib/callouts.js";

// ----------------------------------------------------------------------------
// convertCallouts — port of convert_callouts (vault_passport.py:100-151)
// ----------------------------------------------------------------------------

describe("convertCallouts — TestCallouts.test_basic_with_title", () => {
  it("converts > [!NOTE] Title with body", () => {
    const out = convertCallouts("> [!NOTE] My Note\n> This is content\n");
    expect(out).toContain("\\begin{noteblock}");
    expect(out).toContain("**My Note**");
    expect(out).toContain("This is content");
    expect(out).toContain("\\end{noteblock}");
    expect(out).not.toMatch(/^> \[!/m);
  });
});

describe("convertCallouts — TestCallouts.test_default_title_from_type", () => {
  it("uses titlecased type when no explicit title given", () => {
    const out = convertCallouts("> [!WARNING]\n> Watch out!\n");
    expect(out).toContain("\\begin{warningblock}");
    expect(out).toContain("**Warning**");
    expect(out).toContain("Watch out!");
  });
});

describe("convertCallouts — TestCallouts.test_type_mapping (8 cases)", () => {
  const cases: Array<[string, string]> = [
    ["NOTE", "noteblock"],
    ["TIP", "tipblock"],
    ["WARNING", "warningblock"],
    ["DANGER", "cautionblock"],
    ["IMPORTANT", "noteblock"],
    ["SUCCESS", "tipblock"],
    ["BUG", "cautionblock"],
    ["QUESTION", "noteblock"],
  ];
  it.each(cases)("%s → %s", (type, env) => {
    const out = convertCallouts(`> [!${type}] Title\n> body\n`);
    expect(out).toContain(`\\begin{${env}}`);
  });
});

describe("convertCallouts — TestCallouts.test_unknown_type_falls_back", () => {
  it("unknown types map to noteblock, never producing a LaTeX error", () => {
    const out = convertCallouts("> [!MYCUSTOMTYPE] Title\n> body\n");
    expect(out).toContain("\\begin{noteblock}");
    expect(out).not.toContain("\\begin{mycustomtype}");
  });
});

describe("convertCallouts — fold modifiers", () => {
  it("strips the + fold modifier", () => {
    const out = convertCallouts("> [!TIP]+ Tip title\n> content\n");
    expect(out).toContain("\\begin{tipblock}");
    expect(out).toContain("**Tip title**");
    expect(out).not.toContain("[!TIP]+");
  });

  it("strips the - fold modifier", () => {
    const out = convertCallouts("> [!TIP]- Tip title\n> content\n");
    expect(out).toContain("\\begin{tipblock}");
    expect(out).toContain("**Tip title**");
    expect(out).not.toContain("[!TIP]-");
  });
});

describe("convertCallouts — body shapes", () => {
  it("handles a multiline body", () => {
    const out = convertCallouts(
      "> [!INFO] Details\n> Line one\n> Line two\n> Line three\n"
    );
    expect(out).toContain("Line one");
    expect(out).toContain("Line two");
    expect(out).toContain("Line three");
  });

  it("handles an empty body (header only)", () => {
    const out = convertCallouts("> [!NOTE] Just a header\n");
    expect(out).toContain("\\begin{noteblock}");
    expect(out).toContain("**Just a header**");
    expect(out).toContain("\\end{noteblock}");
  });

  it("preserves a blank line in the body (multi-paragraph)", () => {
    const out = convertCallouts(
      "> [!NOTE] Title\n> First paragraph\n>\n> Second paragraph\n"
    );
    expect(out).toContain("First paragraph");
    expect(out).toContain("Second paragraph");
  });
});

describe("convertCallouts — non-callout content untouched", () => {
  it("leaves regular blockquotes alone", () => {
    const input = "> This is a regular quote\n> Second line\n";
    const out = convertCallouts(input);
    expect(out).toContain("> This is a regular quote");
    expect(out).not.toContain("\\begin{");
  });

  it("leaves prose without any blockquotes alone", () => {
    const input = "Just some prose.\n\nAnother paragraph.\n";
    expect(convertCallouts(input)).toBe(input);
  });
});

describe("convertCallouts — multiple callouts in one document", () => {
  it("converts each callout independently", () => {
    const input =
      "> [!NOTE] First\n> body A\n\n> [!WARNING] Second\n> body B\n";
    const out = convertCallouts(input);
    expect(out).toContain("\\begin{noteblock}");
    expect(out).toContain("\\begin{warningblock}");
    expect(out).toContain("body A");
    expect(out).toContain("body B");
  });
});

describe("convertCallouts — code-fence protection", () => {
  it("does NOT convert callouts inside a fenced code block", () => {
    const input =
      "```markdown\n> [!NOTE] Inside Code\n> not a real callout\n```\n";
    const out = convertCallouts(input);
    expect(out).not.toContain("\\begin{noteblock}");
    expect(out).toContain("> [!NOTE] Inside Code");
  });

  it("converts callouts outside but not inside a code block in the same doc", () => {
    const input =
      "> [!NOTE] Outside\n> real callout\n\n```\n> [!NOTE] Inside\n```\n";
    const out = convertCallouts(input);
    expect(out).toContain("\\begin{noteblock}");
    // Only one block transformed; the inside-code callout is preserved
    const begins = out.match(/\\begin{noteblock}/g) ?? [];
    expect(begins).toHaveLength(1);
    expect(out).toContain("> [!NOTE] Inside");
  });
});

describe("convertCallouts — adversarial cases", () => {
  it("type names are lowercased before lookup (mixed case works)", () => {
    expect(convertCallouts("> [!Note] X\n> y\n")).toContain("\\begin{noteblock}");
    expect(convertCallouts("> [!nOtE] X\n> y\n")).toContain("\\begin{noteblock}");
    expect(convertCallouts("> [!note] X\n> y\n")).toContain("\\begin{noteblock}");
  });

  it("preserves wikilinks inside the callout body for downstream link conversion", () => {
    const out = convertCallouts(
      "> [!NOTE] References\n> See [[Citable Note]] for details.\n"
    );
    // The wikilink survives; convertLinksToCitations will handle it later.
    expect(out).toContain("[[Citable Note]]");
  });

  it("trims surrounding whitespace from the explicit title", () => {
    const out = convertCallouts("> [!NOTE]   Spaced Title   \n> body\n");
    expect(out).toContain("**Spaced Title**");
    expect(out).not.toContain("**   Spaced Title");
  });

  it("returns input verbatim when the document is empty", () => {
    expect(convertCallouts("")).toBe("");
  });

  it("emits the awesomebox environment in raw-LaTeX fences pandoc can pass through", () => {
    const out = convertCallouts("> [!NOTE] Title\n> body\n");
    expect(out).toContain("```{=latex}");
  });
});
