/* The round colour chooser: hue is the angle, saturation the distance from the middle. The disc is
 * always drawn at full value; how dark the colour is comes from a separate control, so a black
 * colour still shows every hue to pick from. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyPaintColorWheel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function hsvToRgb(h, s, v) {
    const f = (n) => {
      const k = (n + h / 60) % 6;
      return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
    };
    return [f(5), f(3), f(1)];
  }

  const toHex = (rgb) => "#" + rgb.map((n) => n.toString(16).padStart(2, "0")).join("");
  const hsvToHex = (h, s, v) => toHex(hsvToRgb(h, s, v));

  function hexToHsv(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const span = max - Math.min(r, g, b);
    let h = 0;
    if (span) {
      if (max === r) h = ((g - b) / span + 6) % 6;
      else if (max === g) h = (b - r) / span + 2;
      else h = (r - g) / span + 4;
    }
    return { h: h * 60, s: max ? span / max : 0, v: max };
  }

  /* Paints the disc, softening its edge by a pixel. */
  function paint(canvas) {
    const size = canvas.width;
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(size, size);
    const radius = size / 2;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = x + 0.5 - radius;
        const dy = y + 0.5 - radius;
        const distance = Math.hypot(dx, dy);
        if (distance > radius) continue;
        const rgb = hsvToRgb(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360, distance / radius, 1);
        const at = (y * size + x) * 4;
        image.data[at] = rgb[0];
        image.data[at + 1] = rgb[1];
        image.data[at + 2] = rgb[2];
        image.data[at + 3] = Math.min(1, radius - distance) * 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  /* Hue and saturation at a point given from the disc's top-left, in a disc of that diameter. A
   * point outside lands on the rim while dragging; inside false, it is null. */
  function pick(x, y, diameter, clampToRim) {
    const radius = diameter / 2;
    const dx = x - radius;
    const dy = y - radius;
    const distance = Math.hypot(dx, dy);
    if (distance > radius && !clampToRim) return null;
    return { h: ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360, s: Math.min(1, distance / radius) };
  }

  /* Where a colour sits on the disc, from its top-left. */
  function position(hsv, diameter) {
    const radius = diameter / 2;
    const angle = (hsv.h * Math.PI) / 180;
    return { x: radius + Math.cos(angle) * hsv.s * radius, y: radius + Math.sin(angle) * hsv.s * radius };
  }

  return { paint: paint, pick: pick, position: position, hsvToHex: hsvToHex, hexToHsv: hexToHsv };
});
