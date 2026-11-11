// Publishing: the site as the files a web server needs — one .html per page, style.css, and the
// pictures (kept in the project as data: URLs) written once each into assets/. The same list is
// written into a folder (desktop), packed into a ZIP (web and desktop), or opened as a preview.
import { pageFile, siteStyles } from './render.js';
import { publishedPageHtml } from './sourcefiles.js';

/** FNV-1a: a short stable name for a picture. */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
}

const EXT = { 'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'image/bmp': 'bmp' };
/** A data: picture URL as it appears in the written HTML (attribute values are escaped, so it ends at & " ' ) or a space). */
const DATA_URL = /data:image\/[a-z0-9+.-]+(?:;[a-z0-9=._-]+)*,[^"'&)\s]+/gi;

function base64Bytes(text) {
  if (typeof atob === 'function') {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(text, 'base64'));
}

/** A data: URL as a file: { ext, data (string | Uint8Array) } or null. */
export function decodeDataUrl(url) {
  const m = /^data:(image\/[a-z0-9+.-]+)((?:;[a-z0-9=._-]+)*),(.*)$/is.exec(url);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const ext = EXT[mime] ?? 'img';
  const base64 = /;base64/i.test(m[2]);
  try {
    if (base64) return { ext, mime, data: base64Bytes(m[3]) };
    const text = decodeURIComponent(m[3]);
    return { ext, mime, data: text };
  } catch {
    return null;
  }
}

/**
 * The site's files: [{ path, data }] — data is text or bytes. `extractImages`: pictures become
 * files in assets/ (otherwise they stay inside the pages).
 */
export function siteFiles(site, { extractImages = true } = {}) {
  const assets = new Map();
  const extract = (text) => (extractImages ? text.replace(DATA_URL, (url) => {
    if (assets.has(url)) return assets.get(url).path;
    const file = decodeDataUrl(url);
    if (!file) return url;
    const path = `assets/img-${hash(url)}.${file.ext}`;
    assets.set(url, { path, data: file.data });
    return path;
  }) : text);
  const files = [];
  for (const page of site.pages) files.push({ path: pageFile(page), data: extract(publishedPageHtml(site, page, { css: 'style.css' })) });
  files.push({ path: 'style.css', data: siteStyles(site) });
  if (String(site.code?.js ?? '').trim()) files.push({ path: 'script.js', data: `${String(site.code.js).trim()}\n` });
  for (const asset of assets.values()) files.push({ path: asset.path, data: asset.data });
  return files;
}

/** One page as a single file with its style and pictures inside (e-mail, a quick share). */
export const singlePageHtml = (site, page) => publishedPageHtml(site, page, { css: null });

/** Total size in bytes of a file list. */
export const filesSize = (files) => files.reduce((sum, f) => sum + (typeof f.data === 'string' ? new TextEncoder().encode(f.data).length : f.data.length), 0);

/** Problems worth telling the user before publishing (i18n keys with values). */
export function publishChecks(site) {
  const out = [];
  if (!site.meta?.title?.trim()) out.push({ key: 'check.noTitle' });
  if (!site.meta?.description?.trim()) out.push({ key: 'check.noDescription' });
  for (const page of site.pages) {
    if (!page.blocks.length) out.push({ key: 'check.emptyPage', params: { name: page.name } });
    for (const block of page.blocks) {
      const p = block.props ?? {};
      if (block.type === 'image' && !p.alt) out.push({ key: 'check.noAlt', params: { name: page.name } });
      if (block.type === 'contact' && p.form && !p.endpoint && !p.email) out.push({ key: 'check.noFormTarget', params: { name: page.name } });
    }
  }
  const slugs = site.pages.map((p) => p.slug);
  if (new Set(slugs).size !== slugs.length) out.push({ key: 'check.sameSlug' });
  return out;
}
