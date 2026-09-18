// HEIC / HEIF preview: decode one image of the file to a PNG data URL.
// Chromium cannot draw these formats; libheif-js (via heic-decode) can.
'use strict';

const fsp = require('fs/promises');
const decodeHeic = require('heic-decode');
const png = require('./png');

const cache = { key: '', images: null };

function dispose() {
  if (cache.images && typeof cache.images.dispose === 'function') {
    try { cache.images.dispose(); } catch { /* already freed */ }
  }
  cache.key = '';
  cache.images = null;
}

async function load(p, mtime, buf) {
  const key = `${p}|${mtime}|${buf.length}`;
  if (cache.key === key && cache.images) return cache.images;
  dispose();
  const images = await decodeHeic.all({ buffer: buf });
  cache.key = key;
  cache.images = images;
  return images;
}

async function preview(filePath, { index = 0 } = {}) {
  const st = await fsp.stat(filePath);
  const buf = await fsp.readFile(filePath);
  let images;
  try {
    images = await load(filePath, st.mtimeMs, buf);
  } catch (e) {
    throw Object.assign(new Error('Not a readable HEIC/HEIF image: ' + (e.message || e)), { code: 'ENOTHEIC' });
  }
  const count = images.length;
  if (!count) throw Object.assign(new Error('HEIC/HEIF has no images'), { code: 'ENOTHEIC' });
  const i = Math.max(0, Math.min(count - 1, index | 0));
  const { width, height, data } = await images[i].decode();
  return {
    kind: 'heic',
    mode: 'frames',
    index: i,
    count,
    width,
    height,
    src: png.dataUrl(width, height, data),
    meta: { format: 'HEIC/HEIF' },
    path: filePath,
  };
}

async function firstPng(filePath) {
  const r = await preview(filePath, { index: 0 });
  dispose();
  return r.src;
}

module.exports = { preview, firstPng, dispose };
