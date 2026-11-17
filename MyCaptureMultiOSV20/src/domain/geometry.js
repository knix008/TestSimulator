/** Rectangle spanned by two drag points, in any direction. */
export function rectFromPoints(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/** Whole-pixel rectangle clamped inside a `width` × `height` image. */
export function clampRect(rect, width, height) {
  const x = Math.min(Math.max(0, Math.floor(rect.x)), width);
  const y = Math.min(Math.max(0, Math.floor(rect.y)), height);
  const right = Math.min(width, Math.max(x, Math.ceil(rect.x + rect.width)));
  const bottom = Math.min(height, Math.max(y, Math.ceil(rect.y + rect.height)));
  return { x, y, width: right - x, height: bottom - y };
}

/** Maps a rectangle from view coordinates (CSS pixels) to image pixels. */
export function viewToImage(rect, view, image) {
  const sx = image.width / view.width;
  const sy = image.height / view.height;
  return clampRect({ x: rect.x * sx, y: rect.y * sy, width: rect.width * sx, height: rect.height * sy }, image.width, image.height);
}

/** Video encoders want even dimensions; never below 2. */
export function evenSize(width, height) {
  return { width: Math.max(2, Math.floor(width / 2) * 2), height: Math.max(2, Math.floor(height / 2) * 2) };
}

/** Largest rectangle with the source's aspect ratio centered in the target. */
export function fitInside(source, target) {
  const scale = Math.min(target.width / source.width, target.height / source.height);
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  return { x: Math.round((target.width - width) / 2), y: Math.round((target.height - height) / 2), width, height };
}

/** Bitrate that keeps screen text sharp without huge files (2–40 Mbps). */
export function videoBitrate(width, height, fps) {
  return Math.round(Math.min(40e6, Math.max(2e6, width * height * fps * 0.12)));
}
