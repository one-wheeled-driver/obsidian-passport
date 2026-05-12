/**
 * Hand-rolled Obsidian API mocks for unit tests.
 *
 * The real `obsidian` module is only available inside the Obsidian app, so
 * we construct lightweight TFile-shaped objects and an `App` with the
 * methods our services rely on:
 *   - `app.vault.getMarkdownFiles()`
 *   - `app.vault.cachedRead(file)`
 *   - `app.metadataCache.getFileCache(file)`
 *   - `app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath)`
 */

export interface MockTFile {
  path: string;
  name: string;
  basename: string;
  extension: string;
}

export function makeMockFile(filePath: string): MockTFile {
  // Strip a vault prefix and any leading slash so paths match Obsidian's
  // vault-relative format ("references/Note.md", not "/abs/.../Note.md").
  const rel = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  const base = rel.split("/").pop() ?? rel;
  const dot = base.lastIndexOf(".");
  return {
    path: rel,
    name: base,
    basename: dot >= 0 ? base.slice(0, dot) : base,
    extension: dot >= 0 ? base.slice(dot + 1) : "",
  };
}

interface FileEntry {
  file: MockTFile;
  content: string;
  frontmatter: Record<string, unknown> | null;
}

export class MockVault {
  private files: Map<string, FileEntry> = new Map();

  /**
   * Default Obsidian config folder name. Tests that exercise a renamed
   * config folder (the Obsidian user-config feature) can mutate this.
   */
  configDir = ".obsidian";

  /** Register a file at the given vault-relative path. */
  add(
    filePath: string,
    content: string = "",
    frontmatter: Record<string, unknown> | null = null
  ): MockTFile {
    const file = makeMockFile(filePath);
    this.files.set(file.path, { file, content, frontmatter });
    return file;
  }

  /** Vault.getMarkdownFiles equivalent. */
  getMarkdownFiles(): MockTFile[] {
    return [...this.files.values()]
      .filter(({ file }) => file.extension === "md")
      .map(({ file }) => file);
  }

  /** Vault.getFiles equivalent (all extensions). */
  getFiles(): MockTFile[] {
    return [...this.files.values()].map(({ file }) => file);
  }

  /** Vault.cachedRead / read equivalent. */
  async cachedRead(file: MockTFile): Promise<string> {
    const entry = this.files.get(file.path);
    if (!entry) throw new Error(`MockVault: file not found ${file.path}`);
    return entry.content;
  }

  /** Look up a registered file by path. */
  getByPath(filePath: string): FileEntry | undefined {
    return this.files.get(filePath);
  }
}

export class MockMetadataCache {
  constructor(private vault: MockVault) {}

  /** MetadataCache.getFileCache equivalent. */
  getFileCache(file: MockTFile): { frontmatter: Record<string, unknown> | null } | null {
    const entry = this.vault.getByPath(file.path);
    if (!entry) return null;
    return { frontmatter: entry.frontmatter };
  }

  /**
   * MetadataCache.getFirstLinkpathDest equivalent — Obsidian's authoritative
   * link resolver. We reproduce the simplest version of its logic:
   *   1. Direct match on the linkpath as a vault-relative path
   *   2. Match by file basename (shortest-path heuristic)
   *   3. Return null
   *
   * The real implementation is more sophisticated (handles aliases via
   * frontmatter, etc.) — services that depend on it pass through to the
   * real API at runtime; the mock just covers the basics our tests need.
   */
  getFirstLinkpathDest(linkpath: string, _sourcePath: string): MockTFile | null {
    // Trim any extension the user may have written
    const stripped = linkpath.replace(/\.md$/i, "");
    // 1. Direct path match
    const direct = this.vault.getByPath(`${stripped}.md`);
    if (direct) return direct.file;
    // 2. Match by basename — first registered file with that basename wins
    const candidates = this.vault
      .getMarkdownFiles()
      .filter((f) => f.basename === stripped);
    return candidates[0] ?? null;
  }
}

export interface MockApp {
  vault: MockVault;
  metadataCache: MockMetadataCache;
}

export function mockApp(): MockApp {
  const vault = new MockVault();
  const metadataCache = new MockMetadataCache(vault);
  return { vault, metadataCache };
}
