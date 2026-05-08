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

  it("mounts the vault root at /vault (rw)", () => {
    const cmd = buildPandocCommand({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      vaultPath: VAULT,
    });
    const vIdx = cmd.indexOf("-v");
    expect(vIdx).toBeGreaterThan(-1);
    expect(cmd[vIdx + 1]).toBe(`${VAULT}:/vault`);
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
    const mounts = cmd.filter((arg, i) => cmd[i - 1] === "-v");
    expect(mounts).toContain("/usr/share/csl:/ext0:ro");
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
    const extMounts = cmd
      .map((a, i) => (cmd[i - 1] === "-v" && a.includes(":ro") ? a : null))
      .filter((x): x is string => x !== null);
    expect(extMounts).toEqual(["/shared:/ext0:ro"]);
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

  it("read-only-mounts external directories", () => {
    const cmd = buildPandocCommand({
      mdPath: `${VAULT}/build/doc.md`,
      bibPath: `${VAULT}/build/refs.bib`,
      pdfPath: `${VAULT}/doc.pdf`,
      cslPath: "/elsewhere/style.csl",
      vaultPath: VAULT,
    });
    expect(cmd).toContain("/elsewhere:/ext0:ro");
  });
});

describe("buildPandocCommand — adversarial cases", () => {
  it("preserves spaces in vault paths verbatim in the volume mount", () => {
    const v = "/path/with spaces/vault";
    const cmd = buildPandocCommand({
      mdPath: `${v}/build/doc.md`,
      bibPath: `${v}/build/refs.bib`,
      pdfPath: `${v}/doc.pdf`,
      vaultPath: v,
    });
    const vIdx = cmd.indexOf("-v");
    expect(cmd[vIdx + 1]).toBe(`${v}:/vault`);
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
    const vIdx = cmd.indexOf("-v");
    expect(cmd[vIdx + 1]).toBe(`${v}:/vault`);
  });
});
