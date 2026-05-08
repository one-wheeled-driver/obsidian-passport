import { describe, it, expect } from "vitest";
import {
  extractYaml,
  injectAwesomebox,
  resolveLogoPaths,
} from "../../src/lib/frontmatter.js";

// ----------------------------------------------------------------------------
// extractYaml — port of extract_yaml_from_note (vault_passport.py:245-254)
// + reads frontmatter from a content string instead of a file path
// ----------------------------------------------------------------------------

describe("extractYaml — basic parsing", () => {
  it("returns null when there is no frontmatter", () => {
    expect(extractYaml("# Just a heading\nContent here.\n")).toBeNull();
  });

  it("returns null when content is empty", () => {
    expect(extractYaml("")).toBeNull();
  });

  it("parses a simple frontmatter block", () => {
    const out = extractYaml(`---
cite-key: smith2024
author: Smith, John
year: 2024
---

Body content.
`);
    expect(out).toEqual({
      "cite-key": "smith2024",
      author: "Smith, John",
      year: 2024,
    });
  });

  it("preserves quoted strings", () => {
    const out = extractYaml(`---
title: "Cats & Dogs: 100% True"
---

Body
`);
    expect(out?.["title"]).toBe("Cats & Dogs: 100% True");
  });

  it("returns {} for a frontmatter block with a blank body", () => {
    // Note: Python's regex `^---\n(.*?)\n---\n` requires a newline BEFORE
    // the closing ---, so a truly empty `---\n---\n` (no blank line) does
    // not match. The minimum valid empty block is `---\n\n---\n`.
    const out = extractYaml("---\n\n---\nBody\n");
    expect(out).toEqual({});
  });

  it("returns null for a malformed `---\\n---\\n` block (no body separator)", () => {
    // Confirms parity with Python's regex: this shape is not valid frontmatter.
    expect(extractYaml("---\n---\nBody\n")).toBeNull();
  });
});

describe("extractYaml — adversarial / edge cases", () => {
  it("returns null when the opening --- is not on the very first line", () => {
    // Python's regex anchors with ^---\n so leading whitespace/text disqualifies
    expect(extractYaml(" ---\ncite-key: x\n---\nbody")).toBeNull();
    expect(extractYaml("\n---\ncite-key: x\n---\nbody")).toBeNull();
  });

  it("returns null when there is no closing ---", () => {
    expect(extractYaml("---\ncite-key: x\nbody without close")).toBeNull();
  });

  it("ignores frontmatter that appears later in the document", () => {
    const out = extractYaml(`# heading

---
cite-key: late
---
`);
    expect(out).toBeNull();
  });

  it("handles CRLF line endings", () => {
    const out = extractYaml(
      "---\r\ncite-key: crlf\r\nauthor: A\r\n---\r\n\r\nBody\r\n"
    );
    expect(out?.["cite-key"]).toBe("crlf");
  });

  it("returns null on malformed YAML rather than throwing", () => {
    // Unclosed string, invalid mapping
    const result = extractYaml(`---
title: "unclosed
year: 2024
---

body
`);
    // gray-matter throws on bad YAML; we wrap and return null
    expect(result).toBeNull();
  });

  it("preserves numeric, boolean, and null values verbatim", () => {
    const out = extractYaml(`---
year: 2024
draft: true
abandoned: false
deadline: null
---
`);
    expect(out?.["year"]).toBe(2024);
    expect(out?.["draft"]).toBe(true);
    expect(out?.["abandoned"]).toBe(false);
    expect(out?.["deadline"]).toBeNull();
  });

  it("preserves YAML-list values", () => {
    const out = extractYaml(`---
author:
  - Smith, A
  - Jones, B
---
`);
    expect(out?.["author"]).toEqual(["Smith, A", "Jones, B"]);
  });

  it("strips a UTF-8 BOM before the first ---", () => {
    const out = extractYaml("﻿---\ncite-key: bom\n---\nbody");
    expect(out?.["cite-key"]).toBe("bom");
  });
});

// ----------------------------------------------------------------------------
// injectAwesomebox — port of _inject_awesomebox (vault_passport.py:446-459)
// ----------------------------------------------------------------------------

describe("injectAwesomebox", () => {
  it("adds \\usepackage{awesomebox} to header-includes when key is missing", () => {
    const yaml = injectAwesomebox({ title: "T" });
    expect(yaml["header-includes"]).toEqual(["\\usepackage{awesomebox}"]);
  });

  it("appends to an existing string-valued header-includes (normalising to list)", () => {
    const yaml = injectAwesomebox({
      "header-includes": "\\usepackage{xcolor}",
    });
    expect(yaml["header-includes"]).toEqual([
      "\\usepackage{xcolor}",
      "\\usepackage{awesomebox}",
    ]);
  });

  it("appends to an existing list-valued header-includes", () => {
    const yaml = injectAwesomebox({
      "header-includes": ["\\usepackage{xcolor}", "\\usepackage{geometry}"],
    });
    expect(yaml["header-includes"]).toEqual([
      "\\usepackage{xcolor}",
      "\\usepackage{geometry}",
      "\\usepackage{awesomebox}",
    ]);
  });

  it("does not duplicate awesomebox when already present (idempotent)", () => {
    const yaml = injectAwesomebox({
      "header-includes": ["\\usepackage{awesomebox}"],
    });
    expect(yaml["header-includes"]).toEqual(["\\usepackage{awesomebox}"]);
  });

  it("does not detect awesomebox in a string when it's not the full value", () => {
    // "\\usepackage{awesomeboxhelper}" contains "awesomebox" but is a different package.
    // The Python implementation just checks the exact string presence in the list,
    // so this returns identical behaviour: it would NOT be detected and we'd append.
    const yaml = injectAwesomebox({
      "header-includes": ["\\usepackage{awesomeboxhelper}"],
    });
    expect(yaml["header-includes"]).toEqual([
      "\\usepackage{awesomeboxhelper}",
      "\\usepackage{awesomebox}",
    ]);
  });

  it("does not mutate the input object", () => {
    const input: Record<string, unknown> = {};
    injectAwesomebox(input);
    expect(input).toEqual({});
  });
});

// ----------------------------------------------------------------------------
// resolveLogoPaths — port of logo path resolution
// (TestLogoPathResolution + vault_passport.py:660ish)
// ----------------------------------------------------------------------------

describe("resolveLogoPaths", () => {
  const vaultRoot = "/path/to/vault";

  it("rewrites relative titlepage-logo to absolute (vault-relative)", () => {
    const out = resolveLogoPaths(
      { "titlepage-logo": "assets/logo.png" },
      vaultRoot
    );
    expect(out["titlepage-logo"]).toBe("/path/to/vault/assets/logo.png");
  });

  it("rewrites relative logo to absolute", () => {
    const out = resolveLogoPaths({ logo: "logo.png" }, vaultRoot);
    expect(out["logo"]).toBe("/path/to/vault/logo.png");
  });

  it("leaves absolute paths untouched", () => {
    const out = resolveLogoPaths(
      {
        "titlepage-logo": "/abs/path/logo.png",
        logo: "/another/abs/logo.png",
      },
      vaultRoot
    );
    expect(out["titlepage-logo"]).toBe("/abs/path/logo.png");
    expect(out["logo"]).toBe("/another/abs/logo.png");
  });

  it("leaves the input untouched when neither logo key is present", () => {
    const input = { title: "T", author: "A" };
    expect(resolveLogoPaths(input, vaultRoot)).toEqual(input);
  });

  it("ignores non-string logo values gracefully", () => {
    const out = resolveLogoPaths(
      { "titlepage-logo": 42 as unknown as string },
      vaultRoot
    );
    expect(out["titlepage-logo"]).toBe(42);
  });

  it("does not mutate the input object", () => {
    const input: Record<string, unknown> = { logo: "logo.png" };
    resolveLogoPaths(input, vaultRoot);
    expect(input["logo"]).toBe("logo.png");
  });
});
