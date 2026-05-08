import { Notice, TFile, normalizePath } from "obsidian";
import type { App, FileSystemAdapter } from "obsidian";
import { dirname, join, parse } from "node:path";
import { exec } from "node:child_process";

import type { VaultPassportSettings } from "../settings.js";
import { parseExtraVars } from "../settings.js";
import { processDocument } from "../pipeline/process-document.js";
import type { LocalTemplate } from "../lib/docker-args.js";

/**
 * Run the export pipeline for the active markdown file.
 *
 * Mirrors the user-facing behaviour of the Python-era main.js's runExport():
 *   - resolve the vault root (FileSystemAdapter)
 *   - resolve the build directory under the plugin folder
 *   - invoke processDocument
 *   - show success/failure notices
 *   - optionally open the PDF after success
 */
export async function exportPdf(
  app: App,
  file: TFile,
  pluginDir: string,
  settings: VaultPassportSettings
): Promise<void> {
  const adapter = app.vault.adapter as FileSystemAdapter;
  if (typeof adapter.getBasePath !== "function") {
    new Notice("Vault Passport: could not determine vault path.");
    return;
  }
  const vaultPath = adapter.getBasePath();
  const buildDir = join(vaultPath, normalizePath(pluginDir), "build");
  const cslPath = join(vaultPath, normalizePath(pluginDir), "numbered-title.csl");
  const inputAbs = join(vaultPath, file.path);
  const pdfPath = join(dirname(inputAbs), `${file.basename}.pdf`);

  new Notice("Vault Passport: exporting…");

  try {
    const template = await resolveTemplate(
      adapter,
      vaultPath,
      pluginDir,
      settings
    );

    const result = await processDocument({
      app,
      input: file,
      vaultPath,
      buildDir,
      pdfPath,
      strict: settings.strictMode,
      callouts: settings.callouts,
      toc: settings.toc,
      template,
      cslPath,
      extraVars: parseExtraVars(settings.extraVars),
    });

    if (result.pdfPath) {
      new Notice(
        `Vault Passport: export complete (${result.citableCount} references)`,
        8000
      );
      if (settings.openPdfAfterExport) {
        openPdf(result.pdfPath);
      }
    } else {
      new Notice("Vault Passport: PDF generation failed (see console).", 10000);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    new Notice(`Vault Passport: export failed.\n${msg}`, 10000);
    console.error("Vault Passport error:", err);
  }
}

/**
 * Resolve the configured template name to either a local file path
 * (mounted into the container by the runner) or a bare string passed
 * through to pandoc/extra (which ships with eisvogel and others).
 *
 * Resolution order: vault template dir → plugin templates dir → bare name.
 */
async function resolveTemplate(
  adapter: FileSystemAdapter,
  vaultPath: string,
  pluginDir: string,
  settings: VaultPassportSettings
): Promise<string | LocalTemplate | undefined> {
  const name = settings.templateName.trim();
  if (!name) return undefined;

  const candidates = [
    join(vaultPath, normalizePath(settings.vaultTemplateDir), name),
    join(vaultPath, normalizePath(pluginDir), "templates", name),
  ];
  for (const candidate of candidates) {
    try {
      // Adapter API: stat is reliable; fallback to fs.access in test envs.
      const exists = await adapter.exists(
        candidate.startsWith(vaultPath)
          ? candidate.slice(vaultPath.length + 1)
          : candidate
      );
      if (exists) return { absolutePath: candidate };
    } catch {
      // ignore — fall through to next candidate
    }
  }
  // Bare name → let pandoc/extra resolve it
  return name;
}

/** Open the generated PDF in the system viewer. */
function openPdf(pdfPath: string): void {
  // Cross-platform open: macOS=open, Linux=xdg-open, Windows=start "" "..."
  const cmd =
    process.platform === "darwin"
      ? `open "${pdfPath}"`
      : process.platform === "win32"
        ? `start "" "${pdfPath}"`
        : `xdg-open "${pdfPath}"`;
  exec(cmd, (err) => {
    if (err) console.warn("Vault Passport: could not open PDF:", err);
  });
  void parse; // silence unused-import lint when the helper isn't called above
}
