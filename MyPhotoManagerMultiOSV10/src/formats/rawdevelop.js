// Real RAW development: LibRaw compiled to
// WebAssembly demosaics the sensor data with the camera's white balance into
// an 8-bit sRGB picture. Runs in LibRaw's own worker.
import { context2d, makeCanvas } from './canvas.js';

/**
 * Develops a RAW file → { source: canvas, width, height }.
 * `whiteBalance`: 'camera' | 'auto' | 'daylight'; `quality` 0–12 (LibRaw interpolation);
 * `half`: half-size output (fast preview).
 */
export async function developRaw(bytes, { whiteBalance = 'camera', quality = 3, half = false, highlight = 0 } = {}) {
  const { default: LibRaw } = await import('libraw-wasm');
  const raw = new LibRaw();
  try {
    await raw.open(new Uint8Array(bytes), {
      useCameraWb: whiteBalance === 'camera',
      useAutoWb: whiteBalance === 'auto',
      outputBps: 8,
      outputColor: 1,
      userQual: quality,
      halfSize: half,
      highlight,
    });
    const image = await raw.imageData();
    if (!image?.data) throw new Error('LibRaw could not develop this file');
    const { width, height, colors } = image;
    const source = image.data instanceof Uint8Array ? image.data : new Uint8Array(image.data);
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, j = 0; i < width * height; i++, j += colors) {
      const o = i * 4;
      rgba[o] = source[j];
      rgba[o + 1] = colors > 1 ? source[j + 1] : source[j];
      rgba[o + 2] = colors > 2 ? source[j + 2] : source[j];
      rgba[o + 3] = 255;
    }
    const canvas = makeCanvas(width, height);
    context2d(canvas).putImageData(new ImageData(rgba, width, height), 0, 0);
    return { source: canvas, width, height };
  } finally {
    raw.dispose?.();
  }
}
