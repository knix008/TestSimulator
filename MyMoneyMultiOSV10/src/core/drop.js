const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
/** Icon files are pictures, but never backgrounds: they are tiny and tile badly. */
const ICON_EXT = /\.(ico|icns|cur)$/i;
const ICON_TYPE = /^image\/(x-icon|vnd\.microsoft\.icon|icns)$/i;

export function classifyDrop(file) {
  const name = String(file?.name || "");
  const type = String(file?.type || "");
  if (name.toLowerCase().endsWith(".mymoney")) return "document";
  // Checked before the general image test: Windows reports an .ico as an image.
  if (ICON_EXT.test(name) || ICON_TYPE.test(type)) return "icon";
  if (type.startsWith("image/") || IMAGE_EXT.test(name)) return "image";
  return "unknown";
}

export function acceptImage(file) {
  const kind = classifyDrop(file);
  if (kind === "icon") return { ok: false, reason: "icon" };
  if (kind !== "image") return { ok: false, reason: "type" };
  return { ok: true };
}
