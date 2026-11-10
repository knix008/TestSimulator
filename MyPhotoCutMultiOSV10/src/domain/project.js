// A MyPhotoCut project: the photo, its face features and the caricatures drawn from it.
//   { format, version, name, photo: { name, type, width, height, data (data: URL) },
//     features, items: [{ id, name, styleId, seed, warp, options, effects }], selected, created, modified }
// Saved as JSON in a .mypcut file. The photo is kept inside, so a project opens anywhere.
import { styleById, STYLE_IDS, normalizeOptions, DEFAULT_STYLE_IDS } from '../engine/styles.js';
import { normalizeWarp, personalWarp, WARP_KEYS, WARP_RANGE } from '../engine/warp.js';
import { normalizeEffect } from '../engine/effects.js';
import { validFeatures } from '../engine/face.js';
import { clamp, rng } from '../engine/raster.js';

export const PROJECT_FORMAT = 'myphotocut';
export const PROJECT_VERSION = 1;
export const PROJECT_EXTENSION = 'mypcut';
/** Most caricatures a project holds. */
export const MAX_ITEMS = 80;

export class FormatError extends Error {
  constructor(code, detail = '') {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

let counter = 0;
export const newId = () => `c${Date.now().toString(36)}${(counter++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/**
 * A new caricature of a style, with the style's own exaggeration (fitted to the face when
 * `factors` — face.js distinctiveness — are given) and options.
 */
export function newItem(styleId, seed = Math.floor(Math.random() * 1e9), factors = null) {
  const style = styleById(styleId);
  return {
    id: newId(),
    name: '',
    styleId: style.id,
    seed: seed >>> 0,
    warp: personalWarp(style.warp, factors),
    options: normalizeOptions(style.id, style.options),
    effects: [],
  };
}

/** The default set: one caricature of each chosen style (all forty unless the user narrowed it). */
export const defaultItems = (styles = DEFAULT_STYLE_IDS, seed = 1, factors = null) => styles.map((id, i) => newItem(id, (seed * 7919 + i * 104729) >>> 0, factors));

/**
 * Another take on a caricature: a new seed (colours, background) and exaggerations moved by up to
 * ±`spread` (0.12 = 12 %) around the current ones.
 */
export function varyItem(item, seed = Math.floor(Math.random() * 1e9), spread = 0.12) {
  const random = rng(seed);
  const warp = { ...item.warp };
  for (const key of WARP_KEYS) warp[key] = clamp(Math.round((warp[key] + (random() * 2 - 1) * spread * warp[key]) * 100) / 100, WARP_RANGE.min, WARP_RANGE.max);
  return { ...structuredClone(item), id: newId(), seed: seed >>> 0, warp: normalizeWarp(warp) };
}

export function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const styleId = STYLE_IDS.includes(raw.styleId) ? raw.styleId : null;
  if (!styleId) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    name: typeof raw.name === 'string' ? raw.name.slice(0, 80) : '',
    styleId,
    seed: Number.isFinite(Number(raw.seed)) ? Number(raw.seed) >>> 0 : 1,
    warp: normalizeWarp(raw.warp),
    options: normalizeOptions(styleId, raw.options),
    effects: Array.isArray(raw.effects) ? raw.effects.map(normalizeEffect).filter(Boolean) : [],
  };
}

/** The project as file text. */
export function serializeProject(project) {
  return JSON.stringify({
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: project.name ?? '',
    created: project.created ?? new Date().toISOString(),
    modified: new Date().toISOString(),
    photo: project.photo,
    features: project.features,
    items: project.items,
    selected: project.selected ?? null,
    autoCrop: project.autoCrop !== false,
    crop: project.crop ?? null,
  });
}

/** A project from file text; throws FormatError (format.notProject, format.badPhoto …). */
export function parseProject(text) {
  let raw;
  try {
    raw = JSON.parse(String(text).replace(/^﻿/, ''));
  } catch (error) {
    throw new FormatError('format.notJson', error.message);
  }
  if (raw?.format !== PROJECT_FORMAT) throw new FormatError('format.notProject');
  if (Number(raw.version) > PROJECT_VERSION) throw new FormatError('format.newer', String(raw.version));
  const photo = raw.photo;
  if (!photo || typeof photo.data !== 'string' || !/^data:image\//.test(photo.data) || !(photo.width > 0) || !(photo.height > 0)) throw new FormatError('format.badPhoto');
  const items = (Array.isArray(raw.items) ? raw.items : []).map(normalizeItem).filter(Boolean).slice(0, MAX_ITEMS);
  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    created: typeof raw.created === 'string' ? raw.created : null,
    photo: { name: String(photo.name ?? ''), type: String(photo.type ?? ''), width: Math.round(photo.width), height: Math.round(photo.height), data: photo.data },
    features: validFeatures(raw.features) ? raw.features : null,
    items,
    selected: items.some((item) => item.id === raw.selected) ? raw.selected : items[0]?.id ?? null,
    autoCrop: raw.autoCrop !== false,
    crop: validCrop(raw.crop, photo.width, photo.height),
  };
}

/** A framing rectangle inside the photo, or null. */
function validCrop(c, width, height) {
  if (!c || ![c.x, c.y, c.w, c.h].every(Number.isFinite) || c.w < 8 || c.h < 8) return null;
  if (c.x < 0 || c.y < 0 || c.x + c.w > width + 1 || c.y + c.h > height + 1) return null;
  return { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.w), h: Math.round(c.h) };
}

// ───────────────────────── file names

export const extensionOf = (name) => String(name ?? '').split(/[\\/]/).pop().split('.').slice(1).pop()?.toLowerCase() ?? '';
export const baseName = (path) => String(path ?? '').split(/[\\/]/).pop() ?? '';
export const stripExtension = (name) => String(name ?? '').replace(/\.[^.\\/]+$/, '');
export const directoryOf = (path) => { const s = String(path ?? ''); const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')); return i > 0 ? s.slice(0, i) : ''; };
/** Pictures that open: the browser's own formats and the ones export/codecs.js reads. */
export const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'jpe', 'jfif', 'png', 'apng', 'webp', 'bmp', 'dib', 'gif', 'avif', 'ico', 'cur', 'svg', 'heic', 'heif', 'tif', 'tiff', 'tga', 'ppm', 'pgm', 'pbm', 'pnm', 'pam', 'qoi', 'psd'];
export const isPhotoName = (name) => PHOTO_EXTENSIONS.includes(extensionOf(name));
export const isProjectName = (name) => extensionOf(name) === PROJECT_EXTENSION;
export const isOpenableName = (name) => isPhotoName(name) || isProjectName(name);
export const safeFileName = (text) => String(text ?? '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'caricature';
export const mimeOf = (name) => ({
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', jfif: 'image/jpeg', png: 'image/png', apng: 'image/apng', webp: 'image/webp', bmp: 'image/bmp', dib: 'image/bmp', gif: 'image/gif',
  avif: 'image/avif', ico: 'image/x-icon', cur: 'image/x-icon', svg: 'image/svg+xml', heic: 'image/heic', heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff',
})[extensionOf(name)] ?? 'application/octet-stream';
