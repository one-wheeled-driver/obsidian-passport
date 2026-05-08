import { IMAGE_EXTENSIONS } from "../constants.js";

/**
 * Check whether a filename has one of the recognised image extensions
 * (case-insensitive). Mirrors `is_image` (vault_passport.py:214-216).
 */
export function isImage(filename: string): boolean {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return false;
  const ext = filename.slice(dot).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}
