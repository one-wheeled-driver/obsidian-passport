import { describe, it, expect } from "vitest";
import { findLinkedNotes } from "../../src/pipeline/find-linked-notes.js";
import { mockApp } from "../helpers/obsidian-mocks.js";

const SOURCE = "test-doc.md";

describe("findLinkedNotes — citable notes (with explicit cite-key)", () => {
  it("collects metadata for a basic [[Citable Note]]", async () => {
    const app = mockApp();
    app.vault.add("Citable Note.md", "", {
      "cite-key": "citable2024",
      author: "Doe, Jane",
      title: "A Citable Study",
      year: 2024,
      type: "article",
    });
    const { metadata, issues } = await findLinkedNotes(
      app,
      "See [[Citable Note]] for details.",
      SOURCE
    );
    expect(issues).toEqual([]);
    expect(metadata["Citable Note"]).toEqual({
      "cite-key": "citable2024",
      author: "Doe, Jane",
      title: "A Citable Study",
      year: 2024,
      type: "article",
    });
  });

  it("deduplicates multiple links to the same note", async () => {
    const app = mockApp();
    app.vault.add("Note.md", "", { "cite-key": "k", title: "T" });
    const { metadata } = await findLinkedNotes(
      app,
      "[[Note]] [[Note]] [[Note]]",
      SOURCE
    );
    expect(Object.keys(metadata)).toEqual(["Note"]);
  });

  it("strips the leading ! from transclusions and treats them as the same note", async () => {
    const app = mockApp();
    app.vault.add("Note.md", "", { "cite-key": "k", title: "T" });
    const { metadata } = await findLinkedNotes(
      app,
      "Inline: [[Note]]\nTransclude: ![[Note]]",
      SOURCE
    );
    expect(Object.keys(metadata)).toEqual(["Note"]);
  });
});

describe("findLinkedNotes — auto-cite-key (Python parity)", () => {
  it("auto-derives cite-key from note name when frontmatter is absent", async () => {
    const app = mockApp();
    app.vault.add("No Cite Note.md", "Body without YAML.", null);
    const { metadata, issues } = await findLinkedNotes(
      app,
      "[[No Cite Note]]",
      SOURCE
    );
    expect(issues).toEqual([]);
    expect(metadata["No Cite Note"]?.["cite-key"]).toBe("no-cite-note");
    expect(metadata["No Cite Note"]?.["title"]).toBe("No Cite Note");
  });

  it("auto-derives cite-key when frontmatter exists but lacks cite-key", async () => {
    const app = mockApp();
    app.vault.add("No Cite Note.md", "", {
      title: "Just a Regular Note",
      author: "Smith, Bob",
    });
    const { metadata } = await findLinkedNotes(app, "[[No Cite Note]]", SOURCE);
    expect(metadata["No Cite Note"]?.["cite-key"]).toBe("no-cite-note");
    // Existing title is preserved
    expect(metadata["No Cite Note"]?.["title"]).toBe("Just a Regular Note");
    expect(metadata["No Cite Note"]?.["author"]).toBe("Smith, Bob");
  });
});

describe("findLinkedNotes — missing notes", () => {
  it("records a 'file_not_found' issue for an unresolvable link", async () => {
    const app = mockApp();
    const { metadata, issues } = await findLinkedNotes(
      app,
      "See [[Ghost Note]] here.",
      SOURCE
    );
    expect(metadata).toEqual({});
    expect(issues).toEqual([{ type: "file_not_found", note: "Ghost Note" }]);
  });

  it("aborts with SystemExit-equivalent when strict=true and a note is missing", async () => {
    const app = mockApp();
    await expect(
      findLinkedNotes(app, "[[Ghost]]", SOURCE, { strict: true })
    ).rejects.toThrow(/not found in vault|Ghost/i);
  });

  it("does not abort in strict mode when all notes resolve", async () => {
    const app = mockApp();
    app.vault.add("Real.md", "", { "cite-key": "real", title: "Real" });
    const { metadata } = await findLinkedNotes(
      app,
      "[[Real]]",
      SOURCE,
      { strict: true }
    );
    expect(metadata["Real"]?.["cite-key"]).toBe("real");
  });
});

describe("findLinkedNotes — sidecar PDFs", () => {
  it("uses an adjacent .md sidecar's frontmatter for ![[paper.pdf]]", async () => {
    const app = mockApp();
    app.vault.add("Sidecar Paper.md", "", {
      "cite-key": "sidecar2023",
      title: "Sidecar Reference",
      type: "misc",
    });
    const { metadata } = await findLinkedNotes(
      app,
      "Paper: ![[Sidecar Paper.pdf]]",
      SOURCE
    );
    expect(metadata["Sidecar Paper.pdf"]?.["cite-key"]).toBe("sidecar2023");
  });

  it("auto-derives cite-key for a sidecar without an explicit cite-key", async () => {
    const app = mockApp();
    app.vault.add("Some Doc.md", "", { title: "no cite key here" });
    const { metadata } = await findLinkedNotes(
      app,
      "![[Some Doc.pdf]]",
      SOURCE
    );
    expect(metadata["Some Doc.pdf"]?.["cite-key"]).toBe("some-doc");
  });

  it("does not register an embed without a sidecar (caller handles fallback)", async () => {
    const app = mockApp();
    const { metadata } = await findLinkedNotes(
      app,
      "![[Orphan.pdf]]",
      SOURCE
    );
    expect(metadata["Orphan.pdf"]).toBeUndefined();
  });
});

describe("findLinkedNotes — image embeds", () => {
  it("ignores image embeds (handled later by convert-links)", async () => {
    const app = mockApp();
    const { metadata, issues } = await findLinkedNotes(
      app,
      "![[image.png]]",
      SOURCE
    );
    expect(metadata).toEqual({});
    expect(issues).toEqual([]);
  });
});

describe("findLinkedNotes — code-block protection", () => {
  it("does not see wikilinks inside fenced code blocks", async () => {
    const app = mockApp();
    app.vault.add("Real.md", "", { "cite-key": "k", title: "Real" });
    const input = "[[Real]]\n```\n[[Inside Code]]\n```\n";
    const { metadata, issues } = await findLinkedNotes(app, input, SOURCE);
    expect(Object.keys(metadata)).toEqual(["Real"]);
    expect(issues).toEqual([]);
  });

  it("does not see wikilinks inside inline code spans", async () => {
    const app = mockApp();
    app.vault.add("Real.md", "", { "cite-key": "k", title: "Real" });
    const input = "[[Real]] and `[[Inside Code]]` here.";
    const { metadata, issues } = await findLinkedNotes(app, input, SOURCE);
    expect(Object.keys(metadata)).toEqual(["Real"]);
    expect(issues).toEqual([]);
  });
});

describe("findLinkedNotes — link variants all collapse to the note name", () => {
  it("[[Note#Heading]] is registered under the note name", async () => {
    const app = mockApp();
    app.vault.add("Note.md", "", { "cite-key": "k", title: "T" });
    const { metadata } = await findLinkedNotes(
      app,
      "See [[Note#Heading]]",
      SOURCE
    );
    expect(Object.keys(metadata)).toEqual(["Note"]);
  });

  it("[[Note#^block-id|alias]] is registered under the note name", async () => {
    const app = mockApp();
    app.vault.add("Note.md", "", { "cite-key": "k", title: "T" });
    const { metadata } = await findLinkedNotes(
      app,
      "See [[Note#^abc|alias]]",
      SOURCE
    );
    expect(Object.keys(metadata)).toEqual(["Note"]);
  });
});
