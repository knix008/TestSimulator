// Inlines local image references in Markdown as Base64 data URIs so merged
// documents are self-contained (images render in preview and all exports).

export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tif', 'tiff', 'ico', 'avif'];

// A src that points to a local file (not remote / data / protocol-relative).
export function isLocalImageSrc(src) {
  const s = String(src || '').trim();
  if (!s) return false;
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

// Replaces every local image src with its data URI. `resolveSrc(src)` returns a
// data URI string (or null to leave the reference untouched).
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
