import { describe, it, expect } from "vitest";
import { buildPandocCommand } from "../../src/lib/docker-args.js";

// ----------------------------------------------------------------------------
// buildPandocCommand — pure command builder for the docker run ... pandoc/extra
// invocation. Mirrors the path-translation + flag-assembly logic of
// run_pandoc (vault_passport.py:490-583), without actually spawning anything.
// ----------------------------------------------------------------------------

const VAULT = "/path/to/vault";

function findFlag(cmd: string[], prefix: string): string | undefined {
  return cmd.find((arg) => arg.startsWith(prefix));
}

describe("buildPandocCommand — basic shape", () => {
  it("produces a docker run command with the pandoc/extra image", () => {
    const cmd = buildPandocCommand({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      vaultPath: VAULT,
    });
    expect(cmd[0]).toBe("docker");
    expect(cmd[1]).toBe("run");
    expect(cmd[2]).toBe("--rm");
    expect(cmd).toContain("pandoc/extra");
  });

  it("mounts the vault root at /vault using --mount long-form syntax", () => {
    const cmd = buildPandocCommand({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      vaultPath: VAULT,
    });
    const mIdx = cmd.indexOf("--mount");
    expect(mIdx).toBeGreaterThan(-1);
    expect(cmd[mIdx + 1]).toBe(`type=bind,source=${VAULT},target=/vault`);
    // No legacy -v form should appear
    expect(cmd).not.toContain("-v");
  });

  it("does NOT mark the primary vault mount as readonly", () => {
    const cmd = buildPandocCommand({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      vaultPath: VAULT,
    });
    const mIdx = cmd.indexOf("--mount");
    expect(cmd[mIdx + 1]).not.toContain("readonly");
  });

  it("translates input/output paths to /vault/...", () => {
    const cmd = buildPandocCommand({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/sub/doc.pdf`,
      vaultPath: VAULT,
    });
    expect(cmd).toContain("/vault/build/doc.md");
    expect(cmd).toContain("/vault/sub/doc.pdf");
    const oIdx = cmd.indexOf("-o");
    expect(cmd[oIdx + 1]).toBe("/vault/sub/doc.pdf");
  });

  it("includes --citeproc and --bibliography by default", () => {
    const cmd = buildPandocCommand({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      vaultPath: VAULT,
    });
    expect(cmd).toContain("--citeproc");
    expect(findFlag(cmd, "--bibliography=")).toBe("--bibliography=/vault/build/refs.bib");
  });

  it("defaults to --pdf-engine=xelatex", () => {
    const cmd = buildPandocCommand({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      vaultPath: VAULT,
    });
    expect(cmd).toContain("--pdf-engine=xelatex");
  });
});

describe("buildPandocCommand — citeproc fallback variant", () => {
  it("omits --citeproc and --bibliography when withCiteproc=false", () => {
    const cmd = buildPandocCommand({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      vaultPath: VAULT,
      withCiteproc: false,
    });
    expect(cmd).not.toContain("--citeproc");
    expect(findFlag(cmd, "--bibliography=")).toBeUndefined();
  });
});

describe("buildPandocCommand — optional flags", () => {
  it("adds --toc when toc=true", () => {
    const cmd = buildPandocCommand({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      vaultPath: VAULT,
      toc: true,
    });
    expect(cmd).toContain("--toc");
  });

  it("omits --toc by default", () => {
    const cmd = buildPandocCommand({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      vaultPath: VAULT,
    });
    expect(cmd).not.toContain("--toc");
  });

  it("includes --csl=/vault/... when CSL is inside the vault", () => {
    const cmd = buildPandocCommand({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      cslPath: `${VAULT}/.obsidian/plugins/vp/numbered-title.csl`,
      vaultPath: VAULT,
    });
    expect(findFlag(cmd, "--csl=")).toBe(
      "--csl=/vault/.obsidian/plugins/vp/numbered-title.csl"
    );
  });

  it("forwards extraVars as -V key=value pairs", () => {
    const cmd = buildPandocCommand({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      vaultPath: VAULT,
      extraVars: ["colorlinks=true", "geometry=margin=2cm"],
    });
    const vIndices = cmd.reduce<number[]>((idxs, arg, i) => {
      if (arg === "-V") idxs.push(i);
      return idxs;
    }, []);
    expect(vIndices).toHaveLength(2);
    expect(cmd[vIndices[0]! + 1]).toBe("colorlinks=true");
    expect(cmd[vIndices[1]! + 1]).toBe("geometry=margin=2cm");
  });

  it("respects pdf-engine override in extraVars (no duplicate xelatex)", () => {
    const cmd = buildPandocCommand({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      vaultPath: VAULT,
      extraVars: ["pdf-engine=lualatex"],
    });
    expect(cmd).not.toContain("--pdf-engine=xelatex");
  });
});

describe("buildPandocCommand — template handling", () => {
  it("passes a bare template name as-is to --template", () => {
    const cmd = buildPandocCommand({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      vaultPath: VAULT,
      template: "eisvogel",
    });
    expect(findFlag(cmd, "--template=")).toBe("--template=eisvogel");
  });

  it("translates a local-file template path to /vault/... when inside the vault", () => {
    const cmd = buildPandocCommand({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      vaultPath: VAULT,
      template: { absolutePath: `${VAULT}/templates/custom.latex` },
    });
    expect(findFlag(cmd, "--template=")).toBe(
      "--template=/vault/templates/custom.latex"
    );
  });
});

/** All --mount specs that appear after a --mount flag, in command order. */
function mountSpecs(cmd: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < cmd.length; i += 1) {
    if (cmd[i] === "--mount" && cmd[i + 1] !== undefined) {
      out.push(cmd[i + 1]!);
    }
  }
  return out;
}

describe("buildPandocCommand — extra mounts for files outside the vault", () => {
  it("adds an /ext0 mount when CSL lives outside the vault", () => {
    const cmd = buildPandocCommand({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      cslPath: "/usr/share/csl/style.csl",
      vaultPath: VAULT,
    });
    const csl = findFlag(cmd, "--csl=");
    expect(csl).toBe("--csl=/ext0/style.csl");
    expect(mountSpecs(cmd)).toContain(
      "type=bind,source=/usr/share/csl,target=/ext0,readonly"
    );
  });

  it("groups files in the same external directory under the same mount", () => {
    const cmd = buildPandocCommand({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      cslPath: "/shared/style.csl",
      template: { absolutePath: "/shared/template.latex" },
      vaultPath: VAULT,
    });
    const csl = findFlag(cmd, "--csl=");
    const tmpl = findFlag(cmd, "--template=");
    expect(csl).toBe("--csl=/ext0/style.csl");
    expect(tmpl).toBe("--template=/ext0/template.latex");
    const extMounts = mountSpecs(cmd).filter((s) => s.includes("readonly"));
    expect(extMounts).toEqual([
      "type=bind,source=/shared,target=/ext0,readonly",
    ]);
  });

  it("uses /ext0 and /ext1 for files in different external directories", () => {
    const cmd = buildPandocCommand({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      cslPath: "/dir-a/style.csl",
      template: { absolutePath: "/dir-b/template.latex" },
      vaultPath: VAULT,
    });
    expect(findFlag(cmd, "--csl=")).toBe("--csl=/ext0/style.csl");
    expect(findFlag(cmd, "--template=")).toBe("--template=/ext1/template.latex");
  });

  it("marks every extra mount as readonly", () => {
    const cmd = buildPandocCommand({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      cslPath: "/elsewhere/style.csl",
      vaultPath: VAULT,
    });
    const extra = mountSpecs(cmd).filter((s) => s.includes(",target=/ext"));
    expect(extra.length).toBeGreaterThan(0);
    for (const spec of extra) {
      expect(spec).toContain("readonly");
    }
  });
});

describe("buildPandocCommand — adversarial cases", () => {
  it("preserves spaces in vault paths verbatim in the --mount source", () => {
    const v = "/path/with spaces/vault";
    const cmd = buildPandocCommand({
      mdPath: `${v}/build/doc.md`,
      bibPath: `${v}/build/refs.bib`,
      pdfPath: `${v}/doc.pdf`,
      vaultPath: v,
    });
    // Path with spaces survives as a single argv element thanks to --mount.
    expect(mountSpecs(cmd)).toContain(
      `type=bind,source=${v},target=/vault`
    );
    // The container-side path uses normal slashes
    expect(cmd).toContain("/vault/build/doc.md");
  });

  it("preserves Unicode in vault paths", () => {
    const v = "/home/user/Café/vault";
    const cmd = buildPandocCommand({
      mdPath: `${v}/doc.md`,
      bibPath: `${v}/refs.bib`,
      pdfPath: `${v}/doc.pdf`,
      vaultPath: v,
    });
    expect(mountSpecs(cmd)).toContain(
      `type=bind,source=${v},target=/vault`
    );
  });
});

describe("buildPandocCommand — Windows compatibility safeguards", () => {
  // These tests can't actually run with Windows paths on Linux (path.resolve
  // mangles `C:\...` because the colon isn't a drive separator on POSIX).
  // Instead they verify the *structural* properties that make Windows-safe
  // mounts work: no `-v` form, --mount syntax with commas, and a single
  // argv element per source path so spawn's Windows quoting handles spaces.

  it("never emits the legacy -v form (drive-letter colons would be ambiguous)", () => {
    const cmd = buildPandocCommand({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      cslPath: "/outside/csl.csl", // forces an extra mount too
      vaultPath: VAULT,
    });
    expect(cmd).not.toContain("-v");
    expect(cmd.filter((a) => a === "--mount")).toHaveLength(2);
  });

  it("each --mount spec is one argv element (so spaces in source don't need shell quoting)", () => {
    const v = "/path/with spaces and lots of words/vault";
    const cmd = buildPandocCommand({
      mdPath: `${v}/build/doc.md`,
      bibPath: `${v}/build/refs.bib`,
      pdfPath: `${v}/doc.pdf`,
      vaultPath: v,
    });
    // Walk the cmd: every "--mount" must be followed by exactly one element
    // and that element must contain the full source path with spaces intact.
    const mIdx = cmd.indexOf("--mount");
    const spec = cmd[mIdx + 1] ?? "";
    expect(spec).toContain("with spaces and lots of words");
    expect(spec).toMatch(/^type=bind,source=.+,target=\/vault$/);
  });
});
