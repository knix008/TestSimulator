/**
 * The pixel comparison behind the picture view, kept free of the DOM so that it can
 * run in a worker (imageDiff.worker.ts) as well as on the page.
 *
 * On a pair of 12-megapixel screenshots, reading the pixels back and comparing them
 * took a third of a second on the page — long enough to freeze the window. In the
 * worker the window keeps answering while it runs.
 */

export type Rect = { x: number; y: number; width: number; height: number };

export type PixelDiff = {
  /** The union of the two pictures: what the comparison is done over. */
  width: number;
  height: number;
  different: number;
  total: number;
  /** The difference picture's RGBA bytes, ready for an ImageData. */
  map: Uint8ClampedArray;
  /** The changed regions, as boxes over the union, for marking both sides. */
  areas: Rect[];
};

/** How far a channel has to move to count as a change, past encoder noise. */
const THRESHOLD = 8;

/** The grid the changed areas are reported on: fine enough to point, coarse enough to see. */
const BLOCK = 12;

/** The whole comparison in one pass over the union of the two pictures' pixels. */
export function diffPixels(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, height: number): PixelDiff {
  const map = new Uint8ClampedArray(width * height * 4);
  const columns = Math.ceil(width / BLOCK);
  const rows = Math.ceil(height / BLOCK);
  const changed = new Uint8Array(columns * rows);
  let different = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      const delta = Math.max(
        Math.abs(a[at] - b[at]),
        Math.abs(a[at + 1] - b[at + 1]),
        Math.abs(a[at + 2] - b[at + 2]),
        Math.abs(a[at + 3] - b[at + 3]),
      );
      if (delta > THRESHOLD) {
        different += 1;
        changed[Math.floor(y / BLOCK) * columns + Math.floor(x / BLOCK)] = 1;
        // Changed pixels in red, at the strength of the change.
        map[at] = 255;
        map[at + 1] = 60;
        map[at + 2] = 60;
        map[at + 3] = Math.min(255, 90 + delta);
      } else {
        // Unchanged pixels as a dim grey ghost, so the shape is still readable.
        const grey = ((a[at] + a[at + 1] + a[at + 2]) / 3) * 0.3;
        map[at] = grey;
        map[at + 1] = grey;
        map[at + 2] = grey;
        map[at + 3] = a[at + 3] ? 90 : 0;
      }
    }
  }

  return { width, height, different, total: width * height, map, areas: boxes(changed, columns, rows, width, height) };
}

/**
 * The changed blocks, joined into as few boxes as possible.
 *
 * A run of neighbouring blocks across a row becomes one box, and a box is then
 * grown downward while the row below changes in exactly the same columns. A
 * one-word edit in a screenshot comes out as one box rather than forty.
 */
function boxes(changed: Uint8Array, columns: number, rows: number, width: number, height: number): Rect[] {
  const used = new Uint8Array(changed.length);
  const out: Rect[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const at = row * columns + column;
      if (!changed[at] || used[at]) continue;

      let end = column;
      while (end + 1 < columns && changed[row * columns + end + 1] && !used[row * columns + end + 1]) end += 1;

      let last = row;
      const matches = (candidate: number) => {
        if (candidate >= rows) return false;
        for (let x = column; x <= end; x += 1) {
          if (!changed[candidate * columns + x] || used[candidate * columns + x]) return false;
        }
        // Not wider than the run we started with, or the box would claim untouched blocks.
        if (column > 0 && changed[candidate * columns + column - 1]) return false;
        if (end + 1 < columns && changed[candidate * columns + end + 1]) return false;
        return true;
      };
      while (matches(last + 1)) last += 1;

      for (let y = row; y <= last; y += 1) {
        for (let x = column; x <= end; x += 1) used[y * columns + x] = 1;
      }

      out.push({
        x: column * BLOCK,
        y: row * BLOCK,
        width: Math.min(width, (end + 1) * BLOCK) - column * BLOCK,
        height: Math.min(height, (last + 1) * BLOCK) - row * BLOCK,
      });
    }
  }

  return out;
}

/** Draws a picture onto a canvas the size of the union and reads its pixels back. */
export function pixelsOf(
  image: CanvasImageSource,
  width: number,
  height: number,
  canvas: OffscreenCanvas | HTMLCanvasElement,
): Uint8ClampedArray {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true }) as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!context) return new Uint8ClampedArray(width * height * 4);
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, width, height).data;
}
