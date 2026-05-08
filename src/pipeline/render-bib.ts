import { yamlToBibtex } from "../lib/bibtex.js";

/**
 * Render the collected note metadata into a complete BibTeX file.
 *
 * Mirrors the bibliography-writing portion of `process_document`
 * (vault_passport.py:617-619): one entry per registered note, deduplicated
 * by cite-key (the first occurrence wins).
 */
export function renderBib(
  metadata: Record<string, Record<string, unknown>>
): string {
  const seenKeys = new Set<string>();
  let out = "";
  for (const yamlData of Object.values(metadata)) {
    const key = String(yamlData["cite-key"] ?? "");
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    out += yamlToBibtex(yamlData);
  }
  return out;
}
