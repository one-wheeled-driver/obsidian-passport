import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const { runPandocMock } = vi.hoisted(() => ({
  runPandocMock: vi.fn(),
}));
vi.mock("../../src/services/docker-runner.js", () => ({
  runPandoc: runPandocMock,
}));

import { processDocument } from "../../src/pipeline/process-document.js";
import { mockApp, makeMockFile } from "../helpers/obsidian-mocks.js";

let tmpRoot: string;
let buildDir: string;
let inputPath: string;
let pdfTarget: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vp-pipe-"));
  buildDir = path.join(tmpRoot, "build");
  inputPath = path.join(tmpRoot, "doc.md");
  pdfTarget = path.join(tmpRoot, "doc.pdf");
  await fs.mkdir(buildDir, { recursive: true });
  runPandocMock.mockReset();
  runPandocMock.mockResolvedValue(pdfTarget);
});

describe("processDocument — happy path", () => {
  it("writes the intermediate markdown and bib files to buildDir", async () => {
    const app = mockApp();
    app.vault.add("Citable.md", "", {
      "cite-key": "k2024",
      type: "article",
      title: "Citable Title",
    });
    await fs.writeFile(inputPath, "See [[Citable]] for context.\n");

    const result = await processDocument({
      app,
      input: makeMockFile("doc.md"),
      vaultPath: tmpRoot,
      buildDir,
      pdfPath: pdfTarget,
    });

    expect(result.bibPath).toBe(path.join(buildDir, "references.bib"));
    expect(result.mdPath).toBe(path.join(buildDir, "doc.md"));
    expect(result.pdfPath).toBe(pdfTarget);

    const bib = await fs.readFile(result.bibPath, "utf8");
    expect(bib).toContain("@article{k2024,");
    expect(bib).toContain("title = {Citable Title}");

    const md = await fs.readFile(result.mdPath, "utf8");
    expect(md).toContain("[@k2024]");
    expect(md).not.toContain("[[Citable]]");
  });

  it("includes the bibliography path in the output frontmatter", async () => {
    const app = mockApp();
    app.vault.add("Citable.md", "", { "cite-key": "k", title: "T" });
    await fs.writeFile(inputPath, "[[Citable]]\n");

    const result = await processDocument({
      app,
      input: makeMockFile("doc.md"),
      vaultPath: tmpRoot,
      buildDir,
      pdfPath: pdfTarget,
    });

    const md = await fs.readFile(result.mdPath, "utf8");
    expect(md).toContain("bibliography:");
    expect(md).toContain("references.bib");
  });

  it("invokes runPandoc with the expected paths", async () => {
    const app = mockApp();
    app.vault.add("Citable.md", "", { "cite-key": "k", title: "T" });
    await fs.writeFile(inputPath, "[[Citable]]\n");

    await processDocument({
      app,
      input: makeMockFile("doc.md"),
      vaultPath: tmpRoot,
      buildDir,
      pdfPath: pdfTarget,
    });

    expect(runPandocMock).toHaveBeenCalledTimes(1);
    const opts = runPandocMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(opts["mdPath"]).toBe(path.join(buildDir, "doc.md"));
    expect(opts["bibPath"]).toBe(path.join(buildDir, "references.bib"));
    expect(opts["pdfPath"]).toBe(pdfTarget);
    expect(opts["vaultPath"]).toBe(tmpRoot);
  });
});

describe("processDocument — callouts toggle", () => {
  it("converts callouts when callouts=true", async () => {
    const app = mockApp();
    await fs.writeFile(
      inputPath,
      "> [!NOTE] Title\n> body content\n"
    );

    const result = await processDocument({
      app,
      input: makeMockFile("doc.md"),
      vaultPath: tmpRoot,
      buildDir,
      pdfPath: pdfTarget,
      callouts: true,
    });

    const md = await fs.readFile(result.mdPath, "utf8");
    expect(md).toContain("\\begin{noteblock}");
    expect(md).not.toMatch(/^> \[!NOTE\]/m);
  });

  it("leaves callouts untouched when callouts=false", async () => {
    const app = mockApp();
    await fs.writeFile(
      inputPath,
      "> [!NOTE] Title\n> body content\n"
    );

    const result = await processDocument({
      app,
      input: makeMockFile("doc.md"),
      vaultPath: tmpRoot,
      buildDir,
      pdfPath: pdfTarget,
      callouts: false,
    });

    const md = await fs.readFile(result.mdPath, "utf8");
    expect(md).toContain("> [!NOTE]");
    expect(md).not.toContain("\\begin{noteblock}");
  });

  it("injects awesomebox header-include when callouts=true and frontmatter is present", async () => {
    const app = mockApp();
    await fs.writeFile(
      inputPath,
      "---\ntitle: My Doc\n---\n\n> [!NOTE] T\n> body\n"
    );

    const result = await processDocument({
      app,
      input: makeMockFile("doc.md"),
      vaultPath: tmpRoot,
      buildDir,
      pdfPath: pdfTarget,
      callouts: true,
    });

    const md = await fs.readFile(result.mdPath, "utf8");
    expect(md).toContain("awesomebox");
  });
});

describe("processDocument — strict mode", () => {
  it("throws when a linked note doesn't exist", async () => {
    const app = mockApp();
    await fs.writeFile(inputPath, "[[Ghost]]\n");

    await expect(
      processDocument({
        app,
        input: makeMockFile("doc.md"),
        vaultPath: tmpRoot,
        buildDir,
        pdfPath: pdfTarget,
        strict: true,
      })
    ).rejects.toThrow();
  });

  it("does NOT throw in strict mode for an auto-cite-key note", async () => {
    const app = mockApp();
    app.vault.add("Real.md", "", null); // no frontmatter — auto cite-key
    await fs.writeFile(inputPath, "[[Real]]\n");

    const result = await processDocument({
      app,
      input: makeMockFile("doc.md"),
      vaultPath: tmpRoot,
      buildDir,
      pdfPath: pdfTarget,
      strict: true,
    });

    const md = await fs.readFile(result.mdPath, "utf8");
    expect(md).toContain("[@real]");
  });
});

describe("processDocument — logo path resolution", () => {
  it("rewrites a relative titlepage-logo to an absolute path", async () => {
    const app = mockApp();
    await fs.writeFile(
      inputPath,
      "---\ntitle: Doc\ntitlepage-logo: assets/logo.png\n---\n\nBody.\n"
    );

    const result = await processDocument({
      app,
      input: makeMockFile("doc.md"),
      vaultPath: tmpRoot,
      buildDir,
      pdfPath: pdfTarget,
    });

    const md = await fs.readFile(result.mdPath, "utf8");
    expect(md).toContain(path.join(tmpRoot, "assets/logo.png"));
  });
});

describe("processDocument — pdf failure", () => {
  it("returns null for pdfPath when runPandoc returns null", async () => {
    runPandocMock.mockResolvedValue(null);
    const app = mockApp();
    app.vault.add("Citable.md", "", { "cite-key": "k", title: "T" });
    await fs.writeFile(inputPath, "[[Citable]]\n");

    const result = await processDocument({
      app,
      input: makeMockFile("doc.md"),
      vaultPath: tmpRoot,
      buildDir,
      pdfPath: pdfTarget,
    });

    expect(result.pdfPath).toBeNull();
    // Intermediate artifacts still produced
    expect(result.bibPath).toBeTruthy();
    expect(result.mdPath).toBeTruthy();
  });
});
