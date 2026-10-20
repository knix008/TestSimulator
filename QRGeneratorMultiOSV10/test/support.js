import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jsQR from "jsqr";
import { loadWasmEncoder } from "../src/js/encoder.js";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let encoderPromise;
/** The real qrcore.wasm (built by scripts/build-wasm.js). */
export function wasmEncoder() {
  encoderPromise ??= loadWasmEncoder(fs.readFileSync(path.join(root, "src", "wasm", "qrcore.wasm")));
  return encoderPromise;
}

/** Paints modules as RGBA pixels with a light quiet zone, the way a camera would see them. */
export function rasterize(modules, size, { scale = 4, margin = 4 } = {}) {
  const width = (size + margin * 2) * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!modules[y * size + x]) continue;
      for (let dy = 0; dy < scale; dy += 1) {
        const row = ((y + margin) * scale + dy) * width;
        for (let dx = 0; dx < scale; dx += 1) {
          const i = (row + (x + margin) * scale + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
  }
  return { data, width, height: width };
}

/** Decodes with jsQR, an independent reader. Returns { text, bytes, version } or null. */
export function decode(modules, size, options) {
  const img = rasterize(modules, size, options);
  const found = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
  return found && { text: found.data, bytes: Uint8Array.from(found.binaryData), version: found.version };
}
