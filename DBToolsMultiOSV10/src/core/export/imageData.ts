// Embedding an image in a document needs two things the data: URL does not
// hand over directly — the bytes, and the picture's real dimensions.
//
// Word and Excel both want an explicit on-page size. Giving them a fixed one
// stretches the diagram: a wide schema and a tall one are not the same shape.
// Reading the intrinsic size and scaling it down proportionally keeps the ERD
// looking the way it does on the canvas.

/** Raw bytes behind a `data:...;base64,...` URL. */
export function decodeDataUrl(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface PixelSize {
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Intrinsic size from a PNG's IHDR chunk, which always comes first: an 8-byte
 * signature, then the chunk length and type, then width and height as
 * big-endian 32-bit values. No decoding needed — the header is enough.
 *
 * Returns null for anything that is not a PNG, so callers can fall back rather
 * than embedding a wrongly-shaped image.
 */
export function readPngSize(bytes: Uint8Array): PixelSize | null {
  if (bytes.length < 24) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/**
 * Scale `size` down to fit inside the box, keeping its aspect ratio. Never
 * scales up: a small diagram embedded at its own size is sharp, enlarged it is
 * just blurry.
 */
export function fitWithin(size: PixelSize, maxWidth: number, maxHeight: number): PixelSize {
  const ratio = Math.min(maxWidth / size.width, maxHeight / size.height, 1);
  return {
    width: Math.max(1, Math.round(size.width * ratio)),
    height: Math.max(1, Math.round(size.height * ratio)),
  };
}

/**
 * On-page size for an ERD embedded from a data: URL. The diagram is rendered at
 * 2x for sharpness, so its pixel size is deliberately larger than it should
 * appear — `fitWithin` brings it back into the box while keeping the shape.
 * Falls back to the box itself only when the image is unreadable.
 */
export function embeddedImageSize(
  dataUrl: string,
  maxWidth: number,
  maxHeight: number,
): PixelSize {
  const size = readPngSize(decodeDataUrl(dataUrl));
  if (!size) return { width: maxWidth, height: maxHeight };
  return fitWithin(size, maxWidth, maxHeight);
}
