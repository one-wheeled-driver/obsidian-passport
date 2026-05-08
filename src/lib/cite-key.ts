/**
 * Derive a BibTeX-safe cite key from a note's display name.
 *
 * Mirrors `_note_name_to_cite_key` (vault_passport.py:219-228):
 *   1. Lowercase
 *   2. Replace any run of non-[a-z0-9] characters with a single hyphen
 *   3. Strip leading/trailing hyphens
 *   4. Fall back to "note" if the result is empty
 *
 * Examples:
 *   "Behavioral Economics Review" → "behavioral-economics-review"
 *   "Urban Mobility (2024)"        → "urban-mobility-2024"
 *
 * Note: non-ASCII letters (accented, non-Latin) are stripped, matching the
 * Python implementation. This keeps generated keys ASCII-clean and BibTeX-
 * safe across all vaults.
 */
export function noteNameToCiteKey(noteName: string): string {
  const key = noteName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return key || "note";
}

/**
 * Return a copy of `yamlData` with `cite-key` and `title` guaranteed to be
 * present, deriving them from `noteName` when absent. Explicit values are
 * preserved untouched.
 *
 * Mirrors `_ensure_citable` (vault_passport.py:231-242).
 */
export function ensureCitable(
  yamlData: Record<string, unknown> | null | undefined,
  noteName: string
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...(yamlData ?? {}) };
  if (!("cite-key" in data)) {
    data["cite-key"] = noteNameToCiteKey(noteName);
  }
  if (!("title" in data)) {
    data["title"] = noteName;
  }
  return data;
}
