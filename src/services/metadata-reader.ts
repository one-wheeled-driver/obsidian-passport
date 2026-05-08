import type { AppLike, VaultFileLike } from "../types.js";
import { extractYaml } from "../lib/frontmatter.js";

/**
 * Read a note's YAML frontmatter, preferring Obsidian's metadata cache
 * (zero-cost, already parsed) and falling back to reading the file and
 * parsing with gray-matter.
 *
 * Replaces the Python `extract_yaml_from_note` (vault_passport.py:245-254).
 *
 * Returns:
 *   - The frontmatter object if either source produces one
 *   - `null` if the note has no frontmatter or the YAML is malformed
 */
export async function readNoteMetadata(
  app: AppLike,
  file: VaultFileLike
): Promise<Record<string, unknown> | null> {
  const cached = app.metadataCache.getFileCache(file);
  if (cached?.frontmatter) {
    return cached.frontmatter;
  }

  const content = await app.vault.cachedRead(file);
  return extractYaml(content);
}
