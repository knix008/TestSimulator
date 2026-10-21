// Draws a module matrix as vector paths. The SVG export and the canvas (preview and PNG)
// use the very same path strings (canvas via Path2D), so both outputs are identical.
// Coordinates are in modules; the quiet zone is `margin` modules on each side.

export const MODULE_STYLES = ["square", "rounded", "dots", "bars"];
export const EYE_FRAME_STYLES = ["square", "rounded", "circle", "leaf"];
export const EYE_BALL_STYLES = ["square", "rounded", "circle", "leaf"];

export const DEFAULT_DESIGN = {
  moduleStyle: "square",
  eyeFrame: "square",
  eyeBall: "square",
  fg: "#111827",
  bg: "#ffffff",
  eyeColor: "",
  gradient: "none",
  fg2: "#2563eb",
  transparent: false,
  margin: 4,
  logo: "",
  logoScale: 0.22,
  logoClear: true,
};

const n = (v) => +v.toFixed(3);

function rect(x, y, w, h) {
  return `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}z`;
}

function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  return (
    `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}` +
    `V${n(y + h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}` +
    `H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}` +
    `V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}z`
  );
}

/** Top-left and bottom-right corners rounded, the other two square. */
function leafRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  return (
    `M${n(x)} ${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}H${n(x + w)}V${n(y + h - r)}` +
    `A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x)}z`
  );
}

function circle(cx, cy, r) {
  return `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0z`;
}

/** A unit square whose corners are rounded only where no dark neighbour touches them. */
function blob(x, y, up, right, down, left) {
  const r = 0.5;
  const tl = !up && !left;
  const tr = !up && !right;
  const br = !down && !right;
  const bl = !down && !left;
  let d = `M${n(x + (tl ? r : 0))} ${y}H${n(x + 1 - (tr ? r : 0))}`;
  if (tr) d += `A${r} ${r} 0 0 1 ${x + 1} ${n(y + r)}`;
  d += `V${n(y + 1 - (br ? r : 0))}`;
  if (br) d += `A${r} ${r} 0 0 1 ${n(x + 1 - r)} ${y + 1}`;
  d += `H${n(x + (bl ? r : 0))}`;
  if (bl) d += `A${r} ${r} 0 0 1 ${x} ${n(y + 1 - r)}`;
  d += `V${n(y + (tl ? r : 0))}`;
  if (tl) d += `A${r} ${r} 0 0 1 ${n(x + r)} ${y}`;
  return `${d}z`;
}

export function finderOrigins(size) {
  return [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ];
}

export function inFinder(x, y, size) {
  return (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
}

/** Centres of the alignment patterns (same formula as qrcore::alignment_positions). */
export function alignmentCenters(size) {
  const version = (size - 17) / 4;
  if (version < 2) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  const pos = [6];
  for (let i = count - 2; i >= 0; i -= 1) pos.push(size - 7 - i * step);
  const centers = [];
  for (const x of pos) for (const y of pos) if (!inFinder(x, y, size)) centers.push([x, y]);
  return centers;
}

/** Square area (in modules, relative to the symbol) covered by the logo, or null. */
export function logoBox(size, scale) {
  if (!(scale > 0)) return null;
  const w = Math.max(1, Math.min(size * 0.4, size * scale));
  const x = (size - w) / 2;
  return { x, y: x, w, h: w };
}

/** Which modules the logo hides: those whose centre lies inside the box plus half a module. */
export function clearedModules(size, design) {
  const hidden = new Uint8Array(size * size);
  if (!design.logo || !design.logoClear) return hidden;
  const box = logoBox(size, design.logoScale);
  if (!box) return hidden;
  const pad = 0.5;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      if (cx > box.x - pad && cx < box.x + box.w + pad && cy > box.y - pad && cy < box.y + box.h + pad) hidden[y * size + x] = 1;
    }
  }
  return hidden;
}

/** The matrix as the logo leaves it (cleared modules light). Used by the scan check. */
export function visibleModules(qr, design) {
  const hidden = clearedModules(qr.size, design);
  return qr.modules.map((dark, i) => (dark && !hidden[i] ? 1 : 0));
}

export function buildPaths(qr, design = DEFAULT_DESIGN) {
  const d = { ...DEFAULT_DESIGN, ...design };
  const { size, modules } = qr;
  const m = Math.max(0, Math.min(20, Number(d.margin) || 0));
  const dark = (x, y) => x >= 0 && y >= 0 && x < size && y < size && modules[y * size + x] === 1;
  const hidden = clearedModules(size, d);
  const shows = (x, y) => dark(x, y) && !inFinder(x, y, size) && !hidden[y * size + x];

  const body = [];
  // Dots and bars break the alignment patterns apart and readers lose them, so those stay solid.
  const solid = new Uint8Array(size * size);
  if (d.moduleStyle === "dots" || d.moduleStyle === "bars") {
    for (const [cx, cy] of alignmentCenters(size)) {
      for (let y = cy - 2; y <= cy + 2; y += 1) {
        for (let x = cx - 2; x <= cx + 2; x += 1) {
          solid[y * size + x] = 1;
          if (shows(x, y)) body.push(rect(x + m, y + m, 1, 1));
        }
      }
    }
  }
  const styled = (x, y) => shows(x, y) && !solid[y * size + x];

  if (d.moduleStyle === "square") {
    // Horizontal runs: fewer path segments and no seams between neighbours.
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; ) {
        if (!shows(x, y)) {
          x += 1;
          continue;
        }
        let end = x;
        while (end < size && shows(end, y)) end += 1;
        body.push(rect(x + m, y + m, end - x, 1));
        x = end;
      }
    }
  } else if (d.moduleStyle === "bars") {
    for (let x = 0; x < size; x += 1) {
      for (let y = 0; y < size; ) {
        if (!styled(x, y)) {
          y += 1;
          continue;
        }
        let end = y;
        while (end < size && styled(x, end)) end += 1;
        body.push(roundRect(x + m + 0.08, y + m + 0.04, 0.84, end - y - 0.08, 0.42));
        y = end;
      }
    }
  } else {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (!styled(x, y)) continue;
        if (d.moduleStyle === "dots") body.push(circle(x + m + 0.5, y + m + 0.5, 0.45));
        else body.push(blob(x + m, y + m, shows(x, y - 1), shows(x + 1, y), shows(x, y + 1), shows(x - 1, y)));
      }
    }
  }

  const frame = [];
  const ball = [];
  for (const [ox, oy] of finderOrigins(size)) {
    const x = ox + m;
    const y = oy + m;
    if (d.eyeFrame === "circle") frame.push(circle(x + 3.5, y + 3.5, 3.5), circle(x + 3.5, y + 3.5, 2.5));
    else if (d.eyeFrame === "rounded") frame.push(roundRect(x, y, 7, 7, 2), roundRect(x + 1, y + 1, 5, 5, 1.2));
    else if (d.eyeFrame === "leaf") frame.push(leafRect(x, y, 7, 7, 3), leafRect(x + 1, y + 1, 5, 5, 2));
    else frame.push(rect(x, y, 7, 7), rect(x + 1, y + 1, 5, 5));
    if (d.eyeBall === "circle") ball.push(circle(x + 3.5, y + 3.5, 1.5));
    else if (d.eyeBall === "rounded") ball.push(roundRect(x + 2, y + 2, 3, 3, 0.9));
    else if (d.eyeBall === "leaf") ball.push(leafRect(x + 2, y + 2, 3, 3, 1.3));
    else ball.push(rect(x + 2, y + 2, 3, 3));
  }

  const box = d.logo ? logoBox(size, d.logoScale) : null;
  return {
    total: size + 2 * m,
    margin: m,
    body: body.join(""),
    eyeFrame: frame.join(""),
    eyeBall: ball.join(""),
    logo: box && { x: box.x + m, y: box.y + m, w: box.w, h: box.h },
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
const color = (value, fallback) => (HEX.test(value) ? value : fallback);

export function gradientEnds(d, total) {
  return d.gradient === "radial"
    ? { cx: total / 2, cy: total / 2, r: total * 0.7 }
    : d.gradient === "diagonal"
      ? { x1: 0, y1: 0, x2: total, y2: total }
      : { x1: 0, y1: 0, x2: 0, y2: total };
}

/** The logo fitted (aspect kept) and centred in its box. */
export function logoRect(box, iw, ih) {
  const k = Math.min(box.w / iw, box.h / ih);
  const w = iw * k;
  const h = ih * k;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** A standalone SVG document. `px` sets width/height; the viewBox stays in modules. */
export function toSvg(qr, design = DEFAULT_DESIGN, px = 1024) {
  const d = { ...DEFAULT_DESIGN, ...design };
  const p = buildPaths(qr, d);
  const fg = color(d.fg, "#000000");
  const eye = color(d.eyeColor, fg);
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${p.total} ${p.total}" width="${px}" height="${px}"${d.moduleStyle === "square" ? ' shape-rendering="crispEdges"' : ""}>`,
  ];
  let bodyFill = fg;
  if (d.gradient !== "none") {
    const g = gradientEnds(d, p.total);
    const stops = `<stop offset="0" stop-color="${fg}"/><stop offset="1" stop-color="${color(d.fg2, fg)}"/>`;
    out.push(
      d.gradient === "radial"
        ? `<defs><radialGradient id="qrfill" gradientUnits="userSpaceOnUse" cx="${n(g.cx)}" cy="${n(g.cy)}" r="${n(g.r)}">${stops}</radialGradient></defs>`
        : `<defs><linearGradient id="qrfill" gradientUnits="userSpaceOnUse" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}">${stops}</linearGradient></defs>`,
    );
    bodyFill = "url(#qrfill)";
  }
  if (!d.transparent) out.push(`<rect width="${p.total}" height="${p.total}" fill="${color(d.bg, "#ffffff")}"/>`);
  if (p.body) out.push(`<path fill="${bodyFill}" d="${p.body}"/>`);
  out.push(`<path fill="${eye}" fill-rule="evenodd" d="${p.eyeFrame}"/>`);
  out.push(`<path fill="${eye}" d="${p.eyeBall}"/>`);
  if (p.logo && /^data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+$/i.test(d.logo)) {
    out.push(`<image href="${d.logo}" x="${n(p.logo.x)}" y="${n(p.logo.y)}" width="${n(p.logo.w)}" height="${n(p.logo.h)}" preserveAspectRatio="xMidYMid meet"/>`);
  }
  out.push("</svg>");
  return out.join("");
}

/** Paints onto a 2D context at `px` pixels square. `logoImage` is a loaded image, if any. */
export function drawToCanvas(ctx, qr, design, px, logoImage) {
  const d = { ...DEFAULT_DESIGN, ...design };
  const p = buildPaths(qr, d);
  const fg = color(d.fg, "#000000");
  const s = px / p.total;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, px, px);
  ctx.scale(s, s);
  if (!d.transparent) {
    ctx.fillStyle = color(d.bg, "#ffffff");
    ctx.fillRect(0, 0, p.total, p.total);
  }
  if (d.gradient !== "none") {
    const g = gradientEnds(d, p.total);
    const grad = d.gradient === "radial" ? ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, g.r) : ctx.createLinearGradient(g.x1, g.y1, g.x2, g.y2);
    grad.addColorStop(0, fg);
    grad.addColorStop(1, color(d.fg2, fg));
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = fg;
  }
  if (p.body) ctx.fill(new Path2D(p.body));
  ctx.fillStyle = color(d.eyeColor, fg);
  ctx.fill(new Path2D(p.eyeFrame), "evenodd");
  ctx.fill(new Path2D(p.eyeBall));
  if (p.logo && logoImage) {
    const r = logoRect(p.logo, logoImage.naturalWidth || logoImage.width, logoImage.naturalHeight || logoImage.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(logoImage, r.x, r.y, r.w, r.h);
  }
  ctx.restore();
}

// ---- Scan-safety checks ----

function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1..21. */
export function contrastRatio(a, b) {
  const la = luminance(color(a, "#000000"));
  const lb = luminance(color(b, "#ffffff"));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Problems that commonly stop cameras from reading the code. Keys are i18n ids. */
export function designWarnings(qr, design, recoveryPercent) {
  const d = { ...DEFAULT_DESIGN, ...design };
  const warnings = [];
  const bg = d.transparent ? "#ffffff" : d.bg;
  const darkest = [d.fg, d.gradient !== "none" ? d.fg2 : d.fg, d.eyeColor || d.fg];
  if (darkest.some((c) => contrastRatio(c, bg) < 3)) warnings.push("warn.contrast");
  if (darkest.some((c) => luminance(color(c, "#000000")) > luminance(color(bg, "#ffffff")))) warnings.push("warn.inverted");
  if (Number(d.margin) < 2) warnings.push("warn.margin");
  if (qr && d.logo) {
    const hidden = clearedModules(qr.size, d);
    let count = 0;
    for (let y = 0; y < qr.size; y += 1) for (let x = 0; x < qr.size; x += 1) if (hidden[y * qr.size + x] && !inFinder(x, y, qr.size)) count += 1;
    const share = d.logoClear ? count / (qr.size * qr.size) : (logoBox(qr.size, d.logoScale).w / qr.size) ** 2;
    // Readers correct errors, not erasures, so only about half the recovery budget is usable.
    if (share * 100 > recoveryPercent / 2) warnings.push("warn.logo");
  }
  return warnings;
}
