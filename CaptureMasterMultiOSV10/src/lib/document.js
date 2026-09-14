// The document model.
//
// Two kinds of document open in tabs:
//   • image  — a capture (or an opened picture) plus its annotations; edited
//              through undo/redo and saved as a .cmcap file
//   • video  — a screen recording played back from disk
//
// The editable part of an image document is its history's `present`:
//   { image: { dataUrl, width, height }, annotations: [...] }
// Everything else on the document (name, path, zoom, selection) is view state.

import { createHistory } from './history.js';

export const CAPTURE_FORMAT = 'capturemaster-capture';
export const CAPTURE_FORMAT_VERSION = 1;
export const CAPTURE_EXT = 'cmcap';

let seq = 0;
export function newId(prefix = 'd') {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`;
}

export function stampName(prefix = 'Capture') {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${prefix} ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/** @param {{dataUrl:string,width:number,height:number}} image */
export function createImageDocument(image, { name, path = null, source = null, annotations = [] } = {}) {
  return {
    id: newId(),
    kind: 'image',
    name: name || stampName(),
    path,
    dir: path ? dirOf(path) : '',
    source,
    createdAt: Date.now(),
    history: createHistory({ image, annotations }),
    savedPresent: null,           // the state last written to disk (null = never saved)
    zoom: 1,
    fitRequested: true,           // fit to the view on first show
    selection: null,              // marquee { x, y, w, h } in image pixels
    selectedId: null,
    nextNumber: 1,                // for numbered badges
  };
}

export function createVideoDocument({ path, name, width = 0, height = 0, duration = 0, source = null }) {
  return {
    id: newId(),
    kind: 'video',
    name: name || nameOf(path),
    path,
    dir: dirOf(path),
    source,
    createdAt: Date.now(),
    width,
    height,
    duration,
    history: null,
    savedPresent: null,
    zoom: 1,
    fitRequested: true,
    selection: null,
    selectedId: null,
  };
}

export function isDirty(doc) {
  if (!doc || doc.kind !== 'image') return false;
  return doc.history.present !== doc.savedPresent;
}

export function present(doc) { return doc && doc.history ? doc.history.present : null; }

export function dirOf(p) {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(0, i) : '';
}

export function nameOf(p) {
  return String(p || '').split(/[\\/]/).pop() || '';
}

export function extOf(p) {
  const n = nameOf(p);
  const i = n.lastIndexOf('.');
  return i > 0 ? n.slice(i + 1).toLowerCase() : '';
}

export function stripExt(n) {
  const i = n.lastIndexOf('.');
  return i > 0 ? n.slice(0, i) : n;
}

// ── .cmcap serialisation ──────────────────────────────────

export function serializeCapture(doc) {
  const p = present(doc);
  return JSON.stringify({
    format: CAPTURE_FORMAT,
    version: CAPTURE_FORMAT_VERSION,
    app: 'CaptureMaster',
    name: doc.name,
    createdAt: doc.createdAt,
    savedAt: Date.now(),
    source: doc.source,
    image: { width: p.image.width, height: p.image.height, dataUrl: p.image.dataUrl },
    annotations: p.annotations,
    nextNumber: doc.nextNumber,
  });
}

/** Parses a .cmcap file. Throws a descriptive error for anything that is not one. */
export function parseCapture(text, path) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`Not a valid CaptureMaster file (JSON parse failed): ${err.message}`);
  }
  if (!data || data.format !== CAPTURE_FORMAT) throw new Error('Not a CaptureMaster capture file (missing format marker).');
  if (Number(data.version) > CAPTURE_FORMAT_VERSION) {
    throw new Error(`This file was saved by a newer CaptureMaster (format ${data.version}); this version reads up to ${CAPTURE_FORMAT_VERSION}.`);
  }
  const image = data.image || {};
  if (typeof image.dataUrl !== 'string' || !image.dataUrl.startsWith('data:image/')) throw new Error('The capture file has no image data.');
  const annotations = Array.isArray(data.annotations) ? data.annotations.filter((a) => a && typeof a.type === 'string') : [];
  const doc = createImageDocument(
    { dataUrl: image.dataUrl, width: Number(image.width) || 0, height: Number(image.height) || 0 },
    { name: typeof data.name === 'string' && data.name ? data.name : stripExt(nameOf(path)), path, source: data.source || null, annotations },
  );
  doc.createdAt = Number(data.createdAt) || doc.createdAt;
  doc.nextNumber = Number(data.nextNumber) || (annotations.filter((a) => a.type === 'number').length + 1);
  doc.savedPresent = doc.history.present;
  return doc;
}

export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
export const VIDEO_EXTS = ['webm', 'mp4', 'mkv', 'ogg'];

export function kindForPath(p) {
  const e = extOf(p);
  if (e === CAPTURE_EXT) return 'capture';
  if (IMAGE_EXTS.includes(e)) return 'image';
  if (VIDEO_EXTS.includes(e)) return 'video';
  return null;
}
