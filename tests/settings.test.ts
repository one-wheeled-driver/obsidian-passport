import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, parseExtraVars } from "../src/settings.js";

describe("DEFAULT_SETTINGS — back-compat with the Python-era plugin", () => {
  it("has all the same keys the Python plugin's data.json used", () => {
    expect(Object.keys(DEFAULT_SETTINGS).sort()).toEqual(
      [
        "callouts",
        "extraVars",
        "openPdfAfterExport",
        "pythonPath",
        "strictMode",
        "templateName",
        "toc",
        "vaultTemplateDir",
      ].sort()
    );
  });

  it("preserves the same default values", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      pythonPath: "python3",
      strictMode: false,
      openPdfAfterExport: true,
      toc: false,
      templateName: "",
      vaultTemplateDir: "templates",
      extraVars: "",
      callouts: false,
    });
  });
});

describe("parseExtraVars", () => {
  it("returns an empty array for empty input", () => {
    expect(parseExtraVars("")).toEqual([]);
  });

  it("parses one entry per line", () => {
    expect(parseExtraVars("colorlinks=true\ngeometry=margin=2cm")).toEqual([
      "colorlinks=true",
      "geometry=margin=2cm",
    ]);
  });

  it("trims surrounding whitespace from each line", () => {
    expect(parseExtraVars("  a=1  \n  b=2  ")).toEqual(["a=1", "b=2"]);
  });

  it("ignores lines without an equals sign", () => {
    expect(parseExtraVars("valid=yes\ngarbage line\nalso=ok")).toEqual([
      "valid=yes",
      "also=ok",
    ]);
  });

  it("ignores blank lines", () => {
    expect(parseExtraVars("a=1\n\n\nb=2\n")).toEqual(["a=1", "b=2"]);
  });
});
