/**
 * One-shot script (run via `npm run test:manual`) that regenerates the
 * committed showcase PDF at showcase_documents/Urban Mobility Report.pdf
 * using the TS pipeline. Run this after pipeline changes that affect the
 * visible output (e.g. new LaTeX escaping in v0.2).
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { processDocument } from "../../src/pipeline/process-document.js";
import { mockApp, makeMockFile } from "../helpers/obsidian-mocks.js";

const VAULT = path.resolve(".");
const SHOWCASE_REL = "showcase_documents/Urban Mobility Report.md";
const REFS_DIR = "showcase_documents/references";

describe("regenerate committed showcase PDF", () => {
  it("writes showcase_documents/Urban Mobility Report.pdf", async () => {
    const app = mockApp();

    // Materialise references with their real frontmatter parsed by hand
    const refFiles = await fs.readdir(path.join(VAULT, REFS_DIR));
    for (const filename of refFiles) {
      if (!filename.endsWith(".md")) continue;
      const content = await fs.readFile(
        path.join(VAULT, REFS_DIR, filename),
        "utf8"
      );
      const fm = parseFrontmatter(content);
      app.vault.add(`${REFS_DIR}/${filename}`, content, fm);
    }
    const showcase = await fs.readFile(path.join(VAULT, SHOWCASE_REL), "utf8");
    app.vault.add(SHOWCASE_REL, showcase);

    const buildDir = path.join(VAULT, ".obsidian/plugins/vault-passport/build");
    const pdfPath = path.join(VAULT, "showcase_documents/Urban Mobility Report.pdf");
    const cslPath = path.join(VAULT, ".obsidian/plugins/vault-passport/numbered-title.csl");

    const result = await processDocument({
      app,
      input: makeMockFile(SHOWCASE_REL),
      vaultPath: VAULT,
      buildDir,
      pdfPath,
      cslPath,
      callouts: true,
      toc: true,
      template: "eisvogel",
    });

    expect(result.pdfPath).toBe(pdfPath);
    const stat = await fs.stat(pdfPath);
    expect(stat.size).toBeGreaterThan(10_000);
  }, 120_000);
});

function parseFrontmatter(content: string): Record<string, unknown> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(content);
  if (!m?.[1]) return {};
  const fm: Record<string, unknown> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!kv || !kv[1] || kv[2] === undefined) continue;
    let v: unknown = kv[2].trim();
    if (typeof v === "string" && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (typeof v === "string" && /^\d+$/.test(v)) v = Number(v);
    fm[kv[1]] = v;
  }
  return fm;
}
