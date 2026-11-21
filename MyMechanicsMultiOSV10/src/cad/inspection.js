// Inspection (no DOM): the characteristics of a drawing — dimensions with their tolerances, GD&T frames,
// surface finish marks, notes and the views' overall sizes — numbered with balloons on the sheet, their
// nominal value and limits, the measured values (typed in or imported from CSV), pass / fail, and the
// inspection report (CSV for spreadsheets, pages for a PDF).
//
// The state lives on the drawing: drawing.inspection = { general: 'm', items: { [src]: { n, bx, by, measured,
// note, … overrides } }, next }. Characteristics are worked out from the drawing every time (they follow its
// dimensions); `src` (annotation id plus a part key) ties each to its stored balloon number and measurements.
import { viewFrames, dimValue, fitDeviations, formatNumber } from './drawing-dims.js';
import { layoutViews } from './drawing.js';

export const GENERAL_CLASSES = ['f', 'm', 'c', 'v'];
// ISO 2768-1 linear tolerances (±mm) by nominal size range.
const LINEAR_RANGES = [3, 6, 30, 120, 400, 1000, 2000, 4000];
const LINEAR = { f: [0.05, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 0.5], m: [0.1, 0.1, 0.2, 0.3, 0.5, 0.8, 1.2, 2], c: [0.2, 0.3, 0.5, 0.8, 1.2, 2, 3, 4], v: [0.5, 0.5, 1, 1.5, 2.5, 4, 6, 8] };
// Angular (±degrees) by the shorter leg: up to 10, 50, 120, 400 mm, over.
const ANGULAR = { f: [1, 0.5, 1 / 3, 1 / 6, 1 / 12], m: [1, 0.5, 1 / 3, 1 / 6, 1 / 12], c: [1.5, 1, 0.5, 0.25, 1 / 6], v: [3, 2, 1, 0.5, 1 / 3] };

/** The general tolerance (±) of a nominal size: linear (mm) or angular (degrees, by `leg`). */
export function generalTolerance(nominal, cls = 'm', { angular = false, leg = 50 } = {}) {
  const c = GENERAL_CLASSES.includes(cls) ? cls : 'm';
  if (angular) { const i = [10, 50, 120, 400].findIndex((x) => leg <= x); return ANGULAR[c][i < 0 ? 4 : i]; }
  const v = Math.abs(nominal);
  const i = LINEAR_RANGES.findIndex((x) => v <= x);
  return LINEAR[c][i < 0 ? LINEAR_RANGES.length - 1 : i];
}

/**
 * Limits of a dimension's tolerance: { upper, lower (signed deviations), usl, lsl, tolKind } where tolKind is
 * 'two' (two-sided), 'basic' or 'reference' (not inspected against limits). `tol` as drawing-dims stores it.
 */
export function limitsOf(nominal, tol, { general = 'm', angular = false } = {}) {
  const t = tol ?? { type: 'none' };
  const up = Math.abs(Number(t.upper) || 0); const low = Math.abs(Number(t.lower) || 0);
  let upper; let lower; const tolKind = 'two'; let source = t.type;
  switch (t.type) {
    case 'symmetric': upper = up; lower = -up; break;
    case 'bilateral': upper = Number(t.upper) || 0; lower = -low; break;
    case 'limits': upper = up; lower = -low; break;
    case 'fit': { const d = fitDeviations(String(t.fit ?? 'H7'), nominal); if (d) { upper = d.upper; lower = d.lower; } else { upper = 0; lower = 0; } break; }
    case 'basic': return { upper: 0, lower: 0, usl: nominal, lsl: nominal, tolKind: 'basic', source };
    case 'reference': return { upper: 0, lower: 0, usl: nominal, lsl: nominal, tolKind: 'reference', source };
    default: { const g = generalTolerance(nominal, general, { angular }); upper = g; lower = -g; source = `iso2768${general}`; }
  }
  return { upper: upper + 0, lower: lower + 0, usl: nominal + upper, lsl: nominal + lower, tolKind, source }; // + 0: no −0
}

const pt = (p) => (Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])) ? [Number(p[0]), Number(p[1])] : null);

/**
 * The characteristics of a sheet drawing in order (view by view, then sheet annotations): [{ src, kind, text,
 * nominal, upper, lower, usl, lsl, unit, check ('two' | 'max' | 'attribute' | 'basic' | 'reference'), at: [x, y]
 * (sheet mm), view }]. projections: Map viewId → projection (for positions and the views' sizes).
 */
export function characteristicsOf(sd, projections, { general = 'm', viewSizes = true, scale = null } = {}) {
  const out = [];
  const frames = projections?.size ? viewFrames(sd, projections).frames : new Map();
  const sc = scale ?? (projections?.size ? layoutViews(sd, projections).scale : sd.scale || 1);
  const anns = Array.isArray(sd.annotations) ? sd.annotations : [];
  const precision = (a) => (a.precision ?? null);
  for (const a of anns) {
    if (!a || !a.id) continue;
    if (a.kind === 'drwDim') {
      const fr = frames.get(a.view);
      const at = fr ? [fr.place.cx + (Number(a.x) || 0), fr.place.cy + (Number(a.y) || 0)] : [Number(a.x) || 0, Number(a.y) || 0];
      const v = dimValue(a);
      const angular = a.dtype === 'angular';
      const unit = angular ? '°' : 'mm';
      const prefix = a.dtype === 'diameter' ? 'Ø' : a.dtype === 'radial' ? 'R' : '';
      if (a.dtype === 'ordinate') {
        (Array.isArray(v) ? v : []).forEach((x, k) => out.push({ src: `${a.id}#${k}`, kind: 'dimension', dtype: a.dtype, text: formatNumber(x, precision(a)), nominal: x, ...limitsOf(x, a.tol, { general }), unit, check: 'two', at: [at[0], at[1] + k * 5], view: a.view, annotation: a.id }));
        continue;
      }
      if (a.dtype === 'chamfer') {
        const d = v?.distance ?? NaN; const ang = v?.angle ?? NaN;
        out.push({ src: `${a.id}#d`, kind: 'dimension', dtype: 'chamfer', text: `${formatNumber(d, precision(a))}`, nominal: d, ...limitsOf(d, a.tol, { general }), unit: 'mm', check: 'two', at, view: a.view, annotation: a.id });
        out.push({ src: `${a.id}#a`, kind: 'dimension', dtype: 'chamferAngle', text: `${formatNumber(ang, 0)}°`, nominal: ang, ...limitsOf(ang, null, { general, angular: true }), unit: '°', check: 'two', at: [at[0] + 6, at[1]], view: a.view, annotation: a.id });
        continue;
      }
      if (!Number.isFinite(v)) continue;
      const lim = limitsOf(v, a.tol, { general, angular });
      const tolText = a.tol?.type === 'fit' ? ` ${a.tol.fit ?? 'H7'}` : a.tol?.type === 'symmetric' ? ` ±${formatNumber(lim.upper, 3)}` : a.tol?.type === 'bilateral' || a.tol?.type === 'limits' ? ` +${formatNumber(lim.upper, 3)}/${formatNumber(lim.lower, 3)}` : '';
      out.push({ src: a.id, kind: 'dimension', dtype: a.dtype, text: `${prefix}${formatNumber(v, precision(a))}${angular ? '°' : ''}${tolText}`, nominal: v, ...lim, unit, check: lim.tolKind, at, view: a.view, annotation: a.id });
    } else if (a.kind === 'dimension') {
      const A = pt(a.a) ?? [Number(a.x) || 0, Number(a.y) || 0]; const B = pt(a.b) ?? [A[0] + 10, A[1]];
      let d = Math.hypot(B[0] - A[0], B[1] - A[1]);
      if (a.orient === 'horizontal') d = Math.abs(B[0] - A[0]); else if (a.orient === 'vertical') d = Math.abs(B[1] - A[1]);
      const textValue = a.text != null && a.text !== '' && Number.isFinite(Number(String(a.text).replace(/[^\d.+-]/g, ''))) ? Number(String(a.text).replace(/[^\d.+-]/g, '')) : null;
      const nominal = textValue ?? d / (sc || 1);
      const off = Number.isFinite(Number(a.offset)) ? Number(a.offset) : 8;
      out.push({ src: a.id, kind: 'dimension', dtype: a.orient ?? 'aligned', text: a.text ? String(a.text) : formatNumber(nominal, 2), nominal, ...limitsOf(nominal, a.tol, { general }), unit: 'mm', check: 'two', at: [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2 - off], annotation: a.id });
    } else if (a.kind === 'gdt') {
      const tol = Number(String(a.tolerance ?? '').replace(/[^\d.]/g, ''));
      const datums = (Array.isArray(a.datums) ? a.datums : []).filter((s) => String(s).trim());
      out.push({ src: a.id, kind: 'gdt', symbol: a.symbol, text: `${a.symbol ?? ''} ${a.diameter ? 'Ø' : ''}${a.tolerance ?? ''}${a.modifier ? ` (${a.modifier})` : ''}${datums.length ? ` | ${datums.join(' | ')}` : ''}`.trim(), nominal: 0, upper: Number.isFinite(tol) ? tol : 0, lower: 0, usl: Number.isFinite(tol) ? tol : 0, lsl: 0, unit: 'mm', check: 'max', at: [Number(a.x) || 0, Number(a.y) || 0], annotation: a.id });
    } else if (a.kind === 'surface') {
      const ra = Number(String(a.ra ?? '').replace(/[^\d.]/g, ''));
      if (!(ra > 0)) continue;
      out.push({ src: a.id, kind: 'surface', text: `Ra ${a.ra}`, nominal: 0, upper: ra, lower: 0, usl: ra, lsl: 0, unit: 'µm', check: 'max', at: [Number(a.x) || 0, Number(a.y) || 0], annotation: a.id });
    } else if (a.kind === 'note') {
      const text = String(a.text ?? '').trim();
      if (!text) continue;
      out.push({ src: a.id, kind: 'note', text, nominal: null, upper: null, lower: null, usl: null, lsl: null, unit: '', check: 'attribute', at: [Number(a.x) || 0, Number(a.y) || 0], annotation: a.id });
    }
  }
  // The overall sizes the views show (their automatic dimensions).
  if (viewSizes && sd.showDims !== false) {
    for (const v of sd.views ?? []) {
      const fr = frames.get(v.id);
      if (!fr || v.type === 'iso' || v.type === 'dimetric' || v.kind === 'detail') continue;
      const p = fr.p; const w = p.box.x1 - p.box.x0; const h = p.box.y1 - p.box.y0;
      const W = p.trueW ?? w; const Hh = p.trueH ?? h;
      if (W > 1e-6) out.push({ src: `view:${v.id}:w`, kind: 'viewSize', text: formatNumber(W, 2), nominal: W, ...limitsOf(W, null, { general }), unit: 'mm', check: 'two', at: [fr.place.cx, fr.place.cy + (h * fr.s) / 2 + 8], view: v.id });
      if (Hh > 1e-6) out.push({ src: `view:${v.id}:h`, kind: 'viewSize', text: formatNumber(Hh, 2), nominal: Hh, ...limitsOf(Hh, null, { general }), unit: 'mm', check: 'two', at: [fr.place.cx - (w * fr.s) / 2 - 8, fr.place.cy], view: v.id });
    }
  }
  return out;
}

/** The drawing's inspection state (created when missing). */
export function inspectionOf(d) {
  if (!d.inspection || typeof d.inspection !== 'object') d.inspection = { general: 'm', items: {}, next: 1 };
  d.inspection.items ??= {}; d.inspection.next ??= 1; d.inspection.general ??= 'm';
  return d.inspection;
}

/**
 * Balloons every characteristic: numbers kept for the ones that had one, new numbers for the rest (in order),
 * balloon places off the anchor away from the view's centre, spread so no two overlap. Returns the
 * characteristics with n, balloon [x, y] and their stored state merged in (manual tolerance overrides too).
 */
export function autoBalloon(d, chars, { radius = 4, gap = 9, frames = null, renumber = false } = {}) {
  const st = inspectionOf(d);
  if (renumber) { for (const k of Object.keys(st.items)) delete st.items[k].n; st.next = 1; }
  // Numbers: existing first, then new ones in reading order.
  const live = new Set(chars.map((c) => c.src));
  for (const k of Object.keys(st.items)) if (!live.has(k) && !st.items[k].measured?.length) delete st.items[k];
  let next = Math.max(1, ...Object.values(st.items).map((x) => (x.n ?? 0) + 1));
  for (const c of chars) { const it = (st.items[c.src] ??= {}); if (!(it.n > 0)) it.n = next++; }
  st.next = next;
  // Places: off the anchor, away from the centre of its view (or of the sheet).
  const placed = [];
  const result = chars.map((c) => {
    const it = st.items[c.src];
    let centre = [210, 148];
    const fr = c.view && frames?.get?.(c.view);
    if (fr) centre = [fr.place.cx, fr.place.cy];
    let b;
    if (Number.isFinite(it.bx) && Number.isFinite(it.by) && it.manual) b = [it.bx, it.by];
    else {
      let dx = c.at[0] - centre[0]; let dy = c.at[1] - centre[1];
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      b = [c.at[0] + dx * gap, c.at[1] + dy * gap];
      // Spread: step around the anchor until the balloon is clear of the ones placed.
      for (let k = 0; k < 24 && placed.some((p) => Math.hypot(p[0] - b[0], p[1] - b[1]) < radius * 2.2); k++) {
        const a = Math.atan2(dy, dx) + (k % 2 ? 1 : -1) * Math.ceil((k + 1) / 2) * 0.45;
        const r = gap + Math.floor(k / 8) * radius * 2;
        b = [c.at[0] + Math.cos(a) * r, c.at[1] + Math.sin(a) * r];
      }
      it.bx = Math.round(b[0] * 100) / 100; it.by = Math.round(b[1] * 100) / 100;
    }
    placed.push(b);
    return merge(c, it);
  });
  return result.sort((a, b) => a.n - b.n);
}

/** A characteristic with its stored state: number, balloon, manual limits, measurements and the verdict. */
function merge(c, it) {
  const out = { ...c, n: it.n, balloon: [it.bx, it.by], measured: Array.isArray(it.measured) ? [...it.measured] : [], remark: it.remark ?? '' };
  if (Number.isFinite(it.upper) && c.check === 'two') { out.upper = it.upper; out.usl = c.nominal + it.upper; }
  if (Number.isFinite(it.lower) && c.check === 'two') { out.lower = it.lower; out.lsl = c.nominal + it.lower; }
  if (Number.isFinite(it.usl) && c.check === 'max') { out.usl = it.usl; out.upper = it.usl; }
  return evaluate(out);
}

/** Pass / fail of one characteristic's measurements: status 'pass' | 'fail' | 'open' | 'na', and statistics. */
export function evaluate(c, eps = 1e-9) {
  const vals = c.measured.map((v) => (typeof v === 'string' ? v.trim() : v)).filter((v) => v !== '' && v != null);
  let status = 'open'; let fails = 0;
  if (c.check === 'basic' || c.check === 'reference') status = 'na';
  else if (c.check === 'attribute') {
    if (vals.length) { fails = vals.filter((v) => !/^(ok|pass|yes|y|1|합격|true)$/i.test(String(v))).length; status = fails ? 'fail' : 'pass'; }
  } else {
    const nums = vals.map(Number).filter(Number.isFinite);
    if (nums.length) {
      fails = nums.filter((v) => v > c.usl + eps || (c.check === 'two' && v < c.lsl - eps) || (c.check === 'max' && v < -eps)).length;
      status = fails ? 'fail' : 'pass';
      const mean = nums.reduce((s, x) => s + x, 0) / nums.length;
      const sd = nums.length > 1 ? Math.sqrt(nums.reduce((s, x) => s + (x - mean) ** 2, 0) / (nums.length - 1)) : 0;
      Object.assign(c, { mean, min: Math.min(...nums), max: Math.max(...nums), sd });
      if (sd > 0 && c.check === 'two') { c.cp = (c.usl - c.lsl) / (6 * sd); c.cpk = Math.min(c.usl - mean, mean - c.lsl) / (3 * sd); }
      c.deviation = mean - (c.nominal ?? 0);
    }
  }
  c.status = status; c.fails = fails;
  return c;
}

/** Stores measurements: values (a list of numbers / strings) for a balloon number or src. */
export function setMeasured(d, key, values) {
  const st = inspectionOf(d);
  const src = typeof key === 'number' ? Object.keys(st.items).find((k) => st.items[k].n === key) : key;
  if (!src || !st.items[src]) return false;
  st.items[src].measured = [].concat(values).map((v) => (typeof v === 'number' ? v : String(v).trim())).filter((v) => v !== '');
  return true;
}

/** Splits one CSV line (quotes, the given separator). */
function splitCsv(line, sep) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Measured values from CSV text: rows of a balloon number and one or more values (a header naming the columns
 * is recognised: balloon / no / # / char and measured / actual / value / sample…, Korean too). ';' separated
 * files may use decimal commas. Returns [{ n, values }].
 */
export function parseMeasurementsCsv(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() && !/^sep=/i.test(l.trim()));
  if (!lines.length) return [];
  const sep = [';', '\t', ','].find((s) => lines[0].includes(s)) ?? ',';
  const num = (s) => { const t = String(s).trim(); const v = Number(sep === ';' ? t.replace(',', '.') : t); return t !== '' && Number.isFinite(v) ? v : t; };
  let rows = lines.map((l) => splitCsv(l, sep));
  let nCol = 0; let valueCols = null;
  const head = rows[0].map((h) => h.toLowerCase());
  const isHeader = head.some((h) => /balloon|^no\.?$|^#$|char|번호|풍선|measured|actual|value|측정|sample/.test(h)) && !Number.isFinite(Number(head[0]));
  if (isHeader) {
    nCol = Math.max(0, head.findIndex((h) => /balloon|^no\.?$|^#$|번호|풍선/.test(h)));
    const vc = head.map((h, i) => (/measured|actual|value|측정|sample|^m\d|^s\d/.test(h) && i !== nCol ? i : -1)).filter((i) => i >= 0);
    valueCols = vc.length ? vc : null;
    rows = rows.slice(1);
  }
  const out = [];
  for (const r of rows) {
    const n = Number(String(r[nCol] ?? '').replace(/[^\d]/g, ''));
    if (!(n > 0)) continue;
    const cols = valueCols ?? r.map((_, i) => i).filter((i) => i !== nCol);
    const values = cols.map((i) => r[i]).filter((v) => v != null && String(v).trim() !== '').map(num);
    out.push({ n, values });
  }
  return out;
}

/** Applies parsed CSV rows to the drawing: { applied, unknown: [n] }. */
export function importMeasurements(d, rows) {
  let applied = 0; const unknown = [];
  for (const r of rows) { if (setMeasured(d, r.n, r.values)) applied++; else unknown.push(r.n); }
  return { applied, unknown };
}

const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const num = (v, d = 4) => (Number.isFinite(v) ? String(Math.round(v * 10 ** d) / 10 ** d) : '');

/** The table rows of the report: header and one row per characteristic (strings). labels by key. */
export function reportRows(chars, labels = {}) {
  const L = (k, d) => labels[k] ?? d;
  const samples = Math.max(1, ...chars.map((c) => c.measured.length));
  const header = [L('insp.col.n', 'Balloon'), L('insp.col.char', 'Characteristic'), L('insp.col.type', 'Type'), L('insp.col.nominal', 'Nominal'), L('insp.col.upper', 'Upper tol'), L('insp.col.lower', 'Lower tol'), L('insp.col.usl', 'USL'), L('insp.col.lsl', 'LSL'), L('insp.col.unit', 'Unit'),
    ...Array.from({ length: samples }, (_, i) => `${L('insp.col.measured', 'Measured')} ${i + 1}`), L('insp.col.mean', 'Mean'), L('insp.col.result', 'Result')];
  const rows = chars.map((c) => [String(c.n), c.text, L(`insp.kind.${c.kind}`, c.kind), c.nominal == null ? '' : num(c.nominal), c.upper == null ? '' : num(c.upper), c.lower == null ? '' : num(c.lower), c.check === 'attribute' ? '' : num(c.usl), c.check === 'two' ? num(c.lsl) : c.check === 'max' ? '0' : '', c.unit,
    ...Array.from({ length: samples }, (_, i) => (c.measured[i] == null ? '' : String(c.measured[i]))), num(c.mean), L(`insp.status.${c.status}`, c.status.toUpperCase())]);
  return { header, rows };
}

/**
 * The report as CSV. excel: a byte-order mark, "sep=," and CRLF line ends, so spreadsheet programs open it
 * with UTF-8 text and the right columns.
 */
export function reportCsv(chars, { labels = {}, excel = false, title = '' } = {}) {
  const { header, rows } = reportRows(chars, labels);
  const lines = [];
  if (excel) lines.push('sep=,');
  if (title) lines.push(csvCell(title));
  lines.push(header.map(csvCell).join(','));
  for (const r of rows) lines.push(r.map(csvCell).join(','));
  const text = lines.join(excel ? '\r\n' : '\n') + (excel ? '\r\n' : '\n');
  return excel ? `﻿${text}` : text;
}

/** Totals: { total, inspected, pass, fail, open, na, verdict ('pass' | 'fail' | 'open') }. */
export function reportSummary(chars) {
  const s = { total: chars.length, pass: 0, fail: 0, open: 0, na: 0 };
  for (const c of chars) s[c.status]++;
  s.inspected = s.pass + s.fail;
  s.verdict = s.fail ? 'fail' : s.open ? 'open' : 'pass';
  return s;
}

/**
 * Report pages (pure layout, sheet mm): A4 portrait or landscape pages of text lines and table rows, wrapping
 * the table onto as many pages as it needs. Returns [{ w, h, items: [{ t: 'text' | 'line' | 'rect', … }] }].
 */
export function reportPages(chars, { title = '', subtitle = '', labels = {}, landscape = true, rowHeight = 6 } = {}) {
  const W = landscape ? 297 : 210; const H = landscape ? 210 : 297;
  const { header, rows } = reportRows(chars, labels);
  const summary = reportSummary(chars);
  const m = 12; const tableW = W - 2 * m;
  // Column widths in proportion to the longest text (characteristic column wider).
  const lens = header.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i] ?? '').length)));
  const weights = lens.map((l, i) => Math.max(4, Math.min(i === 1 ? 40 : 14, l)));
  const total = weights.reduce((s, x) => s + x, 0);
  const widths = weights.map((x) => (x / total) * tableW);
  const pages = [];
  let page = null; let y = 0;
  const newPage = () => {
    page = { w: W, h: H, items: [] }; pages.push(page);
    page.items.push({ t: 'text', x: m, y: m + 4, text: title, size: 5, bold: true });
    if (subtitle) page.items.push({ t: 'text', x: m, y: m + 10, text: subtitle, size: 3.2 });
    y = m + 16;
    if (pages.length === 1) {
      const L = (k, d) => labels[k] ?? d;
      page.items.push({ t: 'text', x: m, y, text: `${L('insp.summary', 'Summary')}: ${summary.total} · ${L('insp.status.pass', 'PASS')} ${summary.pass} · ${L('insp.status.fail', 'FAIL')} ${summary.fail} · ${L('insp.status.open', 'OPEN')} ${summary.open}`, size: 3.4, bold: true, verdict: summary.verdict });
      y += 7;
    }
    tableRow(header, true);
  };
  const tableRow = (cells, head = false, status = null) => {
    let x = m;
    page.items.push({ t: 'rect', x: m, y, w: tableW, h: rowHeight, fill: head ? '#e3e8ef' : status === 'fail' ? '#fde2e1' : status === 'pass' ? '#e6f4ea' : null });
    cells.forEach((c, i) => {
      const maxChars = Math.max(1, Math.floor(widths[i] / 1.75));
      const s = String(c ?? ''); const text = s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s;
      page.items.push({ t: 'text', x: x + 1, y: y + rowHeight * 0.68, text, size: 2.7, bold: head });
      if (i) page.items.push({ t: 'line', x1: x, y1: y, x2: x, y2: y + rowHeight });
      x += widths[i];
    });
    y += rowHeight;
  };
  newPage();
  rows.forEach((r, i) => { if (y + rowHeight > H - m) newPage(); tableRow(r, false, chars[i].status); });
  pages.forEach((p, i) => p.items.push({ t: 'text', x: W - m - 20, y: H - 6, text: `${i + 1} / ${pages.length}`, size: 2.8 }));
  return pages;
}

/**
 * A PDF of report pages drawn as vector text and lines (Helvetica; characters outside Latin-1 become '?').
 * The app prints its report through a canvas (so every script shows); this is the plain fallback.
 */
export function pdfFromPages(pages, { title = '' } = {}) {
  const MM = 72 / 25.4;
  const enc = (s) => String(s).replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\xff]/g, '?').replace(/[Ā-￿]/g, '?');
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  const catalog = add(null); const pagesObj = add(null); const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  for (const p of pages) {
    const ph = p.h * MM;
    const ops = [];
    for (const it of p.items) {
      if (it.t === 'rect') {
        if (it.fill) { const c = it.fill.match(/\w\w/g).map((h) => (parseInt(h, 16) / 255).toFixed(3)); ops.push(`${c.join(' ')} rg ${(it.x * MM).toFixed(2)} ${(ph - (it.y + it.h) * MM).toFixed(2)} ${(it.w * MM).toFixed(2)} ${(it.h * MM).toFixed(2)} re f 0 0 0 rg`); }
        ops.push(`0.3 w ${(it.x * MM).toFixed(2)} ${(ph - (it.y + it.h) * MM).toFixed(2)} ${(it.w * MM).toFixed(2)} ${(it.h * MM).toFixed(2)} re S`);
      } else if (it.t === 'line') ops.push(`0.3 w ${(it.x1 * MM).toFixed(2)} ${(ph - it.y1 * MM).toFixed(2)} m ${(it.x2 * MM).toFixed(2)} ${(ph - it.y2 * MM).toFixed(2)} l S`);
      else if (it.t === 'text') ops.push(`BT /${it.bold ? 'F2' : 'F1'} ${(it.size * MM).toFixed(2)} Tf ${(it.x * MM).toFixed(2)} ${(ph - it.y * MM).toFixed(2)} Td (${enc(it.text)}) Tj ET`);
    }
    const content = ops.join('\n');
    const c = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${(p.w * MM).toFixed(2)} ${ph.toFixed(2)}] /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> /Contents ${c} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const info = add(`<< /Title (${enc(title)}) /Producer (MyMechanics) >>`);
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Latin-1 bytes (the offsets above count characters, which are bytes here).
  return Uint8Array.from(out, (ch) => ch.charCodeAt(0) & 0xff);
}

/** Balloons as SVG (sheet mm, injected into the sheet): circle, number, leader to the anchor; colour by status. */
export function balloonsSvg(chars, { radius = 4, selected = null } = {}) {
  const colour = { pass: '#2e7d32', fail: '#c62828', open: '#1565c0', na: '#6d6d6d' };
  const items = chars.map((c) => {
    const [bx, by] = c.balloon; const [ax, ay] = c.at;
    const dx = ax - bx; const dy = ay - by; const l = Math.hypot(dx, dy);
    const sx = l > radius ? bx + (dx / l) * radius : bx; const sy = l > radius ? by + (dy / l) * radius : by;
    const col = colour[c.status] ?? '#1565c0';
    return `<g class="insp-balloon${selected === c.src ? ' selected' : ''}" data-insp="${String(c.src).replace(/"/g, '')}">${l > radius ? `<line x1="${sx.toFixed(2)}" y1="${sy.toFixed(2)}" x2="${ax.toFixed(2)}" y2="${ay.toFixed(2)}" stroke="${col}" stroke-width="0.25"/><circle cx="${ax.toFixed(2)}" cy="${ay.toFixed(2)}" r="0.55" fill="${col}"/>` : ''}<circle cx="${bx.toFixed(2)}" cy="${by.toFixed(2)}" r="${radius}" fill="#fff" stroke="${col}" stroke-width="${selected === c.src ? 0.6 : 0.35}"/><text x="${bx.toFixed(2)}" y="${(by + radius * 0.38).toFixed(2)}" font-size="${(radius * (c.n > 99 ? 0.85 : 1.05)).toFixed(2)}" text-anchor="middle" font-family="sans-serif" font-weight="700" fill="${col}">${c.n}</text></g>`;
  });
  return items.length ? `<g class="inspection-balloons">${items.join('')}</g>` : '';
}
