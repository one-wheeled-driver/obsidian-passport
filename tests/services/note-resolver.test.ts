import { describe, it, expect } from "vitest";
import { resolveNote } from "../../src/services/note-resolver.js";
import { mockApp } from "../helpers/obsidian-mocks.js";

describe("resolveNote", () => {
  it("resolves a top-level file by basename", () => {
    const app = mockApp();
    app.vault.add("Citable Note.md", "");
    const file = resolveNote(app, "Citable Note", "main.md");
    expect(file?.path).toBe("Citable Note.md");
  });

  it("resolves a file in a subfolder by basename (Obsidian shortest-path)", () => {
    const app = mockApp();
    app.vault.add("references/Citable Note.md", "");
    const file = resolveNote(app, "Citable Note", "main.md");
    expect(file?.path).toBe("references/Citable Note.md");
  });

  it("resolves a fully-qualified vault-relative path", () => {
    const app = mockApp();
    app.vault.add("references/Citable Note.md", "");
    app.vault.add("Citable Note.md", "");
    // Both exist; the qualified path should pick the references/ one.
    const file = resolveNote(app, "references/Citable Note", "main.md");
    expect(file?.path).toBe("references/Citable Note.md");
  });

  it("returns null for a nonexistent note", () => {
    const app = mockApp();
    expect(resolveNote(app, "Ghost", "main.md")).toBeNull();
  });

  it("strips a trailing .md extension before resolving", () => {
    const app = mockApp();
    app.vault.add("Note.md", "");
    expect(resolveNote(app, "Note.md", "main.md")?.path).toBe("Note.md");
  });

  it("ignores .obsidian/ files (those are excluded from the index)", () => {
    const app = mockApp();
    // Even though the mock would find this by basename, services should
    // never return notes from `.obsidian/`.
    app.vault.add(".obsidian/Some Config.md", "");
    expect(resolveNote(app, "Some Config", "main.md")).toBeNull();
  });

  it("returns the first match when multiple files share a basename", () => {
    const app = mockApp();
    const first = app.vault.add("folderA/Dup.md", "");
    app.vault.add("folderB/Dup.md", "");
    expect(resolveNote(app, "Dup", "main.md")?.path).toBe(first.path);
  });
});
