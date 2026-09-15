// Image sources for the Markdown WYSIWYG view and the preview.
//
// `data:` and `http(s):` URLs are used as they are. Anything else is a file
// path — relative to the document's folder — that the page cannot load
// itself (the desktop app runs from file:// or the dev server, the web version
// from a server that does not expose the disk), so the backend reads it and
// hands back a data URL (`file.dataUrl`), cached here per resolved path.
import { call } from './backend';

const cache = new Map();

export function isRemote(src) { return /^(data:|https?:|blob:)/i.test(src); }

function joinPath(base, rel) {
  let p = rel.replace(/^file:\/\/\/?/i, '');
  try { p = decodeURI(p); } catch { /* keep as typed */ }
  if (/^([a-zA-Z]:[\\/]|\\\\|\/)/.test(p)) return p;          // absolute
  if (!base) return p;
  const sep = base.includes('\\') ? '\\' : '/';
  return base.replace(/[\\/]+$/, '') + sep + p.replace(/^\.\//, '');
}

export function resolveImageSrc(src, base) {
  const s = String(src || '').trim().replace(/^<|>$/g, '');
  if (!s) return Promise.reject(new Error('empty'));
  if (isRemote(s)) return Promise.resolve(s);
  const p = joinPath(base, s.split(/[?#]/)[0]);
  let hit = cache.get(p);
  if (!hit) {
    hit = call('file.dataUrl', { path: p }).then((r) => r.dataUrl);
    hit.catch(() => cache.delete(p));
    cache.set(p, hit);
  }
  return hit;
}

// Rewrites the <img> elements under `root` whose src is a local path.
export function resolveImagesIn(root, base) {
  for (const img of root.querySelectorAll('img[src]')) {
    const src = img.getAttribute('src');
    if (!src || isRemote(src)) continue;
    resolveImageSrc(src, base).then((u) => { img.src = u; }).catch(() => {});
  }
}

export const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif' };
export function mimeOfName(name) { const m = String(name || '').match(/\.([a-z0-9]+)$/i); return (m && IMAGE_MIME[m[1].toLowerCase()]) || ''; }
export function isImageFile(file) { return /^image\//.test(file.type || '') || !!mimeOfName(file.name); }

// Reads a dropped / pasted image file as a data URL (for embedding in
// Markdown). The MIME type comes from the file, or from its extension when
// the OS reports none — PNG, JPEG, GIF, WebP, SVG, BMP, AVIF and ICO all work.
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      let u = String(r.result);
      const mime = (/^image\//.test(file.type || '') ? file.type : '') || mimeOfName(file.name);
      if (mime) u = u.replace(/^data:[^;,]*/, `data:${mime}`);
      resolve(u);
    };
    r.onerror = () => reject(r.error || new Error('read failed'));
    r.readAsDataURL(file);
  });
}
