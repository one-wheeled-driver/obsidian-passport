import type { AppLike, FoundNoteMetadata } from "../types.js";
import { ensureCitable } from "../lib/cite-key.js";
import { splitFencedBlocks } from "../lib/fenced-blocks.js";
import { parseLink } from "../lib/parse-link.js";
import { resolveNote } from "../services/note-resolver.js";
import { readNoteMetadata } from "../services/metadata-reader.js";

export interface FindLinkedNotesOptions {
  /** Abort with an Error on the first missing note (caller can map to exit). */
  strict?: boolean;
}

const WIKILINK_RE = /!?\[\[([^\]]+)\]\]/g;

/**
 * Extract every `[[wiki-link]]` and `![[transclusion]]` from a document and
 * resolve each into citable metadata.
 *
 * Mirrors the Python `find_linked_notes` (vault_passport.py:307-367):
 *   - Skips links inside fenced code blocks and inline code spans
 *   - Deduplicates by note name (the part before # or |)
 *   - Image embeds (.png, .jpg, …) produce no metadata — caller handles them
 *   - Non-markdown embeds (e.g. .pdf) check for an adjacent .md sidecar
 *   - Notes that exist but lack frontmatter still get metadata via
 *     ensureCitable (auto-derived cite-key + title)
 *   - Missing notes produce 'file_not_found' issues; strict mode throws
 */
export async function findLinkedNotes(
  app: AppLike,
  content: string,
  sourcePath: string,
  options: FindLinkedNotesOptions = {}
): Promise<FoundNoteMetadata> {
  const { strict = false } = options;
  const metadata: Record<string, Record<string, unknown>> = {};
  const issues: FoundNoteMetadata["issues"] = [];
  const seen = new Set<string>();

  const proseChunks = splitFencedBlocks(content)
    .filter(([inCode]) => !inCode)
    .map(([, chunk]) => chunk);
  // Strip inline code spans before scanning for links — same approach as Python
  const prose = proseChunks.join("").replace(/`+[^`]+`+/g, "");

  const linkBodies = collectLinks(prose);

  for (const raw of linkBodies) {
    const parsed = parseLink(raw);
    const noteName = parsed.noteName;
    if (seen.has(noteName)) continue;
    seen.add(noteName);

    // Embedded files: figure out by extension
    const dot = noteName.lastIndexOf(".");
    if (dot > 0) {
      const ext = noteName.slice(dot).toLowerCase();
      if (ext !== ".md") {
        // Non-markdown embed — try a sidecar with the same stem
        const stem = noteName.slice(0, dot);
        const sidecar = resolveNote(app, stem, sourcePath);
        if (sidecar) {
          const yaml = await readNoteMetadata(app, sidecar);
          metadata[noteName] = ensureCitable(yaml, stem);
        }
        continue;
      }
    }

    // Regular note — resolve and read metadata
    const file = resolveNote(app, noteName, sourcePath);
    if (file) {
      const yaml = await readNoteMetadata(app, file);
      metadata[noteName] = ensureCitable(yaml, noteName);
    } else {
      const issue = { type: "file_not_found" as const, note: noteName };
      issues.push(issue);
      const msg = `Warning: '${noteName}.md' not found in vault`;
      if (strict) {
        throw new Error(`${msg} — aborting (--strict mode)`);
      }
      console.error(msg);
    }
  }

  return { metadata, issues };
}

function collectLinks(prose: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  WIKILINK_RE.lastIndex = 0;
  while ((m = WIKILINK_RE.exec(prose)) !== null) {
    if (m[1] !== undefined) out.push(m[1]);
  }
  return out;
}
