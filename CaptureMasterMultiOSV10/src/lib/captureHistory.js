// Capture history: one entry per capture or recording, newest first.
//
// Entries only point at files (every capture is saved automatically, a
// recording is written as it is made); removing an entry never touches the
// file. The list is kept apart from the settings because of the thumbnails:
// userData/capture-history.json on the desktop, localStorage on the web.

import { platform, isDesktop } from './platform.js';
import { loadImage } from './image.js';
import { newId } from './document.js';

export const MAX_HISTORY = 300;
export const THUMB_SIZE = 240;
const WEB_KEY = 'capturemaster.history';
const FILE_NAME = 'capture-history.json';

const KINDS = ['image', 'video'];
const SOURCES = ['screen', 'window', 'region', 'recording'];

export function normalizeHistory(raw) {
  const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.items) ? raw.items : []);
  const seen = new Set();
  const out = [];
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const id = typeof e.id === 'string' && e.id ? e.id : newId('h');
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      path: typeof e.path === 'string' ? e.path : '',
      name: typeof e.name === 'string' ? e.name : '',
      kind: KINDS.includes(e.kind) ? e.kind : 'image',
      source: SOURCES.includes(e.source) ? e.source : 'screen',
      width: Number(e.width) || 0,
      height: Number(e.height) || 0,
      bytes: Number(e.bytes) || 0,
      time: Number(e.time) || Date.now(),
      thumb: typeof e.thumb === 'string' && e.thumb.startsWith('data:image/') ? e.thumb : '',
    });
    if (out.length >= MAX_HISTORY) break;
  }
  return out;
}

export function addEntry(list, entry) {
  const rest = entry.path ? list.filter((e) => e.path !== entry.path) : list;
  return [{ id: newId('h'), time: Date.now(), ...entry }, ...rest].slice(0, MAX_HISTORY);
}

export function removeEntry(list, id) {
  return list.filter((e) => e.id !== id);
}

function filePath(userData) {
  const sep = userData.includes('\\') ? '\\' : '/';
  return `${userData.replace(/[\\/]+$/, '')}${sep}${FILE_NAME}`;
}

export async function loadHistory(userData) {
  try {
    if (isDesktop && userData) {
      const p = filePath(userData);
      if (!(await platform.fs.exists(p))) return [];
      return normalizeHistory(JSON.parse(await platform.fs.readText(p)));
    }
    return normalizeHistory(JSON.parse(localStorage.getItem(WEB_KEY) || '[]'));
  } catch (err) {
    console.warn('[CaptureMaster] capture history could not be read', err);
    return [];
  }
}

export async function saveHistory(userData, list) {
  const text = JSON.stringify({ version: 1, items: list });
  if (isDesktop && userData) return platform.fs.writeText(filePath(userData), text);
  try { localStorage.setItem(WEB_KEY, text); } catch { localStorage.setItem(WEB_KEY, JSON.stringify({ version: 1, items: list.slice(0, 40) })); }
  return true;
}

// Media URLs are another origin; without CORS the canvas would be tainted.
function loadForCanvas(src) {
  if (/^(data|blob):/.test(src)) return loadImage(src);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The image could not be loaded: ' + src));
    img.src = src;
  });
}

/** A small JPEG of an image (data URL, object URL or app media URL). */
export async function thumbnailOf(src) {
  const img = src instanceof HTMLImageElement || src instanceof HTMLCanvasElement ? src : await loadForCanvas(src);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return '';
  const k = Math.min(1, THUMB_SIZE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

/** First frame of a video file as a thumbnail (empty when it cannot be decoded). */
export function videoThumbnail(url) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const done = (value) => { clearTimeout(timer); v.removeAttribute('src'); v.load(); resolve(value); };
    const timer = setTimeout(() => done(''), 8000);
    v.muted = true;
    v.preload = 'auto';
    if (!/^(data|blob):/.test(url)) v.crossOrigin = 'anonymous';
    v.onerror = () => done('');
    v.onloadeddata = async () => {
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      if (!c.width || !c.height) { done(''); return; }
      c.getContext('2d').drawImage(v, 0, 0);
      done(await thumbnailOf(c).catch(() => ''));
    };
    v.src = url;
  });
}
