import type { AppLike, VaultFileLike } from "../types.js";

/**
 * Return all markdown files in the vault that are eligible for citation
 * resolution — everything except files inside the Obsidian configuration
 * folder (`app.vault.configDir`, `.obsidian` by default but user-configurable)
 * or `.trash/`.
 *
 * Replaces the Python `build_vault_index` (vault_passport.py:257-274) plus
 * the directory-skip logic.
 */
export function listVaultMarkdownFiles(app: AppLike): VaultFileLike[] {
  const configPrefix = `${app.vault.configDir.replace(/\/$/, "")}/`;
  return app.vault.getMarkdownFiles().filter((file) => {
    return !file.path.startsWith(configPrefix) && !file.path.startsWith(".trash/");
  });
}
