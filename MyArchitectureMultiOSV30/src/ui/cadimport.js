// DXF / DWG import helpers for the import dialog (exports.js importDrawing):
// read the file's records once (so the dialog can offer its paper space
// layouts), load external references that sit next to the drawing, and
// turn referenced raster images into tracing underlays.

import { t } from "./i18n.js";
import * as platform from "./platform.js";
import { uid } from "../core/geom.js";

const dirOf = (p) => p.replace(/[\\/][^\\/]*$/, "");
const baseOf = (p) => String(p || "").split(/[\\/]/).pop();
const sep = (p) => (p.includes("\\") ? "\\" : "/");

// Records of a DXF or DWG file (bytes), by its signature.
async function recordsOf(bytes) {
  const { detectDwgVersion, dwgRecords } = await import("../io/dwg.js");
  if (detectDwgVersion(bytes)) return { kind: "dwg", recs: dwgRecords(bytes) };
  const { dxfRecords } = await import("../io/dxf.js");
  return { kind: "dxf", recs: dxfRecords(bytes) };
}

// Candidate files for a path stored in a drawing: next to the drawing
// first (the usual case when a project folder is moved), then as written.
function candidates(stored, basePath) {
  const out = [];
  const name = baseOf(stored);
  if (!name) return out;
  const names = /\.(dwg|dxf)$/i.test(name) || !/\.[^.]+$/.test(name) ? [name, ...(/\.[^.]+$/.test(name) ? [] : [`${name}.dwg`, `${name}.dxf`])] : [name];
  if (basePath) for (const n of names) out.push(dirOf(basePath) + sep(basePath) + n);
  if (/^([a-zA-Z]:[\\/]|\\\\|\/)/.test(stored)) out.push(stored);
  else if (basePath && /[\\/]/.test(stored)) out.push(dirOf(basePath) + sep(basePath) + stored.replace(/^\.[\\/]/, ""));
  return [...new Set(out)];
}

async function readFirst(paths) {
  for (const p of paths) {
    try { const f = await platform.readPath(p); if (f && f.bytes && f.bytes.length) return f; } catch { /* next */ }
  }
  return null;
}

// XREF blocks of a record set: [{name, path}].
function xrefBlocks(recs) {
  const out = [];
  for (const r of recs.blocks || []) {
    if (r.type !== "BLOCK") continue;
    const flags = parseInt((r.tags.find(([c]) => c === 70) || [0, 0])[1], 10) || 0;
    if (!(flags & 12)) continue;
    const name = String((r.tags.find(([c]) => c === 2) || [0, ""])[1]).trim();
    const path = String((r.tags.find(([c]) => c === 1) || [0, ""])[1]).trim();
    out.push({ name, path });
  }
  return out;
}

// External drawings for the XREF blocks of `recs` (desktop: read from disk),
// recursively (an xref's own xrefs) up to a few levels.
async function loadXrefs(recs, basePath, depth = 0, seen = new Set()) {
  const map = {};
  if (!platform.isDesktop || !basePath || depth > 3) return map;
  for (const x of xrefBlocks(recs)) {
    const f = await readFirst(candidates(x.path || x.name, basePath));
    if (!f || seen.has(f.path)) continue;
    try {
      const { recs: sub } = await recordsOf(f.bytes);
      sub.xrefs = await loadXrefs(sub, f.path, depth + 1, new Set([...seen, f.path]));
      map[x.name] = sub;
    } catch { /* unreadable: reported as not loaded */ }
  }
  return map;
}

/**
 * Read a DXF / DWG file for import → {kind, recs, layouts, xrefs} (xrefs:
 * external drawings found next to it, by block name).
 */
export async function prepareCad(f, kind) {
  const bytes = f.bytes || new TextEncoder().encode(f.text || "");
  let recs;
  if (kind === "dwg") { const { dwgRecords } = await import("../io/dwg.js"); recs = dwgRecords(bytes); } else { const { dxfRecords } = await import("../io/dxf.js"); recs = dxfRecords(f.bytes || f.text); }
  const { cadLayouts } = await import("../io/dxf.js");
  const layouts = cadLayouts(recs).map((l) => l.name);
  const xrefs = await loadXrefs(recs, f.path || "");
  return { kind, recs, layouts, xrefs };
}

/** Import prepared records: opts {level, units, space}. */
export async function importCad(cad, opts) {
  const o = { level: opts.level, units: opts.units, space: opts.space || "model", xrefs: cad.xrefs };
  if (cad.kind === "dwg") { const { importDwgRecords } = await import("../io/dwg.js"); return importDwgRecords(cad.recs, o); }
  const { importCadRecords } = await import("../io/dxf.js");
  return importCadRecords(cad.recs, o);
}

const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", bmp: "image/bmp", webp: "image/webp" };

/**
 * Raster images of an imported drawing → res.underlays (the picture file
 * read next to the drawing replaces its frame outline). Images that cannot
 * be found or shown keep their frame, with a note.
 */
export async function resolveCadImages(res, basePath, level) {
  res.underlays = res.underlays || [];
  const missing = [];
  for (const im of res.images || []) {
    const ext = (baseOf(im.file).split(".").pop() || "").toLowerCase();
    let f = null;
    if (platform.isDesktop && basePath && im.file && MIME[ext]) f = await readFirst(candidates(im.file, basePath));
    if (!f) { missing.push(baseOf(im.file) || "?"); continue; }
    res.underlays.push({ id: uid("i"), level, src: `data:${MIME[ext]};base64,${platform.bytesToBase64(f.bytes)}`, x: im.x, y: im.y, w: im.w, h: im.h, rot: im.rot, opacity: 0.5, name: baseOf(im.file) });
    res.drawings = res.drawings.filter((d) => d.id !== im.drawing);
  }
  if (missing.length) res.warnings = [...(res.warnings || []), t("{n} raster images were not found next to the drawing (or are not PNG/JPEG/GIF/BMP/WebP) and are shown as frames: {files}", { n: missing.length, files: [...new Set(missing)].join(", ") })];
  return res;
}
