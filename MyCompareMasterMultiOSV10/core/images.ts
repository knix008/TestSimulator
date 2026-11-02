/**
 * What counts as a picture.
 *
 * The list lives in `core/` rather than in the picture view because two other parts
 * of the app ask the same question about a name they are never going to draw: the
 * directory tree, which picks an icon for every entry it lists, and the server,
 * which decides what it will serve as an image.
 */

export const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "jfif", "gif", "webp", "bmp", "dib",
  "ico", "cur", "avif", "svg", "tif", "tiff", "heic", "heif",
]);

export function isImagePath(target: string | null): boolean {
  if (!target) return false;
  const extension = target.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(extension);
}
