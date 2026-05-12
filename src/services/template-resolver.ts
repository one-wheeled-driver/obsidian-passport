import { join, posix } from "node:path";

import type { AdapterLike } from "../types.js";
import type { LocalTemplate } from "../lib/docker-args.js";

export interface ResolveTemplateOptions {
  /** Obsidian vault adapter (used to test file existence). */
  adapter: AdapterLike;
  /** Absolute filesystem path to the vault root. */
  vaultPath: string;
  /** Vault-relative path to the plugin's own folder (e.g. `.obsidian/plugins/vault-passport`). */
  pluginDir: string;
  /** User-configured template name (e.g. "eisvogel" or "custom.latex"). */
  templateName: string;
  /** User-configured vault-template subfolder (default: "templates"). */
  vaultTemplateDir: string;
}

/**
 * Resolve a pandoc template by name. Tries, in order:
 *   1. `<vault>/<vaultTemplateDir>/<name>` — shared template committed to the vault
 *   2. `<vault>/<pluginDir>/templates/<name>` — per-user template inside the plugin folder
 *   3. Return the bare `name` as a string — let pandoc/extra resolve it from
 *      its built-in data dir (e.g. "eisvogel")
 *
 * Returns `undefined` if `templateName` is empty/whitespace.
 *
 * Mirrors `resolve_template` from the Python implementation
 * (vault_passport.py:462-487), plus the TS-specific distinction between
 * "local file path the runner needs to mount" (LocalTemplate) and "bare
 * string passed through to pandoc" (plain string).
 */
export async function resolveTemplate(
  options: ResolveTemplateOptions
): Promise<string | LocalTemplate | undefined> {
  const name = options.templateName.trim();
  if (!name) return undefined;

  // Build candidates as vault-relative POSIX paths for the adapter check,
  // and as absolute host paths for the LocalTemplate result.
  const candidates: Array<{ vaultRel: string; absolute: string }> = [
    {
      vaultRel: posix.join(toPosix(options.vaultTemplateDir), name),
      absolute: join(options.vaultPath, options.vaultTemplateDir, name),
    },
    {
      vaultRel: posix.join(toPosix(options.pluginDir), "templates", name),
      absolute: join(options.vaultPath, options.pluginDir, "templates", name),
    },
  ];

  for (const candidate of candidates) {
    try {
      if (await options.adapter.exists(candidate.vaultRel)) {
        return { absolutePath: candidate.absolute };
      }
    } catch {
      // Adapter threw — treat as "doesn't exist" and try the next candidate.
    }
  }

  // Fallback: pandoc/extra resolves bare names like "eisvogel" itself.
  return name;
}

/** Normalise host-OS path separators to forward slashes for vault-relative paths. */
function toPosix(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).join("/");
}
