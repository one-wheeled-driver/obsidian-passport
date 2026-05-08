import { BIBTEX_FIELDS } from "../constants.js";

/**
 * Fields that get LaTeX-escaped when emitted to BibTeX. Excludes `url` —
 * citeproc wraps URLs in `\url{…}` which handles raw chars.
 */
const ESCAPED_FIELDS: ReadonlySet<string> = new Set([
  "author",
  "title",
  "journal",
  "publisher",
  "note",
]);

/**
 * Escape LaTeX special characters in a string so it survives a BibTeX → LaTeX
 * roundtrip without breaking the document.
 *
 * The replacement order matters: backslash, tilde, and caret expand into
 * sequences that themselves contain backslashes, so they must be handled in
 * a single pass to avoid double-escaping. We do that with a master regex
 * and a lookup table.
 */
export function escapeLatex(value: string): string {
  return value.replace(/[\\&%$#_{}~^]/g, (ch) => {
    switch (ch) {
      case "\\":
        return "\\textbackslash{}";
      case "~":
        return "\\textasciitilde{}";
      case "^":
        return "\\textasciicircum{}";
      default:
        return `\\${ch}`;
    }
  });
}

/**
 * Convert a YAML metadata object to a BibTeX entry string.
 *
 * Mirrors `yaml_to_bibtex` (vault_passport.py:370-393), with two additions
 * over the Python implementation:
 *   1. List-valued authors are joined with " and " (BibTeX convention)
 *   2. String fields are LaTeX-escaped via {@link escapeLatex}
 */
export function yamlToBibtex(yamlData: Record<string, unknown>): string {
  const citeKeyRaw = pickString(yamlData, "cite-key", "unknown");
  const entryType = pickString(yamlData, "type", "misc");
  const citeKey = escapeLatex(citeKeyRaw);

  let entry = `@${entryType}{${citeKey},\n`;

  for (const [yamlKey, bibKey] of BIBTEX_FIELDS) {
    if (!(yamlKey in yamlData)) continue;
    const value = yamlData[yamlKey];
    if (value == null) continue;

    const rendered = renderField(yamlKey, value);
    if (rendered === null) continue;
    entry += `  ${bibKey} = {${rendered}},\n`;
  }

  entry += "}\n\n";
  return entry;
}

/**
 * Render a single YAML field value to its BibTeX representation, applying
 * LaTeX escaping where appropriate.
 */
function renderField(yamlKey: string, value: unknown): string | null {
  // Authors as a YAML list → join with " and "
  if (yamlKey === "author" && Array.isArray(value)) {
    const joined = value
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .join(" and ");
    if (!joined) return null;
    return escapeLatex(joined);
  }

  if (typeof value === "string") {
    return ESCAPED_FIELDS.has(yamlKey) ? escapeLatex(value) : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  // Anything else (objects, etc.) → stringify; safe but unlikely to be useful.
  return String(value);
}

function pickString(
  data: Record<string, unknown>,
  key: string,
  fallback: string
): string {
  const v = data[key];
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "number") return String(v);
  return fallback;
}
