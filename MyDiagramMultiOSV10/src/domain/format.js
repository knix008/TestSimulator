// The .mdg file (a drawing) and .mdgt (a template: the same content, kept as
// a starting point) — UTF-8 JSON:
//   { "format": "mydiagram", "version": 1, "kind": "drawing" | "template", "saved": "…", "document": { … } }
// Reading repairs what it can (missing fields get their defaults, connectors
// glued to missing shapes keep their place as free ends, members of missing
// groups are released) and refuses what is not a drawing.
import { createDocument, createLayer, createPage, FORMAT, newId, normalizeAngle, normalizeData, refreshGroups, ROUTES, VERSION } from './diagram.js';
import { DESIGNS, isColor, STYLE_KEYS } from './designs.js';
import { CATEGORIES, hasMaster } from './stencils.js';

export const DRAWING_EXTENSION = 'mdg';
export const TEMPLATE_EXTENSION = 'mdgt';

export class FormatError extends Error {
  constructor(code, detail = '') {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

export const baseName = (path) => String(path ?? '').split(/[\\/]/).pop();
export const directoryOf = (path) => {
  const text = String(path ?? '');
  const index = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  return index > 0 ? text.slice(0, index) : '';
};
export const extensionOf = (name) => (/\.([^./\\]+)$/.exec(String(name ?? ''))?.[1] ?? '').toLowerCase();
export const stripExtension = (name) => String(name ?? '').replace(/\.[^./\\]+$/, '');
export const withExtension = (path, extension) => (extensionOf(path) === extension ? path : `${stripExtension(path)}.${extension}`);
export const isDiagramFileName = (name) => ['mdg', 'mdgt', 'json'].includes(extensionOf(name));
export const isTemplateFileName = (name) => extensionOf(name) === 'mdgt';
export const isVsdxFileName = (name) => ['vsdx', 'vstx', 'vssx'].includes(extensionOf(name));
export const isSvgFileName = (name) => extensionOf(name) === 'svg';
export const isCsvFileName = (name) => ['csv', 'tsv', 'txt'].includes(extensionOf(name));
export const isImageFileName = (name) => ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'].includes(extensionOf(name));
/** Files the app opens as a drawing (its own, Visio). */
export const isOpenableFileName = (name) => isDiagramFileName(name) || isVsdxFileName(name);

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const text = (value) => (typeof value === 'string' ? value : value == null ? '' : String(value));

function cleanStyle(raw) {
  const style = {};
  if (!raw || typeof raw !== 'object') return style;
  for (const key of STYLE_KEYS) {
    const value = raw[key];
    if (value === undefined || value === null) continue;
    if (['fill', 'fill2', 'line', 'textColor', 'shadowColor'].includes(key)) {
      if (value === 'none' || isColor(value) || /^rgba?\(/.test(String(value))) style[key] = String(value);
    } else if (['lineWidth', 'fontSize', 'fillOpacity', 'lineOpacity', 'opacity', 'rounding', 'gradientAngle', 'textAngle', 'lineSpacing', 'margin', 'arrowSize'].includes(key)) {
      if (Number.isFinite(Number(value))) style[key] = Number(value);
    } else if (['bold', 'italic', 'underline', 'strike', 'shadow'].includes(key)) style[key] = Boolean(value);
    else style[key] = String(value);
  }
  if (raw.lineJumps === false) style.lineJumps = false;
  return style;
}

function cleanEnd(raw) {
  if (raw && typeof raw === 'object' && raw.id) return { id: text(raw.id), pt: raw.pt === 'auto' || raw.pt == null ? 'auto' : Math.max(0, Math.round(num(raw.pt))) };
  return { x: num(raw?.x), y: num(raw?.y) };
}

const cleanComments = (list) => (Array.isArray(list) ? list : []).filter((c) => c && c.text != null).map((c) => ({ id: text(c.id) || newId('cmt'), author: text(c.author), text: text(c.text), at: text(c.at) || new Date().toISOString(), done: Boolean(c.done) }));

function cleanShape(raw, layerIds) {
  const type = raw.type === 'connector' ? 'connector' : raw.type === 'group' ? 'group' : 'shape';
  const common = {
    id: text(raw.id) || newId(type === 'connector' ? 'con' : type === 'group' ? 'grp' : 'shp'), type, name: text(raw.name), text: text(raw.text),
    style: cleanStyle(raw.style), layers: (Array.isArray(raw.layers) ? raw.layers : []).map(text).filter((id) => layerIds.has(id)),
    locked: raw.locked && typeof raw.locked === 'object' ? Object.fromEntries(Object.entries(raw.locked).filter(([, v]) => v).map(([k]) => [k, true])) : {},
    data: normalizeData(raw.data), hyperlink: text(raw.hyperlink), comments: cleanComments(raw.comments), groupId: raw.groupId ? text(raw.groupId) : null,
  };
  if (type === 'connector') {
    return {
      ...common, from: cleanEnd(raw.from), to: cleanEnd(raw.to), route: ROUTES.includes(raw.route) ? raw.route : 'orthogonal',
      waypoints: (Array.isArray(raw.waypoints) ? raw.waypoints : []).filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))).map((p) => ({ x: num(p.x), y: num(p.y) })),
      textPos: Math.max(0, Math.min(1, num(raw.textPos, 0.5))),
    };
  }
  const shape = {
    ...common, master: type === 'group' ? 'group' : hasMaster(raw.master) ? raw.master : 'rect',
    x: num(raw.x), y: num(raw.y), w: Math.max(1, num(raw.w, 100)), h: Math.max(1, num(raw.h, 60)), angle: normalizeAngle(num(raw.angle)),
    flipH: Boolean(raw.flipH), flipV: Boolean(raw.flipV), qs: raw.qs && typeof raw.qs === 'object' ? { ...(raw.qs.color ? { color: Math.max(1, Math.min(6, Math.round(num(raw.qs.color, 1)))) } : {}), ...(raw.qs.variant ? { variant: text(raw.qs.variant) } : {}) } : {},
    params: raw.params && typeof raw.params === 'object' ? JSON.parse(JSON.stringify(raw.params)) : {}, showData: Boolean(raw.showData),
  };
  if (Array.isArray(raw.points) && raw.points.length) shape.points = raw.points.filter((p) => Array.isArray(p) && p.length === 2).map(([x, y]) => [num(x), num(y)]);
  if (raw.src) shape.src = text(raw.src);
  return shape;
}

function cleanPage(raw, index, language) {
  const base = createPage({ name: text(raw?.name) || `${language === 'en' ? 'Page' : '페이지'}-${index + 1}` });
  const page = { ...base, id: text(raw?.id) || base.id, name: text(raw?.name) || base.name };
  page.width = Math.max(50, num(raw?.width, base.width));
  page.height = Math.max(50, num(raw?.height, base.height));
  page.paper = text(raw?.paper) || 'custom';
  page.orientation = raw?.orientation === 'portrait' ? 'portrait' : 'landscape';
  page.autoSize = raw?.autoSize !== false;
  page.background = Boolean(raw?.background);
  page.backgroundId = raw?.backgroundId ? text(raw.backgroundId) : null;
  page.color = isColor(raw?.color) ? raw.color : '';
  page.grid = raw?.grid !== false;
  page.gridSize = Math.max(0, num(raw?.gridSize));
  page.layers = (Array.isArray(raw?.layers) ? raw.layers : []).filter((layer) => layer && typeof layer === 'object').map((layer) => ({ ...createLayer(text(layer.name) || 'Layer'), id: text(layer.id) || newId('layer'), visible: layer.visible !== false, print: layer.print !== false, locked: Boolean(layer.locked), color: isColor(layer.color) ? layer.color : '' }));
  const layerIds = new Set(page.layers.map((layer) => layer.id));
  page.activeLayer = layerIds.has(raw?.activeLayer) ? raw.activeLayer : null;
  page.guides = (Array.isArray(raw?.guides) ? raw.guides : []).filter((g) => g && (g.orient === 'h' || g.orient === 'v')).map((g) => ({ id: text(g.id) || newId('guide'), orient: g.orient, pos: num(g.pos) }));
  page.comments = cleanComments(raw?.comments);
  const seen = new Set();
  page.shapes = (Array.isArray(raw?.shapes) ? raw.shapes : []).filter((shape) => shape && typeof shape === 'object').map((shape) => {
    const clean = cleanShape(shape, layerIds);
    if (seen.has(clean.id)) clean.id = newId(clean.type === 'connector' ? 'con' : 'shp');
    seen.add(clean.id);
    return clean;
  });
  const ids = new Map(page.shapes.map((shape) => [shape.id, shape]));
  for (const shape of page.shapes) {
    if (shape.groupId && ids.get(shape.groupId)?.type !== 'group') shape.groupId = null;
    if (shape.type === 'connector') {
      for (const key of ['from', 'to']) {
        const end = shape[key];
        const target = end.id ? ids.get(end.id) : null;
        if (end.id && (!target || target.type === 'connector')) shape[key] = { x: 0, y: 0 };
      }
    }
  }
  // Empty groups go.
  page.shapes = page.shapes.filter((shape) => shape.type !== 'group' || page.shapes.some((other) => other.groupId === shape.id));
  refreshGroups(page);
  return page;
}

/** Repairs a document read from a file: every field present and valid. */
export function normalizeDocument(raw, language = 'ko') {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.pages)) throw new FormatError('format.notDiagram');
  const base = createDocument({ title: text(raw.title) || 'Drawing', language: raw.language === 'en' || raw.language === 'ko' ? raw.language : language });
  const doc = { ...base };
  for (const key of ['id', 'title', 'subject', 'author', 'manager', 'company', 'category', 'keywords', 'description', 'created']) if (raw[key] != null) doc[key] = text(raw[key]);
  doc.id = doc.id || base.id;
  doc.title = doc.title || base.title;
  doc.design = DESIGNS.some((d) => d.id === raw.design) ? raw.design : 'office';
  doc.variant = Math.max(0, Math.min(3, Math.round(num(raw.variant))));
  doc.units = ['mm', 'cm', 'in', 'pt', 'px'].includes(raw.units) ? raw.units : base.units;
  doc.options = { ...base.options, ...(raw.options && typeof raw.options === 'object' ? raw.options : {}) };
  for (const key of ['lineJumps', 'avoidShapes', 'snapGrid', 'snapShapes', 'snapGuides', 'glue', 'dataGraphics']) doc.options[key] = doc.options[key] !== false && doc.options[key] !== 0 ? Boolean(doc.options[key]) : false;
  doc.options.connectorRoute = ROUTES.includes(doc.options.connectorRoute) ? doc.options.connectorRoute : 'orthogonal';
  if (Array.isArray(raw.stencils)) doc.stencils = raw.stencils.filter((id) => CATEGORIES.some((cat) => cat.id === id));
  doc.pages = raw.pages.filter((page) => page && typeof page === 'object').map((page, index) => cleanPage(page, index, doc.language));
  if (!doc.pages.length) doc.pages = base.pages;
  const pageIds = new Set(doc.pages.map((page) => page.id));
  for (const page of doc.pages) if (page.backgroundId && (!pageIds.has(page.backgroundId) || page.backgroundId === page.id)) page.backgroundId = null;
  doc.format = FORMAT;
  doc.version = VERSION;
  return doc;
}

/** The document as file text. A template keeps everything (it is a starting point), marked as such. */
export function serialize(doc, { template = false } = {}) {
  return `${JSON.stringify({ format: FORMAT, version: VERSION, kind: template ? 'template' : 'drawing', saved: new Date().toISOString(), document: doc }, null, 1)}\n`;
}

/** File text → { doc, template }. Throws FormatError. */
export function parseDiagram(source, language = 'ko') {
  let data;
  try {
    data = JSON.parse(String(source ?? '').replace(/^﻿/, ''));
  } catch (error) {
    throw new FormatError('format.notJson', error.message);
  }
  if (!data || typeof data !== 'object') throw new FormatError('format.notDiagram');
  if (data.format && data.format !== FORMAT) throw new FormatError('format.notDiagram', String(data.format));
  if (Number(data.version) > VERSION) throw new FormatError('format.newer', String(data.version));
  const raw = data.document ?? (Array.isArray(data.pages) ? data : null);
  if (!raw) throw new FormatError('format.notDiagram');
  return { doc: normalizeDocument(raw, language), template: data.kind === 'template' };
}
