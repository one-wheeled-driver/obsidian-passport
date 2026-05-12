/**
 * Focused regression tests for the YAML frontmatter emitter inside
 * process-document. These caught two real bugs during the Phase 8 real-
 * Docker smoke run:
 *
 *   - JS Date objects were rendered via Date.toString() (un-parseable by YAML)
 *   - Strings containing backslashes (LaTeX includes!) were emitted in
 *     double-quotes, where \u was interpreted as a Unicode escape and broke
 *     pandoc's YAML parser.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const { runPandocMock } = vi.hoisted(() => ({ runPandocMock: vi.fn() }));
vi.mock("../../src/services/docker-runner.js", () => ({
  runPandoc: runPandocMock,
}));

import { processDocument } from "../../src/pipeline/process-document.js";
import { mockApp, makeMockFile } from "../helpers/obsidian-mocks.js";

let tmpRoot: string;
let buildDir: string;
let inputPath: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vp-yaml-"));
  buildDir = path.join(tmpRoot, "build");
  inputPath = path.join(tmpRoot, "doc.md");
  await fs.mkdir(buildDir, { recursive: true });
  runPandocMock.mockReset();
  runPandocMock.mockResolvedValue(`${tmpRoot}/doc.pdf`);
});

describe("frontmatter rendering — backslash-safe", () => {
  it("emits LaTeX includes (which contain \\) with single quotes (no escape interpretation)", async () => {
    const app = mockApp();
    await fs.writeFile(
      inputPath,
      "---\ntitle: Doc\n---\n\n> [!NOTE] T\n> body\n"
    );

    const result = await processDocument({
      app,
      input: makeMockFile("doc.md"),
      vaultPath: tmpRoot,
      buildDir,
      pdfPath: `${tmpRoot}/doc.pdf`,
      callouts: true,
    });

    const md = await fs.readFile(result.mdPath, "utf8");
    // The awesomebox include must be single-quoted so YAML parsers don't
    // interpret \u as a Unicode escape sequence.
    expect(md).toContain("'\\usepackage{awesomebox}'");
    expect(md).not.toContain('"\\usepackage{awesomebox}"');
  });
});

describe("frontmatter rendering — Date round-trip", () => {
  it("renders Date values as ISO date strings (YYYY-MM-DD), not Date.toString()", async () => {
    const app = mockApp();
    // YAML date literal — gray-matter parses this as a JS Date
    await fs.writeFile(inputPath, "---\ndate: 2026-02-28\n---\n\nBody.\n");

    const result = await processDocument({
      app,
      input: makeMockFile("doc.md"),
      vaultPath: tmpRoot,
      buildDir,
      pdfPath: `${tmpRoot}/doc.pdf`,
    });

    const md = await fs.readFile(result.mdPath, "utf8");
    expect(md).toContain("date: 2026-02-28");
    expect(md).not.toMatch(/date:\s+\w+ \w+ \d+ \d{4}/); // no `Sat Feb 28 2026`
  });
});
