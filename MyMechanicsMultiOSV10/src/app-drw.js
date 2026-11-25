// The main window's side of the drawing annotations, the extra Evaluate tools and the mold tools (app.js hands in
// what they need and chains them onto app-more.js's hooks with attachDrwTools()):
//   drawing — smart dimensions picked in the views (PropertyManager: type, precision, tolerance), model items,
//     centre marks / lines, weld symbols, general tables, layers, the title block and sheet formats; the sheet
//     SVG (screen, print, SVG export) and the DXF get them through the svg / dxf hooks;
//   evaluate — deviation, symmetry, geometry check, undercut, compare documents, costing, sustainability: a
//     PropertyManager page with the inputs and results, the part coloured while it is open;
//   mold — shut-off surfaces and parting surface features (their pages are in ui/pm-eval-more.js).
// The modelling is in cad/drawing-dims.js, cad/drawing-annot.js, cad/evaluate-more.js and cad/mold-more.js.
import './styles-drw.css';
// The sheet's font (its texts are measured with the same font: cad/text-metrics.js).
import '@fontsource/roboto/latin-400.css';
import '@fontsource/roboto/latin-700.css';
import { rep } from './cad/kernel.js';
import { adoptToActiveSheet, sheetDrawing } from './cad/drawing-more.js';
import { STANDARD_SCALES, scaleLabel, bomRows, viewBasis, autoBalloonLayout } from './cad/drawing.js';
import { flattenAssembly, placePoint } from './cad/assembly.js';
import {
  DIM_TYPES, TOL_TYPES, FIT_CLASSES, viewFrames, viewAt, viewEntities, pickEntity, dimensionFromPicks, ordinateFromPicks, SET_TYPES, autoTextOffset,
  isPictorial, centerItems, modelItemDims, dimLabel, formatNumber, pickToTrue, insideDetail, modelGeometry, pictorialPick, pictorialDimension,
  layoutDimLabels, ellipseSheet, holeCalloutItems,
} from './cad/drawing-dims.js';
import { snapDrag, shiftBox } from './cad/drawing-snap.js';
import { embedFonts } from './cad/text-metrics.js';
import {
  DRW_KINDS, WELD_SYMBOLS, WELD_SIDES, WELD_CONTOURS, STANDARDS, ISO_SHEETS, ANSI_SHEETS, drwSvg, drwDxf, injectSvg, annotationVisible, layerOf,
  addLayer, removeLayer, createTable, resizeTable, applySheetFormat, layersOf, annotationBoxes,
} from './cad/drawing-annot.js';
import {
  deviationAnalysis, symmetryCheck, geometryCheck, undercutAnalysis, compareParts, faceColours, RESULT_COLOURS,
} from './cad/evaluate-more.js';
import { partCost, partCO2, costReportCsv, costReportHtml, PROCESSES } from './cad/costing.js';
import { STD_PLANES } from './cad/features.js';
import { materialName } from './cad/materials.js';
import { evalPm, EVAL_KINDS, PULL_DIRS } from './ui/pm-eval-more.js';
import { escapeHtml } from './ui/dom.js';
import { fileSafe } from './domain/paths.js';
import { icon } from './icons.js';

const MODES = new Set(['drwDim', 'drwWeld', 'drwTable', 'drwLayers', 'drwTitle', 'drwFormat', 'evalMore']);
const PLACE = 'drw';
const AXIS = { x: [1, 0, 0], '-x': [-1, 0, 0], y: [0, 1, 0], '-y': [0, -1, 0], z: [0, 0, 1], '-z': [0, 0, -1] };
const DIM_ICONS = { auto: 'smartDim', horizontal: 'dimHorizontal', vertical: 'dimVertical', aligned: 'dimAligned', radial: 'dimRadius', diameter: 'dimDiameter', angular: 'dimAngle', ordinate: 'dimOrdinate', baseline: 'dimBaseline', chain: 'dimChain', chamfer: 'dimChamfer', arclength: 'dimArcLength' };
/** A rate typed in the Costing / Sustainability page: '' clears it (the default again), numbers, 'auto' setups, the currency, a speed table "t:speed, …". undefined = not valid. */
function parseRate(path, raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return null;
  if (path === 'currency') return text.slice(0, 8);
  if (path === 'machining.setups' && text.toLowerCase() === 'auto') return 'auto';
  if (path === 'sheet.cutSpeed') {
    const pairs = text.split(/[,;]/).map((x) => x.split(':').map((y) => Number(y.trim())));
    return pairs.length && pairs.every((q) => q.length === 2 && q.every(Number.isFinite) && q[0] > 0 && q[1] > 0) ? pairs : undefined;
  }
  const v = Number(text);
  return Number.isFinite(v) ? v : undefined;
}
/** Sets (or with null removes) the value at a dotted path, making the tables on the way. */
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) { if (!o[k] || typeof o[k] !== 'object' || Array.isArray(o[k])) o[k] = {}; o = o[k]; }
  if (value == null) delete o[keys.at(-1)]; else o[keys.at(-1)] = value;
  return obj;
}
const numOr = (v, d) => (v === '' || v == null || !Number.isFinite(Number(v)) ? d : Number(v));

export function createDrwTools(ctx) {
  const { state, t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const drw = () => ctx.activeDrawing();
  const part = () => ctx.activePart();
  const editing = () => state.editing;
  const owns = (e) => Boolean(e && MODES.has(e.mode));
  const sel = (key, options, current, label) => `<label class="pm-field" title="${escapeHtml(label)}"><span class="pm-label">${escapeHtml(label)}</span><select data-pm-select="${escapeHtml(key)}" aria-label="${escapeHtml(label)}">${options.map(([v, text]) => `<option value="${escapeHtml(v)}" ${String(v) === String(current ?? '') ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select></label>`;
  const check = (key, on, label, glyph) => `<label class="pm-check" title="${escapeHtml(label)}"><input type="checkbox" data-pm-toggle="${escapeHtml(key)}" ${on ? 'checked' : ''}/>${icon(glyph)}<span>${escapeHtml(label)}</span></label>`;
  const buttons = (key, list, current) => `<div class="pm-relations">${list.map(([v, label, glyph]) => `<button type="button" class="small-button ${String(v) === String(current) ? 'active' : ''}" data-pm-set="${escapeHtml(key)}" data-value="${escapeHtml(v)}" title="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span></button>`).join('')}</div>`;
  const textRow = (key, value, label, glyph = 'edit') => `<label class="pm-field" title="${escapeHtml(label)}">${icon(glyph)}<span class="pm-label">${escapeHtml(label)}</span>${ctx.pm.textInput(key, value)}</label>`;

  function begin(mode, extra = {}) {
    if (state.editing) ctx.cancelEditing({ quiet: true });
    state.editing = { mode, ...extra };
    state.leftTab = 'pm';
    if (mode.startsWith('drw') && !['drwLayers', 'drwTitle', 'drwFormat'].includes(mode)) state.drawingPlace = PLACE;
    ctx.renderAll();
  }
  function finish() {
    state.drawingPlace = null;
    state.drwEval = null;
    ctx.cancelEditing({ quiet: true });
  }
  const selectedAnn = (kind) => { const d = drw(); const a = d?.annotations?.find((x) => x.id === state.drawingSelected); return a && a.kind === kind ? a : null; };
  const ann = (id) => drw()?.annotations?.find((a) => a.id === id) ?? null;
  const edit = (fn) => ctx.change('op.annotation', () => fn(drw()));

  // ───────────────────────── where a click on the sheet is

  function sheetPoint(event) {
    const svg = event.target.closest?.('#drawing-host svg') ?? null;
    if (!svg?.getScreenCTM) return null;
    const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY;
    const q = p.matrixTransform(svg.getScreenCTM().inverse());
    return [q.x, q.y];
  }
  function frames(d) {
    adoptToActiveSheet(d);
    const sd = sheetDrawing(d);
    return { sd, ...viewFrames(sd, ctx.drawingProjections(sd)) };
  }

  /** The click handler's hook: true when the click was ours (a drawing tool's PropertyManager is open). */
  function sheetClick(event) {
    if (state.drawingPlace !== PLACE) return false;
    if (!event.target.closest?.('#drawing-host svg')) return false;
    const e = editing();
    if (!owns(e) || !drw()) { state.drawingPlace = null; return true; }
    const at = sheetPoint(event);
    if (!at) return true;
    const hitAnn = event.target.closest('[data-annotation]')?.dataset.annotation;
    if (e.mode === 'drwDim') dimClick(e, at, hitAnn);
    else if (e.mode === 'drwWeld') weldClick(e, at, hitAnn);
    else if (e.mode === 'drwTable') tableClick(e, at, hitAnn);
    return true;
  }

  // ───────────────────────── smart dimensions

  function startDim() {
    const d = drw();
    if (!d) return;
    const sel0 = selectedAnn('drwDim');
    begin('drwDim', { dtype: 'auto', picks: [], view: null, precision: sel0?.precision ?? '', tolType: sel0?.tol?.type ?? 'none', upper: sel0?.tol?.upper ?? 0.1, lower: sel0?.tol?.lower ?? 0.1, fit: sel0?.tol?.fit ?? 'H7', axis: 'x', editId: sel0?.id ?? null, ordinateId: null, measure: sel0?.measure ?? 'true', trueMark: sel0?.trueMark !== false });
    notify('info', t('drwDim.pickHint'));
  }

  const tolOf = (e) => (e.tolType === 'none' ? { type: 'none' } : { type: e.tolType, upper: Number(e.upper) || 0, lower: Number(e.lower) || 0, fit: e.fit });
  const pickLabel = (p) => (p.kind === 'ellipse' ? t('drwDim.pickEllipse') : p.kind === 'curve' ? t('drwDim.pickCurve') : p.silhouette ? t('drwDim.pickSilhouette') : p.kind === 'point' ? t(p.of === 'center' ? 'drwDim.pickCenter' : 'drwDim.pickPoint') : p.kind === 'arc' || p.kind === 'circle' ? `${t(p.full ? 'drwDim.pickCircle' : 'drwDim.pickArc')} R${formatNumber(p.r)}` : t('drwDim.pickEdge'));

  function dimClick(e, at, hitAnn) {
    const d = drw();
    const hit = hitAnn ? ann(hitAnn) : null;
    if (hit?.kind === 'drwDim' && !e.picks.length) {
      Object.assign(e, { editId: hit.id, precision: hit.precision ?? '', tolType: hit.tol?.type ?? 'none', upper: hit.tol?.upper ?? e.upper, lower: hit.tol?.lower ?? e.lower, fit: hit.tol?.fit ?? e.fit, measure: hit.measure ?? 'true', trueMark: hit.trueMark !== false });
      state.drawingSelected = hit.id;
      ctx.renderLeft(); ctx.renderDrawing();
      return;
    }
    const { frames: fr } = frames(d);
    const f = viewAt(fr, at[0], at[1]);
    if (!f) { notify('info', t('drwDim.pickInView')); return; }
    if (e.view && e.view !== f.v.id) { e.picks = []; e.ordinateId = null; }
    e.view = f.v.id;
    // Picked in the projection's own coordinates (a broken view is shortened), kept in the view's true ones.
    const q = f.projAt(at[0], at[1]);
    if (!insideDetail(f, q)) { notify('info', t('drwDim.outsideDetail')); return; }
    const raw = pickEntity(viewEntities(f.p, { hidden: d.showHidden !== false && !f.pictorial }), q, 2.2 / f.s);
    if (!raw) { notify('info', t('drwDim.nothingHere')); return; }
    let pick = pickToTrue(f, raw);
    if (f.pictorial) return pictorialClick(d, e, f, pick, f.toTrue(q[0], q[1]), fr);
    if (SET_TYPES.includes(e.dtype)) {
      const o = e.ordinateId ? ann(e.ordinateId) : null;
      if (o && o.view === f.v.id) {
        const pt = pick.kind === 'point' ? pick.p : pick.kind === 'arc' ? pick.c : null;
        if (!pt) { notify('info', t('drwDim.needPoint')); return; }
        edit(() => { o.pts = [...o.pts, pt]; });
        return;
      }
      e.picks.push(pick);
      const g = ordinateFromPicks(e.picks, e.axis, e.dtype);
      if (g.error) { ctx.renderLeft(); ctx.renderDrawing(); return; }
      const a = makeDim(d, f, g, e, fr);
      e.ordinateId = a.id; e.picks = [];
      return;
    }
    e.picks.push(pick);
    const g = dimensionFromPicks(e.picks, e.dtype);
    if (g.error === 'more' && e.picks.length < 2) { ctx.renderLeft(); ctx.renderDrawing(); return; }
    if (g.error) { notify('warning', t(`drwDim.error.${g.error}`, null, t('drwDim.error.more'))); e.picks = []; ctx.renderLeft(); ctx.renderDrawing(); return; }
    makeDim(d, f, g, e, fr);
    e.picks = [];
  }

  /** The model's 3D edges for the pictorial views (cached per model state). */
  let geomCache = { key: null, geom: null };
  function modelGeom(d) {
    const { key, shape } = ctx.drawingShape(d);
    if (!shape) return null;
    if (geomCache.key !== key || !geomCache.geom) { try { geomCache = { key, geom: modelGeometry(shape) }; } catch { geomCache = { key, geom: null }; } }
    return geomCache.geom;
  }

  /** A click in an isometric / dimetric view: the pick matched to the model's 3D edges, the value measured in 3D. */
  function pictorialClick(d, e, f, pick, q, fr) {
    if (['horizontal', 'vertical', 'ordinate', 'baseline', 'chain', 'chamfer'].includes(e.dtype)) { notify('warning', t('drwDim.error.pictorialType')); return; }
    const pk = pictorialPick(pick, q, modelGeom(d), f.basis, 2.2 / f.s);
    if (!pk) { notify('info', t('drwDim.noModelEdge')); return; }
    e.picks.push(pk);
    const g = pictorialDimension(e.picks, e.dtype, f.basis);
    if (g.error === 'more' && e.picks.length < 2) { ctx.renderLeft(); ctx.renderDrawing(); return; }
    if (g.error) { notify('warning', t(`drwDim.error.${g.error}`, null, t('drwDim.error.more'))); e.picks = []; ctx.renderLeft(); ctx.renderDrawing(); return; }
    if (e.measure === 'projected') g.measure = 'projected';
    if (e.trueMark === false) g.trueMark = false;
    makeDim(d, f, g, e, fr);
    e.picks = [];
  }

  function makeDim(d, f, g, e, fr = null) {
    let a = { id: ctx.newId('dim'), kind: 'drwDim', view: f.v.id, ...g, tol: tolOf(e) };
    if (e.precision !== '' && e.precision != null) a.precision = Number(e.precision);
    if (d.activeLayer) a.layer = d.activeLayer;
    [a.x, a.y] = autoTextOffset(a, f);
    // Its label clear of the other dimensions' labels on the sheet.
    if (fr) { try { a = layoutDimLabels([a], fr, { existing: (sheetDrawing(d).annotations ?? []).filter((x) => x.kind === 'drwDim') }).dims[0]; } catch { /* where it was put */ } }
    ctx.change('op.annotation', () => { d.annotations = [...(d.annotations ?? []), a]; });
    state.drawingSelected = a.id; e.editId = a.id;
    notify('success', t('drwDim.made', { text: dimLabel(a) }));
    return a;
  }

  /** The dimension the page edits (the one picked or made last), with the page's values applied. */
  function applyToEdited(e) {
    const a = e.editId ? ann(e.editId) : null;
    if (!a || a.kind !== 'drwDim') return;
    edit(() => {
      a.tol = tolOf(e);
      if (e.precision === '' || e.precision == null) delete a.precision; else a.precision = Number(e.precision);
      if (a.m3) { if (e.measure === 'projected') a.measure = 'projected'; else delete a.measure; if (e.trueMark === false) a.trueMark = false; else delete a.trueMark; }
    });
  }

  /** The pictorial-view options: show the true size (marked TL) or the projected size. */
  function pictorialGroup(e, a) {
    const { pmGroup, pmSeg } = ctx.pm;
    const d = drw();
    let pictorial = Boolean(a?.m3);
    if (!pictorial && e.view && d) { try { pictorial = Boolean(frames(d).frames.get(e.view)?.pictorial); } catch { pictorial = false; } }
    if (!pictorial) return '';
    return pmGroup('dimTrueLength', t('drwDim.pictorial'), `${pmSeg('measure', [['true', t('drwDim.measureTrue'), 'dimTrueLength'], ['projected', t('drwDim.measureProjected'), 'dimProjected']], e.measure ?? 'true')}${check('trueMark', e.trueMark !== false, t('drwDim.trueMark'), 'dimTrueLength')}<p class="pm-note">${escapeHtml(t('drwDim.pictorialNote'))}</p>`);
  }

  function dimPm(e) {
    const { pmHead, pmGroup, pmList, pmButton } = ctx.pm;
    const a = e.editId ? ann(e.editId) : null;
    const types = DIM_TYPES.map((k) => [k, t(`drwDim.${k}`), DIM_ICONS[k]]);
    const tolFields = e.tolType === 'none' || e.tolType === 'basic' || e.tolType === 'reference' ? '' : e.tolType === 'fit'
      ? sel('fit', FIT_CLASSES.map((k) => [k, k]), e.fit, t('drwDim.fitClass'))
      : `${textRow('upper', e.upper, t(e.tolType === 'symmetric' ? 'drwDim.tolValue' : 'drwDim.upper'), 'dimTolerance')}${e.tolType === 'symmetric' ? '' : textRow('lower', e.lower, t('drwDim.lower'), 'dimTolerance')}`;
    return [
      pmHead('smartDim', t('cmd.drwSmartDim'), t('pm.help.drwSmartDim')),
      pmGroup('smartDim', t('drwDim.type'), `${buttons('dtype', types, e.dtype)}${SET_TYPES.includes(e.dtype) ? ctx.pm.pmSeg('axis', [['x', t('drwDim.ordX')], ['y', t('drwDim.ordY')]], e.axis) : ''}`),
      pmGroup('select', t('drwDim.picks'), pmList('picks', e.picks.map(pickLabel), t('drwDim.picksList'), 'smartDim', true)),
      pmGroup('dimTolerance', t('drwDim.tolerance'), `${sel('precision', [['', t('drwDim.precisionAuto')], ...[0, 1, 2, 3, 4].map((k) => [String(k), k ? `0.${'0'.repeat(k - 1)}1` : '1'])], e.precision === '' || e.precision == null ? '' : String(e.precision), t('drwDim.precision'))}${sel('tolType', TOL_TYPES.map((k) => [k, t(`drwDim.tol.${k}`)]), e.tolType, t('drwDim.tolType'))}${tolFields}`),
      pictorialGroup(e, a),
      a ? pmGroup('edit', t('drwDim.editing'), `<p class="pm-note">${icon('smartDim', 'icon tiny')}${escapeHtml(dimLabel(a))}</p><div class="pm-row">${pmButton('drw.delDim', 'trash', t('action.delete'))}</div>`) : '',
      pmGroup('autoDims', t('drwDim.more'), `<div class="pm-relations">${pmButton('drw.modelItems', 'modelItems', t('cmd.drwModelItems'))}${pmButton('drw.centerMarks', 'centerMarksAuto', t('cmd.drwCenterMarks'))}</div>`),
    ].join('');
  }

  // ───────────────────────── model items, centre marks

  function modelItems() {
    const d = drw();
    if (!d) return;
    adoptToActiveSheet(d);
    const sd = sheetDrawing(d);
    if (d.source?.kind !== 'part') { notify('info', t('drw.modelItemsPartOnly')); return; }
    const src = ctx.project().parts.find((p) => p.id === d.source.id);
    if (!src) return;
    const built = ctx.buildPart(src);
    const { frames: fr } = viewFrames(sd, ctx.drawingProjections(sd));
    const ids = new Set(sd.views.map((v) => v.id));
    const dims = modelItemDims(src, built.result.results, sd.views).filter((g) => fr.has(g.view));
    const placed = dims.map((g) => { const a = { id: ctx.newId('dim'), kind: 'drwDim', ...g }; if (d.activeLayer) a.layer = d.activeLayer; [a.x, a.y] = autoTextOffset(a, fr.get(g.view)); return a; });
    // Labels laid out so none overlaps another (small parts: the labels are bigger than the views).
    const kept = (sd.annotations ?? []).filter((a) => a.kind === 'drwDim' && !(a.model && ids.has(a.view)));
    let made = placed;
    try { made = layoutDimLabels(placed, fr, { existing: kept }).dims; } catch { made = placed; }
    // Running it again refreshes them: the model items of these views made before go.
    ctx.change('op.annotation', () => { d.annotations = [...(d.annotations ?? []).filter((a) => !(a.kind === 'drwDim' && a.model && ids.has(a.view))), ...made]; });
    notify(made.length ? 'success' : 'info', made.length ? t('drw.modelItemsMade', { count: made.length }) : t('drw.modelItemsNone'));
  }

  function centerMarks() {
    const d = drw();
    if (!d) return;
    adoptToActiveSheet(d);
    const sd = sheetDrawing(d);
    const { shape } = ctx.drawingShape(d);
    if (!shape) return;
    const { frames: fr } = viewFrames(sd, ctx.drawingProjections(sd));
    const made = [];
    for (const v of sd.views) {
      if (!fr.has(v.id) || isPictorial(v)) continue;
      let items = [];
      try { items = centerItems(shape, v); } catch { items = []; }
      for (const it of items) made.push({ id: ctx.newId('cm'), kind: 'drwCenter', view: v.id, auto: true, x: 0, y: 0, ...it, ...(d.activeLayer ? { layer: d.activeLayer } : {}) });
    }
    const ids = new Set(sd.views.map((v) => v.id));
    ctx.change('op.annotation', () => { d.annotations = [...(d.annotations ?? []).filter((a) => !(a.kind === 'drwCenter' && a.auto && ids.has(a.view))), ...made]; });
    notify(made.length ? 'success' : 'info', made.length ? t('drw.centerMarksMade', { count: made.length }) : t('drw.centerMarksNone'));
  }

  // ───────────────────────── auto balloons

  /** A balloon per BOM row in the selected view (or the first one), pointing at its component, round the view. */
  function autoBalloons() {
    const d = drw();
    if (!d || d.source?.kind !== 'assembly') return;
    adoptToActiveSheet(d);
    const sd = sheetDrawing(d);
    const project = ctx.project();
    const asm = project.assemblies.find((a) => a.id === d.source.id);
    if (!asm) return;
    const { frames: fr } = viewFrames(sd, ctx.drawingProjections(sd));
    const view = sd.views.find((v) => v.id === state.drawingSelected && fr.has(v.id)) ?? sd.views.find((v) => fr.has(v.id) && !isPictorial(v)) ?? sd.views.find((v) => fr.has(v.id));
    if (!view) { notify('info', t('drw.autoBalloonNone')); return; }
    const frame = fr.get(view.id); const b = viewBasis(view);
    const leaves = flattenAssembly(project, asm);
    const targets = [];
    for (const row of bomRows(asm, project, { lang: ctx.lang?.() })) {
      const leaf = leaves.find((l) => row.components.includes(l.path[0]));
      const part = leaf ? project.parts.find((p) => p.id === leaf.part) : null;
      if (!leaf || !part) continue;
      let c = [0, 0, 0];
      try { const [lo, hi] = ctx.buildPart(part).body.boundingBox.bounds; c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]; } catch { /* the origin */ }
      const w = placePoint(leaf.placement, c);
      const v2 = b ? [w[0] * b.x[0] + w[1] * b.x[1] + w[2] * b.x[2], w[0] * b.y[0] + w[1] * b.y[1] + w[2] * b.y[2]] : [0, 0];
      targets.push({ item: row.item, target: frame.toSheet(v2[0], v2[1]) });
    }
    if (!targets.length) { notify('info', t('drw.autoBalloonNone')); return; }
    const centre = [targets.reduce((s, x) => s + x.target[0], 0) / targets.length, targets.reduce((s, x) => s + x.target[1], 0) / targets.length];
    const placed = autoBalloonLayout(targets, centre);
    const r1 = (v) => Math.round(v * 10) / 10;
    const made = placed.map((p) => ({ id: ctx.newId('ann'), kind: 'balloon', auto: true, view: view.id, item: p.item, x: r1(p.at[0]), y: r1(p.at[1]), target: [r1(p.target[0]), r1(p.target[1])] }));
    ctx.change('op.annotation', () => { d.annotations = [...(d.annotations ?? []).filter((a) => !(a.kind === 'balloon' && a.auto && a.view === view.id)), ...made]; });
    notify('success', t('drw.autoBalloonMade', { count: made.length }));
  }

  // ───────────────────────── hole callouts

  /** A callout for every hole feature seen end on in each view (with its count), beside its first hole. */
  function holeCallouts() {
    const d = drw();
    if (!d || d.source?.kind !== 'part') return;
    adoptToActiveSheet(d);
    const sd = sheetDrawing(d);
    const { shape } = ctx.drawingShape(d);
    const model = ctx.project().parts.find((p) => p.id === d.source.id);
    const holes = (model?.features ?? []).filter((f) => !f.suppressed && (f.type === 'hole' || f.type === 'advancedHole'));
    if (!shape || !holes.length) { notify('info', t('drw.holeCalloutsNone')); return; }
    const { frames: fr } = viewFrames(sd, ctx.drawingProjections(sd));
    const made = [];
    for (const v of sd.views) {
      const frame = fr.get(v.id);
      if (!frame || isPictorial(v)) continue;
      let items = [];
      try { items = holeCalloutItems(shape, v, holes); } catch { items = []; }
      for (const it of items) {
        const C = frame.toSheet(it.c[0], it.c[1]);
        made.push({ id: ctx.newId('hc'), kind: 'drwHole', view: v.id, auto: true, c: it.c, r: it.r, lines: it.lines, x: Math.round((C[0] + 14) * 10) / 10, y: Math.round((C[1] - 12) * 10) / 10, ...(d.activeLayer ? { layer: d.activeLayer } : {}) });
      }
    }
    const ids = new Set(sd.views.map((v) => v.id));
    ctx.change('op.annotation', () => { d.annotations = [...(d.annotations ?? []).filter((a) => !(a.kind === 'drwHole' && a.auto && ids.has(a.view))), ...made]; });
    notify(made.length ? 'success' : 'info', made.length ? t('drw.holeCalloutsMade', { count: made.length }) : t('drw.holeCalloutsNone'));
  }

  // ───────────────────────── weld symbols

  function startWeld() {
    const w = selectedAnn('drwWeld');
    begin('drwWeld', { editId: w?.id ?? null, pickTarget: false });
    notify('info', t('drwWeld.hint'));
  }
  function weldClick(e, at, hitAnn) {
    const hit = hitAnn ? ann(hitAnn) : null;
    if (hit?.kind === 'drwWeld') { e.editId = hit.id; state.drawingSelected = hit.id; ctx.renderLeft(); ctx.renderDrawing(); return; }
    const x = Math.round(at[0] * 10) / 10; const y = Math.round(at[1] * 10) / 10;
    const w = e.editId ? ann(e.editId) : null;
    if (w && e.pickTarget) { edit(() => { w.target = [x, y]; }); e.pickTarget = false; return; }
    if (w) { edit(() => { const dx = x - w.x; const dy = y - w.y; w.x = x; w.y = y; w.target = [w.target[0] + dx, w.target[1] + dy]; }); return; }
    const d = drw();
    const a = { id: ctx.newId('weld'), kind: 'drwWeld', x, y, target: [x - 12, y + 12], symbol: 'fillet', side: 'arrow', size: '5', length: '', pitch: '', allAround: false, field: false, contour: 'none', tail: '', ...(d.activeLayer ? { layer: d.activeLayer } : {}) };
    ctx.change('op.annotation', () => { d.annotations = [...(d.annotations ?? []), a]; });
    e.editId = a.id; state.drawingSelected = a.id;
  }
  function weldPm(e) {
    const { pmHead, pmGroup, pmSeg, pmButton } = ctx.pm;
    const w = e.editId ? ann(e.editId) : null;
    const head = pmHead('weldSymbol', t('cmd.drwWeld'), t('pm.help.drwWeld'));
    if (!w) return [head, `<p class="pm-note">${escapeHtml(t('drwWeld.clickToPlace'))}</p>`].join('');
    return [head,
      pmGroup('weldSymbol', t('drwWeld.symbol'), buttons('w:symbol', WELD_SYMBOLS.map((k) => [k, t(`drwWeld.sym.${k}`), `weld_${k}`]), w.symbol)),
      pmGroup('weldSymbol', t('drwWeld.side'), `${pmSeg('w:side', WELD_SIDES.map((k) => [k, t(`drwWeld.side.${k}`)]), w.side)}${pmSeg('w:contour', WELD_CONTOURS.map((k) => [k, t(`drwWeld.contour.${k}`)]), w.contour ?? 'none')}`),
      pmGroup('smartDim', t('drwWeld.values'), `${textRow('w:size', w.size, t('drwWeld.size'), 'smartDim')}${textRow('w:length', w.length, t('drwWeld.length'), 'dimHorizontal')}${textRow('w:pitch', w.pitch, t('drwWeld.pitch'), 'dimHorizontal')}${textRow('w:tail', w.tail, t('drwWeld.tail'), 'note')}`),
      pmGroup('weldSymbol', t('drwWeld.marks'), `${check('w:allAround', w.allAround, t('drwWeld.allAround'), 'weldAllAround')}${check('w:field', w.field, t('drwWeld.field'), 'weldField')}<div class="pm-row">${pmButton('drw.weldTarget', 'pointTool', t('drwWeld.pickArrow'), e.pickTarget ? 'active' : '')}${pmButton('drw.newWeld', 'plus', t('drwWeld.new'))}</div>`),
    ].join('');
  }

  // ───────────────────────── general tables

  function startTable() {
    const tb = selectedAnn('drwTable');
    begin('drwTable', { editId: tb?.id ?? null });
    notify('info', t('drwTable.hint'));
  }
  function tableClick(e, at, hitAnn) {
    const hit = hitAnn ? ann(hitAnn) : null;
    if (hit?.kind === 'drwTable') { e.editId = hit.id; state.drawingSelected = hit.id; ctx.renderLeft(); ctx.renderDrawing(); return; }
    const x = Math.round(at[0] * 10) / 10; const y = Math.round(at[1] * 10) / 10;
    const tb = e.editId ? ann(e.editId) : null;
    if (tb) { edit(() => { tb.x = x; tb.y = y; }); return; }
    const d = drw();
    const a = createTable({ id: ctx.newId('tbl'), x, y, rows: 3, cols: 3, title: t('drwTable.defaultTitle') });
    if (d.activeLayer) a.layer = d.activeLayer;
    ctx.change('op.annotation', () => { d.annotations = [...(d.annotations ?? []), a]; });
    e.editId = a.id; state.drawingSelected = a.id;
  }
  function tablePm(e) {
    const { pmHead, pmGroup, pmNum, pmButton } = ctx.pm;
    const tb = e.editId ? ann(e.editId) : null;
    const head = pmHead('generalTable', t('cmd.drwTable'), t('pm.help.drwTable'));
    if (!tb) return [head, `<p class="pm-note">${escapeHtml(t('drwTable.clickToPlace'))}</p>`].join('');
    const grid = tb.cells.map((row, r) => `<div class="drw-table-row">${row.map((c, k) => ctx.pm.textInput(`cell:${r}:${k}`, c, 'drw-cell')).join('')}</div>`).join('');
    return [head,
      pmGroup('generalTable', t('drwTable.size'), `${textRow('t:title', tb.title, t('drwTable.title'), 'note')}${pmNum('t:rows', tb.rows, t('drwTable.rows'), 'generalTable')}${pmNum('t:cols', tb.cols, t('drwTable.cols'), 'generalTable')}${pmNum('t:colW', tb.colW?.[0] ?? 25, t('drwTable.colWidth'), 'dimHorizontal')}`),
      pmGroup('edit', t('drwTable.cells'), `<div class="drw-table-grid">${grid}</div><div class="pm-relations">${pmButton('drw.addRow', 'plus', t('drwTable.addRow'))}${pmButton('drw.addCol', 'plus', t('drwTable.addCol'))}${pmButton('drw.delRow', 'trash', t('drwTable.delRow'))}${pmButton('drw.delCol', 'trash', t('drwTable.delCol'))}</div>`),
      `<div class="pm-row">${pmButton('drw.newTable', 'plus', t('drwTable.new'))}</div>`,
    ].join('');
  }

  // ───────────────────────── layers

  function layersPm() {
    const { pmHead, pmGroup, pmButton } = ctx.pm;
    const d = drw();
    const list = layersOf(d);
    const rows = list.map((l) => `<div class="drw-layer-row ${d.activeLayer === l.id ? 'active' : ''}"><button type="button" class="icon-button" data-pm-set="activeLayer" data-value="${escapeHtml(l.id)}" title="${escapeHtml(t('drwLayer.makeActive'))}">${icon(d.activeLayer === l.id ? 'check' : 'layers')}</button>${ctx.pm.textInput(`layerName:${l.id}`, l.name, 'drw-layer-name')}<input type="color" data-pm-field="layerColor:${escapeHtml(l.id)}" value="${escapeHtml(l.color ?? '#000000')}" title="${escapeHtml(t('drwLayer.color'))}"/><label class="pm-check" title="${escapeHtml(t('drwLayer.visible'))}"><input type="checkbox" data-pm-toggle="layerVis:${escapeHtml(l.id)}" ${l.visible !== false ? 'checked' : ''}/>${icon('eye')}</label><button type="button" class="icon-button" data-pm="drw.delLayer:${escapeHtml(l.id)}" title="${escapeHtml(t('action.delete'))}">${icon('trash', 'icon tiny')}</button></div>`).join('');
    const opts = [['', t('drwLayer.default')], ...list.map((l) => [l.id, l.name])];
    const sd = sheetDrawing(d);
    const anns = (sd.annotations ?? []).map((a) => `<div class="drw-assign-row">${icon(a.kind === 'drwDim' ? 'smartDim' : a.kind === 'drwWeld' ? 'weldSymbol' : a.kind === 'drwTable' ? 'generalTable' : a.kind === 'drwCenter' ? 'centerMarksAuto' : 'note', 'icon tiny')}<span class="grow">${escapeHtml(t(`ann.${a.kind}`, null, a.kind))}${a.kind === 'drwDim' ? ` ${escapeHtml(dimLabel(a))}` : a.text ? ` ${escapeHtml(String(a.text).slice(0, 16))}` : ''}</span>${sel(`assign:${a.id}`, opts, a.layer ?? '', t('drwLayer.layer'))}</div>`).join('');
    return [
      pmHead('layers', t('cmd.drwLayers'), t('pm.help.drwLayers')),
      pmGroup('layers', t('drwLayer.list'), `${rows || `<p class="pm-note">${escapeHtml(t('drwLayer.none'))}</p>`}<div class="pm-row">${pmButton('drw.addLayer', 'plus', t('drwLayer.add'))}${list.length ? pmButton('drw.assignAll', 'layers', t('drwLayer.assignAll')) : ''}</div>`),
      anns ? pmGroup('note', t('drwLayer.annotations'), `<div class="drw-assign">${anns}</div>`) : '',
    ].join('');
  }

  // ───────────────────────── title block, sheet format

  const TB_FIELDS = ['title', 'partNo', 'material', 'drawnBy', 'checkedBy', 'date', 'revision', 'company'];
  function titlePm() {
    const { pmHead, pmGroup } = ctx.pm;
    const d = drw();
    const scaleSel = sel('tb:scale', [['auto', t('drawing.autoScale')], ...STANDARD_SCALES.map((s) => [String(s), scaleLabel(s)])], d.autoScale !== false ? 'auto' : String(d.scale), t('title.scale'));
    return [
      pmHead('titleBlock', t('cmd.drwTitleBlock'), t('pm.help.drwTitleBlock')),
      pmGroup('titleBlock', t('drawing.titleBlock'), `${TB_FIELDS.map((k) => textRow(`tb:${k}`, d.title?.[k] ?? '', t(`drwTitle.${k}`), k === 'date' ? 'calendar' : k === 'material' ? 'material' : 'edit')).join('')}${scaleSel}`),
    ].join('');
  }
  function formatPm() {
    const { pmHead, pmGroup, pmSeg } = ctx.pm;
    const d = drw();
    const std = d.format?.standard ?? (d.projection === 'third' ? 'ANSI' : 'ISO');
    const sizes = std === 'ANSI' ? ANSI_SHEETS.map(([k, key]) => [key, `ANSI ${k}`, 'sheetFormat']) : ISO_SHEETS.map((k) => [k, k, 'sheetFormat']);
    return [
      pmHead('sheetFormat', t('cmd.drwSheetFormat'), t('pm.help.drwSheetFormat')),
      pmGroup('sheetFormat', t('drwFormat.standard'), pmSeg('f:standard', STANDARDS.map((k) => [k, k]), std)),
      pmGroup('sheetFormat', t('drwFormat.size'), buttons('f:sheet', sizes, d.sheet)),
      pmGroup('drawing', t('drawing.projection'), `${pmSeg('f:projection', [['first', t('drawing.first')], ['third', t('drawing.third')]], d.projection ?? 'third')}${check('f:zones', d.format?.zones !== false && Boolean(d.format), t('drwFormat.zones'), 'grid')}`),
      pmGroup('snapAlign', t('drwSnap.title'), `${check('f:snapAlign', d.snap?.align !== false, t('drwSnap.align'), 'snapAlign')}${sel('f:snapGrid', [['0', t('drwSnap.gridOff')], ...['1', '2', '5', '10'].map((g) => [g, `${g} mm`])], String(d.snap?.grid ?? 0), t('drwSnap.grid'))}<p class="pm-note">${escapeHtml(t('drwSnap.note'))}</p>`),
    ].join('');
  }
  function setFormat(key, value) {
    const d = drw();
    const cur = { standard: d.format?.standard ?? 'ISO', sheet: d.sheet, projection: d.projection, zones: d.format?.zones !== false };
    if (key === 'standard') { cur.standard = value; cur.projection = null; cur.sheet = value === 'ANSI' ? (ANSI_SHEETS.some(([, k]) => k === d.sheet) ? d.sheet : 'Tabloid') : (ISO_SHEETS.includes(d.sheet) ? d.sheet : 'A3'); }
    else cur[key] = value;
    ctx.change('op.edit', () => applySheetFormat(d, cur));
    ctx.fitDrawing?.();
  }

  // ───────────────────────── evaluate

  function startEval(kind) {
    const p = part();
    if (!p || !state.partEntry?.body) { notify('info', t('notice.noBody')); return; }
    const up = Object.entries(AXIS).find(([, v]) => v.every((x, i) => Math.abs(x - STD_PLANES.top.normal[i]) < 1e-9))?.[0] ?? 'z';
    const other = ctx.project().parts.find((x) => x.id !== p.id);
    begin('evalMore', { kind, edges: [], plane: 'right', offset: 0, minEdge: 0.01, sliverRatio: 0.02, dir: up, other: other?.id ?? '', result: null, error: null });
    runEval();
  }

  function runEval() {
    const e = editing(); const p = part(); const entry = state.partEntry;
    if (!e || !p || !entry?.body) return;
    const body = entry.body;
    const C = RESULT_COLOURS;
    let byFace = null; // faceId (hashCode) → colour
    e.error = null;
    try {
      if (e.kind === 'deviation') {
        const r = deviationAnalysis(body, { edges: e.edges.length ? e.edges.map((x) => x.hash) : null });
        const faces = body.faces; byFace = new Map();
        for (const x of r.edges) for (const i of x.faces) { const h = faces[i].hashCode; const c = x.max < 1 ? C.ok : x.max < 10 ? C.warn : null; if (c && byFace.get(h) !== C.warn) byFace.set(h, c); }
        e.result = r;
      } else if (e.kind === 'symmetry') {
        const n = STD_PLANES[e.plane]?.normal ?? [1, 0, 0];
        const r = symmetryCheck(body, { point: n.map((v) => v * (Number(e.offset) || 0)), normal: n });
        byFace = new Map(r.faces.map((f) => [f.hash, f.symmetric ? C.ok : C.bad]));
        e.result = r;
      } else if (e.kind === 'geometry') {
        const r = geometryCheck(body, { minEdge: Number(e.minEdge) || 0.01, sliverRatio: Number(e.sliverRatio) || 0.02 });
        byFace = new Map(r.faces.map((f) => [f.hash, f.problem ? (f.problem === 'sliver' || f.problem === 'shortEdge' ? C.warn : C.bad) : C.ok]));
        e.result = r;
      } else if (e.kind === 'undercut') {
        const r = undercutAnalysis(body, AXIS[e.dir] ?? AXIS.z);
        byFace = new Map([...r.faces].map(([h, cls]) => [h, C[cls]]));
        const areas = { cavity: 0, core: 0, straight: 0, undercut: 0 };
        for (const x of r.details ?? []) for (const k of Object.keys(areas)) areas[k] += x.area * (x.fractions?.[k] ?? 0);
        e.result = { counts: r.counts, undercut: r.undercut, split: r.split ?? 0, areas };
      } else if (e.kind === 'compare') {
        const other = ctx.project().parts.find((x) => x.id === e.other);
        if (!other) { e.result = null; e.error = 'drwEval.needOther'; }
        else {
          const ob = ctx.buildPart(other).body;
          if (!ob) { e.error = 'drwEval.otherEmpty'; e.result = null; }
          else {
            const r = compareParts(body, ob, { featuresA: p.features, featuresB: other.features });
            byFace = new Map(r.faces.map((f) => [f.hash, f.same ? C.muted : C.bad]));
            e.result = { ...r, otherName: other.name };
          }
        }
      } else if (e.kind === 'costing' || e.kind === 'sustain') {
        const res = entry.result ?? {};
        // Sheet metal: the flat pattern gives the blank (cut length, pierces); its own build slot keeps the view's.
        let flat = null;
        if (res.sheet && (p.costing?.process ?? 'auto') !== 'machining') { try { flat = ctx.buildPart({ ...p, flat: true }, { slot: 'costFlat' })?.body ?? null; } catch { flat = null; } }
        const labels = { hole: t('cost.holeName'), end: t('cost.endName'), stock: t('cost.stock'), surface: t('cost.surface'), fillet: t('cost.filletName'), chamfer: t('cost.chamferName') };
        const cost = partCost({ body, material: p.material, features: res.features ?? p.features, results: res.results, sheet: res.sheet, flat, labels }, p.costing ?? {});
        const co2 = partCO2(cost, p.sustain ?? {});
        // Faces of the recognised holes in the result colour, the rest muted.
        if (cost.holes?.length || cost.edges?.length) { const faces = body.faces; byFace = new Map(); for (const h of cost.holes ?? []) for (const i of h.faces) if (faces[i]) byFace.set(faces[i].hashCode, C.info); for (const x of cost.edges ?? []) if (faces[x.face]) byFace.set(faces[x.face].hashCode, C.warn); }
        e.result = { cost, co2, material: materialName(p.material, ctx.lang()), volume: cost.volume, area: cost.area };
      }
    } catch (error) { e.error = 'drwEval.failed'; e.result = null; console.warn('evaluate', error); }
    state.drwEval = byFace && entry.mesh ? { key: entry.key, colors: faceColours(entry.mesh, (h) => byFace.get(h) ?? null) } : null;
    ctx.syncView();
    ctx.renderLeft();
  }

  /** The cost / CO₂e breakdown saved as CSV or an HTML report (the app's export: a save dialog or a download). */
  function exportCost(format) {
    const e = editing(); const p = part();
    const c = e?.result?.cost;
    if (!c || !p) { notify('info', t('cost.noResult')); return undefined; }
    const tr = (k) => t(k);
    const base = `${fileSafe(p.name)}-cost`;
    if (format === 'csv') return ctx.saveExport(`${base}.csv`, 'csv', `\uFEFF${costReportCsv(c, e.result.co2, tr)}`, 'text/csv');
    const html = costReportHtml(c, e.result.co2, tr, { title: `${t('cmd.eval.costing')} — ${p.name}`, part: p.name, material: e.result.material, date: new Date().toLocaleString() });
    return ctx.saveExport(`${base}.html`, 'html', html, 'text/html');
  }

  function colours(p, entry) {
    const e = editing();
    if (e?.mode !== 'evalMore' || !state.drwEval || state.drwEval.key !== entry?.key) return null;
    return { colors: state.drwEval.colors };
  }

  // ───────────────────────── PropertyManager hooks

  function pm(e) {
    if (e.mode === 'drwDim') return dimPm(e);
    if (e.mode === 'drwWeld') return weldPm(e);
    if (e.mode === 'drwTable') return tablePm(e);
    if (e.mode === 'drwLayers') return layersPm(e);
    if (e.mode === 'drwTitle') return titlePm(e);
    if (e.mode === 'drwFormat') return formatPm(e);
    if (e.mode === 'evalMore') return evalPm(e, { ...ctx.pm, t, fmt: ctx.fmt, fmtLen: ctx.fmtLen, sel, check, textRow, buttons, otherParts: ctx.project().parts.filter((x) => x.id !== part()?.id), costing: part()?.costing, sustain: part()?.sustain });
    return '';
  }

  function pick(hit) {
    const e = editing();
    if (e.mode !== 'evalMore' || e.kind !== 'deviation') return undefined;
    if (hit?.kind !== 'edge') { notify('info', t('drwEval.pickEdges')); return undefined; }
    const edge = ctx.topoOf(hit)?.shape;
    if (!edge) return undefined;
    const i = e.edges.findIndex((x) => x.hash === edge.hashCode);
    if (i >= 0) e.edges.splice(i, 1); else e.edges.push({ hash: edge.hashCode, index: hit.index, bodyKey: hit.bodyKey });
    ctx.viewport()?.setSelection(e.edges.map((x) => ({ kind: 'edge', bodyKey: x.bodyKey, index: x.index })));
    return runEval();
  }

  function field(key, raw) {
    const e = editing();
    const d = drw();
    if (e.mode === 'drwDim') { if (key === 'upper' || key === 'lower') { e[key] = numOr(raw, e[key]); applyToEdited(e); } return ctx.renderLeft(); }
    if (e.mode === 'drwWeld' && key.startsWith('w:')) { const w = ann(e.editId); if (w) edit(() => { w[key.slice(2)] = String(raw ?? ''); }); return undefined; }
    if (e.mode === 'drwTable') {
      const tb = ann(e.editId);
      if (!tb) return undefined;
      if (key.startsWith('cell:')) { const [, r, c] = key.split(':').map(Number); return edit(() => { tb.cells[r][c] = String(raw ?? ''); }); }
      if (key === 't:title') return edit(() => { tb.title = String(raw ?? ''); });
      if (key === 't:rows' || key === 't:cols') { const n = Math.round(Number(raw)); if (n > 0) edit(() => resizeTable(tb, key === 't:rows' ? n : tb.rows, key === 't:cols' ? n : tb.cols)); return undefined; }
      if (key === 't:colW') { const w = Number(raw); if (w > 0) edit(() => { tb.colW = tb.colW.map(() => w); }); return undefined; }
      return undefined;
    }
    if (e.mode === 'drwLayers') {
      const [what, id] = key.split(':');
      const l = layersOf(d).find((x) => x.id === id);
      if (!l) return undefined;
      return ctx.change('op.edit', () => { if (what === 'layerName') l.name = String(raw || l.name); if (what === 'layerColor' && /^#[0-9a-f]{6}$/i.test(raw)) l.color = raw; });
    }
    if (e.mode === 'drwTitle' && key.startsWith('tb:')) return ctx.change('op.edit', () => { d.title = { ...(d.title ?? {}), [key.slice(3)]: String(raw ?? '') }; });
    if (e.mode === 'evalMore') {
      const p = part();
      if (key.startsWith('cost:') || key.startsWith('co2:')) {
        const [scope, k] = key.split(':'); const store = scope === 'cost' ? 'costing' : 'sustain';
        const v = parseRate(k, raw);
        if (v === undefined) { notify('error', t('notice.invalidValue', { text: raw })); return ctx.renderLeft(); }
        ctx.change('op.edit', () => { p[store] = setPath(JSON.parse(JSON.stringify(p[store] ?? {})), k, v); });
        return runEval();
      }
      if (['offset', 'minEdge', 'sliverRatio'].includes(key)) { const v = Number(raw); if (Number.isFinite(v)) e[key] = v; return runEval(); }
    }
    return undefined;
  }

  function set(key, value) {
    const e = editing(); const d = drw();
    if (e.mode === 'drwDim') {
      if (key === 'dtype') { e.dtype = value; e.picks = []; e.ordinateId = null; }
      if (key === 'axis') { e.axis = value; e.ordinateId = null; }
      if (key === 'measure') { e.measure = value; applyToEdited(e); }
      ctx.renderLeft(); return ctx.renderDrawing();
    }
    if (e.mode === 'drwWeld' && key.startsWith('w:')) { const w = ann(e.editId); if (w) edit(() => { w[key.slice(2)] = value; }); return undefined; }
    if (e.mode === 'drwLayers' && key === 'activeLayer') return ctx.change('op.edit', () => { d.activeLayer = d.activeLayer === value ? null : value; });
    if (e.mode === 'drwFormat' && key.startsWith('f:')) return setFormat(key.slice(2), value);
    if (e.mode === 'evalMore') { if (['plane', 'dir', 'kind'].includes(key)) e[key] = value; return runEval(); }
    return undefined;
  }

  function select(key, value) {
    const e = editing(); const d = drw();
    if (e.mode === 'drwDim') { if (['precision', 'tolType', 'fit'].includes(key)) { e[key] = value; applyToEdited(e); } return ctx.renderLeft(); }
    if (e.mode === 'drwLayers' && key.startsWith('assign:')) { const a = ann(key.slice(7)); if (a) ctx.change('op.edit', () => { if (value) a.layer = value; else delete a.layer; }); return undefined; }
    if (e.mode === 'drwFormat' && key === 'f:snapGrid') return ctx.change('op.edit', () => { d.snap = { ...(d.snap ?? {}), grid: Number(value) || 0 }; });
    if (e.mode === 'drwTitle' && key === 'tb:scale') return ctx.change('op.edit', () => { if (value === 'auto') d.autoScale = true; else { d.autoScale = false; d.scale = Number(value); } });
    if (e.mode === 'evalMore' && key === 'other') { e.other = value; return runEval(); }
    if (e.mode === 'evalMore' && key === 'costProcess') { const p = part(); ctx.change('op.edit', () => { p.costing = setPath({ ...(p.costing ?? {}) }, 'process', PROCESSES.includes(value) ? value : null); }); return runEval(); }
    return undefined;
  }

  function toggle(key, checked) {
    const e = editing(); const d = drw();
    if (e.mode === 'drwWeld' && key.startsWith('w:')) { const w = ann(e.editId); if (w) edit(() => { w[key.slice(2)] = checked; }); return undefined; }
    if (e.mode === 'drwDim' && key === 'trueMark') { e.trueMark = checked; applyToEdited(e); return ctx.renderLeft(); }
    if (e.mode === 'drwFormat' && key === 'f:snapAlign') return ctx.change('op.edit', () => { d.snap = { ...(d.snap ?? {}), align: checked }; });
    if (e.mode === 'drwLayers' && key.startsWith('layerVis:')) { const l = layersOf(d).find((x) => x.id === key.slice(9)); if (l) ctx.change('op.edit', () => { l.visible = checked; }); return undefined; }
    if (e.mode === 'drwFormat' && key === 'f:zones') return setFormat('zones', checked);
    return undefined;
  }

  function accept() { return finish(); }

  const COMMAND_NAMES = new Set(['drw.costCsv', 'drw.costHtml', 'drw.modelItems', 'drw.centerMarks', 'drw.delDim', 'drw.weldTarget', 'drw.newWeld', 'drw.newTable', 'drw.addRow', 'drw.addCol', 'drw.delRow', 'drw.delCol', 'drw.addLayer', 'drw.delLayer', 'drw.assignAll']);
  function handles(name) { return COMMAND_NAMES.has(name) || (name === 'clear' && owns(editing())); }
  function command(name, arg) {
    const e = editing(); const d = drw();
    if (name === 'clear') {
      if (e?.mode === 'drwDim') { e.picks = []; e.ordinateId = null; ctx.renderDrawing(); }
      if (e?.mode === 'evalMore') { e.edges = []; ctx.viewport()?.setSelection([]); return runEval(); }
      return ctx.renderLeft();
    }
    if (name === 'drw.costCsv' || name === 'drw.costHtml') return exportCost(name === 'drw.costCsv' ? 'csv' : 'html');
    if (name === 'drw.modelItems') return modelItems();
    if (name === 'drw.centerMarks') return centerMarks();
    if (name === 'drw.delDim') { const id = e?.editId; e.editId = null; return ctx.change('op.delete', () => { d.annotations = d.annotations.filter((a) => a.id !== id); }); }
    if (name === 'drw.weldTarget') { e.pickTarget = !e.pickTarget; return ctx.renderLeft(); }
    if (name === 'drw.newWeld' || name === 'drw.newTable') { e.editId = null; state.drawingSelected = null; return ctx.renderLeft(); }
    if (name.startsWith('drw.add') && name !== 'drw.addLayer' || name === 'drw.delRow' || name === 'drw.delCol') {
      const tb = ann(e?.editId);
      if (!tb) return undefined;
      const r = tb.rows + (name === 'drw.addRow' ? 1 : name === 'drw.delRow' ? -1 : 0); const c = tb.cols + (name === 'drw.addCol' ? 1 : name === 'drw.delCol' ? -1 : 0);
      return edit(() => resizeTable(tb, r, c));
    }
    if (name === 'drw.addLayer') { let l; ctx.change('op.edit', () => { l = addLayer(d, { id: ctx.newId('layer'), name: `${t('drwLayer.name')}${layersOf(d).length + 1}`, color: ['#c62828', '#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a'][layersOf(d).length % 5] }); }); return notify('success', t('drwLayer.added', { name: l.name })); }
    if (name === 'drw.delLayer') return ctx.change('op.edit', () => removeLayer(d, arg));
    if (name === 'drw.assignAll') { if (!d.activeLayer) { notify('info', t('drwLayer.noActive')); return undefined; } return ctx.change('op.edit', () => { for (const a of sheetDrawing(d).annotations) a.layer = d.activeLayer; }); }
    return undefined;
  }

  const subject = (e) => t({ drwDim: 'cmd.drwSmartDim', drwWeld: 'cmd.drwWeld', drwTable: 'cmd.drwTable', drwLayers: 'cmd.drwLayers', drwTitle: 'cmd.drwTitleBlock', drwFormat: 'cmd.drwSheetFormat' }[e.mode] ?? `cmd.eval.${e.kind}`);

  // ───────────────────────── sheet SVG and DXF

  function infoOf(d, info = {}) {
    const out = { ...info };
    if (d.title?.title) out.name = d.title.title;
    if (d.title?.material) out.material = d.title.material;
    return out;
  }

  /** Pick marks of the smart dimension being made. */
  function pickMarks(sd, fr) {
    const e = editing();
    if (e?.mode !== 'drwDim' || !e.picks.length) return '';
    const f = fr.get(e.view);
    if (!f) return '';
    return `<g class="dx-picks">${e.picks.map((p) => {
      if (p.kind === 'line') { const a = f.toSheet(...p.a); const b = f.toSheet(...p.b); return `<path d="M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}" fill="none" stroke="#e91e63" stroke-width="0.8"/>`; }
      if ((p.kind === 'ellipse' || p.kind === 'curve') && f.basis && p.pts3?.length) { const pts = p.pts3.map((q3) => f.toSheet(q3[0] * f.basis.x[0] + q3[1] * f.basis.x[1] + q3[2] * f.basis.x[2], q3[0] * f.basis.y[0] + q3[1] * f.basis.y[1] + q3[2] * f.basis.y[2])); return `<path d="M ${pts.map((q) => `${q[0]} ${q[1]}`).join(' L ')}" fill="none" stroke="#e91e63" stroke-width="0.8"/>`; }
      if (p.kind === 'circle' && f.basis) { const pts = ellipseSheet({ c: p.c3, n: p.n3, r: p.r }, f, 64); return `<path d="M ${pts.map((q) => `${q[0]} ${q[1]}`).join(' L ')} Z" fill="none" stroke="#e91e63" stroke-width="0.8"/>`; }
      const c = f.toSheet(...(p.kind === 'point' ? p.p : p.c));
      const r = p.kind === 'arc' ? p.r * f.s : 1.2;
      return `<circle cx="${c[0]}" cy="${c[1]}" r="${r}" fill="none" stroke="#e91e63" stroke-width="0.8"/>`;
    }).join('')}</g>`;
  }

  function svg(d, opts, base) {
    adoptToActiveSheet(d);
    const plain = { ...d, annotations: (d.annotations ?? []).filter((a) => !DRW_KINDS.has(a?.kind) && annotationVisible(d, a)) };
    const out = base(plain, { ...opts, info: infoOf(d, opts.info) });
    const sd = sheetDrawing(d);
    const projections = ctx.drawingProjections(sd);
    let extra = drwSvg(sd, projections, { selected: opts.selected });
    try { extra += pickMarks(sd, viewFrames(sd, projections).frames); } catch { /* none */ }
    // An exported file carries the sheet's font (Roboto), so it looks the same where it is not installed.
    return opts.embedFonts ? embedFonts(injectSvg(out, extra)) : injectSvg(out, extra);
  }

  function dxf(d, opts, base) {
    adoptToActiveSheet(d);
    const plain = { ...d, annotations: (d.annotations ?? []).filter((a) => !DRW_KINDS.has(a?.kind) && !layerOf(d, a)) };
    const out = base(plain, opts);
    const sd = sheetDrawing(d);
    return drwDxf(out, sd, ctx.drawingProjections(sd), { info: infoOf(d, opts.info ?? ctx.drawingInfo?.(d) ?? {}), labels: opts.labels ?? {}, layered: (sd.annotations ?? []).filter((a) => !DRW_KINDS.has(a?.kind) && layerOf(d, a)) });
  }

  // ───────────────────────── dragging annotations (with snapping)

  const SVGNS = 'http://www.w3.org/2000/svg';
  /** Moves an annotation by (dx, dy) sheet mm: its text / symbol moves, a leader's end stays where it points. */
  function moveAnnotation(a, dx, dy) {
    const r = (v) => Math.round(v * 100) / 100;
    a.x = r((Number(a.x) || 0) + dx); a.y = r((Number(a.y) || 0) + dy);
    if (a.kind === 'dimension' && Array.isArray(a.a) && Array.isArray(a.b)) { a.a = [r(a.a[0] + dx), r(a.a[1] + dy)]; a.b = [r(a.b[0] + dx), r(a.b[1] + dy)]; }
  }

  /**
   * pointerdown on an annotation of the sheet (app.js hands it over, also while a drawing tool's page is open):
   * drag it, lining it up with the other annotations (anchors and box edges, guides shown) or the sheet's snap
   * grid; Shift drags freely. A click without a drag goes on as a click (the tools pick with it). True when taken.
   */
  function annotationDrag(event, el) {
    const d = drw();
    const svg = el?.ownerSVGElement;
    if (!d || !svg?.getScreenCTM) return false;
    const id = el.dataset.annotation;
    adoptToActiveSheet(d);
    const a0 = (d.annotations ?? []).find((x) => x.id === id);
    if (!a0 || a0.kind === 'drwCenter') return false;
    event.stopPropagation();
    const sd = sheetDrawing(d);
    let boxes = [];
    try { boxes = annotationBoxes(sd, ctx.drawingProjections(sd)).filter((b) => annotationVisible(d, (d.annotations ?? []).find((x) => x.id === b.id))); } catch { boxes = []; }
    const mine = boxes.find((b) => b.id === id) ?? null;
    const targets = boxes.filter((b) => b.id !== id && b.anchor);
    const align = d.snap?.align !== false; const grid = Number(d.snap?.grid) || 0;
    const pt = (e) => { const q = svg.createSVGPoint(); q.x = e.clientX; q.y = e.clientY; const r = q.matrixTransform(svg.getScreenCTM().inverse()); return [r.x, r.y]; };
    const start = pt(event);
    const guides = document.createElementNS(SVGNS, 'g');
    guides.setAttribute('class', 'snap-guides');
    svg.appendChild(guides);
    let moved = false; let delta = [0, 0];
    const move = (e) => {
      const q = pt(e);
      let dx = q[0] - start[0]; let dy = q[1] - start[1];
      if (!moved && Math.hypot(dx, dy) <= 0.8) return;
      moved = true;
      let lines = [];
      if (mine && !e.shiftKey && (align || grid)) {
        const s = snapDrag({ anchor: mine.anchor ? [mine.anchor[0] + dx, mine.anchor[1] + dy] : null, box: shiftBox(mine.box, dx, dy) }, align ? targets : [], { tol: 2, grid });
        dx += s.dx; dy += s.dy; lines = s.guides;
      }
      delta = [dx, dy];
      el.setAttribute('transform', `translate(${dx} ${dy})`);
      guides.innerHTML = lines.map((g) => (g.axis === 'x'
        ? `<line x1="${g.at}" y1="${g.from - 3}" x2="${g.at}" y2="${g.to + 3}" stroke="#1e88e5" stroke-width="0.25" stroke-dasharray="1.5 1"/>`
        : `<line x1="${g.from - 3}" y1="${g.at}" x2="${g.to + 3}" y2="${g.at}" stroke="#1e88e5" stroke-width="0.25" stroke-dasharray="1.5 1"/>`)).join('');
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      guides.remove();
      if (!moved) return;
      // The click that follows the drag is not a pick.
      const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      const [dx, dy] = delta;
      ctx.change('op.annotation', () => { const a = (drw()?.annotations ?? []).find((x) => x.id === id); if (a) moveAnnotation(a, dx, dy); });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return true;
  }

  // ───────────────────────── commands

  const hasDrawing = () => Boolean(drw());
  const partBody = () => Boolean(part()) && !(state.editing?.mode === 'sketch');
  const toggleMode = (mode, start) => () => (editing()?.mode === mode ? finish() : start());
  const evalCmd = (kind, glyph) => ({ icon: glyph, label: `cmd.eval.${kind}`, enabled: partBody, checked: () => editing()?.mode === 'evalMore' && editing().kind === kind, run: () => (editing()?.mode === 'evalMore' && editing().kind === kind ? finish() : startEval(kind)) });
  const commands = {
    drwSmartDim: { icon: 'smartDim', label: 'cmd.drwSmartDim', enabled: hasDrawing, checked: () => editing()?.mode === 'drwDim', run: toggleMode('drwDim', startDim) },
    drwModelItems: { icon: 'modelItems', label: 'cmd.drwModelItems', enabled: () => drw()?.source?.kind === 'part', run: () => modelItems() },
    drwCenterMarks: { icon: 'centerMarksAuto', label: 'cmd.drwCenterMarks', enabled: hasDrawing, run: () => centerMarks() },
    drwAutoBalloon: { icon: 'autoBalloon', label: 'cmd.drwAutoBalloon', enabled: () => drw()?.source?.kind === 'assembly', run: () => autoBalloons() },
    drwHoleCallout: { icon: 'holeCallout', label: 'cmd.drwHoleCallout', enabled: () => drw()?.source?.kind === 'part', run: () => holeCallouts() },
    drwWeld: { icon: 'weldSymbol', label: 'cmd.drwWeld', enabled: hasDrawing, checked: () => editing()?.mode === 'drwWeld', run: toggleMode('drwWeld', startWeld) },
    drwTable: { icon: 'generalTable', label: 'cmd.drwTable', enabled: hasDrawing, checked: () => editing()?.mode === 'drwTable', run: toggleMode('drwTable', startTable) },
    drwLayers: { icon: 'layers', label: 'cmd.drwLayers', enabled: hasDrawing, checked: () => editing()?.mode === 'drwLayers', run: toggleMode('drwLayers', () => begin('drwLayers')) },
    drwTitleBlock: { icon: 'titleBlock', label: 'cmd.drwTitleBlock', enabled: hasDrawing, checked: () => editing()?.mode === 'drwTitle', run: toggleMode('drwTitle', () => begin('drwTitle')) },
    drwSheetFormat: { icon: 'sheetFormat', label: 'cmd.drwSheetFormat', enabled: hasDrawing, checked: () => editing()?.mode === 'drwFormat', run: toggleMode('drwFormat', () => begin('drwFormat')) },
    ...Object.fromEntries(EVAL_KINDS.map(([kind, glyph]) => [`eval_${kind}`, evalCmd(kind, glyph)])),
    shutOff: { icon: 'shutOff', label: 'cmd.shutOff', enabled: partBody, run: () => ctx.startFeature('shutOff') },
    partingSurface: { icon: 'partingSurface', label: 'cmd.partingSurface', enabled: partBody, run: () => ctx.startFeature('partingSurface') },
  };

  /** Command ids per CommandManager tab (appended to the app's lists). */
  const TABS = {
    drawing: ['drwSmartDim', 'drwModelItems', 'drwCenterMarks', 'drwHoleCallout', 'drwAutoBalloon', 'drwWeld', 'drwTable', 'drwLayers', 'drwTitleBlock', 'drwSheetFormat'],
    evaluate: EVAL_KINDS.map(([k]) => `eval_${k}`),
    mold: ['shutOff', 'partingSurface', 'eval_undercut'],
  };

  /** Adds the commands to the menus (Insert › Annotations, Insert › Mold, Tools). */
  function extendMenus(SUBMENUS, MENUS) {
    SUBMENUS.annotations?.items.push('-', 'drwSmartDim', 'drwModelItems', 'drwCenterMarks', 'drwHoleCallout', 'drwAutoBalloon', 'drwWeld', 'drwTable', '-', 'drwLayers', 'drwTitleBlock', 'drwSheetFormat');
    SUBMENUS.mold?.items.splice(Math.max(0, SUBMENUS.mold.items.indexOf('toolingSplit')), 0, 'shutOff', 'partingSurface');
    SUBMENUS.mold?.items.push('eval_undercut');
    SUBMENUS.evalMore = { icon: 'deviation', items: EVAL_KINDS.map(([k]) => `eval_${k}`) };
    const i = MENUS.tools?.indexOf('draftAnalysis') ?? -1;
    if (MENUS.tools) MENUS.tools.splice(i < 0 ? MENUS.tools.length : i + 1, 0, { sub: 'evalMore' });
  }

  return { commands, TABS, owns, pm, pick, field, set, select, toggle, accept, handles, command, subject, colours, svg, dxf, sheetClick, extendMenus, runEval, annotationDrag };
}

/**
 * Creates the tools and chains them onto app-more.js's hook object `more` (app.js calls those hooks): our modes
 * answer first, everything else goes on to app-more.js. Returns the tools.
 */
export function attachDrwTools(more, ctx) {
  const tools = createDrwTools(ctx);
  const o = { ...more };
  const mine = () => tools.owns(ctx.state.editing);
  more.owns = (e) => tools.owns(e) || o.owns(e);
  more.pm = (e) => (tools.owns(e) ? tools.pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? tools.pick(hit, ev) : o.pick(hit, ev));
  more.field = (k, raw, v) => (mine() ? tools.field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? tools.set(k, v) : o.set(k, v));
  more.select = (k, v) => (mine() ? tools.select(k, v) : o.select?.(k, v));
  more.toggle = (k, c) => (mine() ? tools.toggle(k, c) : o.toggle(k, c));
  more.accept = () => (mine() ? tools.accept() : o.accept());
  more.subject = (e) => (tools.owns(e) ? tools.subject(e) : o.subject(e));
  more.handles = (name) => tools.handles(name) || o.handles(name);
  more.command = (name, arg) => ((name === 'clear' ? mine() : tools.handles(name)) ? tools.command(name, arg) : o.command(name, arg));
  more.colours = (p, entry) => tools.colours(p, entry) ?? o.colours(p, entry);
  more.svg = (d, opts = {}) => tools.svg(d, opts, o.svg);
  more.dxf = (d, opts = {}) => tools.dxf(d, opts, o.dxf);
  more.sheetClick = (event) => tools.sheetClick(event);
  more.annotationDrag = (event, el) => tools.annotationDrag(event, el);
  for (const [tab, ids] of Object.entries(tools.TABS)) more.TABS[tab] = more.TABS[tab]?.length ? [...more.TABS[tab], '|', ...ids] : [...ids];
  return tools;
}
