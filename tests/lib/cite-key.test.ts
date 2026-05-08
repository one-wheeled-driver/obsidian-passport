import { describe, it, expect } from "vitest";
import { noteNameToCiteKey, ensureCitable } from "../../src/lib/cite-key.js";

// ----------------------------------------------------------------------------
// noteNameToCiteKey — port of _note_name_to_cite_key (vault_passport.py:219)
// ----------------------------------------------------------------------------

describe("noteNameToCiteKey — Python parity", () => {
  it("lowercases and replaces non-alphanumeric runs with single hyphens", () => {
    expect(noteNameToCiteKey("Behavioral Economics Review")).toBe(
      "behavioral-economics-review"
    );
  });

  it("collapses parentheses and punctuation into hyphens", () => {
    expect(noteNameToCiteKey("Urban Mobility (2024)")).toBe("urban-mobility-2024");
  });

  it("strips leading and trailing hyphens", () => {
    expect(noteNameToCiteKey("---")).toBe("note");
    expect(noteNameToCiteKey("__hello__")).toBe("hello");
  });

  it("returns 'note' as a fallback when nothing alphanumeric remains", () => {
    expect(noteNameToCiteKey("@@@")).toBe("note");
    expect(noteNameToCiteKey("")).toBe("note");
    expect(noteNameToCiteKey("   ")).toBe("note");
  });
});

describe("noteNameToCiteKey — adversarial cases", () => {
  it("preserves leading digits (BibTeX keys may start with a digit)", () => {
    expect(noteNameToCiteKey("123 Smith")).toBe("123-smith");
    expect(noteNameToCiteKey("2024")).toBe("2024");
  });

  it("collapses multiple consecutive separators into one hyphen", () => {
    expect(noteNameToCiteKey("Smith   Jones")).toBe("smith-jones");
    expect(noteNameToCiteKey("Note --- Title")).toBe("note-title");
  });

  it("normalises mixed-case identically to all-lowercase / all-uppercase", () => {
    expect(noteNameToCiteKey("CamelCase")).toBe("camelcase");
    expect(noteNameToCiteKey("ALLCAPS")).toBe("allcaps");
    expect(noteNameToCiteKey("ALLCAPS")).toBe(noteNameToCiteKey("allcaps"));
  });

  it("strips characters outside [a-z0-9] including accented letters", () => {
    // Decision: the Python regex [^a-z0-9]+ collapses non-ASCII letters away.
    // We preserve that exact behaviour so cite-keys are pure ASCII and
    // BibTeX-safe even in vaults full of non-Latin notes.
    // Note: only the accented char itself is stripped; surrounding ASCII
    // letters (the leading "m" of "Müller") become their own segment.
    expect(noteNameToCiteKey("Müller 2023")).toBe("m-ller-2023");
    expect(noteNameToCiteKey("Café")).toBe("caf");
    expect(noteNameToCiteKey("北京")).toBe("note");
  });

  it("treats two notes that differ only in case as colliding (documented)", () => {
    expect(noteNameToCiteKey("My Note")).toBe(noteNameToCiteKey("my note"));
    expect(noteNameToCiteKey("My Note")).toBe(noteNameToCiteKey("MY NOTE"));
  });

  it("strips emoji and symbols", () => {
    expect(noteNameToCiteKey("Report 🎯 2024")).toBe("report-2024");
  });

  it("handles dotted filenames as separators", () => {
    expect(noteNameToCiteKey("Smith.v2.draft")).toBe("smith-v2-draft");
  });

  it("preserves digits-only identifiers", () => {
    expect(noteNameToCiteKey("2024")).toBe("2024");
  });

  it("keeps ASCII-only segments after stripping accents", () => {
    // "Müller and Smith" → "müller and smith" → strip ü → "m-ller-and-smith"
    expect(noteNameToCiteKey("Müller and Smith")).toBe("m-ller-and-smith");
  });
});

// ----------------------------------------------------------------------------
// ensureCitable — port of _ensure_citable (vault_passport.py:231-242)
// ----------------------------------------------------------------------------

describe("ensureCitable", () => {
  it("derives cite-key and title from noteName when both are absent", () => {
    expect(ensureCitable(null, "Behavioral Economics Review")).toEqual({
      "cite-key": "behavioral-economics-review",
      title: "Behavioral Economics Review",
    });
  });

  it("preserves explicit cite-key", () => {
    const out = ensureCitable({ "cite-key": "explicit2024" }, "My Note");
    expect(out["cite-key"]).toBe("explicit2024");
  });

  it("preserves explicit title", () => {
    const out = ensureCitable({ title: "A Different Title" }, "My Note");
    expect(out["title"]).toBe("A Different Title");
  });

  it("derives only the missing field, leaving the other untouched", () => {
    const out = ensureCitable({ title: "Custom Title" }, "Note Name");
    expect(out["cite-key"]).toBe("note-name");
    expect(out["title"]).toBe("Custom Title");
  });

  it("does not mutate the input object", () => {
    const input: Record<string, unknown> = { author: "Smith" };
    const before = JSON.stringify(input);
    ensureCitable(input, "Note");
    expect(JSON.stringify(input)).toBe(before);
  });

  it("preserves all unrelated fields verbatim", () => {
    const input = {
      author: "Smith, Bob",
      year: 2024,
      type: "article",
      journal: "Test Journal",
    };
    const out = ensureCitable(input, "Note");
    expect(out["author"]).toBe("Smith, Bob");
    expect(out["year"]).toBe(2024);
    expect(out["type"]).toBe("article");
    expect(out["journal"]).toBe("Test Journal");
  });

  it("treats undefined input identically to null", () => {
    expect(ensureCitable(undefined, "Note")).toEqual({
      "cite-key": "note",
      title: "Note",
    });
  });
});
