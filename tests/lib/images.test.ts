import { describe, it, expect } from "vitest";
import { isImage } from "../../src/lib/images.js";

describe("isImage", () => {
  it.each([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".bmp",
    ".webp",
  ])("recognises %s as an image extension", (ext) => {
    expect(isImage(`photo${ext}`)).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isImage("photo.PNG")).toBe(true);
    expect(isImage("photo.JpG")).toBe(true);
    expect(isImage("photo.WEBP")).toBe(true);
  });

  it.each(["paper.pdf", "video.mp4", "doc.md", "archive.zip"])(
    "rejects non-image extensions: %s",
    (filename) => {
      expect(isImage(filename)).toBe(false);
    }
  );

  it("returns false for files with no extension", () => {
    expect(isImage("README")).toBe(false);
    expect(isImage("Makefile")).toBe(false);
  });

  it("treats only the last dotted suffix as the extension", () => {
    expect(isImage("archive.tar.png")).toBe(true);
    expect(isImage("photo.png.bak")).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(isImage("")).toBe(false);
  });
});
