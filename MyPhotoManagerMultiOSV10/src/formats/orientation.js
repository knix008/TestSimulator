// EXIF orientation (1–8) as "flip horizontally, then rotate clockwise r × 90°".
//
//   1 normal          2 flip H            3 rotate 180        4 flip V
//   5 transpose       6 rotate 90 CW      7 transverse        8 rotate 270 CW
//
// Composing orientations is how JPEG rotation stays lossless: only the tag changes.

const TABLE = { 1: [0, 0], 2: [1, 0], 3: [0, 2], 4: [1, 2], 5: [1, 3], 6: [0, 1], 7: [1, 1], 8: [0, 3] };

export function decompose(orientation) {
  const [flip, rotate] = TABLE[orientation] ?? TABLE[1];
  return { flip: Boolean(flip), rotate };
}

export function compose({ flip, rotate }) {
  const r = ((rotate % 4) + 4) % 4;
  return Number(Object.keys(TABLE).find((key) => TABLE[key][0] === Number(Boolean(flip)) && TABLE[key][1] === r));
}

/** Orientation after rotating the displayed image by `quarterTurns` × 90° clockwise. */
export function rotateOrientation(orientation, quarterTurns) {
  const { flip, rotate } = decompose(orientation);
  return compose({ flip, rotate: rotate + quarterTurns });
}

/** Orientation after mirroring the displayed image left↔right (or top↔bottom when `vertical`). */
export function flipOrientation(orientation, vertical = false) {
  const { flip, rotate } = decompose(orientation);
  // F·R(r) = R(−r)·F; a vertical flip is a horizontal flip followed by 180°.
  return compose({ flip: !flip, rotate: -rotate + (vertical ? 2 : 0) });
}

/** True when the orientation swaps width and height. */
export const swapsAxes = (orientation) => decompose(orientation).rotate % 2 === 1;

/**
 * Draws `source` (w × h, as stored) into `context` so it appears upright.
 * The canvas must already be sized (h × w when the orientation swaps axes).
 */
export function drawOriented(context, source, width, height, orientation) {
  const { flip, rotate } = decompose(orientation);
  context.save();
  switch (rotate) {
    case 1: context.translate(height, 0); context.rotate(Math.PI / 2); break;
    case 2: context.translate(width, height); context.rotate(Math.PI); break;
    case 3: context.translate(0, width); context.rotate(-Math.PI / 2); break;
    default: break;
  }
  if (flip) { context.translate(width, 0); context.scale(-1, 1); }
  context.drawImage(source, 0, 0, width, height);
  context.restore();
}

/** Where pixel (x, y) of the stored image lands after the orientation (for tests and maps). */
export function mapPoint(x, y, width, height, orientation) {
  const { flip, rotate } = decompose(orientation);
  let px = flip ? width - 1 - x : x;
  let py = y;
  let w = width;
  let h = height;
  for (let i = 0; i < rotate; i++) {
    [px, py] = [h - 1 - py, px];
    [w, h] = [h, w];
  }
  return [px, py];
}
