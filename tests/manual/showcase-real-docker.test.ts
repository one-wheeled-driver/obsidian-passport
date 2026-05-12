/**
 * Real-Docker smoke test. Skipped under the default `npm test` run via the
 * `tests/manual/` exclusion in vitest.config.ts; invoke explicitly with:
 *
 *   npx vitest run tests/manual/showcase-real-docker.test.ts --testTimeout=120000
 *
 * Runs the full pipeline (NO runPandoc mock) over the showcase document and
 * confirms a real PDF lands at the configured path.
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import { processDocument } from "../../src/pipeline/process-document.js";
import { mockApp, makeMockFile } from "../helpers/obsidian-mocks.js";

const VAULT_PROJECT = path.resolve(".");
const SHOWCASE_REL = "showcase_documents/Urban Mobility Report.md";
const REFS_DIR = "showcase_documents/references";

describe("real-docker showcase smoke", () => {
  beforeAll(async () => {
    const out = await import("node:child_process").then(({ spawnSync }) =>
      spawnSync("docker", ["info"], { stdio: "ignore" })
    );
    if (out.status !== 0) {
      throw new Error("docker not available — skipping real-docker test");
    }
  }, 30_000);

  it("produces a real PDF using pandoc/extra", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vp-real-"));
    const buildDir = path.join(tmpRoot, "build");
    await fs.mkdir(buildDir, { recursive: true });

    // Materialise the showcase doc and its references inside the scratch vault
    await fs.mkdir(path.join(tmpRoot, REFS_DIR), { recursive: true });
    const showcase = await fs.readFile(
      path.join(VAULT_PROJECT, SHOWCASE_REL),
      "utf8"
    );
    await fs.writeFile(path.join(tmpRoot, SHOWCASE_REL), showcase);

    const refFiles = await fs.readdir(path.join(VAULT_PROJECT, REFS_DIR));
    const app = mockApp();
    for (const filename of refFiles) {
      if (!filename.endsWith(".md")) continue;
      const content = await fs.readFile(
        path.join(VAULT_PROJECT, REFS_DIR, filename),
        "utf8"
      );
      await fs.writeFile(path.join(tmpRoot, REFS_DIR, filename), content);

      // Quick frontmatter parse for the mock
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
    app.vault.add(SHOWCASE_REL, showcase);

    const pdfPath = path.join(tmpRoot, "Urban Mobility Report.pdf");

    const result = await processDocument({
      app,
      input: makeMockFile(SHOWCASE_REL),
      vaultPath: tmpRoot,
      buildDir,
      pdfPath,
      callouts: true,
      toc: true,
      template: "eisvogel",
    });

    expect(result.pdfPath).toBe(pdfPath);

    const stat = await fs.stat(pdfPath);
    expect(stat.size).toBeGreaterThan(10_000); // a real PDF, not 0 bytes

    const head = await fs.readFile(pdfPath, { encoding: "utf8" }).catch(
      // PDF is binary; read first 8 bytes as latin1 to check magic
      async () => {
        const buf = await fs.readFile(pdfPath);
        return buf.subarray(0, 8).toString("latin1");
      }
    );
    expect(head.toString().slice(0, 4)).toBe("%PDF");
  }, 120_000);
});
