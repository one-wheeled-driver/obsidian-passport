import { AWESOMEBOX_FALLBACK, AWESOMEBOX_MAP } from "../constants.js";
import { splitFencedBlocks } from "./fenced-blocks.js";

// Header + body matcher, mirroring CALLOUT_RE (vault_passport.py:71-75):
//   ^> [!TYPE][+-]? optional title
//   (zero or more body lines that start with `>`)
// Multiline mode required so `^` matches at every line start.
const CALLOUT_RE = /^> \[!(\w+)\][+\-]?[ \t]*(.*)\n((?:^>.*\n)*)/gm;

/**
 * Convert Obsidian callouts (`> [!TYPE] Title` … body lines …) to raw-LaTeX
 * fences pandoc passes through to xelatex, wrapping the body in an
 * awesomebox environment.
 *
 * Mirrors `convert_callouts` (vault_passport.py:100-151). Code blocks are
 * protected by routing the input through {@link splitFencedBlocks} first.
 */
export function convertCallouts(content: string): string {
  if (content.length === 0) return "";

  return splitFencedBlocks(content)
    .map(([inCode, chunk]) => (inCode ? chunk : transformProse(chunk)))
    .join("");
}

function transformProse(chunk: string): string {
  return chunk.replace(CALLOUT_RE, (_match, rawType: string, rawTitle: string, rawBody: string) => {
    const calloutType = rawType.toLowerCase();
    const explicitTitle = rawTitle.trim();
    const env = AWESOMEBOX_MAP.get(calloutType) ?? AWESOMEBOX_FALLBACK;
    const title = explicitTitle.length > 0 ? explicitTitle : titleCase(calloutType);

    const body = stripBodyPrefix(rawBody);

    let result = "```{=latex}\n";
    result += `\\begin{${env}}\n`;
    result += "```\n";
    result += `**${title}**\n`;
    if (body.length > 0) {
      result += `\n${body}\n`;
    }
    result += "\n```{=latex}\n";
    result += `\\end{${env}}\n`;
    result += "```\n";
    return result;
  });
}

/**
 * Strip the leading "> " (or just ">") from each body line so the inner
 * content is plain markdown, then trim trailing/leading whitespace.
 */
function stripBodyPrefix(rawBody: string): string {
  const lines = rawBody.split("\n");
  const stripped = lines.map((line) => {
    if (line.startsWith("> ")) return line.slice(2);
    if (line.startsWith(">")) return line.slice(1);
    return line;
  });
  return stripped.join("\n").trim();
}

/**
 * Capitalise the first character of a word; mirrors Python's `str.title()`
 * for our single-word callout-type input (e.g. "warning" → "Warning").
 */
function titleCase(word: string): string {
  if (word.length === 0) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}
