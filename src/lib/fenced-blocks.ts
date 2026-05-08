/**
 * Split content into alternating `[inCode, chunk]` pairs.
 *
 * - `inCode = false` chunks are prose: callers may freely transform them
 *   (replace wiki-links, etc.) without disturbing code blocks.
 * - `inCode = true` chunks are fenced code blocks (``` or ~~~) that must be
 *   left untouched.
 *
 * Preserves the input verbatim — concatenating every chunk reproduces the
 * original string, including line endings.
 *
 * Mirrors `_split_fenced_blocks` (vault_passport.py:17-65). Handles:
 *   - Backtick (```) and tilde (~~~) fences
 *   - Variable fence lengths — closing fence must use the same character and
 *     be at least as long as the opening fence
 *   - Unclosed fences — opening with no matching close runs to EOF
 *   - Optional trailing whitespace on the closing fence line
 */
export function splitFencedBlocks(content: string): Array<[inCode: boolean, chunk: string]> {
  if (content.length === 0) return [];

  // Split into lines while keeping their terminators so we can re-join exactly.
  const lines = splitLinesKeepEnds(content);
  const segments: Array<[boolean, string]> = [];
  let plainStart = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const openMatch = /^(`{3,}|~{3,})/.exec(line);
    if (openMatch) {
      const fenceChar = openMatch[1]![0]!;
      const fenceLen = openMatch[1]!.length;

      // Emit accumulated prose before the fence.
      if (i > plainStart) {
        segments.push([false, lines.slice(plainStart, i).join("")]);
      }

      // Find the matching closing fence.
      let j = i + 1;
      while (j < lines.length) {
        const closeMatch = /^(`{3,}|~{3,})\s*$/.exec(lines[j] ?? "");
        if (
          closeMatch &&
          closeMatch[1]![0]! === fenceChar &&
          closeMatch[1]!.length >= fenceLen
        ) {
          break;
        }
        j += 1;
      }

      // The fenced block runs from i through j (inclusive, if closed) or to EOF.
      const blockEnd = Math.min(j + 1, lines.length);
      segments.push([true, lines.slice(i, blockEnd).join("")]);
      i = blockEnd;
      plainStart = i;
    } else {
      i += 1;
    }
  }

  // Flush any trailing prose.
  if (plainStart < lines.length) {
    segments.push([false, lines.slice(plainStart).join("")]);
  }

  return segments;
}

/**
 * Equivalent of Python's `splitlines(keepends=True)` — split on every line
 * terminator while preserving the terminator on each line. Recognises `\n`,
 * `\r\n`, and bare `\r`.
 */
function splitLinesKeepEnds(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\n") {
      out.push(text.slice(start, i + 1));
      start = i + 1;
    } else if (ch === "\r") {
      // Treat \r\n as a single terminator; bare \r as its own.
      const next = text[i + 1];
      if (next === "\n") {
        out.push(text.slice(start, i + 2));
        i += 1;
      } else {
        out.push(text.slice(start, i + 1));
      }
      start = i + 1;
    }
  }
  if (start < text.length) {
    out.push(text.slice(start));
  }
  return out;
}
