import { describe, it, expect, vi, beforeAll } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const { runPandocMock } = vi.hoisted(() => ({ runPandocMock: vi.fn() }));
vi.mock("../../src/services/docker-runner.js", () => ({
  runPandoc: runPandocMock,
}));

import { processDocument } from "../../src/pipeline/process-document.js";
import { mockApp, makeMockFile } from "../helpers/obsidian-mocks.js";

/**
 * End-to-end snapshot of the showcase document. Confirms the TS pipeline
 * reproduces the meaningful artifacts the Python implementation produced.
 *
 * The actual showcase markdown lives in showcase_documents/. We feed it
 * through the pipeline against a synthetic vault that mirrors the real
 * one (the five reference notes), with runPandoc mocked.
 */

let SHOWCASE_BODY: string;
const SHOWCASE_REL = "showcase_documents/Urban Mobility Report.md";

const REFS_DIR = "showcase_documents/references";
const REF_FILES = [
  ["Behavioral Economics Review.md", "behavecon2023"],
  ["Nudge Theory Origins.md", "nudge2008"],
  ["Population Migration Patterns.md", "migration2024"],
  ["Transit Infrastructure Study.md", "transit2024"],
  ["Urban Demographics 2024.md", "demographics2024"],
] as const;

beforeAll(async () => {
  SHOWCASE_BODY = await fs.readFile(SHOWCASE_REL, "utf8");
  runPandocMock.mockResolvedValue("/fake/path/Urban Mobility Report.pdf");
});

describe("showcase snapshot — Urban Mobility Report end-to-end", () => {
  it("produces a self-contained intermediate markdown + bib", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vp-showcase-"));
    const buildDir = path.join(tmpRoot, "build");
    await fs.mkdir(buildDir, { recursive: true });

    // Materialise the input doc and copy into the scratch vault
    const inputAbs = path.join(tmpRoot, SHOWCASE_REL);
    await fs.mkdir(path.dirname(inputAbs), { recursive: true });
    await fs.writeFile(inputAbs, SHOWCASE_BODY);

    // Build a mock app with the five references registered
    const app = mockApp();
    for (const [filename, citeKey] of REF_FILES) {
      app.vault.add(`${REFS_DIR}/${filename}`, "", {
        "cite-key": citeKey,
        title: filename.replace(".md", ""),
        type: "article",
      });
    }

    const inputFile = makeMockFile(SHOWCASE_REL);

    const result = await processDocument({
      app,
      input: inputFile,
      vaultPath: tmpRoot,
      buildDir,
      pdfPath: path.join(tmpRoot, "showcase_documents/Urban Mobility Report.pdf"),
      callouts: true,
      toc: true,
      template: "eisvogel",
    });

    // Assertions on the intermediate markdown
    const md = await fs.readFile(result.mdPath, "utf8");
    // Every reference's cite-key appears in the body
    for (const [, citeKey] of REF_FILES) {
      expect(md).toContain(`[@${citeKey}]`);
    }
    // No raw wiki-links survived
    expect(md).not.toContain("[[");
    // Callouts converted (the report has [!NOTE], [!WARNING], [!TIP], [!CAUTION]).
    // [!CAUTION] is in the warning family (→ warningblock), not cautionblock —
    // that environment is reserved for [!DANGER]/[!ERROR]/[!BUG] etc.
    expect(md.match(/\\begin\{noteblock\}/g)?.length ?? 0).toBeGreaterThan(0);
    expect(md.match(/\\begin\{warningblock\}/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(md).toContain("\\begin{tipblock}");
    // Awesomebox include injected
    expect(md).toContain("awesomebox");

    // Assertions on the .bib
    const bib = await fs.readFile(result.bibPath, "utf8");
    for (const [, citeKey] of REF_FILES) {
      expect(bib).toContain(`@article{${citeKey},`);
    }

    // Pandoc was invoked once with sane shape
    expect(runPandocMock).toHaveBeenCalledTimes(1);
    const pandocOpts = runPandocMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(pandocOpts["template"]).toBe("eisvogel");
    expect(pandocOpts["toc"]).toBe(true);
    expect(pandocOpts["mdPath"]).toBe(result.mdPath);
    expect(pandocOpts["bibPath"]).toBe(result.bibPath);

    // Result-level metrics
    expect(result.citableCount).toBe(REF_FILES.length);
    expect(result.unresolvedCount).toBe(0);
  });
});
