/**
 * Plugin settings shape.
 *
 * Setting keys are intentionally identical to the Python-era plugin's
 * `data.json` so existing user installs upgrade in place. The `pythonPath`
 * field is preserved (and ignored) for the same reason.
 */
export interface VaultPassportSettings {
  /** Ignored by the TS port; preserved for back-compat with existing data.json. */
  pythonPath: string;
  /** Abort export when a linked note is missing from the vault. */
  strictMode: boolean;
  /** Open the PDF in the system viewer after a successful export. */
  openPdfAfterExport: boolean;
  /** Include a `--toc` table-of-contents in the PDF. */
  toc: boolean;
  /** Pandoc template name (e.g. "eisvogel") or filename. */
  templateName: string;
  /** Vault-relative folder containing shared templates. */
  vaultTemplateDir: string;
  /** Multi-line `key=value` block forwarded as repeated `-V` flags to pandoc. */
  extraVars: string;
  /** Convert Obsidian callouts to awesomebox LaTeX boxes. */
  callouts: boolean;
}

export const DEFAULT_SETTINGS: VaultPassportSettings = {
  pythonPath: "python3",
  strictMode: false,
  openPdfAfterExport: true,
  toc: false,
  templateName: "",
  vaultTemplateDir: "templates",
  extraVars: "",
  callouts: false,
};

/**
 * Parse the multi-line `extraVars` string into an array of `-V key=value`
 * arguments, mirroring main.js's parser.
 */
export function parseExtraVars(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.includes("="));
}
