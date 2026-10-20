// PDF and EPS export. Both are written from the same path strings as the preview and the SVG
// (render.js), converted to move/line/cubic segments, so every style stays true vector art.

import { buildPaths, DEFAULT_DESIGN, gradientEnds, logoRect } from "./render.js";

const PT_PER_MM = 72 / 25.4;
const num = (v) => {
  const s = (Math.round(v * 10000) / 10000).toString();
  return s === "-0" ? "0" : s;
};

// ---- SVG path → segments ----

const TOKEN = /[MmLlHhVvCcAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g;

/** Endpoint arc (SVG F.6.5) → cubic Béziers, each spanning at most 90°. */
export function arcToCubics(x1, y1, rx, ry, phiDeg, largeArc, sweep, x2, y2) {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (!rx || !ry) return [["L", x2, y2]];
  const phi = (phiDeg * Math.PI) / 180;
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const numer = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denom = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numer / denom));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  else if (sweep && dt < 0) dt += 2 * Math.PI;

  const count = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / count;
  const k = (4 / 3) * Math.tan(step / 4);
  const point = (a) => [cx + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin, cy + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos];
  const tangent = (a) => [-rx * Math.sin(a) * cos - ry * Math.cos(a) * sin, -rx * Math.sin(a) * sin + ry * Math.cos(a) * cos];
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const a1 = t1 + i * step;
    const a2 = a1 + step;
    const [p1x, p1y] = point(a1);
    const [e1x, e1y] = tangent(a1);
    const [p2x, p2y] = i === count - 1 ? [x2, y2] : point(a2);
    const [e2x, e2y] = tangent(a2);
    out.push(["C", p1x + k * e1x, p1y + k * e1y, p2x - k * e2x, p2y - k * e2y, p2x, p2y]);
  }
  return out;
}

/** Parses an SVG path into absolute ["M"|"L"|"C"|"Z", …] segments. */
export function pathSegments(d) {
  const tokens = String(d).match(TOKEN) || [];
  const out = [];
  let i = 0;
  let cmd = "";
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const next = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case "M":
        x = ox + next();
        y = oy + next();
        sx = x;
        sy = y;
        out.push(["M", x, y]);
        cmd = rel ? "l" : "L"; // further pairs are line-tos
        break;
      case "L":
        x = ox + next();
        y = oy + next();
        out.push(["L", x, y]);
        break;
      case "H":
        x = ox + next();
        out.push(["L", x, y]);
        break;
      case "V":
        y = oy + next();
        out.push(["L", x, y]);
        break;
      case "C": {
        const c = [ox + next(), oy + next(), ox + next(), oy + next(), ox + next(), oy + next()];
        out.push(["C", ...c]);
        x = c[4];
        y = c[5];
        break;
      }
      case "A": {
        const [rx, ry, phi, large, sweep] = [next(), next(), next(), next(), next()];
        const ex = ox + next();
        const ey = oy + next();
        out.push(...arcToCubics(x, y, rx, ry, phi, large ? 1 : 0, sweep ? 1 : 0, ex, ey));
        x = ex;
        y = ey;
        break;
      }
      case "Z":
        out.push(["Z"]);
        x = sx;
        y = sy;
        break;
      default:
        throw new Error(`unsupported path command ${cmd}`);
    }
  }
  return out;
}

// ---- Scene: what both writers draw ----

function rgb(hex, fallback) {
  const h = /^#[0-9a-f]{6}$/i.test(hex) ? hex : fallback;
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

/** Logo pixels → RGB bytes (blended over `under`) and an alpha channel. */
function splitLogo(logo, under) {
  const n = logo.width * logo.height;
  const color = new Uint8Array(n * 3);
  const alpha = new Uint8Array(n);
  const flat = new Uint8Array(n * 3);
  let translucent = false;
  for (let i = 0; i < n; i += 1) {
    const a = logo.rgba[i * 4 + 3];
    alpha[i] = a;
    if (a < 255) translucent = true;
    for (let c = 0; c < 3; c += 1) {
      const v = logo.rgba[i * 4 + c];
      color[i * 3 + c] = v;
      flat[i * 3 + c] = Math.round((v * a + under[c] * 255 * (255 - a)) / 255);
    }
  }
  return { color, alpha, flat, translucent };
}

function scene(qr, design, logo) {
  const d = { ...DEFAULT_DESIGN, ...design };
  const p = buildPaths(qr, d);
  const fg = rgb(d.fg, "#000000");
  const bg = d.transparent ? null : rgb(d.bg, "#ffffff");
  return {
    total: p.total,
    background: bg,
    body: pathSegments(p.body),
    bodyFill: d.gradient === "none" ? { color: fg } : { gradient: d.gradient, ends: gradientEnds(d, p.total), c0: fg, c1: rgb(d.fg2, d.fg) },
    eyeFrame: pathSegments(p.eyeFrame),
    eyeBall: pathSegments(p.eyeBall),
    eyeColor: rgb(d.eyeColor || d.fg, "#000000"),
    logo: p.logo && logo && logo.width > 0 ? { box: logoRect(p.logo, logo.width, logo.height), ...logo, ...splitLogo(logo, bg || [1, 1, 1]) } : null,
  };
}

// ---- PDF ----

const latin1 = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** zlib (FlateDecode) via CompressionStream, or null where it is missing. */
async function deflate(bytes) {
  if (typeof CompressionStream === "undefined") return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function pdfPath(segments) {
  const ops = [];
  for (const s of segments) {
    if (s[0] === "M") ops.push(`${num(s[1])} ${num(s[2])} m`);
    else if (s[0] === "L") ops.push(`${num(s[1])} ${num(s[2])} l`);
    else if (s[0] === "C") ops.push(`${s.slice(1).map(num).join(" ")} c`);
    else ops.push("h");
  }
  return ops.join("\n");
}

const pdfColor = (c) => c.map(num).join(" ");

function shadingDict(fill) {
  const e = fill.ends;
  const fn = `<< /FunctionType 2 /Domain [0 1] /C0 [${pdfColor(fill.c0)}] /C1 [${pdfColor(fill.c1)}] /N 1 >>`;
  return fill.gradient === "radial"
    ? `<< /ShadingType 3 /ColorSpace /DeviceRGB /Coords [${num(e.cx)} ${num(e.cy)} 0 ${num(e.cx)} ${num(e.cy)} ${num(e.r)}] /Function ${fn} /Extend [true true] >>`
    : `<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [${num(e.x1)} ${num(e.y1)} ${num(e.x2)} ${num(e.y2)}] /Function ${fn} /Extend [true true] >>`;
}

/**
 * A one-page PDF, `sizeMm` square. `logo` is { width, height, rgba } (the decoded logo), or null.
 */
export async function toPdf(qr, design, { sizeMm = 50, logo = null, title = "QR code" } = {}) {
  const sc = scene(qr, design, logo);
  const W = sizeMm * PT_PER_MM;
  const s = W / sc.total;
  const objects = []; // [dict, streamBytes?]
  const add = (dict, stream) => objects.push([dict, stream]) && objects.length;
  const streamObj = async (dict, bytes) => {
    const packed = await deflate(bytes);
    return packed ? add(`<< ${dict} /Length ${packed.length} /Filter /FlateDecode >>`, packed) : add(`<< ${dict} /Length ${bytes.length} >>`, bytes);
  };

  const content = ["q", `${num(s)} 0 0 ${num(-s)} 0 ${num(W)} cm`];
  if (sc.background) content.push(`${pdfColor(sc.background)} rg`, `0 0 ${sc.total} ${sc.total} re f`);
  if (sc.body.length) {
    if (sc.bodyFill.color) content.push(`${pdfColor(sc.bodyFill.color)} rg`, pdfPath(sc.body), "f");
    else content.push("q", pdfPath(sc.body), "W n", "/Sh0 sh", "Q");
  }
  content.push(`${pdfColor(sc.eyeColor)} rg`, pdfPath(sc.eyeFrame), "f*", pdfPath(sc.eyeBall), "f");
  if (sc.logo) {
    const b = sc.logo.box;
    content.push("q", `${num(b.w)} 0 0 ${num(-b.h)} ${num(b.x)} ${num(b.y + b.h)} cm`, "/Im0 Do", "Q");
  }
  content.push("Q");

  // Objects 1–3 are fixed (catalog, pages, page) so the page can point at the rest.
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  const pageIndex = add("") - 1;
  const contents = await streamObj("", latin1(content.join("\n")));
  const resources = [];
  if (sc.bodyFill.gradient) resources.push(`/Shading << /Sh0 ${add(shadingDict(sc.bodyFill))} 0 R >>`);
  if (sc.logo) {
    const l = sc.logo;
    let smask = "";
    if (l.translucent) smask = ` /SMask ${await streamObj(`/Type /XObject /Subtype /Image /Width ${l.width} /Height ${l.height} /ColorSpace /DeviceGray /BitsPerComponent 8`, l.alpha)} 0 R`;
    const image = await streamObj(`/Type /XObject /Subtype /Image /Width ${l.width} /Height ${l.height} /ColorSpace /DeviceRGB /BitsPerComponent 8${smask}`, l.color);
    resources.push(`/XObject << /Im0 ${image} 0 R >>`);
  }
  objects[pageIndex][0] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(W)} ${num(W)}] /Resources << ${resources.join(" ")} >> /Contents ${contents} 0 R >>`;
  const safeTitle = String(title).replace(/[^\x20-\x7e]/g, "?").replace(/([()\\])/g, "\\$1");
  const info = add(`<< /Title (${safeTitle}) /Producer (QR Generator) /Creator (QR Generator) >>`);

  const parts = [latin1("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")];
  let offset = parts[0].length;
  const offsets = [];
  objects.forEach(([dict, stream], i) => {
    offsets.push(offset);
    const chunk = stream ? concat([latin1(`${i + 1} 0 obj\n${dict}\nstream\n`), stream, latin1("\nendstream\nendobj\n")]) : latin1(`${i + 1} 0 obj\n${dict}\nendobj\n`);
    parts.push(chunk);
    offset += chunk.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n`, "0000000000 65535 f \n", ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
  parts.push(latin1(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`));
  return concat(parts);
}

// ---- EPS ----

function psPath(segments) {
  const ops = ["newpath"];
  for (const s of segments) {
    if (s[0] === "M") ops.push(`${num(s[1])} ${num(s[2])} moveto`);
    else if (s[0] === "L") ops.push(`${num(s[1])} ${num(s[2])} lineto`);
    else if (s[0] === "C") ops.push(`${s.slice(1).map(num).join(" ")} curveto`);
    else ops.push("closepath");
  }
  return ops.join("\n");
}

function hexLines(bytes) {
  const lines = [];
  let line = "";
  for (const b of bytes) {
    line += b.toString(16).padStart(2, "0");
    if (line.length >= 78) {
      lines.push(line);
      line = "";
    }
  }
  if (line) lines.push(line);
  return `${lines.join("\n")}>`;
}

/** Encapsulated PostScript (level 3 for gradients). The logo is blended over the background. */
export function toEps(qr, design, { sizeMm = 50, logo = null, title = "QR code" } = {}) {
  const sc = scene(qr, design, logo);
  const W = Math.max(1, Math.round(sizeMm * PT_PER_MM));
  const s = W / sc.total;
  const out = [
    "%!PS-Adobe-3.0 EPSF-3.0",
    `%%BoundingBox: 0 0 ${W} ${W}`,
    `%%HiResBoundingBox: 0 0 ${W} ${W}`,
    `%%Title: ${String(title).replace(/[^\x20-\x7e]/g, "?")}`,
    "%%Creator: QR Generator",
    `%%LanguageLevel: ${sc.bodyFill.gradient ? 3 : 2}`,
    "%%Pages: 1",
    "%%EndComments",
    "save",
    `0 ${W} translate ${num(s)} ${num(-s)} scale`,
  ];
  if (sc.background) out.push(`${pdfColor(sc.background)} setrgbcolor`, `0 0 ${sc.total} ${sc.total} rectfill`);
  if (sc.body.length) {
    if (sc.bodyFill.color) out.push(`${pdfColor(sc.bodyFill.color)} setrgbcolor`, psPath(sc.body), "fill");
    else out.push("gsave", psPath(sc.body), "clip", shadingDict(sc.bodyFill), "shfill", "grestore");
  }
  out.push(`${pdfColor(sc.eyeColor)} setrgbcolor`, psPath(sc.eyeFrame), "eofill", psPath(sc.eyeBall), "fill");
  if (sc.logo) {
    const l = sc.logo;
    const b = l.box;
    out.push(
      "gsave",
      `${num(b.x)} ${num(b.y)} translate ${num(b.w)} ${num(b.h)} scale`,
      "/DeviceRGB setcolorspace",
      `<< /ImageType 1 /Width ${l.width} /Height ${l.height} /BitsPerComponent 8 /Decode [0 1 0 1 0 1] /ImageMatrix [${l.width} 0 0 ${l.height} 0 0] /DataSource currentfile /ASCIIHexDecode filter >> image`,
      hexLines(l.flat),
      "grestore",
    );
  }
  out.push("restore", "showpage", "%%EOF", "");
  return latin1(out.join("\n"));
}
