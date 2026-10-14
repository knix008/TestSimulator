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
export const MODEL_EXTENSIONS = ['fcstd', 'ifc', 'step', 'stp', 'brep', 'brp', 'scad', 'csg', 'xyz', 'asc', 'pts', 'pcd', 'stl', 'obj', 'ply', 'off', 'amf', '3mf', 'wrl', 'vrml', 'dae'];
export const isModelFileName = (name) => MODEL_EXTENSIONS.includes(extensionOf(name));
export const isImageFileName = (name) => ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'].includes(extensionOf(name));
export const isTextFileName = (name) => ['txt', 'text', 'md', 'csv'].includes(extensionOf(name));

/**
 * Every file format MyCAD reads or writes (shown in Help → About).
 * group: drawing (2D) | model (3D) | other; use: what reading it does, when not "open".
 */
export const FILE_FORMATS = [
  { id: 'mcad', name: 'MyCAD', extensions: ['mcad', 'json'], group: 'drawing', read: true, write: true },
  { id: 'dxf', name: 'AutoCAD DXF (R12 – 2018, text · binary)', extensions: ['dxf'], group: 'drawing', read: true, write: true },
  { id: 'svg', name: 'SVG', extensions: ['svg'], group: 'drawing', read: true, write: true },
  { id: 'iges', name: 'IGES 5.3', extensions: ['igs', 'iges'], group: 'drawing', read: true, write: true },
  { id: 'hpgl', name: 'HP-GL/2', extensions: ['plt', 'hpgl', 'hgl', 'hp2', 'pen'], group: 'drawing', read: true, write: true },
  { id: 'gerber', name: 'Gerber RS-274X', extensions: ['gbr', 'ger', 'gtl', 'gbl', 'gto', 'gbo', 'gts', 'gbs', 'gtp', 'gbp', 'gko', 'gm1', 'gml', 'art', 'pho'], group: 'drawing', read: true, write: false },
  { id: 'excellon', name: 'Excellon drill', extensions: ['drl', 'xln', 'exc', 'drd'], group: 'drawing', read: true, write: false },
  { id: 'png', name: 'PNG', extensions: ['png'], group: 'drawing', read: false, write: true },
  { id: 'fcstd', name: 'FreeCAD', extensions: ['FCStd'], group: 'model', read: true, write: true },
  { id: 'ifc', name: 'IFC 4 (BIM)', extensions: ['ifc'], group: 'model', read: true, write: true },
  { id: 'step', name: 'STEP AP214', extensions: ['step', 'stp'], group: 'model', read: true, write: true },
  { id: 'stl', name: 'STL', extensions: ['stl'], group: 'model', read: true, write: true },
  { id: 'obj', name: 'Wavefront OBJ', extensions: ['obj'], group: 'model', read: true, write: true },
  { id: 'ply', name: 'Stanford PLY', extensions: ['ply'], group: 'model', read: true, write: true },
  { id: 'off', name: 'Object File Format', extensions: ['off'], group: 'model', read: true, write: true },
  { id: 'amf', name: 'Additive Manufacturing (AMF)', extensions: ['amf'], group: 'model', read: true, write: true },
  { id: 'wrl', name: 'VRML 2.0 (VRML97)', extensions: ['wrl', 'vrml'], group: 'model', read: true, write: true },
  { id: 'dae', name: 'COLLADA', extensions: ['dae'], group: 'model', read: true, write: true },
  { id: 'brep', name: 'OpenCASCADE BREP', extensions: ['brep', 'brp'], group: 'model', read: true, write: true },
  { id: 'scad', name: 'OpenSCAD (CSG)', extensions: ['scad', 'csg'], group: 'model', read: true, write: true },
  { id: 'xyz', name: 'Point cloud (XYZ, ASC, PTS, PCD)', extensions: ['xyz', 'asc', 'pts', 'pcd'], group: 'model', read: true, write: true },
  { id: 'nc', name: 'G-code (CAM)', extensions: ['nc', 'gcode', 'ngc', 'tap'], group: 'other', read: false, write: true },
  { id: '3mf', name: '3D Manufacturing (3MF)', extensions: ['3mf'], group: 'model', read: true, write: true },
  { id: 'image', name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'], group: 'other', read: true, write: false, use: 'background' },
  { id: 'text', name: 'Text', extensions: ['txt', 'md', 'csv'], group: 'other', read: true, write: false, use: 'text' },
];
/** File name usable on every OS. */
export const safeFileName = (name, fallback = 'drawing') => String(name ?? '').replace(/[\\/:*?"<>|]/g, '_').trim() || fallback;
