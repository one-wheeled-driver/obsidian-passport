import matter from "gray-matter";
import * as path from "node:path";

/**
 * Extract YAML frontmatter from a Markdown content string.
 *
 * Mirrors `extract_yaml_from_note` (vault_passport.py:245-254) but operates
 * on a string rather than a file path, so callers control file I/O.
 *
 * Behaviour:
 *   - Returns `null` when the document has no frontmatter (i.e. doesn't
 *     start with `---\n`)
 *   - Returns `null` when the YAML block is malformed (gray-matter throws,
 *     we swallow and return null)
 *   - Returns an empty object `{}` for an empty frontmatter block
 *   - Strips a UTF-8 BOM before checking for the opening fence
 *   - Recognises CRLF line endings the same as LF
 */
export function extractYaml(content: string): Record<string, unknown> | null {
  if (content.length === 0) return null;

  // Strip a UTF-8 BOM if present.
  const stripped = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

  // Match the frontmatter boundary ourselves so we get identical semantics to
  // the Python regex `^---\n(.*?)\n---\n` (with DOTALL). Anchored at the very
  // first character; non-greedy body capture; closing `---` must be on its
  // own line followed by a newline (or EOF after `---`).
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/m.exec(stripped);
  if (!match || match.index !== 0) return null;

  const yamlBody = match[1] ?? "";
  if (yamlBody.trim().length === 0) return {};

  try {
    // Use gray-matter's underlying YAML engine on the body alone — wrapping
    // it back in `---` delimiters so gray-matter parses cleanly.
    const parsed = matter(`---\n${yamlBody}\n---\n`);
    return (parsed.data as Record<string, unknown>) ?? {};
  } catch {
    return null;
  }
}

const AWESOMEBOX_INCLUDE = "\\usepackage{awesomebox}";

/**
 * Return a copy of `yaml` with `header-includes` extended to contain the
 * awesomebox `\usepackage` directive (idempotent).
 *
 * Mirrors `_inject_awesomebox` (vault_passport.py:446-459):
 *   - If `header-includes` is missing → set to `[AWESOMEBOX_INCLUDE]`
 *   - If it's a string → normalise to a list, then append
 *   - If it's a list → append unless already present
 */
export function injectAwesomebox(
  yaml: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...yaml };
  const existing = out["header-includes"];

  let list: unknown[];
  if (existing == null) {
    list = [];
  } else if (Array.isArray(existing)) {
    // existing is `unknown` at the type level; Array.isArray narrows to any[],
    // but we re-widen to unknown[] explicitly to avoid an unsafe-spread lint.
    list = (existing as unknown[]).slice();
  } else {
    list = [existing];
  }

  if (!list.includes(AWESOMEBOX_INCLUDE)) {
    list.push(AWESOMEBOX_INCLUDE);
  }

  out["header-includes"] = list;
  return out;
}

/**
 * Resolve relative `titlepage-logo` and `logo` paths in the frontmatter to
 * absolute paths anchored at `vaultRoot`. Absolute paths and non-string
 * values are left untouched.
 *
 * Used so xelatex can find the logo regardless of where the script is
 * invoked from (the original Python implementation does this in
 * process_document).
 */
export function resolveLogoPaths(
  yaml: Record<string, unknown>,
  vaultRoot: string
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...yaml };
  for (const key of ["titlepage-logo", "logo"]) {
    const value = out[key];
    if (typeof value !== "string") continue;
    if (path.isAbsolute(value)) continue;
    out[key] = path.resolve(vaultRoot, value);
  }
  return out;
}
