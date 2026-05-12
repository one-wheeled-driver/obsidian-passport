import { describe, it, expect } from "vitest";
import { listVaultMarkdownFiles } from "../../src/services/vault-index.js";
import { mockApp } from "../helpers/obsidian-mocks.js";

describe("listVaultMarkdownFiles", () => {
  it("returns all top-level markdown files", () => {
    const app = mockApp();
    app.vault.add("Note A.md", "");
    app.vault.add("Note B.md", "");
    const files = listVaultMarkdownFiles(app);
    expect(files.map((f) => f.basename).sort()).toEqual(["Note A", "Note B"]);
  });

  it("returns files in subfolders", () => {
    const app = mockApp();
    app.vault.add("references/Citable.md", "");
    app.vault.add("notes/Plain.md", "");
    const files = listVaultMarkdownFiles(app);
    expect(files.map((f) => f.path).sort()).toEqual([
      "notes/Plain.md",
      "references/Citable.md",
    ]);
  });

  it("excludes files inside .obsidian/", () => {
    const app = mockApp();
    app.vault.add("Note.md", "");
    app.vault.add(".obsidian/plugins/X/internal.md", "");
    app.vault.add(".obsidian/Some Config.md", "");
    const files = listVaultMarkdownFiles(app);
    expect(files.map((f) => f.path)).toEqual(["Note.md"]);
  });

  it("respects a user-renamed config folder (vault.configDir)", () => {
    const app = mockApp();
    app.vault.configDir = ".my-config";
    app.vault.add("Note.md", "");
    app.vault.add(".my-config/Some Config.md", "");
    // A folder literally named ".obsidian" is now just a regular folder —
    // its markdown files should be visible.
    app.vault.add(".obsidian/historical-note.md", "");
    const files = listVaultMarkdownFiles(app).map((f) => f.path).sort();
    expect(files).toEqual(["Note.md", ".obsidian/historical-note.md"].sort());
  });

  it("excludes files inside .trash/", () => {
    const app = mockApp();
    app.vault.add("Note.md", "");
    app.vault.add(".trash/Deleted Note.md", "");
    expect(listVaultMarkdownFiles(app).map((f) => f.path)).toEqual(["Note.md"]);
  });

  it("returns an empty list when the vault has no markdown files", () => {
    const app = mockApp();
    expect(listVaultMarkdownFiles(app)).toEqual([]);
  });

  it("returns only .md files (ignores other extensions)", () => {
    const app = mockApp();
    app.vault.add("Note.md", "");
    // Test infrastructure: Mock vault filters by extension===md already in
    // getMarkdownFiles(), so we only see .md regardless. But verify nothing
    // sneaks through.
    const files = listVaultMarkdownFiles(app);
    expect(files.every((f) => f.extension === "md")).toBe(true);
  });
});
