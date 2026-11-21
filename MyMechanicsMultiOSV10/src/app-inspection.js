// The main window's side of inspection (app-mfg.js chains it onto app-more.js's hooks): balloons on the active
// drawing sheet for every characteristic, the characteristics table in the PropertyManager (nominal, limits,
// measured values typed in or imported from CSV, pass / fail), and the inspection report as CSV, Excel CSV or
// PDF (pages drawn on a canvas and written by print/pdf.js; tests hand in hooks instead of dialogs). The
// characteristics themselves are cad/inspection.js (no DOM).
import {
  characteristicsOf, autoBalloon, inspectionOf, setMeasured, parseMeasurementsCsv, importMeasurements, reportCsv, reportSummary, reportPages, pdfFromPages,
  balloonsSvg, GENERAL_CLASSES,
} from './cad/inspection.js';
import { sheetDrawing } from './cad/drawing-more.js';
import { viewFrames } from './cad/drawing-dims.js';
import { injectSvg } from './cad/drawing-annot.js';
import { pdfFromJpegPages } from './print/pdf.js';
import * as native from './platform/native.js';
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';

const STATUS_ICONS = { pass: 'check', fail: 'error', open: 'inspOpen', na: 'info' };
const KIND_ICONS = { dimension: 'smartDim', viewSize: 'dimHorizontal', gdt: 'inspGdt', surface: 'inspSurface', note: 'note' };

export function createInspectionTools(ctx) {
  const { state, t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const drw = () => ctx.activeDrawing();
  const editing = () => state.editing;
  const owns = (e) => e?.mode === 'inspection';
  const fmt = (v, d = 3) => (v == null || !Number.isFinite(v) ? '' : ctx.fmt(v, d));
  let saveHook = null; let csvHook = null;

  /** The characteristics of the drawing's active sheet with their balloons and measurements. */
  function characteristics(d = drw(), { balloon = true } = {}) {
    if (!d) return [];
    const sd = sheetDrawing(d);
    let projections = new Map();
    try { projections = ctx.drawingProjections(sd) ?? new Map(); } catch { /* no model yet */ }
    const st = inspectionOf(d);
    const chars = characteristicsOf(sd, projections, { general: st.general ?? 'm', viewSizes: st.viewSizes !== false });
    if (!balloon) return chars;
    const frames = projections.size ? viewFrames(sd, projections).frames : null;
    return autoBalloon(d, chars, { frames });
  }

  const edit = (mutate) => ctx.change('op.inspection', () => { const d = drw(); mutate(inspectionOf(d), d); });

  function begin(extra = {}) {
    const d = drw();
    if (!d) { notify('info', t('insp.needDrawing')); return; }
    if (editing() && !owns(editing())) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'inspection', selected: null, ...extra };
    state.leftTab = 'pm';
    ctx.renderAll();
  }
  const finish = () => ctx.cancelEditing({ quiet: true });

  function balloonAll({ renumber = false } = {}) {
    const d = drw();
    if (!d) { notify('info', t('insp.needDrawing')); return 0; }
    let count = 0;
    ctx.change('op.inspection', () => {
      const st = inspectionOf(d);
      st.show = true;
      const sd = sheetDrawing(d);
      let projections = new Map();
      try { projections = ctx.drawingProjections(sd) ?? new Map(); } catch { /* none */ }
      const chars = characteristicsOf(sd, projections, { general: st.general ?? 'm', viewSizes: st.viewSizes !== false });
      count = autoBalloon(d, chars, { frames: projections.size ? viewFrames(sd, projections).frames : null, renumber }).length;
    });
    if (!owns(editing())) begin();
    notify('success', t('insp.ballooned', { count }));
    return count;
  }

  function clearBalloons() {
    const d = drw(); if (!d) return;
    ctx.change('op.inspection', () => { d.inspection = { general: d.inspection?.general ?? 'm', items: {}, next: 1, show: false }; });
    notify('info', t('insp.cleared'));
  }

  // ───────────────────────── files

  const baseName = () => `${(drw()?.name ?? 'drawing').replace(/[\\/:*?"<>|]+/g, '_')}-inspection`;
  async function save(name, type, content, mime) {
    if (saveHook) { await saveHook(content, name, type); notify('success', t('notice.exported', { name })); return true; }
    return ctx.saveExport(name, type, content, mime);
  }
  function labels() {
    const L = {};
    for (const k of ['n', 'char', 'type', 'nominal', 'upper', 'lower', 'usl', 'lsl', 'unit', 'measured', 'mean', 'result']) L[`insp.col.${k}`] = t(`insp.col.${k}`);
    for (const k of ['dimension', 'viewSize', 'gdt', 'surface', 'note']) L[`insp.kind.${k}`] = t(`insp.kind.${k}`);
    for (const k of ['pass', 'fail', 'open', 'na']) L[`insp.status.${k}`] = t(`insp.status.${k}`);
    L['insp.summary'] = t('insp.summary');
    return L;
  }
  const title = () => t('insp.reportTitle', { name: drw()?.name ?? '' });

  async function exportCsv(excel = false) {
    const chars = characteristics();
    if (!chars.length) { notify('info', t('insp.none')); return false; }
    const csv = reportCsv(chars, { labels: labels(), excel, title: title() });
    return save(`${baseName()}${excel ? '-excel' : ''}.csv`, 'csv', csv, 'text/csv');
  }

  async function importCsv(text = null) {
    const d = drw(); if (!d) { notify('info', t('insp.needDrawing')); return null; }
    let csv = text;
    try {
      if (csv == null && csvHook) csv = await csvHook();
      if (csv == null) {
        if (native.isDesktop()) {
          const paths = await native.chooseFiles(state.settings?.lastDirectory ?? null, [{ name: 'CSV', extensions: ['csv', 'txt'] }], false);
          if (!paths[0]) return null;
          csv = await native.readTextFile(paths[0], '');
        } else {
          const files = await native.pickWithInput('.csv,.txt', false);
          if (!files[0]) return null;
          csv = await files[0].text();
        }
      }
    } catch (error) { notify('error', t('insp.importFailed', { reason: error?.message ?? String(error) })); return null; }
    characteristics(d); // numbers for everything first
    const rows = parseMeasurementsCsv(csv);
    let res = { applied: 0, unknown: [] };
    ctx.change('op.inspection', () => { res = importMeasurements(d, rows); inspectionOf(d).show = true; });
    notify(res.unknown.length ? 'warning' : 'success', t('insp.imported', { count: res.applied, unknown: res.unknown.length ? res.unknown.join(', ') : '—' }));
    if (!owns(editing())) begin();
    return res;
  }

  /** The report pages drawn on canvases (every script shows), the ballooned sheet first, as one PDF. */
  async function reportPdfBytes() {
    const d = drw();
    const chars = characteristics(d);
    const s = reportSummary(chars);
    const pages = reportPages(chars, { title: title(), subtitle: `${t(`insp.verdict.${s.verdict}`)} · ${new Date().toLocaleString()}`, labels: labels() });
    const doc = globalThis.document;
    if (!doc?.createElement) return pdfFromPages(pages, { title: title() });
    const dpmm = 150 / 25.4;
    const canvasPage = (w, h) => { const c = doc.createElement('canvas'); c.width = Math.round(w * dpmm); c.height = Math.round(h * dpmm); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.scale(dpmm, dpmm); return { c, g }; };
    const jpeg = async (c) => new Uint8Array(await (await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.9))).arrayBuffer());
    const out = [];
    try {
      const svg = ctx.drawingSvg?.(d);
      if (svg) {
        const img = new Image();
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
        const { c, g } = canvasPage(297, 210);
        const k = Math.min(297 / img.width, 210 / img.height);
        g.drawImage(img, (297 - img.width * k) / 2, (210 - img.height * k) / 2, img.width * k, img.height * k);
        URL.revokeObjectURL(url);
        out.push({ jpeg: await jpeg(c), width: c.width, height: c.height, widthMm: 297, heightMm: 210 });
      }
    } catch (error) { console.warn('inspection sheet picture', error); }
    for (const p of pages) {
      const { c, g } = canvasPage(p.w, p.h);
      g.lineWidth = 0.2; g.strokeStyle = '#555';
      for (const it of p.items) {
        if (it.t === 'rect') { if (it.fill) { g.fillStyle = it.fill; g.fillRect(it.x, it.y, it.w, it.h); } g.strokeRect(it.x, it.y, it.w, it.h); }
        else if (it.t === 'line') { g.beginPath(); g.moveTo(it.x1, it.y1); g.lineTo(it.x2, it.y2); g.stroke(); }
        else if (it.t === 'text') { g.fillStyle = it.verdict === 'fail' ? '#b71c1c' : it.verdict === 'pass' ? '#1b5e20' : '#111'; g.font = `${it.bold ? '700 ' : ''}${it.size}px sans-serif`; g.fillText(it.text, it.x, it.y); }
      }
      out.push({ jpeg: await jpeg(c), width: c.width, height: c.height, widthMm: p.w, heightMm: p.h });
    }
    return pdfFromJpegPages(out, { title: title() });
  }

  async function exportPdf() {
    const chars = characteristics();
    if (!chars.length) { notify('info', t('insp.none')); return false; }
    const bytes = await ctx.withProgress('progress.inspection', drw().name, async () => reportPdfBytes(), { delay: 200 });
    if (!bytes) return false;
    return save(`${baseName()}.pdf`, 'pdf', bytes, 'application/pdf');
  }

  // ───────────────────────── sheet

  /** The sheet SVG with the balloons on it (when shown). */
  function svg(d, opts, base) {
    const out = base(d, opts);
    if (!d?.inspection?.show) return out;
    try {
      const chars = characteristics(d);
      return injectSvg(out, balloonsSvg(chars, { selected: owns(editing()) ? editing().selected : null }));
    } catch (error) { console.warn('balloons', error); return out; }
  }

  // ───────────────────────── PropertyManager

  function pm(e) {
    const { pmHead, pmGroup, pmButton, pmSeg } = ctx.pm;
    const d = drw();
    if (!d) return pmHead('inspTable', t('cmd.inspTable'), t('insp.needDrawing'));
    const st = inspectionOf(d);
    const chars = characteristics(d);
    const s = reportSummary(chars);
    const general = pmSeg('inspGeneral', GENERAL_CLASSES.map((c) => [c, `ISO 2768-${c}`, 'inspGeneral']), st.general ?? 'm');
    const rows = chars.map((c) => {
      const limits = c.check === 'two' ? `${fmt(c.lsl)} … ${fmt(c.usl)}` : c.check === 'max' ? `≤ ${fmt(c.usl)}` : c.check === 'attribute' ? t('insp.okNg') : t(`insp.check.${c.check}`);
      const meas = c.measured.join(' ');
      return `<div class="insp-row ${c.status} ${e.selected === c.src ? 'active' : ''}"><button type="button" class="insp-n" data-pm="insp.sel:${escapeHtml(c.src)}" title="${escapeHtml(t('insp.select'))}">${c.n}</button><span class="insp-char">${icon(KIND_ICONS[c.kind] ?? 'smartDim', 'icon tiny')}<b>${escapeHtml(c.text)}</b><small>${escapeHtml(limits)}${c.unit ? ` ${escapeHtml(c.unit)}` : ''}</small></span>${c.check === 'basic' || c.check === 'reference' ? '<span class="insp-meas muted">—</span>' : `<input type="text" class="pm-text insp-meas" data-pm-field="inspMeas:${escapeHtml(c.src)}" value="${escapeHtml(meas)}" placeholder="${escapeHtml(t('insp.measuredHint'))}" spellcheck="false"/>`}<span class="insp-status" title="${escapeHtml(t(`insp.status.${c.status}`))}">${icon(STATUS_ICONS[c.status] ?? 'info', 'icon tiny')}</span></div>`;
    }).join('');
    const sel = chars.find((c) => c.src === e.selected);
    const detail = sel ? `<ul class="pm-results"><li>${escapeHtml(t('insp.detail', { n: sel.n, kind: t(`insp.kind.${sel.kind}`), nominal: fmt(sel.nominal) || '—', upper: fmt(sel.upper) || '—', lower: fmt(sel.lower) || '—' }))}</li>${sel.mean != null ? `<li>${escapeHtml(t('insp.stats', { mean: fmt(sel.mean, 4), min: fmt(sel.min, 4), max: fmt(sel.max, 4), cpk: sel.cpk != null ? fmt(sel.cpk, 2) : '—' }))}</li>` : ''}</ul>${sel.check === 'two' ? `${ctx.pm.pmNum('inspUpper', sel.upper, t('insp.col.upper'), 'smartDim', sel.unit)}${ctx.pm.pmNum('inspLower', sel.lower, t('insp.col.lower'), 'smartDim', sel.unit)}` : ''}` : `<p class="pm-note">${escapeHtml(t('insp.pickRow'))}</p>`;
    return [
      pmHead('inspTable', t('cmd.inspTable'), t('pm.help.inspection')),
      pmGroup('inspBalloon', t('insp.balloons'), `<p class="pm-note ${s.verdict}">${escapeHtml(t('insp.summaryLine', { total: s.total, pass: s.pass, fail: s.fail, open: s.open }))}</p><div class="pm-row">${pmButton('insp.balloon', 'inspBalloon', t('cmd.inspBalloon'))}${pmButton('insp.renumber', 'inspRenumber', t('cmd.inspRenumber'))}${pmButton('insp.clear', 'inspClear', t('cmd.inspClear'))}</div>`),
      pmGroup('inspGeneral', t('insp.generalTol'), general),
      pmGroup('inspTable', t('insp.characteristics'), `<div class="insp-table">${rows || `<p class="pm-note">${escapeHtml(t('insp.none'))}</p>`}</div>`),
      pmGroup('edit', t('insp.selected'), detail),
      pmGroup('inspReport', t('insp.reportGroup'), `<div class="pm-row">${pmButton('insp.import', 'inspImport', t('cmd.inspImport'))}${pmButton('insp.csv', 'inspCsv', t('cmd.inspCsv'))}${pmButton('insp.excel', 'inspExcel', t('cmd.inspExcel'))}${pmButton('insp.pdf', 'inspReport', t('cmd.inspReport'))}</div>`),
    ].join('');
  }

  function field(key, raw) {
    const e = editing(); const d = drw(); if (!d) return undefined;
    if (key.startsWith('inspMeas:')) {
      const src = key.slice(9);
      const values = String(raw ?? '').split(/[\s;/|]+|,(?=\s)|,(?=\D)/).map((x) => x.trim()).filter(Boolean).map((x) => (Number.isFinite(Number(x.replace(',', '.'))) ? Number(x.replace(',', '.')) : x));
      ctx.change('op.inspection', () => { characteristics(d); setMeasured(d, src, values); });
      e.selected = src;
      return ctx.renderDrawing?.();
    }
    if (key === 'inspUpper' || key === 'inspLower') {
      const v = Number(String(raw).replace(',', '.'));
      if (!Number.isFinite(v) || !e.selected) { notify('error', t('notice.invalidValue', { text: raw })); return ctx.renderLeft(); }
      edit((st) => { const it = st.items[e.selected]; if (it) it[key === 'inspUpper' ? 'upper' : 'lower'] = v; });
      return undefined;
    }
    return undefined;
  }

  function set(key, value) {
    if (key === 'inspGeneral') { edit((st) => { st.general = value; }); return undefined; }
    return undefined;
  }

  const NAMES = new Set(['insp.sel', 'insp.balloon', 'insp.renumber', 'insp.clear', 'insp.import', 'insp.csv', 'insp.excel', 'insp.pdf']);
  const handles = (name) => NAMES.has(name);
  async function command(name, arg) {
    const e = editing();
    if (name === 'clear') return undefined;
    switch (name) {
      case 'insp.sel': e.selected = e.selected === arg ? null : arg; ctx.renderDrawing?.(); return ctx.renderLeft();
      case 'insp.balloon': return balloonAll();
      case 'insp.renumber': return balloonAll({ renumber: true });
      case 'insp.clear': return clearBalloons();
      case 'insp.import': return importCsv();
      case 'insp.csv': return exportCsv(false);
      case 'insp.excel': return exportCsv(true);
      case 'insp.pdf': return exportPdf();
      default: return undefined;
    }
  }

  const hasDrawing = () => Boolean(drw());
  const commands = {
    inspBalloon: { icon: 'inspBalloon', label: 'cmd.inspBalloon', enabled: hasDrawing, run: () => balloonAll() },
    inspTable: { icon: 'inspTable', label: 'cmd.inspTable', enabled: hasDrawing, checked: () => owns(editing()), run: () => (owns(editing()) ? finish() : begin()) },
    inspRenumber: { icon: 'inspRenumber', label: 'cmd.inspRenumber', enabled: hasDrawing, run: () => balloonAll({ renumber: true }) },
    inspClear: { icon: 'inspClear', label: 'cmd.inspClear', enabled: () => Boolean(drw()?.inspection?.show), run: () => clearBalloons() },
    inspImport: { icon: 'inspImport', label: 'cmd.inspImport', enabled: hasDrawing, run: () => importCsv() },
    inspCsv: { icon: 'inspCsv', label: 'cmd.inspCsv', enabled: hasDrawing, run: () => exportCsv(false) },
    inspExcel: { icon: 'inspExcel', label: 'cmd.inspExcel', enabled: hasDrawing, run: () => exportCsv(true) },
    inspReport: { icon: 'inspReport', label: 'cmd.inspReport', enabled: hasDrawing, run: () => exportPdf() },
  };
  const TAB = ['inspBalloon', 'inspTable', 'inspRenumber', 'inspClear', '|', 'inspImport', '|', 'inspCsv', 'inspExcel', 'inspReport'];
  const api = {
    begin, balloon: balloonAll, characteristics: () => characteristics(), importCsv, exportCsv, exportPdf, reportPdfBytes,
    setMeasured: (key, values) => { const d = drw(); ctx.change('op.inspection', () => { characteristics(d); setMeasured(d, key, values); }); },
    setSaveHook(fn) { saveHook = fn; }, setCsvHook(fn) { csvHook = fn; },
  };
  return { commands, TAB, owns, pm, pick: () => undefined, field, set, select: () => false, toggle: () => undefined, accept: () => finish(), handles, command, subject: () => t('cmd.inspTable'), svg, colours: () => undefined, decorate: () => undefined, api };
}
