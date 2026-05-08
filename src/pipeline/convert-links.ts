import { isImage } from "../lib/images.js";
import { protectInlineCode } from "../lib/inline-code.js";
import { splitFencedBlocks } from "../lib/fenced-blocks.js";
import { parseLink } from "../lib/parse-link.js";

const LINK_RE = /(!?)\[\[([^\]]+)\]\]/g;

/**
 * Replace every `[[wiki-link]]` and `![[transclusion]]` in `content` with its
 * citation form, falling back to readable plain text when the metadata
 * doesn't include the note.
 *
 * Mirrors `convert_links_to_citations` (vault_passport.py:396-443):
 *   - Images become standard markdown images
 *   - Non-markdown embeds with sidecar metadata become citations
 *   - Non-markdown embeds without sidecar become "[Embedded file: name]"
 *   - Notes in metadata become "[@cite-key]"
 *   - Missing notes fall back to display text → heading-aware text → name
 *
 * Code blocks and inline code spans are protected.
 */
export function convertLinks(
  content: string,
  metadata: Record<string, Record<string, unknown>>
): string {
  const segments = splitFencedBlocks(content);
  return segments
    .map(([inCode, chunk]) => (inCode ? chunk : transformProse(chunk, metadata)))
    .join("");
}

function transformProse(
  chunk: string,
  metadata: Record<string, Record<string, unknown>>
): string {
  const { protected: prot, restore } = protectInlineCode(chunk);
  const transformed = prot.replace(LINK_RE, (_match, prefix: string, raw: string) => {
    const isEmbed = prefix === "!";
    const parsed = parseLink(raw);
    const noteName = parsed.noteName;

    // Embedded files (images, PDFs, …)
    if (isEmbed && noteName.includes(".")) {
      const ext = noteName.slice(noteName.lastIndexOf(".")).toLowerCase();
      if (ext !== ".md") {
        if (isImage(noteName)) {
          return `![](${noteName})`;
        }
        // Non-image embed — sidecar lookup
        const meta = metadata[noteName];
        if (meta && typeof meta["cite-key"] === "string") {
          return `[@${meta["cite-key"]}]`;
        }
        return `[Embedded file: ${noteName}]`;
      }
    }

    // Regular link or markdown transclusion
    const meta = metadata[noteName];
    if (meta && typeof meta["cite-key"] === "string") {
      return `[@${meta["cite-key"]}]`;
    }

    // Missing-note fallback chain
    if (parsed.displayText) return parsed.displayText;
    if (parsed.heading) return `${noteName}, section ${parsed.heading}`;
    if (parsed.blockId) return `${noteName}, block ${parsed.blockId}`;
    return noteName;
  });
  return restore(transformed);
}
