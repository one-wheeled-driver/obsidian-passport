import { spawn } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { buildPandocCommand, type LocalTemplate } from "../lib/docker-args.js";

export interface RunPandocOptions {
  mdPath: string;
  bibPath: string;
  pdfPath: string;
  cslPath?: string;
  template?: string | LocalTemplate;
  toc?: boolean;
  extraVars?: string[];
  vaultPath: string;
}

/**
 * Run pandoc inside the `pandoc/extra` Docker image to produce a PDF.
 *
 * Replaces the Python `run_pandoc` (vault_passport.py:490-583). Behaviour:
 *   1. Probe `docker` on PATH; warn + return null if missing
 *   2. Build the citeproc-enabled command via `buildPandocCommand`
 *   3. Spawn it; on success return the pdf path
 *   4. On failure, warn and retry without --citeproc/--bibliography
 *   5. If the second attempt also fails, log + return null
 */
export async function runPandoc(options: RunPandocOptions): Promise<string | null> {
  if (!(await dockerAvailable())) {
    console.error("Warning: docker not found — skipping PDF generation");
    return null;
  }

  // First attempt: with citeproc
  const cmdWithCiteproc = buildPandocCommand({ ...options, withCiteproc: true });
  const first = await runDocker(cmdWithCiteproc);
  if (first.code === 0) return options.pdfPath;

  // Fallback: no citeproc / bibliography
  console.error(
    "Warning: pandoc --citeproc failed — generating PDF without resolved citations"
  );
  if (first.stderr.length > 0) {
    console.error(`  pandoc said: ${first.stderr.trim()}`);
  }
  const cmdPlain = buildPandocCommand({ ...options, withCiteproc: false });
  const second = await runDocker(cmdPlain);
  if (second.code === 0) return options.pdfPath;

  console.error(`Error: pandoc (docker) failed — ${second.stderr.trim()}`);
  return null;
}

async function dockerAvailable(): Promise<boolean> {
  const pathDirs = (process.env["PATH"] ?? "").split(delimiter);
  for (const dir of pathDirs) {
    if (dir.length === 0) continue;
    try {
      await access(join(dir, "docker"), constants.X_OK);
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

interface DockerResult {
  code: number;
  stderr: string;
}

function runDocker(argv: string[]): Promise<DockerResult> {
  const [program, ...args] = argv;
  if (!program) throw new Error("buildPandocCommand returned an empty argv");

  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      resolve({ code: code ?? 1, stderr });
    });
  });
}
