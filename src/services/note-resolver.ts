import type { AppLike, VaultFileLike } from "../types.js";

const EXCLUDED_PREFIXES = [".obsidian/", ".trash/"];

/**
 * Resolve a wiki-link target to a vault file using Obsidian's authoritative
 * resolver. Replaces the Python `resolve_note_path` (vault_passport.py:277).
 *
 * Files inside `.obsidian/` or `.trash/` are excluded — those are
 * implementation directories, not user-citable notes.
 */
export function resolveNote(
  app: AppLike,
  linkpath: string,
  sourcePath: string
): VaultFileLike | null {
  const file = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
  if (!file) return null;
  if (EXCLUDED_PREFIXES.some((prefix) => file.path.startsWith(prefix))) {
    return null;
  }
  return file;
}
