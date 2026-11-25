// Piping ISO drawings (the main window's side; cad/pipe-iso.js does the work): Pipe ISO / Spools makes a drawing
// holding the route's isometric ('drwPipeIso', associative to the route) with the spool, bill-of-materials and weld
// tables as the drawing's general tables, and its edit page (status, scale, spool length, stock length, what to
// show, auto update). app-std.js routes its PropertyManager hooks here for the 'pipeIsoSheet' mode.
import { addDrawing } from './cad/document.js';
import { SHEETS } from './cad/drawing.js';
import { isoSheet, isoKey, applyIsoSheet, isoSheetOptions, ISO_SCALES } from './cad/pipe-iso.js';
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';

export function createPipeIsoTools(ctx, { begin, activeDrw, part, asm, editing }) {
  const { t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const isPiping = (f) => f?.type === 'route' && (f.kind === 'pipe' || f.kind === 'tube') && !f.suppressed;

  /** The pipe / tube route to draw: the one being edited, the part's, or the first in the assembly's parts. */
  function source() {
    const e = editing();
    if (e?.mode === 'feature' && isPiping(e.feature) && part()) return { f: e.feature, features: part().features, part: part() };
    const pt = part();
    const own = pt?.features.find(isPiping);
    if (own) return { f: own, features: pt.features, part: pt };
    for (const c of asm()?.components ?? []) {
      const rp = ctx.project()?.parts.find((x) => x.id === c.part);
      const f = rp?.features.find(isPiping);
      if (f) return { f, features: rp.features, part: rp };
    }
    return null;
  }
  function sheetSource(ann) {
    const pt = ctx.project()?.parts.find((x) => x.id === ann.source?.part);
    const f = pt?.features.find((x) => x.id === ann.source?.feature && isPiping(x));
    return f ? { f, features: pt.features, part: pt } : null;
  }
  const labels = () => Object.fromEntries(['spools', 'spool', 'pipe', 'fittings', 'welds', 'weight', 'bom', 'item', 'size', 'qty', 'length', 'weldList', 'weld', 'type', 'shop', 'fieldW'].map((k) => [k, t(`iso.${k}`)]));
  const itemName = (it) => t(`iso.item.${it}`, null, t(`route.bom.${it}`, null, it));

  function rebuild(d, ann, src) {
    const [W, H] = SHEETS[d.sheet] ?? SHEETS.A3;
    const sheet = isoSheet(src.f, src.features, { W, H, labels: labels(), ids: () => ctx.newId('ann'), title: t('iso.title'), opts: ann.opts, itemName });
    applyIsoSheet(d, ann, sheet, { source: { part: src.part.id, feature: src.f.id }, key: isoKey(src.f, src.features) });
    return ann;
  }
  const failed = (error) => notify('error', t(`rebuild.${error.code ?? 'route-failed'}`, error.params ?? null, error.code ?? String(error.message ?? '')));

  /** Keeps the ISO sheets of drawing `d` associative (before the sheet is drawn). True when something changed. */
  function sync(d) {
    let changed = false;
    for (const ann of (d?.annotations ?? []).filter((x) => x.kind === 'drwPipeIso' && x.source)) {
      const src = sheetSource(ann);
      if (!src) { if (ann.stale !== 'missing') { ann.stale = 'missing'; changed = true; } continue; }
      const key = isoKey(src.f, src.features);
      if (key === ann.key) { if (ann.stale) { ann.stale = false; changed = true; } continue; }
      if (isoSheetOptions(ann.opts).auto) { try { rebuild(d, ann, src); } catch { ann.stale = true; } } else if (ann.stale !== true) ann.stale = true;
      changed = true;
    }
    return changed;
  }

  /** Pipe ISO: the edit page of the ISO on this drawing, or a new drawing with the route's ISO. */
  function start() {
    const dw = activeDrw();
    const existing = dw?.annotations?.find((x) => x.kind === 'drwPipeIso');
    if (existing) { begin({ mode: 'pipeIsoSheet', drawing: dw.id, ann: existing.id }); return undefined; }
    const src = source();
    if (!src) { notify('info', t('iso.needRoute')); return undefined; }
    if (editing()) ctx.cancelEditing({ quiet: true });
    let d; let ann;
    try {
      ctx.change('op.pipeIso', (pr) => {
        d = addDrawing(pr, { kind: 'part', id: src.part.id }, `${src.part.name} - ${t('iso.title')}`);
        d.views = [];
        ann = { id: ctx.newId('ann'), kind: 'drwPipeIso', opts: isoSheetOptions() };
        rebuild(d, ann, src);
        d.annotations.unshift(ann);
        d.scale = ann.scale; d.autoScale = false;
        pr.active = { kind: 'drawing', id: d.id };
      });
    } catch (error) { failed(error); return undefined; }
    notify('success', t('notice.drawingCreated', { name: d.name }));
    begin({ mode: 'pipeIsoSheet', drawing: d.id, ann: ann.id });
    return d;
  }

  const sheetOf = (e) => { const d = ctx.project()?.drawings.find((x) => x.id === e.drawing); return { d, ann: d?.annotations.find((x) => x.id === e.ann) ?? null }; };
  function setOption(key, value) {
    const { d, ann } = sheetOf(editing());
    if (!ann) return;
    ctx.change('op.pipeIso', () => {
      ann.opts = isoSheetOptions({ ...ann.opts, [key]: value });
      const src = sheetSource(ann);
      if (src && key !== 'auto') { try { rebuild(d, ann, src); } catch (error) { failed(error); } }
    });
    ctx.renderAll();
  }
  function update() {
    const { d, ann } = sheetOf(editing());
    const src = ann && sheetSource(ann);
    if (!src) { notify('error', t('iso.sourceMissing')); return; }
    ctx.change('op.pipeIso', () => { try { rebuild(d, ann, src); } catch (error) { failed(error); } });
    ctx.renderAll();
  }

  function pm(e) {
    const { pmHead, pmGroup, pmNum, pmButton } = ctx.pm;
    const { ann } = sheetOf(e);
    if (!ann) return pmHead('pipeIso', t('cmd.pipeIso'), t('pm.help.pipeIso'));
    const o = isoSheetOptions(ann.opts);
    const src = sheetSource(ann);
    const status = !src ? 'missing' : ann.stale ? 'stale' : 'current';
    const scales = [['auto', t('harness.scaleAuto')], ...ISO_SCALES.map((k) => [String(k), k >= 1 ? `${k}:1` : `1:${Math.round(1 / k)}`])];
    const check = (key, on, label, glyph) => `<label class="pm-check"><input type="checkbox" data-pm-toggle="${key}" ${on ? 'checked' : ''}/>${icon(glyph)}<span>${escapeHtml(label)}</span></label>`;
    const iso = ann.iso ?? {};
    const summary = `<dl class="pm-results iso-summary"><dt>${escapeHtml(t('iso.spools'))}</dt><dd>${escapeHtml(String(iso.spools?.length ?? 0))}</dd><dt>${escapeHtml(t('iso.shopWelds'))}</dt><dd>${escapeHtml(String(iso.shopWelds ?? 0))}</dd><dt>${escapeHtml(t('iso.fieldWelds'))}</dt><dd>${escapeHtml(String(iso.fieldWelds?.length ?? 0))}</dd></dl>`;
    return [
      pmHead('pipeIso', t('cmd.pipeIso'), t('pm.help.pipeIso')),
      pmGroup(status === 'current' ? 'check' : 'warning', t('harness.sheetStatus'), `<p class="pm-note ${status === 'current' ? '' : 'warn'}" data-iso-status="${status}">${escapeHtml(t(`iso.status.${status}`))}</p>${status === 'stale' ? `<div class="pm-row">${pmButton('std.isoUpdate', 'refresh', t('harness.update'))}</div>` : ''}${check('isoAuto', o.auto, t('harness.autoUpdate'), 'refresh')}`),
      pmGroup('scaleTool', t('harness.sheetScale'), `<label class="pm-field"><span class="pm-label">${escapeHtml(t('harness.sheetScale'))}</span><select data-pm-select="isoScale">${scales.map(([v, l]) => `<option value="${v}" ${String(o.scale) === v ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select></label><p class="pm-note">${escapeHtml(t('harness.scaleNow', { scale: ann.scaleLabel ?? '' }))}</p>`),
      pmGroup('pipeIso', t('iso.spoolGroup'), `${pmNum('isoMaxSpool', o.maxSpool, `${t('iso.maxSpool')} (mm, 0 = ${t('iso.noLimit')})`, 'pipeRoute')}${pmNum('isoStock', o.stock, `${t('iso.stock')} (mm)`, 'pipeRoute')}<p class="pm-note">${escapeHtml(t('iso.spoolNote'))}</p>${summary}`),
      pmGroup('generalTable', t('harness.sheetTables'), `${check('isoDims', o.showDims, t('iso.showDims'), 'smartDim')}${check('isoSpools', o.showSpools, t('iso.showSpools'), 'generalTable')}${check('isoBom', o.showBom, t('iso.showBom'), 'generalTable')}${check('isoWelds', o.showWelds, t('iso.showWelds'), 'generalTable')}${pmNum('isoRowH', o.rowH, t('harness.rowHeight'), 'generalTable')}`),
    ].join('');
  }
  function field(key, v) {
    if (key === 'isoMaxSpool' && v >= 0) return setOption('maxSpool', v);
    if (key === 'isoStock' && v > 0) return setOption('stock', v);
    if (key === 'isoRowH' && v > 0) return setOption('rowH', Math.max(3, Math.min(12, v)));
    return ctx.renderLeft();
  }
  function toggle(key, checked) {
    const k = { isoAuto: 'auto', isoDims: 'showDims', isoSpools: 'showSpools', isoBom: 'showBom', isoWelds: 'showWelds' }[key];
    if (k) setOption(k, checked);
  }
  function select(key, value) {
    if (key !== 'isoScale') return false;
    setOption('scale', value === 'auto' ? 'auto' : Number(value));
    return true;
  }
  const command = { icon: 'pipeIso', label: 'cmd.pipeIso', enabled: () => Boolean(source() || activeDrw()?.annotations?.some((x) => x.kind === 'drwPipeIso')), checked: () => editing()?.mode === 'pipeIsoSheet', run: () => (editing()?.mode === 'pipeIsoSheet' ? ctx.cancelEditing({ quiet: true }) : start()) };
  return { start, sync, pm, field, toggle, select, update, command, source };
}
