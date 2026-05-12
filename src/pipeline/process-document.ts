import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { AppLike, VaultFileLike } from "../types.js";
import { convertCallouts } from "../lib/callouts.js";
import {
  extractYaml,
  injectAwesomebox,
  resolveLogoPaths,
} from "../lib/frontmatter.js";
import { findLinkedNotes } from "./find-linked-notes.js";
import { convertLinks } from "./convert-links.js";
import { renderBib } from "./render-bib.js";
import { runPandoc } from "../services/docker-runner.js";
import type { LocalTemplate } from "../lib/docker-args.js";

export interface ProcessDocumentOptions {
  app: AppLike;
  /** The active markdown file, vault-relative path inside its `path`. */
  input: VaultFileLike;
  /** Absolute filesystem path to the vault root. */
  vaultPath: string;
  /** Absolute path to the directory where intermediate .md and .bib are written. */
  buildDir: string;
  /** Absolute path where pandoc should write the PDF. */
  pdfPath: string;

  // optional
  strict?: boolean;
  callouts?: boolean;
  toc?: boolean;
  template?: string | LocalTemplate;
  cslPath?: string;
  extraVars?: string[];
}

export interface ProcessDocumentResult {
  mdPath: string;
  bibPath: string;
  /** Absolute path to the generated PDF, or null if pandoc failed. */
  pdfPath: string | null;
  /** Number of citable references extracted. */
  citableCount: number;
  /** Number of unresolved links. */
  unresolvedCount: number;
}

/**
 * End-to-end document processing pipeline.
 *
 * Replaces the Python `process_document` (vault_passport.py:586-682):
 *   1. Read the input markdown
 *   2. Optionally run callout conversion
 *   3. Find every wiki-link, collect citable metadata
 *   4. Write the BibTeX file
 *   5. Replace links with citations
 *   6. Splice frontmatter additions (bibliography path, awesomebox include
 *      when callouts active, absolute logo paths)
 *   7. Write the intermediate markdown
 *   8. Invoke pandoc (Docker) to produce the PDF
 */
export async function processDocument(
  options: ProcessDocumentOptions
): Promise<ProcessDocumentResult> {
  const {
    app,
    input,
    vaultPath,
    buildDir,
    pdfPath,
    strict = false,
    callouts = false,
    toc = false,
    template,
    cslPath,
    extraVars,
  } = options;

  await mkdir(buildDir, { recursive: true });

  // 1. Read input
  const inputAbs = absoluteInputPath(vaultPath, input);
  let content = await readFile(inputAbs, "utf8");

  // 2. Callouts
  if (callouts) {
    content = convertCallouts(content);
  }

  // 3. Find linked notes
  const { metadata, issues } = await findLinkedNotes(app, content, input.path, {
    strict,
  });

  // 4. Write BibTeX
  const bibPath = join(buildDir, "references.bib");
  await writeFile(bibPath, renderBib(metadata), "utf8");

  // 5. Convert links → citations
  let converted = convertLinks(content, metadata);

  // 6. Frontmatter splices
  converted = spliceFrontmatter(converted, {
    bibPath,
    callouts,
    vaultRoot: vaultPath,
  });

  // 7. Write the intermediate markdown
  const mdPath = join(buildDir, `${input.basename}.md`);
  await writeFile(mdPath, converted, "utf8");

  // 8. Pandoc via Docker
  const pdfResult = await runPandoc({
    mdPath,
    bibPath,
    pdfPath,
    vaultPath,
    cslPath,
    template,
    toc,
    extraVars,
  });

  console.log(`Generated ${bibPath}`);
  console.log(`Generated ${mdPath}`);
  if (pdfResult) console.log(`Generated ${pdfResult}`);
  console.log(`Found ${Object.keys(metadata).length} citable references`);
  if (issues.length > 0) {
    console.log(
      `${issues.length} link(s) resolved as plain text (see warnings above)`
    );
  }

  return {
    mdPath,
    bibPath,
    pdfPath: pdfResult,
    citableCount: Object.keys(metadata).length,
    unresolvedCount: issues.length,
  };
}

/**
 * Resolve the input file to an absolute filesystem path. The Obsidian
 * `TFile.path` is vault-relative; we anchor it at `vaultPath`.
 */
function absoluteInputPath(vaultPath: string, input: VaultFileLike): string {
  return join(vaultPath, input.path);
}

interface SpliceOptions {
  bibPath: string;
  callouts: boolean;
  vaultRoot: string;
}

/**
 * Inject bibliography path, reference-section title, awesomebox include
 * (when callouts are active), and resolved logo paths into the document's
 * YAML frontmatter. If no frontmatter exists and we have something to add,
 * a minimal block is created.
 */
function spliceFrontmatter(content: string, opts: SpliceOptions): string {
  const existing = extractYaml(content);
  let yaml: Record<string, unknown> = existing ?? {};
  let body: string;

  if (existing) {
    // Strip the original frontmatter block from the body
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/m.exec(content);
    body = match ? content.slice(match[0].length) : content;
  } else {
    body = content;
  }

  if (!("bibliography" in yaml)) {
    yaml["bibliography"] = opts.bibPath;
  }
  if (!("reference-section-title" in yaml)) {
    yaml["reference-section-title"] = "References";
  }

  if (opts.callouts) {
    yaml = injectAwesomebox(yaml);
  }

  yaml = resolveLogoPaths(yaml, opts.vaultRoot);

  const yamlBlock = renderYamlFrontmatter(yaml);
  return `${yamlBlock}${body}`;
}

/**
 * Render a frontmatter block by hand. We don't want to re-stringify via
 * yaml/gray-matter because the original may have stylistic choices we'd
 * like to preserve in the future. Today we just emit a deterministic shape.
 */
function renderYamlFrontmatter(yaml: Record<string, unknown>): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(yaml)) {
    lines.push(`${key}: ${formatYamlValue(value)}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

function formatYamlValue(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return "\n" + value.map((v) => `  - ${formatScalar(v)}`).join("\n");
  }
  return formatScalar(value);
}

function formatScalar(value: unknown): string {
  if (value instanceof Date) {
    // Emit as ISO date (YYYY-MM-DD); pandoc + YAML round-trip cleanly.
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    // YAML single-quoted strings don't interpret escapes — use them whenever
    // the value contains a backslash (e.g. LaTeX commands like \usepackage).
    if (value.includes("\\")) {
      return `'${value.replace(/'/g, "''")}'`;
    }
    // Plain strings of safe chars don't need quoting at all.
    if (/^[\w./-]+$/.test(value)) return value;
    // Otherwise double-quote and escape internal double-quotes.
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return String(value);
}

// Suppress unused-warning for dirname in a way that doesn't break ESLint
void dirname;
