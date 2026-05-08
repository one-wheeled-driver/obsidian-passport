/**
 * Structural typing for the Obsidian APIs our services actually use.
 *
 * Defined here (rather than importing from `obsidian` directly) so unit
 * tests can satisfy the same contract with hand-rolled mocks without
 * pulling in the full Electron-bound `obsidian` runtime.
 *
 * The real Obsidian types from `import("obsidian")` are structurally
 * compatible with these — they expose strictly more, and we accept that.
 */

export interface VaultFileLike {
  /** Vault-relative path with forward slashes (e.g. `references/Note.md`). */
  path: string;
  /** File basename including extension (e.g. `Note.md`). */
  name: string;
  /** File basename without extension (e.g. `Note`). */
  basename: string;
  /** Lower-case extension without the leading dot (e.g. `md`). */
  extension: string;
}

export interface MetadataCacheLike {
  getFileCache(file: VaultFileLike): {
    frontmatter?: Record<string, unknown> | null;
  } | null;
  getFirstLinkpathDest(linkpath: string, sourcePath: string): VaultFileLike | null;
}

export interface VaultLike {
  getMarkdownFiles(): VaultFileLike[];
  cachedRead(file: VaultFileLike): Promise<string>;
}

export interface AppLike {
  vault: VaultLike;
  metadataCache: MetadataCacheLike;
}

// ----------------------------------------------------------------------------
// Domain types used across pipeline modules
// ----------------------------------------------------------------------------

export interface ParsedLink {
  noteName: string;
  heading: string | null;
  blockId: string | null;
  displayText: string | null;
}

export interface NoteIssue {
  type: "file_not_found";
  note: string;
}

export interface FoundNoteMetadata {
  /** Map from the user's link text → the note's frontmatter (always citable). */
  metadata: Record<string, Record<string, unknown>>;
  /** Notes the document referenced that we couldn't resolve. */
  issues: NoteIssue[];
}
