// .mcad files: JSON { format: 'mycad', version, drawing }. DXF files are read
// by dxf.js and become drawings too.
import { normalizeDrawing } from './drawing.js';

export const FORMAT = 'mycad';
export const VERSION = 1;
export const EXTENSION = '.mcad';

/** A file the app cannot read; `code` is an i18n key, `detail` the technical reason. */
export class FormatError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'FormatError';
    this.code = code;
    this.detail = detail;
  }
}

export function serialize(drawing) {
  return `${JSON.stringify({ format: FORMAT, version: VERSION, app: 'MyCAD', saved: new Date().toISOString(), drawing }, null, 1)}\n`;
}

export function parseFile(text, language = 'ko') {
  let data;
  try {
    data = JSON.parse(String(text).replace(/^﻿/, ''));
  } catch (error) {
    throw new FormatError('format.invalidJson', error.message);
  }
  if (!data || typeof data !== 'object') throw new FormatError('format.notDrawing');
  if (data.format && data.format !== FORMAT) throw new FormatError('format.otherFormat', String(data.format));
  if (data.format === FORMAT && Number(data.version) > VERSION) throw new FormatError('format.newerVersion', `v${data.version}`);
  const raw = data.drawing ?? (Array.isArray(data.entities) ? data : null);
  if (!raw || typeof raw !== 'object') throw new FormatError('format.notDrawing');
  return normalizeDrawing(raw, language);
}

// ───────────────────────── file names

export const baseName = (path) => String(path ?? '').split(/[\\/]/).pop() ?? '';
export function directoryOf(path) {
  const value = String(path ?? '');
  const index = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
  return index > 0 ? value.slice(0, index) : '';
}
export const stripExtension = (name) => String(name ?? '').replace(/\.[^.\\/]+$/, '');
export const extensionOf = (name) => (/\.([^.\\/]+)$/.exec(String(name ?? ''))?.[1] ?? '').toLowerCase();
/** `path` with the given extension (added when missing or different). */
export function withExtension(path, extension = EXTENSION) {
  return String(path).toLowerCase().endsWith(extension) ? path : `${path}${extension}`;
}
export const isDrawingFileName = (name) => ['mcad', 'json'].includes(extensionOf(name));
export const isDxfFileName = (name) => extensionOf(name) === 'dxf';
/** 3D models MyCAD reads (FreeCAD's exchange formats). */
export const MODEL_EXTENSIONS = ['fcstd', 'step', 'stp', 'stl', 'obj', 'ply', 'off', 'amf', '3mf'];
export const isModelFileName = (name) => MODEL_EXTENSIONS.includes(extensionOf(name));
export const isImageFileName = (name) => ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'].includes(extensionOf(name));
export const isTextFileName = (name) => ['txt', 'text', 'md', 'csv'].includes(extensionOf(name));
/** File name usable on every OS. */
export const safeFileName = (name, fallback = 'drawing') => String(name ?? '').replace(/[\\/:*?"<>|]/g, '_').trim() || fallback;
