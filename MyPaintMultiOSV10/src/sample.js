(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyPaintSample = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function wave(x0, y0, length, amplitude, steps) {
    const points = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      points.push({ x: x0 + length * t, y: y0 + Math.sin(t * Math.PI * 2) * amplitude });
    }
    return points;
  }

  const welcome = {
    name: "welcome.mpaint",
    width: 900,
    height: 560,
    background: "#ffffff",
    shapes: [
      { id: "w-sky", kind: "rect", x: 40, y: 40, w: 820, h: 300, color: "#60a5fa", fill: "#dbeafe", width: 3 },
      { id: "w-sun", kind: "ellipse", x: 660, y: 70, w: 120, h: 120, color: "#f59e0b", fill: "#fde68a", width: 3 },
      { id: "w-hill", kind: "ellipse", x: 60, y: 240, w: 420, h: 220, color: "#16a34a", fill: "#bbf7d0", width: 3 },
      { id: "w-road", kind: "line", x: 80, y: 500, w: 740, h: -60, color: "#78716c", width: 8 },
      { id: "w-wave", kind: "brush", color: "#0ea5e9", width: 4, points: wave(120, 420, 600, 18, 48) },
      { id: "w-note", kind: "pencil", color: "#111827", width: 2, points: [
        { x: 120, y: 120 }, { x: 180, y: 90 }, { x: 240, y: 140 }, { x: 300, y: 100 },
      ] },
      { id: "w-title", kind: "text", x: 110, y: 220, w: 420, h: 40, text: "MyPaint 10.0", color: "#1f2937", fontFamily: "Segoe UI", fontSize: 44, fontStyle: "bold", width: 1 },
    ],
  };

  const shapes = {
    name: "shapes.mpaint",
    width: 720,
    height: 480,
    background: "#f8fafc",
    shapes: [
      { id: "s-rect", kind: "rect", x: 60, y: 60, w: 200, h: 140, color: "#dc2626", fill: "", width: 4 },
      { id: "s-ellipse", kind: "ellipse", x: 320, y: 60, w: 200, h: 140, color: "#7c3aed", fill: "#ede9fe", width: 4 },
      { id: "s-line", kind: "line", x: 60, y: 260, w: 460, h: 120, color: "#0f766e", width: 6 },
      { id: "s-text", kind: "text", x: 60, y: 440, w: 300, h: 30, text: "shapes", color: "#111827", fontFamily: "Segoe UI", fontSize: 32, fontStyle: "italic", width: 1 },
    ],
  };

  return { welcome: welcome, shapes: shapes, wave: wave };
});
