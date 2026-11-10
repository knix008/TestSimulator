// A synthetic portrait for the tests (no image decoder in Node): background, shoulders, a skin-coloured
// head with dark eyes, brows, a nose shadow and a red mouth, at known places.
import { createRaster } from '../../src/engine/raster.js';

export function syntheticPortrait(width = 480, height = 600, { cx = width / 2, cy = height * 0.4, rx = width * 0.2, ry = width * 0.26 } = {}) {
  const r = createRaster(width, height);
  const d = r.data;
  const eyes = [[cx - rx * 0.38, cy - ry * 0.1], [cx + rx * 0.38, cy - ry * 0.1]];
  const mouth = [cx, cy + ry * 0.52];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let c = [70 + (y / height) * 40, 110, 150 - (x / width) * 30]; // blue-grey wall
      if (y > cy + ry * 1.25 && Math.abs(x - cx) < rx * (0.5 + (y - cy - ry * 1.25) / 60)) c = [40, 50, 90]; // shirt
      if (Math.abs(x - cx) < rx * 0.42 && y > cy + ry * 0.8 && y < cy + ry * 1.4) c = [205, 150, 120]; // neck
      const head = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (head < 1) c = [222, 172, 140];
      if (head < 1 && y < cy - ry * 0.55) c = [60, 40, 30]; // hair
      for (const [ex, ey] of eyes) {
        if (((x - ex) / (rx * 0.13)) ** 2 + ((y - ey) / (rx * 0.07)) ** 2 < 1) c = [245, 245, 245];
        if (Math.hypot(x - ex, y - ey) < rx * 0.055) c = [30, 25, 25];
        if (Math.abs(y - (ey - ry * 0.16)) < 3 && Math.abs(x - ex) < rx * 0.16) c = [70, 45, 35];
      }
      if (Math.abs(x - cx) < rx * 0.06 && y > cy + ry * 0.12 && y < cy + ry * 0.3) c = [190, 135, 110];
      if (((x - mouth[0]) / (rx * 0.3)) ** 2 + ((y - mouth[1]) / (rx * 0.07)) ** 2 < 1) c = [170, 60, 70];
      const i = (y * width + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  return { raster: r, truth: { cx, cy, rx, ry, eyes, mouth } };
}
