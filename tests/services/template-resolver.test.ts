import { describe, it, expect } from "vitest";
import { resolveTemplate } from "../../src/services/template-resolver.js";
import type { AdapterLike } from "../../src/types.js";

const VAULT = "/path/to/vault";
const PLUGIN_DIR = ".obsidian/plugins/vault-passport";

/** Adapter mock whose `exists()` answers from a Set of vault-relative paths. */
function makeAdapter(existing: string[]): AdapterLike {
  const set = new Set(existing);
  return {
    exists: async (p) => set.has(p),
  };
}

describe("resolveTemplate — empty / whitespace name", () => {
  it("returns undefined when name is empty", async () => {
    const out = await resolveTemplate({
      adapter: makeAdapter([]),
      vaultPath: VAULT,
      pluginDir: PLUGIN_DIR,
      templateName: "",
      vaultTemplateDir: "templates",
    });
    expect(out).toBeUndefined();
  });

  it("returns undefined when name is whitespace only", async () => {
    const out = await resolveTemplate({
      adapter: makeAdapter([]),
      vaultPath: VAULT,
      pluginDir: PLUGIN_DIR,
      templateName: "   ",
      vaultTemplateDir: "templates",
    });
    expect(out).toBeUndefined();
  });
});

describe("resolveTemplate — vault folder (Python TestTemplateSupport.test_plugin_template_passed_to_pandoc + vault_template_takes_priority)", () => {
  it("returns a LocalTemplate when the template lives in the vault folder", async () => {
    const out = await resolveTemplate({
      adapter: makeAdapter(["templates/custom.latex"]),
      vaultPath: VAULT,
      pluginDir: PLUGIN_DIR,
      templateName: "custom.latex",
      vaultTemplateDir: "templates",
    });
    expect(out).toEqual({
      absolutePath: `${VAULT}/templates/custom.latex`,
    });
  });

  it("prefers the vault folder over the plugin folder when both contain the template", async () => {
    const out = await resolveTemplate({
      adapter: makeAdapter([
        "templates/shared.latex",
        `${PLUGIN_DIR}/templates/shared.latex`,
      ]),
      vaultPath: VAULT,
      pluginDir: PLUGIN_DIR,
      templateName: "shared.latex",
      vaultTemplateDir: "templates",
    });
    expect(out).toEqual({
      absolutePath: `${VAULT}/templates/shared.latex`,
    });
  });
});

describe("resolveTemplate — plugin folder fallback", () => {
  it("falls back to the plugin's templates/ when vault folder doesn't contain it", async () => {
    const out = await resolveTemplate({
      adapter: makeAdapter([`${PLUGIN_DIR}/templates/per-user.latex`]),
      vaultPath: VAULT,
      pluginDir: PLUGIN_DIR,
      templateName: "per-user.latex",
      vaultTemplateDir: "templates",
    });
    expect(out).toEqual({
      absolutePath: `${VAULT}/${PLUGIN_DIR}/templates/per-user.latex`,
    });
  });
});

describe("resolveTemplate — custom vault template folder", () => {
  it("respects a non-default vaultTemplateDir setting (Python test_custom_vault_template_dir)", async () => {
    const out = await resolveTemplate({
      adapter: makeAdapter(["pandoc-templates/mytemplate.latex"]),
      vaultPath: VAULT,
      pluginDir: PLUGIN_DIR,
      templateName: "mytemplate.latex",
      vaultTemplateDir: "pandoc-templates",
    });
    expect(out).toEqual({
      absolutePath: `${VAULT}/pandoc-templates/mytemplate.latex`,
    });
  });
});

describe("resolveTemplate — bare-name fallback", () => {
  it("returns the bare name as a string when nothing local matches (Python test_unresolved_template_passed_as_bare_name)", async () => {
    const out = await resolveTemplate({
      adapter: makeAdapter([]),
      vaultPath: VAULT,
      pluginDir: PLUGIN_DIR,
      templateName: "eisvogel",
      vaultTemplateDir: "templates",
    });
    expect(out).toBe("eisvogel");
  });

  it("returns the bare name even with whitespace trimmed", async () => {
    const out = await resolveTemplate({
      adapter: makeAdapter([]),
      vaultPath: VAULT,
      pluginDir: PLUGIN_DIR,
      templateName: "  eisvogel  ",
      vaultTemplateDir: "templates",
    });
    expect(out).toBe("eisvogel");
  });
});

describe("resolveTemplate — robustness", () => {
  it("treats adapter.exists() throwing as 'not present' (try next candidate)", async () => {
    let calls = 0;
    const throwingAdapter: AdapterLike = {
      exists: async (p) => {
        calls += 1;
        if (p.startsWith("templates/")) {
          throw new Error("simulated adapter failure");
        }
        return p.includes(PLUGIN_DIR);
      },
    };
    const out = await resolveTemplate({
      adapter: throwingAdapter,
      vaultPath: VAULT,
      pluginDir: PLUGIN_DIR,
      templateName: "custom.latex",
      vaultTemplateDir: "templates",
    });
    // First check threw; second succeeded
    expect(calls).toBe(2);
    expect(out).toEqual({
      absolutePath: `${VAULT}/${PLUGIN_DIR}/templates/custom.latex`,
    });
  });

  it("handles Windows-style pluginDir with backslashes by normalising to forward slashes for the vault-relative check", async () => {
    // The adapter (Obsidian's FileSystemAdapter) wants vault-relative paths
    // with forward slashes regardless of host OS.
    const out = await resolveTemplate({
      adapter: makeAdapter([
        ".obsidian/plugins/vault-passport/templates/custom.latex",
      ]),
      vaultPath: "C:\\Users\\x\\vault",
      pluginDir: ".obsidian\\plugins\\vault-passport",
      templateName: "custom.latex",
      vaultTemplateDir: "templates",
    });
    expect(out).not.toBeUndefined();
    expect(typeof out).toBe("object");
  });
});
