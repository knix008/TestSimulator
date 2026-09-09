// Local image handling for the merged document.
//
// Two jobs live here:
//  1. Resolving local image links to Base64 data URIs so a merged document is
//     self-contained (images render in preview and in every export).
//  2. Keeping those (huge) data URIs OUT of the editable Markdown. Each image
//     is registered in a module-level store and referenced from the text as
//     `mmm-img:<n>`, so the Edit tab stays readable and the outline / merge /
//     numbering logic keeps working on short lines. The refs are expanded back
//     into real data URIs at render / export time (see markdown.js).

export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tif', 'tiff', 'ico', 'avif'];

// A src that points to a local file (not remote / data / protocol-relative).
export function isLocalImageSrc(src) {
  const s = String(src || '').trim();
  if (!s) return false;
  if (isImageRef(s)) return false;
  return !/^(https?:|data:|file:|\/\/|#)/i.test(s);
}

// Collects image srcs from Markdown image syntax and raw <img> tags.
function collectSrcs(content) {
  const srcs = new Set();
  const mdRx = /!\[[^\]]*\]\(\s*<?([^)\s"<>]+)>?[^)]*\)/g;
  const imgRx = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = mdRx.exec(content))) srcs.add(m[1]);
  while ((m = imgRx.exec(content))) srcs.add(m[1]);
  return [...srcs];
}

// Replaces every local image src with whatever `resolveSrc(src)` returns — a
// data URI, or (preferred) an `mmm-img:<n>` ref from registerImage(). Returning
// null leaves the reference untouched.
export async function embedImages(content, resolveSrc) {
  if (!content) return content;
  const srcs = collectSrcs(content).filter(isLocalImageSrc);
  if (!srcs.length) return content;

  const map = {};
  await Promise.all(srcs.map(async (s) => {
    try { const uri = await resolveSrc(s); if (uri) map[s] = uri; } catch { /* ignore */ }
  }));

  let out = content;
  // Replace longer srcs first to avoid partial overlaps.
  for (const s of Object.keys(map).sort((a, b) => b.length - a.length)) {
    out = out.split(s).join(map[s]);
  }
  return out;
}

// Resolves `src` relative to the directory of `baseRelPath` (POSIX-style),
// collapsing ./ and ../ — used to match web folder-upload entries.
export function resolveRelPath(baseRelPath, src) {
  const baseDir = String(baseRelPath || '').split('/').slice(0, -1);
  const parts = String(src || '').split('/');
  const stack = [...baseDir];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') stack.pop();
    else stack.push(p);
  }
  return stack.join('/');
}

// ── Image store ───────────────────────────────────────────
// `mmm-img:<n>` → { uri, name }. Module-level: the app edits one merged
// document at a time, and the store must outlive re-renders.
export const IMAGE_REF_PREFIX = 'mmm-img:';
const REF_ONE = /^mmm-img:(\d+)$/;
const REF_ALL = /mmm-img:(\d+)/g;

const byRef = new Map();   // id → { uri, name }
const byUri = new Map();   // dedupe key → id
let refSeq = 0;

// Cheap content key so the same picture used by several files is stored once
// (comparing multi-megabyte data URIs in full would be wasteful).
function uriKey(uri) {
  return `${uri.length}|${uri.slice(0, 96)}|${uri.slice(-48)}`;
}

// Registers a data URI and returns its `mmm-img:<n>` ref (or null).
export function registerImage(uri, name = '') {
  const u = String(uri || '');
  if (!u) return null;
  const key = uriKey(u);
  const hit = byUri.get(key);
  if (hit) {
    const rec = byRef.get(hit);
    if (rec && !rec.name && name) rec.name = name;
    return IMAGE_REF_PREFIX + hit;
  }
  const id = String(++refSeq);
  byRef.set(id, { uri: u, name });
  byUri.set(key, id);
  return IMAGE_REF_PREFIX + id;
}

export function isImageRef(src) {
  return REF_ONE.test(String(src || '').trim());
}

// The data URI behind a ref (null when `src` is not a known ref).
export function resolveImageRef(src) {
  const m = REF_ONE.exec(String(src || '').trim());
  return m ? (byRef.get(m[1])?.uri || null) : null;
}

// The original file name a ref was created from ('' when unknown).
export function imageRefName(src) {
  const m = REF_ONE.exec(String(src || '').trim());
  return m ? (byRef.get(m[1])?.name || '') : '';
}

// Replaces every `mmm-img:<n>` ref with its data URI. Unknown refs are left
// alone so a stale reference degrades to a broken image, not to lost text.
export function expandImageRefs(text) {
  const s = String(text || '');
  if (!s || s.indexOf(IMAGE_REF_PREFIX) < 0) return s;
  return s.replace(REF_ALL, (m, id) => byRef.get(id)?.uri || m);
}

// Anything renderable for `src`: a stored ref, or the src itself (remote/data).
export function imageDisplaySrc(src) {
  return resolveImageRef(src) || (isLocalImageSrc(src) ? '' : String(src || ''));
}

// File name part of a src ('diagram.png' from '../img/diagram.png?v=2').
export function srcBaseName(src) {
  const s = String(src || '').split('#')[0].split('?')[0];
  return s.split(/[\\/]/).pop() || '';
}

// Drops every stored image (used when the document is cleared).
export function clearImages() {
  byRef.clear();
  byUri.clear();
  refSeq = 0;
}
