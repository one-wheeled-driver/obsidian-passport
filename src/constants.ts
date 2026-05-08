/**
 * Image extensions recognised by `isImage()`. Mirrors Python's
 * IMAGE_EXTENSIONS (vault_passport.py:11).
 */
export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".bmp",
  ".webp",
]);

/**
 * Obsidian callout type → awesomebox LaTeX environment name.
 * Mirrors `_AWESOMEBOX` (vault_passport.py:80-97). Unknown types fall back
 * to `AWESOMEBOX_FALLBACK` ("noteblock").
 */
export const AWESOMEBOX_MAP: ReadonlyMap<string, string> = new Map([
  // note / info family → noteblock (blue)
  ["note", "noteblock"],
  ["info", "noteblock"],
  ["todo", "noteblock"],
  ["abstract", "noteblock"],
  ["summary", "noteblock"],
  ["tldr", "noteblock"],
  ["question", "noteblock"],
  ["help", "noteblock"],
  ["faq", "noteblock"],
  ["example", "noteblock"],
  ["quote", "noteblock"],
  ["cite", "noteblock"],
  // tip / success family → tipblock (green)
  ["tip", "tipblock"],
  ["hint", "tipblock"],
  ["success", "tipblock"],
  ["check", "tipblock"],
  ["done", "tipblock"],
  // warning family → warningblock (orange)
  ["warning", "warningblock"],
  ["caution", "warningblock"],
  ["attention", "warningblock"],
  // danger / error / failure family → cautionblock (red)
  ["danger", "cautionblock"],
  ["error", "cautionblock"],
  ["bug", "cautionblock"],
  ["failure", "cautionblock"],
  ["fail", "cautionblock"],
  ["missing", "cautionblock"],
  // important: awesomebox v0.6 ships an importantblock but it's not portable;
  // map to noteblock to avoid LaTeX errors on standard installations.
]);

export const AWESOMEBOX_FALLBACK = "noteblock";

/**
 * YAML frontmatter keys → BibTeX entry fields.
 * Mirrors `field_mapping` (vault_passport.py:377-385).
 */
export const BIBTEX_FIELDS: ReadonlyArray<readonly [yamlKey: string, bibKey: string]> = [
  ["author", "author"],
  ["title", "title"],
  ["year", "year"],
  ["journal", "journal"],
  ["publisher", "publisher"],
  ["url", "url"],
  ["note", "note"],
];
