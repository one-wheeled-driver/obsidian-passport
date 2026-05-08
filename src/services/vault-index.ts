import type { AppLike, VaultFileLike } from "../types.js";

/**
 * Folders excluded from the indexable vault. Matches the Python
 * implementation's `.obsidian` skip plus a `.trash/` skip we added during
 * the port (Obsidian's trash folder by default).
 */
const EXCLUDED_PREFIXES = [".obsidian/", ".trash/"];

/**
 * Return all markdown files in the vault that are eligible for citation
 * resolution — everything except files inside `.obsidian/` or `.trash/`.
 *
 * Replaces the Python `build_vault_index` (vault_passport.py:257-274) plus
 * the directory-skip logic.
 */
export function listVaultMarkdownFiles(app: AppLike): VaultFileLike[] {
  return app.vault.getMarkdownFiles().filter((file) => {
    return !EXCLUDED_PREFIXES.some((prefix) => file.path.startsWith(prefix));
  });
}
