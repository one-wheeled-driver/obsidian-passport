/**
 * Parsed components of an Obsidian wiki-link.
 *
 * Mirrors the dict returned by `parse_link()` in the Python implementation
 * (vault_passport.py:177-211).
 */
export interface ParsedLink {
  /** Filename part of the link, before any `#` or `|`. May be empty. */
  noteName: string;
  /** Heading anchor (after `#`, when not starting with `^`). */
  heading: string | null;
  /** Block ID (after `#^`). */
  blockId: string | null;
  /** Alias text after `|`. */
  displayText: string | null;
}

/**
 * Parse the raw content inside `[[ ]]` (or `![[ ]]` after the leading `!` is
 * stripped) into its components.
 *
 * The parser splits on the first `|` for the alias, then on the first `#`
 * for the anchor. An anchor starting with `^` is a block ID; otherwise it is
 * a heading. Leading and trailing whitespace is trimmed from each component
 * — note names with embedded whitespace are preserved verbatim.
 */
export function parseLink(raw: string): ParsedLink {
  // 1. Split off the alias (everything after the first |).
  let left: string;
  let displayText: string | null;
  const pipeIdx = raw.indexOf("|");
  if (pipeIdx === -1) {
    left = raw;
    displayText = null;
  } else {
    left = raw.slice(0, pipeIdx);
    displayText = raw.slice(pipeIdx + 1).trim();
  }

  // 2. Split the left side on the first # for the anchor.
  let noteName: string;
  let heading: string | null = null;
  let blockId: string | null = null;
  const hashIdx = left.indexOf("#");
  if (hashIdx === -1) {
    noteName = left.trim();
  } else {
    noteName = left.slice(0, hashIdx).trim();
    const fragment = left.slice(hashIdx + 1).trim();
    if (fragment.startsWith("^")) {
      blockId = fragment.slice(1);
    } else {
      heading = fragment;
    }
  }

  return { noteName, heading, blockId, displayText };
}
