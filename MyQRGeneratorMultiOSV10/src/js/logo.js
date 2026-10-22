/** Image files the logo picker and drag-and-drop accept. */

// Extensions count even when the OS reports no image MIME. Windows often leaves
// .avif and .tif as an empty type.
export const LOGO_EXTS = ["apng", "avif", "bmp", "dib", "gif", "ico", "jfif", "jpeg", "jpg", "pjpeg", "png", "svg", "tif", "tiff", "webp"];

export const LOGO_ACCEPT = `image/*,image/avif,image/bmp,image/gif,image/jpeg,image/png,image/svg+xml,image/tiff,image/webp,image/x-icon,image/vnd.microsoft.icon,${LOGO_EXTS.map((ext) => `.${ext}`).join(",")}`;

export function logoExtension(name) {
  const fileName = String(name || "");
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
}

/** True for an image MIME, or a known extension when the OS did not set one. */
export function isLogoFile(file) {
  if (!file) return false;
  return String(file.type || "").startsWith("image/") || LOGO_EXTS.includes(logoExtension(file.name));
}
