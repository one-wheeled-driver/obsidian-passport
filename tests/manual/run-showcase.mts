/**
 * Manual smoke-test driver: exports the showcase document via the TS pipeline
 * with REAL Docker (not mocked). Bypasses Obsidian entirely.
 *
 * Usage: npx tsx tests/manual/run-showcase.mts
 */

import * as path from "node:path";
import * as fs from "node:fs/promises";
import { processDocument } from "../../src/pipeline/process-document.ts";
import { mockApp, makeMockFile } from "../helpers/obsidian-mocks.ts";

const VAULT = path.resolve(".");
const SHOWCASE_REL = "showcase_documents/Urban Mobility Report.md";
const REFS_DIR = "showcase_documents/references";

async function main() {
  const app = mockApp();

  // Register every reference note with its actual frontmatter
  const refFiles = await fs.readdir(path.join(VAULT, REFS_DIR));
  for (const filename of refFiles) {
    if (!filename.endsWith(".md")) continue;
    const fullPath = path.join(VAULT, REFS_DIR, filename);
    const content = await fs.readFile(fullPath, "utf8");
    // Quick gray-matter-free parse — the reference files all have frontmatter
    const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(content);
    const fm: Record<string, unknown> = {};
    if (fmMatch?.[1]) {
      for (const line of fmMatch[1].split(/\r?\n/)) {
        const m = /^([\w-]+):\s*(.*)$/.exec(line);
        if (m && m[1] && m[2] !== undefined) {
          let v: unknown = m[2].trim();
          if (typeof v === "string" && v.startsWith('"') && v.endsWith('"')) {
            v = v.slice(1, -1);
          }
          if (typeof v === "string" && /^\d+$/.test(v)) v = Number(v);
          fm[m[1]] = v;
        }
      }
    }
    app.vault.add(`${REFS_DIR}/${filename}`, content, fm);
  }

  // Register the input doc itself for Obsidian-API-shape compliance
  const inputContent = await fs.readFile(path.join(VAULT, SHOWCASE_REL), "utf8");
  app.vault.add(SHOWCASE_REL, inputContent);

  const buildDir = path.join(VAULT, ".obsidian/plugins/vault-passport/build");
  const pdfPath = path.join(VAULT, "showcase_documents/Urban Mobility Report.pdf");
  const cslPath = path.join(VAULT, ".obsidian/plugins/vault-passport/numbered-title.csl");

  console.log(`Vault:     ${VAULT}`);
  console.log(`Input:     ${SHOWCASE_REL}`);
  console.log(`PDF:       ${pdfPath}`);
  console.log(`Build dir: ${buildDir}`);
  console.log(`CSL:       ${cslPath}`);
  console.log("");

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

  console.log("");
  console.log(`citable references: ${result.citableCount}`);
  console.log(`unresolved links:   ${result.unresolvedCount}`);
  console.log(`pdf:                ${result.pdfPath ?? "FAILED"}`);
}

main().catch((err) => {
  console.error("Showcase smoke test failed:", err);
  process.exit(1);
});
