const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

export function classifyDrop(file) {
  const name = String(file?.name || "");
  const type = String(file?.type || "");
  if (name.toLowerCase().endsWith(".myweather")) return "document";
  if (type.startsWith("image/") || IMAGE_EXT.test(name)) return "image";
  return "unknown";
}

export function acceptImage(file) {
  if (classifyDrop(file) !== "image") return { ok: false, reason: "type" };
  return { ok: true };
}
