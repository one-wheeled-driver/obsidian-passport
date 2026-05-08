import { describe, it, expect } from "vitest";
import { readNoteMetadata } from "../../src/services/metadata-reader.js";
import { mockApp } from "../helpers/obsidian-mocks.js";

describe("readNoteMetadata", () => {
  it("returns frontmatter from the metadata cache when available", async () => {
    const app = mockApp();
    const file = app.vault.add("Note.md", "ignored body", {
      "cite-key": "explicit2024",
      title: "From Cache",
    });
    const out = await readNoteMetadata(app, file);
    expect(out).toEqual({ "cite-key": "explicit2024", title: "From Cache" });
  });

  it("falls back to gray-matter parsing when the cache has no frontmatter", async () => {
    const app = mockApp();
    const file = app.vault.add(
      "Note.md",
      "---\ncite-key: parsed2024\ntitle: From File\n---\nbody",
      null // null means cache will return { frontmatter: null }
    );
    const out = await readNoteMetadata(app, file);
    expect(out).toEqual({ "cite-key": "parsed2024", title: "From File" });
  });

  it("returns null for a note with no frontmatter at all", async () => {
    const app = mockApp();
    const file = app.vault.add("Note.md", "Just some prose, no YAML.", null);
    const out = await readNoteMetadata(app, file);
    expect(out).toBeNull();
  });

  it("returns null when malformed YAML is in the file", async () => {
    const app = mockApp();
    const file = app.vault.add("Note.md", "---\ntitle: \"unclosed\nx\n---\nbody", null);
    const out = await readNoteMetadata(app, file);
    expect(out).toBeNull();
  });

  it("prefers the cache over file content when both are available", async () => {
    const app = mockApp();
    const file = app.vault.add(
      "Note.md",
      "---\ncite-key: from-file\n---\nbody",
      { "cite-key": "from-cache" }
    );
    const out = await readNoteMetadata(app, file);
    expect(out?.["cite-key"]).toBe("from-cache");
  });
});
