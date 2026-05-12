import type { AppLike, VaultFileLike } from "../types.js";

/**
 * Resolve a wiki-link target to a vault file using Obsidian's authoritative
 * resolver. Replaces the Python `resolve_note_path` (vault_passport.py:277).
 *
 * Files inside the Obsidian configuration folder (`app.vault.configDir`,
 * `.obsidian` by default — the user can rename it) or the `.trash/` folder
 * are excluded; those are implementation directories, not user-citable notes.
 */
export function resolveNote(
  app: AppLike,
  linkpath: string,
  sourcePath: string
): VaultFileLike | null {
  const file = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
  if (!file) return null;
  if (isExcluded(file.path, app.vault.configDir)) {
    return null;
  }
  return file;
}

function isExcluded(filePath: string, configDir: string): boolean {
  const configPrefix = `${configDir.replace(/\/$/, "")}/`;
  return filePath.startsWith(configPrefix) || filePath.startsWith(".trash/");
}
