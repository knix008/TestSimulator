(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.PaintEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FORMAT = "mypaint-document";
  const FORMAT_VERSION = 1;

  const TOOLS = [
    { id: "select", icon: "select", kind: "", drag: true },
    { id: "selectRect", icon: "marquee", kind: "", drag: true, region: "rect" },
    { id: "selectEllipse", icon: "marqueeEllipse", kind: "", drag: true, region: "ellipse" },
    { id: "selectFree", icon: "lasso", kind: "", drag: true, region: "free" },
    { id: "pencil", icon: "pencil", kind: "pencil", drag: true },
    { id: "brush", icon: "brush", kind: "brush", drag: true },
    { id: "marker", icon: "marker", kind: "marker", drag: true },
    { id: "spray", icon: "spray", kind: "spray", drag: true },
    { id: "eraser", icon: "eraser", kind: "eraser", drag: true },
    { id: "line", icon: "line", kind: "line", drag: true },
    { id: "arrow", icon: "arrow", kind: "arrow", drag: true },
    { id: "curve", icon: "curve", kind: "curve", drag: true },
    { id: "freeCurve", icon: "freeCurve", kind: "freeCurve", drag: true },
    { id: "rect", icon: "rect", kind: "rect", drag: true },
    { id: "roundRect", icon: "roundRect", kind: "roundRect", drag: true },
    { id: "ellipse", icon: "ellipse", kind: "ellipse", drag: true },
    { id: "triangle", icon: "triangle", kind: "triangle", drag: true },
    { id: "text", icon: "text", kind: "text", drag: false },
    { id: "fill", icon: "fill", kind: "", drag: false },
    { id: "picker", icon: "picker", kind: "", drag: false },
  ];

  const SHAPE_KINDS = ["pencil", "brush", "marker", "spray", "eraser", "line", "arrow", "curve", "freeCurve", "rect", "roundRect", "ellipse", "triangle", "text", "image"];

  const PALETTE = [
    "#000000", "#7f7f7f", "#880015", "#ed1c24", "#ff7f27", "#fff200",
    "#22b14c", "#00a2e8", "#3f48cc", "#a349a4", "#ffffff", "#c3c3c3",
    "#b97a57", "#ffaec9", "#ffc90e", "#efe4b0", "#b5e61d", "#99d9ea",
    "#7092be", "#c8bfe7",
  ];

  let counter = 0;

  function uid(prefix) {
    counter += 1;
    return (prefix || "s") + "-" + counter;
  }

  function clamp(value, min, max) {
    const number = Number(value);
    if (Number.isNaN(number)) return min;
    return Math.min(max, Math.max(min, number));
  }

  function isStroke(kind) {
    return kind === "pencil" || kind === "brush" || kind === "marker" || kind === "spray" || kind === "eraser" || kind === "freeCurve";
  }

  function createDoc(options) {
    const opts = options || {};
    return {
      id: opts.id || uid("doc"),
      name: opts.name || "untitled.mypaint",
      path: opts.path || "",
      width: Math.round(clamp(opts.width || 900, 16, 8192)),
      height: Math.round(clamp(opts.height || 560, 16, 8192)),
      background: opts.background || "#ffffff",
      shapes: Array.isArray(opts.shapes) ? opts.shapes.map(normalizeShape) : [],
      dirty: Boolean(opts.dirty),
      ...(opts.svg ? { svg: String(opts.svg) } : {}),
    };
  }

  function makeShape(kind, props) {
    const base = props || {};
    return normalizeShape(Object.assign({ kind: kind }, base));
  }

  function normalizeShape(raw) {
    const shape = Object.assign({}, raw || {});
    shape.id = shape.id || uid("shape");
    shape.kind = SHAPE_KINDS.indexOf(shape.kind) >= 0 ? shape.kind : "pencil";
    shape.color = shape.color || "#000000";
    shape.fill = shape.fill == null ? "" : shape.fill;
    shape.width = clamp(shape.width == null ? 2 : shape.width, 1, 96);
    shape.opacity = clamp(shape.opacity == null ? 100 : shape.opacity, 0, 100);
    if (isStroke(shape.kind)) {
      shape.points = (shape.points || []).map((point) => ({ x: Number(point.x) || 0, y: Number(point.y) || 0 }));
      if (!shape.points.length) shape.points.push({ x: 0, y: 0 });
    } else {
      shape.x = Number(shape.x) || 0;
      shape.y = Number(shape.y) || 0;
      shape.w = Number(shape.w) || 0;
      shape.h = Number(shape.h) || 0;
    }
    if (shape.kind === "text") {
      shape.text = shape.text == null ? "" : String(shape.text);
      shape.fontFamily = shape.fontFamily || "Segoe UI";
      shape.fontSize = clamp(shape.fontSize == null ? 24 : shape.fontSize, 6, 400);
      shape.fontStyle = shape.fontStyle || "normal";
      shape.underline = !!shape.underline;
      shape.strike = !!shape.strike;
      settleRuns(shape, raw && raw.text != null);
    }
    if (shape.kind === "image") shape.src = shape.src || "";
    return shape;
  }

  function cloneShape(shape) {
    return normalizeShape(JSON.parse(JSON.stringify(shape)));
  }

  function normalizeRect(rect) {
    const x = Math.min(rect.x, rect.x + rect.w);
    const y = Math.min(rect.y, rect.y + rect.h);
    return { x: x, y: y, w: Math.abs(rect.w), h: Math.abs(rect.h) };
  }

  function bounds(shape) {
    if (!shape) return { x: 0, y: 0, w: 0, h: 0 };
    if (isStroke(shape.kind)) {
      const pad = shape.kind === "spray" ? shape.width * 2.4 : shape.kind === "marker" ? shape.width * 1.8 : shape.width / 2;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      shape.points.forEach((point) => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
      return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
    }
    if (shape.kind === "text") {
      const runs = textRuns(shape);
      const size = runs.reduce((max, run) => Math.max(max, run.fontSize), 0) || shape.fontSize;
      const span = runs.reduce((sum, run) => sum + measureRun(run), 0);
      const width = Math.max(shape.w || 0, span);
      return { x: shape.x, y: shape.y - size, w: width, h: size * 1.3 };
    }
    if (shape.kind === "line" || shape.kind === "arrow") {
      const pad = shape.width / 2 + (shape.kind === "arrow" ? Math.max(10, shape.width * 3.2) : 0);
      const box = normalizeRect({ x: shape.x, y: shape.y, w: shape.w, h: shape.h });
      return { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
    }
    const box = normalizeRect({ x: shape.x, y: shape.y, w: shape.w, h: shape.h });
    const pad = shape.kind === "image" ? 0 : shape.width / 2;
    return { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
  }

  function insideBox(box, x, y, slack) {
    const pad = slack || 0;
    return x >= box.x - pad && y >= box.y - pad && x <= box.x + box.w + pad && y <= box.y + box.h + pad;
  }

  function distanceToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / len, 0, 1);
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }

  function boxesOverlap(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  function hitShape(shape, x, y) {
    // a thin line still needs a comfortable target to click on
    const slack = Math.max(6, shape.width / 2 + 4);
    if (isStroke(shape.kind)) {
      const points = shape.points;
      if (points.length === 1) return Math.hypot(points[0].x - x, points[0].y - y) <= slack;
      for (let i = 1; i < points.length; i += 1) {
        if (distanceToSegment(x, y, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y) <= slack) return true;
      }
      return false;
    }
    if (shape.kind === "line" || shape.kind === "arrow") {
      return distanceToSegment(x, y, shape.x, shape.y, shape.x + shape.w, shape.y + shape.h) <= slack;
    }
    if (shape.kind === "curve") {
      return distanceToSegment(x, y, shape.x, shape.y, shape.x, shape.y + shape.h) <= slack
        || distanceToSegment(x, y, shape.x, shape.y + shape.h, shape.x + shape.w, shape.y + shape.h) <= slack;
    }
    const box = bounds(shape);
    if (!insideBox(box, x, y, 0)) return false;
    if (shape.kind !== "ellipse") return true;
    const rx = Math.max(0.5, box.w / 2);
    const ry = Math.max(0.5, box.h / 2);
    const dx = (x - (box.x + rx)) / rx;
    const dy = (y - (box.y + ry)) / ry;
    return dx * dx + dy * dy <= 1;
  }

  function hitTest(doc, x, y) {
    if (!doc) return null;
    for (let i = doc.shapes.length - 1; i >= 0; i -= 1) {
      if (hitShape(doc.shapes[i], x, y)) return doc.shapes[i];
    }
    return null;
  }

  function moveShape(shape, dx, dy) {
    if (isStroke(shape.kind)) {
      shape.points = shape.points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
      return shape;
    }
    shape.x += dx;
    shape.y += dy;
    return shape;
  }

  function sizeOf(shape) {
    const box = bounds(shape);
    return { width: Math.round(box.w), height: Math.round(box.h) };
  }

  function scaleShape(shape, factorX, factorY) {
    const box = bounds(shape);
    const fx = Number(factorX) || 1;
    const fy = factorY == null ? fx : (Number(factorY) || 1);
    if (isStroke(shape.kind)) {
      shape.points = shape.points.map((point) => ({
        x: box.x + (point.x - box.x) * fx,
        y: box.y + (point.y - box.y) * fy,
      }));
      return shape;
    }
    shape.w *= fx;
    shape.h *= fy;
    if (shape.kind === "text") shape.fontSize = Math.round(clamp(shape.fontSize * fy, 6, 400));
    return shape;
  }

  function addShape(doc, shape) {
    const item = normalizeShape(shape);
    doc.shapes.push(item);
    doc.dirty = true;
    return item;
  }

  function removeShape(doc, id) {
    const before = doc.shapes.length;
    doc.shapes = doc.shapes.filter((shape) => shape.id !== id);
    if (doc.shapes.length !== before) doc.dirty = true;
    return before - doc.shapes.length;
  }

  function clearDoc(doc) {
    doc.shapes = [];
    doc.dirty = true;
    return doc;
  }

  function fillAt(doc, x, y, color) {
    const shape = hitTest(doc, x, y);
    if (!shape) {
      doc.background = color;
      doc.dirty = true;
      return { target: "background", color: color };
    }
    if (isStroke(shape.kind) || shape.kind === "line" || shape.kind === "arrow" || shape.kind === "curve") shape.color = color;
    else shape.fill = color;
    doc.dirty = true;
    return { target: shape.id, color: color };
  }

  function pickAt(doc, x, y) {
    const shape = hitTest(doc, x, y);
    if (!shape) return doc.background;
    if (shape.fill) return shape.fill;
    return shape.color;
  }

  function moveLayer(doc, id, delta) {
    const index = doc.shapes.findIndex((shape) => shape.id === id);
    if (index < 0) return -1;
    const next = clamp(index + delta, 0, doc.shapes.length - 1);
    if (next === index) return index;
    const [shape] = doc.shapes.splice(index, 1);
    doc.shapes.splice(next, 0, shape);
    doc.dirty = true;
    return next;
  }

  /* ── text runs ──
   * A text shape may hold `runs`: pieces of its text, each with its own font, size, weight,
   * slant, lines and colour, drawn one after the other on the same baseline. The shape's own
   * font fields always describe its first run, and `text` is always the runs joined, so code
   * that only knows plain text keeps working. A shape whose text is changed as plain text
   * loses its runs; a shape with a single run keeps it in the shape's own fields. */
  const RUN_KEYS = ["fontFamily", "fontSize", "bold", "italic", "underline", "strike", "color"];

  function styleOfShape(shape) {
    const style = String(shape.fontStyle || "normal");
    return {
      fontFamily: shape.fontFamily || "Segoe UI",
      fontSize: clamp(shape.fontSize == null ? 24 : shape.fontSize, 6, 400),
      bold: style.indexOf("bold") >= 0,
      italic: style.indexOf("italic") >= 0,
      underline: !!shape.underline,
      strike: !!shape.strike,
      color: shape.color || "#000000",
    };
  }

  function styleName(style) {
    if (style.bold && style.italic) return "bold-italic";
    if (style.bold) return "bold";
    if (style.italic) return "italic";
    return "normal";
  }

  function sameStyle(a, b) {
    return RUN_KEYS.every((key) => a[key] === b[key]);
  }

  function normalizeRun(run, base) {
    const out = { text: String(run && run.text != null ? run.text : "") };
    RUN_KEYS.forEach((key) => { out[key] = run && run[key] != null ? run[key] : base[key]; });
    out.fontSize = clamp(out.fontSize, 6, 400);
    out.bold = !!out.bold;
    out.italic = !!out.italic;
    out.underline = !!out.underline;
    out.strike = !!out.strike;
    out.fontFamily = String(out.fontFamily || base.fontFamily);
    out.color = String(out.color || base.color);
    return out;
  }

  /* Empty pieces go, and neighbours that look the same become one. */
  function normalizeRuns(runs, base) {
    const out = [];
    (runs || []).forEach((run) => {
      const clean = normalizeRun(run, base);
      if (!clean.text) return;
      const last = out[out.length - 1];
      if (last && sameStyle(last, clean)) last.text += clean.text;
      else out.push(clean);
    });
    return out;
  }

  function applyRunStyle(shape, style) {
    shape.fontFamily = style.fontFamily;
    shape.fontSize = style.fontSize;
    shape.fontStyle = styleName(style);
    shape.underline = !!style.underline;
    shape.strike = !!style.strike;
    shape.color = style.color;
  }

  function settleRuns(shape, textGiven) {
    if (!Array.isArray(shape.runs)) { delete shape.runs; return shape; }
    const runs = normalizeRuns(shape.runs, styleOfShape(shape));
    const joined = runs.map((run) => run.text).join("");
    if ((textGiven && shape.text !== joined) || runs.length < 2) {
      if (runs.length === 1 && (!textGiven || shape.text === joined)) applyRunStyle(shape, runs[0]);
      delete shape.runs;
      return shape;
    }
    shape.runs = runs;
    shape.text = joined;
    applyRunStyle(shape, runs[0]);
    return shape;
  }

  /* The runs of any text shape: its own, or one made from its fields. */
  function textRuns(shape) {
    if (Array.isArray(shape.runs) && shape.runs.length) return shape.runs;
    return [Object.assign({ text: shape.text || "" }, styleOfShape(shape))];
  }

  /* Set a text shape from runs (the text editor reads them back from what was typed). */
  function setTextRuns(shape, runs) {
    shape.runs = normalizeRuns(runs, styleOfShape(shape));
    shape.text = shape.runs.map((run) => run.text).join("");
    return settleRuns(shape, false);
  }

  /* A style change over characters [start, end) of the runs. */
  function restyleRuns(runs, start, end, patch, base) {
    const out = [];
    let at = 0;
    (runs || []).forEach((run) => {
      const from = at;
      const to = at + run.text.length;
      at = to;
      const cutA = Math.max(from, Math.min(to, start));
      const cutB = Math.max(from, Math.min(to, end));
      const pieces = [[from, cutA, false], [cutA, cutB, true], [cutB, to, false]];
      pieces.forEach((piece) => {
        if (piece[1] <= piece[0]) return;
        const part = Object.assign({}, run, { text: run.text.slice(piece[0] - from, piece[1] - from) });
        if (piece[2]) Object.assign(part, patch);
        out.push(part);
      });
    });
    return normalizeRuns(out, base || out[0] || {});
  }

  /* The style a character typed at `offset` takes: that of the character before it. */
  function styleAt(runs, offset, base) {
    let at = 0;
    let found = null;
    (runs || []).forEach((run) => {
      if (found) return;
      at += run.text.length;
      if (offset <= at && run.text.length) found = run;
    });
    const pick = found || (runs && runs.length ? runs[runs.length - 1] : null) || base;
    const style = {};
    RUN_KEYS.forEach((key) => { style[key] = pick[key]; });
    return style;
  }

  function runFont(run) {
    return (run.italic ? "italic " : "") + (run.bold ? "700 " : "") + run.fontSize + 'px "' + String(run.fontFamily || "Segoe UI").replace(/["\\]/g, "") + '", sans-serif';
  }

  let measurer = null;
  function measureRun(run) {
    try {
      if (!measurer) {
        if (typeof OffscreenCanvas === "function") measurer = new OffscreenCanvas(1, 1).getContext("2d");
        else if (typeof document !== "undefined") measurer = document.createElement("canvas").getContext("2d");
      }
      if (measurer) {
        measurer.font = runFont(run);
        return measurer.measureText(run.text).width;
      }
    } catch (error) { measurer = null; }
    return run.text.length * run.fontSize * 0.56;
  }

  function fontOf(shape) {
    const style = String(shape.fontStyle || "normal");
    const italic = style.indexOf("italic") >= 0 ? "italic " : "";
    const bold = style.indexOf("bold") >= 0 ? "700 " : "";
    return italic + bold + shape.fontSize + 'px "' + String(shape.fontFamily || "Segoe UI").replace(/["\\]/g, "") + '", sans-serif';
  }

  /* A free curve goes through the middle of every pair of points it kept, with each point
   * as the control of a quadratic piece, so the line has no corners however it was drawn. */
  function smoothPath(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    if (points.length === 1) { ctx.lineTo(points[0].x + 0.01, points[0].y); return; }
    if (points.length === 2) { ctx.lineTo(points[1].x, points[1].y); return; }
    for (let i = 1; i < points.length - 1; i += 1) {
      const midX = (points[i].x + points[i + 1].x) / 2;
      const midY = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  /* Ramer-Douglas-Peucker: keep only the points the line bends at, within `tolerance`. */
  function simplifyPoints(points, tolerance) {
    const list = points || [];
    if (list.length < 3) return list.slice();
    const limit = tolerance == null ? 1.5 : tolerance;
    const keep = new Uint8Array(list.length);
    keep[0] = 1;
    keep[list.length - 1] = 1;
    const stack = [[0, list.length - 1]];
    while (stack.length) {
      const [first, last] = stack.pop();
      let far = -1;
      let best = limit;
      for (let i = first + 1; i < last; i += 1) {
        const d = distanceToSegment(list[i].x, list[i].y, list[first].x, list[first].y, list[last].x, list[last].y);
        if (d > best) { best = d; far = i; }
      }
      if (far > 0) {
        keep[far] = 1;
        stack.push([first, far], [far, last]);
      }
    }
    return list.filter((_, index) => keep[index]);
  }

  function drawShape(ctx, shape, doc, images) {
    ctx.save();
    ctx.globalAlpha = clamp(shape.opacity, 0, 100) / 100;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = shape.width;
    ctx.strokeStyle = shape.kind === "eraser" ? (doc ? doc.background : "#ffffff") : shape.color;
    ctx.fillStyle = shape.fill || shape.color;
    if (isStroke(shape.kind)) {
      if (shape.kind === "brush") ctx.lineWidth = shape.width * 2.5;
      if (shape.kind === "eraser") {
        ctx.lineWidth = shape.width;
        ctx.lineCap = "square";
        ctx.lineJoin = "miter";
      }
      if (shape.kind === "marker") {
        ctx.lineWidth = shape.width * 3.4;
        ctx.globalAlpha *= 0.45;
      }
      if (shape.kind === "spray") {
        ctx.fillStyle = shape.color;
        shape.points.forEach((point, index) => {
          for (let n = 0; n < 5; n += 1) {
            const angle = ((index * 17 + n * 47) % 360) * Math.PI / 180;
            const dist = ((index * 13 + n * 31) % 100) / 100 * shape.width * 2.2;
            ctx.beginPath();
            ctx.arc(point.x + Math.cos(angle) * dist, point.y + Math.sin(angle) * dist, Math.max(0.6, shape.width * 0.35), 0, Math.PI * 2);
            ctx.fill();
          }
        });
        ctx.restore();
        return;
      }
      if (shape.kind === "freeCurve") {
        smoothPath(ctx, shape.points);
        ctx.stroke();
        ctx.restore();
        return;
      }
      ctx.beginPath();
      const points = shape.points;
      ctx.moveTo(points[0].x, points[0].y);
      if (points.length === 1) ctx.lineTo(points[0].x + 0.01, points[0].y);
      for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (shape.kind === "line" || shape.kind === "arrow") {
      const x1 = shape.x;
      const y1 = shape.y;
      const x2 = shape.x + shape.w;
      const y2 = shape.y + shape.h;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (shape.kind === "arrow") {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const head = Math.max(10, shape.width * 3.2);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(angle - 0.42), y2 - head * Math.sin(angle - 0.42));
        ctx.lineTo(x2 - head * Math.cos(angle + 0.42), y2 - head * Math.sin(angle + 0.42));
        ctx.closePath();
        ctx.fillStyle = shape.color;
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    if (shape.kind === "curve") {
      ctx.beginPath();
      ctx.moveTo(shape.x, shape.y);
      ctx.quadraticCurveTo(shape.x, shape.y + shape.h, shape.x + shape.w, shape.y + shape.h);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (shape.kind === "rect" || shape.kind === "roundRect") {
      const box = normalizeRect(shape);
      const radius = shape.kind === "roundRect" ? Math.min(box.w, box.h) * 0.22 : 0;
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, Math.max(0, box.w), Math.max(0, box.h), radius);
      if (shape.fill) ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (shape.kind === "triangle") {
      const box = normalizeRect(shape);
      ctx.beginPath();
      ctx.moveTo(box.x + box.w / 2, box.y);
      ctx.lineTo(box.x + box.w, box.y + box.h);
      ctx.lineTo(box.x, box.y + box.h);
      ctx.closePath();
      if (shape.fill) ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (shape.kind === "ellipse") {
      const box = normalizeRect(shape);
      ctx.beginPath();
      ctx.ellipse(box.x + box.w / 2, box.y + box.h / 2, Math.max(0.5, box.w / 2), Math.max(0.5, box.h / 2), 0, 0, Math.PI * 2);
      if (shape.fill) ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (shape.kind === "text" && Array.isArray(shape.runs) && shape.runs.length) {
      ctx.textBaseline = "alphabetic";
      let x = shape.x;
      shape.runs.forEach((run) => {
        if (!run.text) return;
        ctx.font = runFont(run);
        ctx.fillStyle = run.color || shape.color;
        ctx.fillText(run.text, x, shape.y);
        const width = ctx.measureText(run.text).width;
        if (run.underline || run.strike) {
          ctx.strokeStyle = run.color || shape.color;
          ctx.lineWidth = Math.max(1, run.fontSize / 14);
          ctx.beginPath();
          if (run.underline) { ctx.moveTo(x, shape.y + run.fontSize * 0.15); ctx.lineTo(x + width, shape.y + run.fontSize * 0.15); }
          if (run.strike) { ctx.moveTo(x, shape.y - run.fontSize * 0.32); ctx.lineTo(x + width, shape.y - run.fontSize * 0.32); }
          ctx.stroke();
        }
        x += width;
      });
      ctx.restore();
      return;
    }
    if (shape.kind === "text") {
      ctx.fillStyle = shape.color;
      ctx.font = fontOf(shape);
      ctx.textBaseline = "alphabetic";
      ctx.fillText(shape.text, shape.x, shape.y);
      if (shape.text && (shape.underline || shape.strike)) {
        const width = ctx.measureText(shape.text).width;
        const size = shape.fontSize;
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = Math.max(1, size / 14);
        ctx.beginPath();
        if (shape.underline) {
          const y = shape.y + size * 0.15;
          ctx.moveTo(shape.x, y);
          ctx.lineTo(shape.x + width, y);
        }
        if (shape.strike) {
          const y = shape.y - size * 0.32;
          ctx.moveTo(shape.x, y);
          ctx.lineTo(shape.x + width, y);
        }
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    if (shape.kind === "image") {
      const box = normalizeRect(shape);
      const bitmap = images ? images[shape.src] : null;
      if (bitmap) ctx.drawImage(bitmap, box.x, box.y, box.w, box.h);
      else {
        ctx.fillStyle = "#e5e7eb";
        ctx.fillRect(box.x, box.y, box.w, box.h);
        ctx.strokeStyle = "#9ca3af";
        ctx.strokeRect(box.x, box.y, box.w, box.h);
      }
    }
    ctx.restore();
  }

  function render(ctx, doc, options) {
    const opts = options || {};
    const shapes = opts.shapes || doc.shapes;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, doc.width * (opts.scale || 1), doc.height * (opts.scale || 1));
    if (opts.scale && opts.scale !== 1) ctx.scale(opts.scale, opts.scale);
    ctx.fillStyle = doc.background;
    ctx.fillRect(0, 0, doc.width, doc.height);
    shapes.forEach((shape) => drawShape(ctx, shape, doc, opts.images));
    if (opts.preview) drawShape(ctx, opts.preview, doc, opts.images);
    ctx.restore();
    return shapes.length;
  }

  function serialize(docs) {
    return JSON.stringify({
      format: FORMAT,
      version: FORMAT_VERSION,
      savedAt: new Date().toISOString(),
      documents: (docs || []).map((doc) => ({
        name: doc.name,
        width: doc.width,
        height: doc.height,
        background: doc.background,
        shapes: doc.shapes,
        ...(doc.svg ? { svg: doc.svg } : {}),
      })),
    }, null, 1);
  }

  function parse(text) {
    const data = JSON.parse(String(text || "{}"));
    if (data.format !== FORMAT) throw new Error("This file is not a MyPaint drawing.");
    const documents = Array.isArray(data.documents) ? data.documents : [];
    if (!documents.length) throw new Error("The MyPaint file has no drawing in it.");
    return {
      version: Number(data.version) || 1,
      savedAt: data.savedAt || "",
      documents: documents.map((item) => createDoc(item)),
    };
  }

  function looksLikeDrawing(text) {
    return String(text || "").indexOf(FORMAT) >= 0;
  }

  /* ── picked regions ──
   * A region is not a shape: it marks the part of the picture a crop, a copy or an erase
   * works on. It is a rectangle, an ellipse, or the outline the pointer drew. */

  function makeRegion(kind, x, y) {
    return { kind: kind === "ellipse" || kind === "free" ? kind : "rect", x: x, y: y, w: 0, h: 0, points: [{ x: x, y: y }] };
  }

  function growRegion(area, x, y) {
    if (!area) return null;
    if (area.kind === "free") {
      const last = area.points[area.points.length - 1];
      if (!last || Math.hypot(last.x - x, last.y - y) > 1) area.points.push({ x: x, y: y });
    }
    area.w = x - area.x;
    area.h = y - area.y;
    return area;
  }

  function regionBounds(area) {
    if (!area) return { x: 0, y: 0, w: 0, h: 0 };
    if (area.kind === "free") {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      area.points.forEach((point) => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
      if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    return normalizeRect(area);
  }

  function regionArea(area) {
    const box = regionBounds(area);
    if (!area) return 0;
    if (area.kind === "ellipse") return Math.PI * (box.w / 2) * (box.h / 2);
    if (area.kind !== "free") return box.w * box.h;
    const points = area.points;
    let sum = 0;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      sum += a.x * b.y - b.x * a.y;
    }
    return Math.abs(sum) / 2;
  }

  function regionHas(area, x, y) {
    if (!area) return false;
    const box = regionBounds(area);
    if (area.kind === "rect") return x >= box.x && y >= box.y && x <= box.x + box.w && y <= box.y + box.h;
    if (area.kind === "ellipse") {
      const rx = Math.max(0.5, box.w / 2);
      const ry = Math.max(0.5, box.h / 2);
      const dx = (x - (box.x + rx)) / rx;
      const dy = (y - (box.y + ry)) / ry;
      return dx * dx + dy * dy <= 1;
    }
    const points = area.points;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const a = points[i];
      const b = points[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / ((b.y - a.y) || 1e-9) + a.x) inside = !inside;
    }
    return inside;
  }

  function regionPath(ctx, area) {
    const box = regionBounds(area);
    ctx.beginPath();
    if (area.kind === "ellipse") {
      ctx.ellipse(box.x + box.w / 2, box.y + box.h / 2, Math.max(0.5, box.w / 2), Math.max(0.5, box.h / 2), 0, 0, Math.PI * 2);
      return ctx;
    }
    if (area.kind === "free") {
      const points = area.points;
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();
      return ctx;
    }
    ctx.rect(box.x, box.y, box.w, box.h);
    return ctx;
  }

  function clipRegion(ctx, area) {
    regionPath(ctx, area);
    ctx.clip();
    return ctx;
  }

  function regionOutline(area, scale) {
    const factor = scale || 1;
    const box = regionBounds(area);
    if (area.kind === "ellipse") {
      return '<ellipse cx="' + ((box.x + box.w / 2) * factor) + '" cy="' + ((box.y + box.h / 2) * factor) +
        '" rx="' + Math.max(1, (box.w / 2) * factor) + '" ry="' + Math.max(1, (box.h / 2) * factor) + '"/>';
    }
    if (area.kind === "free") {
      return '<polygon points="' + area.points.map((point) => (point.x * factor) + "," + (point.y * factor)).join(" ") + '"/>';
    }
    return '<rect x="' + (box.x * factor) + '" y="' + (box.y * factor) +
      '" width="' + Math.max(1, box.w * factor) + '" height="' + Math.max(1, box.h * factor) + '"/>';
  }

  function stats(doc) {
    const counts = {};
    SHAPE_KINDS.forEach((kind) => { counts[kind] = 0; });
    (doc ? doc.shapes : []).forEach((shape) => { counts[shape.kind] += 1; });
    return { total: doc ? doc.shapes.length : 0, counts: counts };
  }

  return {
    FORMAT: FORMAT,
    FORMAT_VERSION: FORMAT_VERSION,
    TOOLS: TOOLS,
    simplifyPoints: simplifyPoints,
    RUN_KEYS: RUN_KEYS,
    styleOfShape: styleOfShape,
    styleName: styleName,
    normalizeRuns: normalizeRuns,
    textRuns: textRuns,
    setTextRuns: setTextRuns,
    restyleRuns: restyleRuns,
    styleAt: styleAt,
    runFont: runFont,
    smoothPath: smoothPath,
    SHAPE_KINDS: SHAPE_KINDS,
    PALETTE: PALETTE,
    createDoc: createDoc,
    makeShape: makeShape,
    normalizeShape: normalizeShape,
    cloneShape: cloneShape,
    normalizeRect: normalizeRect,
    bounds: bounds,
    sizeOf: sizeOf,
    hitShape: hitShape,
    boxesOverlap: boxesOverlap,
    hitTest: hitTest,
    moveShape: moveShape,
    scaleShape: scaleShape,
    addShape: addShape,
    removeShape: removeShape,
    clearDoc: clearDoc,
    fillAt: fillAt,
    pickAt: pickAt,
    moveLayer: moveLayer,
    fontOf: fontOf,
    isStroke: isStroke,
    render: render,
    drawShape: drawShape,
    serialize: serialize,
    parse: parse,
    looksLikeDrawing: looksLikeDrawing,
    stats: stats,
    distanceToSegment: distanceToSegment,
    makeRegion: makeRegion,
    growRegion: growRegion,
    regionBounds: regionBounds,
    regionArea: regionArea,
    regionHas: regionHas,
    regionPath: regionPath,
    clipRegion: clipRegion,
    regionOutline: regionOutline,
  };
});
