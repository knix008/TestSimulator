/**
 * What counts as an archive.
 *
 * Only the names, with none of the reading: `zip.ts` opens archives and so brings
 * `node:fs` and `node:zlib` with it, which the renderer has no business bundling.
 * The directory tree asks this question about every entry it draws and never opens
 * one, so the question lives apart from the answer — the same split as
 * `images.ts` beside the picture view.
 */

/** Extensions read as archives. The format is the same for all of them. */
export const ARCHIVE_EXTENSIONS = new Set([
  "zip", "jar", "war", "ear", "apk", "aar", "xpi", "whl", "nupkg", "vsix", "docx",
  "xlsx", "pptx", "odt", "ods", "odp", "epub", "crx", "ipa",
]);

export function isArchivePath(file: string): boolean {
  const name = file.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  const extension = name.includes(".") ? name.split(".").pop()! : "";
  return ARCHIVE_EXTENSIONS.has(extension);
}
