// Columns of the shape tables (Shape Sheet and Shape Data views): how each
// value is read, shown and written. ctx = { doc, page, units, language, t }.
import { formatLength, isConnector, isGroup, normalizeAngle, parseLength, setBox, setStyle } from './diagram.js';
import { isColor, resolveConnectorStyle, resolveShapeStyle } from './designs.js';
import { masterById } from './stencils.js';

const num = (value) => { const v = Number(String(value).replace(',', '.').replace(/[^\d.+-]/g, '')); return Number.isFinite(v) ? v : null; };
const lengthField = (id, key) => ({
  id, width: 84, align: 'right', kind: 'number',
  get: (ctx, s) => (isConnector(s) ? null : s[key]),
  text: (ctx, v) => (v == null ? '' : formatLength(v, ctx.units)),
  set: (ctx, s, value) => {
    if (isConnector(s)) return;
    const px = parseLength(value, ctx.units);
    if (px == null) throw new Error(ctx.t('field.badNumber'));
    const box = { x: s.x, y: s.y, w: s.w, h: s.h, [key]: key === 'w' || key === 'h' ? Math.max(1, px) : px };
    setBox(ctx.page, s.id, box);
  },
});
const styleColor = (id, key) => ({
  id, width: 96, align: 'left', kind: 'color',
  get: (ctx, s) => (isGroup(s) ? '' : (isConnector(s) ? resolveConnectorStyle(ctx.doc, s) : resolveShapeStyle(ctx.doc, s))[key] ?? ''),
  set: (ctx, s, value) => {
    const v = String(value).trim();
    if (v && v !== 'none' && !isColor(v)) throw new Error(ctx.t('field.badColor'));
    setStyle(ctx.page, [s.id], { [key]: v || null });
  },
});

export const SHAPE_FIELDS = [
  { id: 'name', width: 140, align: 'left', kind: 'text', get: (ctx, s) => s.name ?? '', set: (ctx, s, v) => { s.name = String(v ?? ''); } },
  { id: 'master', width: 130, align: 'left', kind: 'readonly', get: (ctx, s) => (isConnector(s) ? ctx.t('shape.connector') : isGroup(s) ? ctx.t('shape.group') : masterById(s.master).name[ctx.language === 'en' ? 'en' : 'ko']) },
  { id: 'text', width: 200, align: 'left', kind: 'text', get: (ctx, s) => s.text ?? '', text: (ctx, v) => String(v ?? '').replace(/\n/g, ' ⏎ '), set: (ctx, s, v) => { s.text = String(v ?? '').replace(/ ⏎ /g, '\n'); } },
  lengthField('x', 'x'),
  lengthField('y', 'y'),
  lengthField('width', 'w'),
  lengthField('height', 'h'),
  { id: 'angle', width: 70, align: 'right', kind: 'number', get: (ctx, s) => (isConnector(s) ? null : s.angle ?? 0), text: (ctx, v) => (v == null ? '' : `${Math.round(v * 10) / 10}°`),
    set: (ctx, s, v) => { const a = num(v); if (a == null) throw new Error(ctx.t('field.badNumber')); if (!isConnector(s) && !isGroup(s)) s.angle = normalizeAngle(a); } },
  styleColor('fill', 'fill'),
  styleColor('line', 'line'),
  { id: 'lineWidth', width: 74, align: 'right', kind: 'number', get: (ctx, s) => (isGroup(s) ? null : (isConnector(s) ? resolveConnectorStyle(ctx.doc, s) : resolveShapeStyle(ctx.doc, s)).lineWidth), text: (ctx, v) => (v == null ? '' : `${v} px`),
    set: (ctx, s, v) => { const w = num(v); if (w == null || w < 0) throw new Error(ctx.t('field.badNumber')); setStyle(ctx.page, [s.id], { lineWidth: w }); } },
  { id: 'fontSize', width: 70, align: 'right', kind: 'number', get: (ctx, s) => (isGroup(s) ? null : (isConnector(s) ? resolveConnectorStyle(ctx.doc, s) : resolveShapeStyle(ctx.doc, s)).fontSize), text: (ctx, v) => (v == null ? '' : `${v} px`),
    set: (ctx, s, v) => { const f = num(v); if (f == null || f <= 0) throw new Error(ctx.t('field.badNumber')); setStyle(ctx.page, [s.id], { fontSize: f }); } },
  { id: 'layer', width: 120, align: 'left', kind: 'readonly', get: (ctx, s) => (s.layers ?? []).map((id) => ctx.page.layers.find((layer) => layer.id === id)?.name).filter(Boolean).join(', ') },
  { id: 'hyperlink', width: 160, align: 'left', kind: 'text', get: (ctx, s) => s.hyperlink ?? '', set: (ctx, s, v) => { s.hyperlink = String(v ?? '').trim(); } },
  { id: 'dataCount', width: 70, align: 'right', kind: 'readonly', get: (ctx, s) => s.data?.length ?? 0 },
  { id: 'id', width: 150, align: 'left', kind: 'readonly', get: (ctx, s) => s.id },
];
export const SHAPE_FIELD_MAP = new Map(SHAPE_FIELDS.map((field) => [field.id, field]));
export const SHEET_COLUMNS = ['name', 'master', 'text', 'x', 'y', 'width', 'height', 'angle', 'fill', 'line', 'lineWidth', 'fontSize', 'layer', 'hyperlink', 'dataCount'];

/** A column for one shape data key (Shape Data view). */
export function dataField(key) {
  return {
    id: `data:${key}`, label: key, width: 120, align: 'left', kind: 'text',
    get: (ctx, s) => s.data?.find((f) => f.key === key)?.value ?? '',
    set: (ctx, s, value) => {
      const fields = [...(s.data ?? [])];
      const existing = fields.find((f) => f.key === key);
      if (existing) existing.value = String(value ?? '');
      else fields.push({ key, label: key, type: 'text', value: String(value ?? ''), options: [] });
      s.data = fields;
    },
  };
}

export const pageField = { id: 'page', width: 110, align: 'left', kind: 'readonly', get: (ctx, s, info) => info?.pageName ?? '' };

export function fieldText(ctx, field, item, info) {
  const value = field.get(ctx, item, info);
  if (field.text) return field.text(ctx, value, item, info);
  return value == null ? '' : String(value);
}

export const fieldOptions = (ctx, field) => (typeof field.options === 'function' ? field.options(ctx) : field.options ?? []);
