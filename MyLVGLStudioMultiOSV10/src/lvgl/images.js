// The project's images. The document only names them (project.images); the bytes stay out of it,
// so undo history stays small. Each image keeps its original file and its decoded pixels.
const store = new Map();
const key = (name) => String(name);

export const imageData = (name) => store.get(key(name)) ?? null;
export const clearImages = () => store.clear();
export const removeImage = (name) => store.delete(key(name));

/** Registers an image: its pixels (RGBA, straight alpha) and its original file as base64. */
export function addImage(name, { w, h, rgba, base64 = "" }) {
  const bgra = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    bgra[i] = rgba[i + 2];
    bgra[i + 1] = rgba[i + 1];
    bgra[i + 2] = rgba[i];
    bgra[i + 3] = rgba[i + 3];
  }
  store.set(key(name), { w, h, bgra, base64 });
}

/** A file name's extension, lower case, without the dot. */
export const extensionOf = (file) => (/\.([a-z0-9]+)$/i.exec(file)?.[1] ?? "png").toLowerCase();

/** Decodes an image file (base64) to pixels, in the browser. */
export async function decodeImage(base64, extension) {
  const type = extension === "jpg" ? "jpeg" : extension === "svg" ? "svg+xml" : extension;
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: `image/${type}` }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0);
  const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
  return { w: bitmap.width, h: bitmap.height, rgba: data };
}

/** The image files of a project folder, keyed by path inside the folder, as base64. */
export function imageFiles(project) {
  const files = {};
  for (const image of project.images ?? []) {
    const data = imageData(image.name);
    if (data?.base64) files[image.file] = data.base64;
  }
  return files;
}
