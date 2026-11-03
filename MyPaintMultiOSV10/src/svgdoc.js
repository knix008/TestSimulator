/* SVG documents: reading the source, drawing it, and writing a drawing back out as SVG.
 *
 * A document opened from an .svg file keeps its source in `doc.svg`. The right panel edits that
 * text; every valid change is drawn again into the picture's frame. Shapes drawn on top stay
 * MyPaint shapes, and saving as SVG writes them as SVG elements after the source, so the file
 * stays vectors all the way through.
 *
 *   SvgDoc.inspect(text)               → { ok, error, width, height, viewBox, counts, total, title }
 *   SvgDoc.rasterize(text, w, h)       → Promise<HTMLCanvasElement>
 *   SvgDoc.setSize(text, w, h)         → the source with new width / height attributes
 *   SvgDoc.fromDoc(doc, images)        → an SVG file for a whole document
 *   SvgDoc.shapeToSvg(shape, doc, images)
 */
(function (root, factory) {
  const api = factory(root.PaintEngine || (typeof require === "function" ? require("./paint") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyPaintSvgDoc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Paint) {
  const NS = "http://www.w3.org/2000/svg";
  const MAX = 8192;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch]));
  }

  function num(value) {
    const n = Math.round(Number(value) * 100) / 100;
    return Number.isFinite(n) ? String(n) : "0";
  }

  const UNITS = { px: 1, pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, em: 16, ex: 8 };

  function length(value) {
    const match = /^\s*([0-9.+-eE]+)\s*([a-z%]*)\s*$/.exec(String(value || ""));
    if (!match || match[2] === "%") return 0;
    const n = Number(match[1]) * (UNITS[match[2] || "px"] || 1);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function parseDom(text) {
    if (typeof DOMParser !== "function") return { error: "DOMParser is not available here." };
    const dom = new DOMParser().parseFromString(String(text || ""), "image/svg+xml");
    const bad = dom.getElementsByTagName("parsererror")[0];
    if (bad) {
      const message = (bad.textContent || "").replace(/\s+/g, " ").trim();
      return { error: message.slice(0, 220) || "The SVG is not well formed." };
    }
    const svg = dom.documentElement;
    if (!svg || svg.localName !== "svg") return { error: "The text has no <svg> element at its top." };
    return { dom: dom, svg: svg };
  }

  function sizeOf(svg) {
    let width = length(svg.getAttribute("width"));
    let height = length(svg.getAttribute("height"));
    const box = String(svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    const hasBox = box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0;
    if (!width && !height && hasBox) { width = box[2]; height = box[3]; }
    else if (!width && height && hasBox) width = height * box[2] / box[3];
    else if (width && !height && hasBox) height = width * box[3] / box[2];
    if (!width) width = 300;
    if (!height) height = 150;
    const factor = Math.min(1, MAX / Math.max(width, height));
    return {
      width: Math.max(1, Math.round(width * factor)),
      height: Math.max(1, Math.round(height * factor)),
      viewBox: hasBox ? box : null,
    };
  }

  function inspect(text) {
    const parsed = parseDom(text);
    if (parsed.error) return { ok: false, error: parsed.error };
    const counts = {};
    let total = 0;
    Array.from(parsed.svg.getElementsByTagName("*")).forEach((node) => {
      counts[node.localName] = (counts[node.localName] || 0) + 1;
      total += 1;
    });
    const size = sizeOf(parsed.svg);
    const title = parsed.svg.getElementsByTagName("title")[0];
    return {
      ok: true,
      error: "",
      width: size.width,
      height: size.height,
      viewBox: size.viewBox,
      counts: counts,
      total: total,
      title: title ? String(title.textContent || "").trim() : "",
      version: parsed.svg.getAttribute("version") || "",
    };
  }

  /* New width and height attributes; a source without a viewBox gets one of its old size, so
   * the drawing scales instead of being cropped. */
  function setSize(text, width, height) {
    const parsed = parseDom(text);
    if (parsed.error) return text;
    const svg = parsed.svg;
    if (!svg.getAttribute("viewBox")) {
      const old = sizeOf(svg);
      svg.setAttribute("viewBox", "0 0 " + old.width + " " + old.height);
    }
    svg.setAttribute("width", String(Math.round(width)));
    svg.setAttribute("height", String(Math.round(height)));
    return new XMLSerializer().serializeToString(parsed.dom);
  }

  function rasterize(text, width, height) {
    return new Promise((resolve, reject) => {
      const parsed = parseDom(text);
      if (parsed.error) { reject(new Error(parsed.error)); return; }
      const size = sizeOf(parsed.svg);
      const w = Math.max(1, Math.round(width || size.width));
      const h = Math.max(1, Math.round(height || size.height));
      // the picture is drawn at the document's size whatever the file says
      parsed.svg.setAttribute("width", String(w));
      parsed.svg.setAttribute("height", String(h));
      if (!parsed.svg.getAttribute("viewBox")) parsed.svg.setAttribute("viewBox", "0 0 " + size.width + " " + size.height);
      if (!parsed.svg.getAttribute("xmlns")) parsed.svg.setAttribute("xmlns", NS);
      const source = new XMLSerializer().serializeToString(parsed.dom);
      const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(image, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("The SVG could not be drawn."));
      };
      image.src = url;
    });
  }

  /* ── shapes as SVG ── */

  function strokeAttrs(shape, width, color) {
    return ' fill="none" stroke="' + esc(color || shape.color) + '" stroke-width="' + num(width) + '" stroke-linecap="round" stroke-linejoin="round"';
  }

  function opacityAttr(shape, extra) {
    const value = (shape.opacity == null ? 100 : shape.opacity) / 100 * (extra == null ? 1 : extra);
    return value < 1 ? ' opacity="' + num(value) + '"' : "";
  }

  function pointsPath(points) {
    if (!points.length) return "";
    if (points.length === 1) return "M" + num(points[0].x) + " " + num(points[0].y) + "h0.01";
    return "M" + points.map((p) => num(p.x) + " " + num(p.y)).join("L");
  }

  function smoothPathData(points) {
    if (points.length < 3) return pointsPath(points);
    let d = "M" + num(points[0].x) + " " + num(points[0].y);
    for (let i = 1; i < points.length - 1; i += 1) {
      const mx = (points[i].x + points[i + 1].x) / 2;
      const my = (points[i].y + points[i + 1].y) / 2;
      d += "Q" + num(points[i].x) + " " + num(points[i].y) + " " + num(mx) + " " + num(my);
    }
    const last = points[points.length - 1];
    return d + "L" + num(last.x) + " " + num(last.y);
  }

  function imageHref(shape, images) {
    const cached = images ? images[shape.src] : null;
    if (cached && typeof cached.toDataURL === "function") {
      try { return cached.toDataURL("image/png"); } catch (error) { /* tainted */ }
    }
    if (cached && typeof document !== "undefined" && cached.naturalWidth) {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = cached.naturalWidth;
        canvas.height = cached.naturalHeight;
        canvas.getContext("2d").drawImage(cached, 0, 0);
        return canvas.toDataURL("image/png");
      } catch (error) { /* tainted */ }
    }
    return String(shape.src || "").indexOf("data:") === 0 ? shape.src : "";
  }

  function textToSvg(shape) {
    const runs = Paint ? Paint.textRuns(shape) : [{ text: shape.text, fontFamily: shape.fontFamily, fontSize: shape.fontSize, color: shape.color }];
    const spans = runs.map((run) => {
      const deco = [run.underline ? "underline" : "", run.strike ? "line-through" : ""].filter(Boolean).join(" ");
      return '<tspan font-family="' + esc(run.fontFamily) + '" font-size="' + num(run.fontSize) + '"' +
        (run.bold ? ' font-weight="700"' : "") + (run.italic ? ' font-style="italic"' : "") +
        (deco ? ' text-decoration="' + deco + '"' : "") + ' fill="' + esc(run.color || shape.color) + '">' + esc(run.text) + "</tspan>";
    }).join("");
    return '<text x="' + num(shape.x) + '" y="' + num(shape.y) + '" xml:space="preserve"' + opacityAttr(shape) + ">" + spans + "</text>";
  }

  function shapeToSvg(shape, doc, images) {
    const kind = shape.kind;
    const background = doc ? doc.background : "#ffffff";
    if (kind === "freeCurve") return '<path d="' + smoothPathData(shape.points) + '"' + strokeAttrs(shape, shape.width) + opacityAttr(shape) + "/>";
    if (kind === "spray") {
      const dots = [];
      shape.points.forEach((point, index) => {
        for (let n = 0; n < 5; n += 1) {
          const angle = ((index * 17 + n * 47) % 360) * Math.PI / 180;
          const dist = ((index * 13 + n * 31) % 100) / 100 * shape.width * 2.2;
          dots.push('<circle cx="' + num(point.x + Math.cos(angle) * dist) + '" cy="' + num(point.y + Math.sin(angle) * dist) + '" r="' + num(Math.max(0.6, shape.width * 0.35)) + '"/>');
        }
      });
      return '<g fill="' + esc(shape.color) + '"' + opacityAttr(shape) + ">" + dots.join("") + "</g>";
    }
    if (Paint && Paint.isStroke(kind)) {
      let width = shape.width;
      let extra = 1;
      let color = shape.color;
      if (kind === "brush") width *= 2.5;
      if (kind === "marker") { width *= 3.4; extra = 0.45; }
      if (kind === "eraser") color = background;
      const caps = kind === "eraser" ? ' stroke-linecap="square" stroke-linejoin="miter"' : "";
      return '<path d="' + pointsPath(shape.points) + '"' + strokeAttrs(shape, width, color).replace(' stroke-linecap="round" stroke-linejoin="round"', caps || ' stroke-linecap="round" stroke-linejoin="round"') + opacityAttr(shape, extra) + "/>";
    }
    if (kind === "line" || kind === "arrow") {
      const x2 = shape.x + shape.w;
      const y2 = shape.y + shape.h;
      let out = '<line x1="' + num(shape.x) + '" y1="' + num(shape.y) + '" x2="' + num(x2) + '" y2="' + num(y2) + '"' + strokeAttrs(shape, shape.width) + "/>";
      if (kind === "arrow") {
        const angle = Math.atan2(y2 - shape.y, x2 - shape.x);
        const head = Math.max(10, shape.width * 3.2);
        const a = [x2 - head * Math.cos(angle - 0.42), y2 - head * Math.sin(angle - 0.42)];
        const b = [x2 - head * Math.cos(angle + 0.42), y2 - head * Math.sin(angle + 0.42)];
        out += '<polygon points="' + num(x2) + "," + num(y2) + " " + num(a[0]) + "," + num(a[1]) + " " + num(b[0]) + "," + num(b[1]) + '" fill="' + esc(shape.color) + '"/>';
      }
      return "<g" + opacityAttr(shape) + ">" + out + "</g>";
    }
    if (kind === "curve") {
      return '<path d="M' + num(shape.x) + " " + num(shape.y) + "Q" + num(shape.x) + " " + num(shape.y + shape.h) + " " + num(shape.x + shape.w) + " " + num(shape.y + shape.h) + '"' + strokeAttrs(shape, shape.width) + opacityAttr(shape) + "/>";
    }
    const box = Paint ? Paint.normalizeRect(shape) : { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
    const paint = ' fill="' + esc(shape.fill || "none") + '" stroke="' + esc(shape.color) + '" stroke-width="' + num(shape.width) + '"' + opacityAttr(shape);
    if (kind === "rect" || kind === "roundRect") {
      const radius = kind === "roundRect" ? Math.min(box.w, box.h) * 0.22 : 0;
      return '<rect x="' + num(box.x) + '" y="' + num(box.y) + '" width="' + num(box.w) + '" height="' + num(box.h) + '"' + (radius ? ' rx="' + num(radius) + '"' : "") + paint + "/>";
    }
    if (kind === "ellipse") {
      return '<ellipse cx="' + num(box.x + box.w / 2) + '" cy="' + num(box.y + box.h / 2) + '" rx="' + num(box.w / 2) + '" ry="' + num(box.h / 2) + '"' + paint + "/>";
    }
    if (kind === "triangle") {
      return '<polygon points="' + num(box.x + box.w / 2) + "," + num(box.y) + " " + num(box.x + box.w) + "," + num(box.y + box.h) + " " + num(box.x) + "," + num(box.y + box.h) + '"' + paint + ' stroke-linejoin="round"/>';
    }
    if (kind === "text") return textToSvg(shape);
    if (kind === "image") {
      const href = imageHref(shape, images);
      if (!href) return "";
      return '<image x="' + num(box.x) + '" y="' + num(box.y) + '" width="' + num(box.w) + '" height="' + num(box.h) + '" preserveAspectRatio="none" href="' + esc(href) + '"' + opacityAttr(shape) + "/>";
    }
    return "";
  }

  /* The whole document. An SVG document starts from its own source (re-sized to the document)
   * and leaves out the frame its pixels were drawn into; the shapes drawn on it follow. */
  function fromDoc(doc, images, frameKey) {
    const shapes = (doc.shapes || []).filter((shape) => !(doc.svg && shape.kind === "image" && shape.src === frameKey));
    const drawn = shapes.map((shape) => shapeToSvg(shape, doc, images)).filter(Boolean).join("\n  ");
    if (doc.svg) {
      const sized = setSize(doc.svg, doc.width, doc.height);
      if (!drawn) return sized;
      const close = sized.lastIndexOf("</svg>");
      if (close < 0) return sized;
      return sized.slice(0, close) + '<g id="mypaint-shapes">\n  ' + drawn + "\n</g>\n" + sized.slice(close);
    }
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="' + NS + '" width="' + doc.width + '" height="' + doc.height + '" viewBox="0 0 ' + doc.width + " " + doc.height + '">\n' +
      '  <rect width="100%" height="100%" fill="' + esc(doc.background) + '"/>\n' +
      (drawn ? "  " + drawn + "\n" : "") + "</svg>\n";
  }

  return {
    inspect: inspect,
    setSize: setSize,
    rasterize: rasterize,
    fromDoc: fromDoc,
    shapeToSvg: shapeToSvg,
    length: length,
  };
});
