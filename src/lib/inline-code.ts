/**
 * Result of {@link protectInlineCode}. Pass `protected` through any prose
 * transformation, then call `restore()` on the result to put the original
 * code spans back where they were.
 */
export interface InlineCodeProtection {
  protected: string;
  restore: (transformed: string) => string;
}

const PLACEHOLDER_PREFIX = "\x00CODE";
const PLACEHOLDER_SUFFIX = "\x00";

/**
 * Replace inline code spans (`` `…` ``) with NUL-delimited placeholders so the
 * caller can transform the surrounding prose without touching the code.
 *
 * Mirrors `_protect_inline_code` (vault_passport.py:154-174):
 *   - Regex is `` `+[^`\n]+`+ `` — one or more backticks, at least one
 *     non-backtick non-newline character, then matching closing backticks
 *   - Newlines inside the span break it (multi-line "code spans" are not
 *     considered code by Obsidian or Markdown CommonMark)
 *   - Empty spans (` `` `) are not matched
 */
export function protectInlineCode(text: string): InlineCodeProtection {
  const spans: string[] = [];

  const protectedText = text.replace(/`+[^`\n]+`+/g, (match) => {
    const idx = spans.length;
    spans.push(match);
    return `${PLACEHOLDER_PREFIX}${idx}${PLACEHOLDER_SUFFIX}`;
  });

  function restore(transformed: string): string {
    let s = transformed;
    // Iterate with entries() so the span value is typed `string`, not
    // `string | undefined` (which it would be under noUncheckedIndexedAccess
    // for spans[i]).
    for (const [i, span] of spans.entries()) {
      // The placeholder is NUL-delimited and won't collide with any user
      // content (NULs aren't valid in Markdown source).
      s = s.split(`${PLACEHOLDER_PREFIX}${i}${PLACEHOLDER_SUFFIX}`).join(span);
    }
    return s;
  }

  return { protected: protectedText, restore };
}
