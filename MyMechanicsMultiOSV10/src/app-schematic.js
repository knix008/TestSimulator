// 2D electrical schematics: the editor (the model, nets, lists and drawing are in cad/schematic.js). The sheet is shown
// over the graphics area; tools: select (click, drag to move — wires follow), wire (pin to pin), and one per symbol
// kind (click to place, snapped to the 5 mm grid). Delete removes, Esc cancels, R rotates the selection. The
// PropertyManager holds the schematics, the tools, the selection's properties, the checks and the exports.
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';
import { SYMBOLS, GRID, createSchematic, nextTag, pinAt, autoRoute, schematicSvg, fromToCsv, schematicBom, checkSchematic, symbolPins } from './cad/schematic.js';

const KINDS = ['connector', 'terminal', 'switch', 'pushbutton', 'coil', 'contact', 'fuse', 'lamp', 'motor', 'resistor', 'diode', 'supply', 'ground'];

export function createSchematicTools(ctx) {
  const { state, t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const editing = () => state.editing;
  const owns = (e) => e?.mode === 'schematic';
  const project = () => ctx.project();
  const list = () => project()?.schematics ?? [];
  const sch = () => list().find((s) => s.id === editing()?.sch) ?? null;
  const edit = (mutate, op = 'op.schematic') => { ctx.change(op, () => { const s = sch(); if (s) mutate(s); }); draw(); ctx.renderLeft(); };
  const snap = (v) => Math.round(v / GRID) * GRID;

  // ───────────────────────── mode

  function begin(id = null) {
    if (!project()) { notify('info', t('sch.needProject')); return; }
    if (editing() && !owns(editing())) ctx.cancelEditing({ quiet: true });
    if (!list().length) newSchematic({ quiet: true });
    state.editing = { mode: 'schematic', sch: id ?? list()[0]?.id ?? null, tool: 'select', pending: null, sel: null };
    draw();
    ctx.renderAll();
  }
  function finish() { removeHost(); ctx.cancelEditing({ quiet: true }); }
  function newSchematic({ quiet = false } = {}) {
    const id = ctx.newId('sch');
    ctx.change('op.schematic', () => { const p = project(); p.schematics ??= []; p.schematics.push(createSchematic(id, t('sch.defaultName', { n: p.schematics.length + 1 }))); });
    if (editing() && owns(editing())) { editing().sch = id; editing().sel = null; draw(); ctx.renderLeft(); }
    if (!quiet) notify('success', t('sch.created'));
    return id;
  }

  // ───────────────────────── the sheet over the graphics area

  function host() {
    let h = document.getElementById('schematic-host');
    if (!h) {
      const area = document.querySelector('#view-host');
      if (!area) return null;
      h = document.createElement('div');
      h.id = 'schematic-host';
      h.className = 'schematic-host';
      area.append(h);
      h.addEventListener('pointerdown', onPointerDown);
      h.addEventListener('pointermove', onPointerMove);
      h.addEventListener('pointerup', onPointerUp);
      h.addEventListener('wheel', onWheel, { passive: false });
      h.addEventListener('contextmenu', (ev) => ev.preventDefault());
      window.addEventListener('keydown', onKey, true);
    }
    return h;
  }
  function removeHost() { document.getElementById('schematic-host')?.remove(); window.removeEventListener('keydown', onKey, true); }
  function draw() {
    const e = editing();
    if (!owns(e) || !sch()) { removeHost(); return; }
    const h = host(); if (!h) return;
    h.innerHTML = schematicSvg(sch(), { selected: e.sel, grid: true, labels: { title: t('sch.title') } });
    const svg = h.querySelector('svg');
    svg?.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const own = svg?.getAttribute('viewBox')?.split(/[ ,]+/).map(Number);
    if (own?.length === 4 && own.every(Number.isFinite)) fullBox = own;
    if (svg && e.view) svg.setAttribute('viewBox', e.view.map((v) => Math.round(v * 1000) / 1000).join(' '));
    if (e.pending) { const p = pinAt(sch(), e.pending); if (p) h.querySelector(`[data-pin="${CSS.escape(`${e.pending.sym}:${e.pending.pin}`)}"]`)?.setAttribute('fill', '#dc2626'); }
    h.dataset.tool = e.tool;
  }
  /** A pointer event's point on the sheet (mm). */
  function sheetPoint(ev) {
    const svg = document.querySelector('#schematic-host svg');
    const m = svg?.getScreenCTM(); if (!m) return [0, 0];
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  }

  // ── zoom and pan: the view is the SVG viewBox [x, y, w, h] in sheet mm; null = the whole sheet.
  let fullBox = [0, 0, 420, 297];
  const sheetBox = () => (document.querySelector('#schematic-host svg')?.getAttribute('viewBox') ?? '0 0 420 297').split(/[ ,]+/).map(Number);
  /** Zoom by `factor` (>1 = closer) keeping the sheet point (x, y) under the cursor. */
  function zoomAt(factor, x, y) {
    const e = editing(); if (!owns(e)) return;
    const [vx, vy, vw, vh] = e.view ?? sheetBox();
    // From 10 mm across up to four sheets wide.
    const w = Math.min(fullBox[2] * 4, Math.max(10, vw / factor)); const k = w / vw;
    e.view = [x - (x - vx) * k, y - (y - vy) * k, vw * k, vh * k];
    draw();
  }
  function fitView() { const e = editing(); if (!owns(e)) return; e.view = null; draw(); }
  function onWheel(ev) {
    ev.preventDefault();
    const [x, y] = sheetPoint(ev);
    zoomAt(Math.exp(-ev.deltaY * 0.0015), x, y);
  }
  let pan = null;

  let drag = null;
  function onPointerDown(ev) {
    const e = editing(); const s = sch(); if (!owns(e) || !s) return;
    if (ev.button === 1 || ev.button === 2) {
      ev.preventDefault();
      pan = { cx: ev.clientX, cy: ev.clientY, view: e.view ?? sheetBox() };
      host()?.setPointerCapture?.(ev.pointerId);
      return;
    }
    const [x, y] = sheetPoint(ev);
    const pinEl = ev.target.closest?.('[data-pin]'); const symEl = ev.target.closest?.('[data-symbol]'); const wireEl = ev.target.closest?.('[data-wire]');
    if (e.tool === 'wire') {
      const ref = pinEl ? { sym: pinEl.dataset.pin.split(':')[0], pin: pinEl.dataset.pin.split(':').slice(1).join(':') } : null;
      if (!ref) return;
      if (!e.pending) { e.pending = ref; draw(); return; }
      if (e.pending.sym === ref.sym && e.pending.pin === ref.pin) { e.pending = null; draw(); return; }
      const a = e.pending; e.pending = null;
      return addWire(a, ref);
    }
    if (e.tool?.startsWith('place:')) return placeSymbol(e.tool.slice(6), snap(x), snap(y));
    if (symEl) { e.sel = symEl.dataset.symbol; const sym = s.symbols.find((z) => z.id === e.sel); drag = { id: e.sel, dx: sym.x - x, dy: sym.y - y, moved: false }; host()?.setPointerCapture?.(ev.pointerId); draw(); ctx.renderLeft(); return; }
    if (wireEl) { e.sel = wireEl.dataset.wire; draw(); ctx.renderLeft(); return; }
    e.sel = null; draw(); ctx.renderLeft();
  }
  function onPointerMove(ev) {
    if (pan) {
      // The sheet point under the cursor moves as the view moves, so measure against the view at the start.
      const svg = document.querySelector('#schematic-host svg'); const r = svg?.getBoundingClientRect(); if (!r) return;
      const [, , vw, vh] = pan.view; const scale = Math.max(vw / r.width, vh / r.height);
      const dx = (ev.clientX - pan.cx) * scale; const dy = (ev.clientY - pan.cy) * scale;
      const e = editing(); e.view = [pan.view[0] - dx, pan.view[1] - dy, vw, vh]; draw();
      return;
    }
    if (!drag) return;
    const s = sch(); const sym = s?.symbols.find((z) => z.id === drag.id); if (!sym) return;
    const [x, y] = sheetPoint(ev);
    const nx = snap(x + drag.dx); const ny = snap(y + drag.dy);
    if (nx === sym.x && ny === sym.y) return;
    if (!drag.moved) { drag.moved = true; drag.before = JSON.stringify(s); }
    sym.x = nx; sym.y = ny; reroute(s, sym.id); draw();
  }
  function onPointerUp() {
    if (pan) { pan = null; return; }
    if (drag?.moved) {
      // One undo step for the whole drag: the state before it, then the move.
      const s = sch(); const after = JSON.stringify(s); const before = JSON.parse(drag.before);
      Object.assign(s, before);
      ctx.change('op.schematicMove', () => { Object.assign(sch(), JSON.parse(after)); });
      draw(); ctx.renderLeft();
    }
    drag = null;
  }
  function onKey(ev) {
    const e = editing(); if (!owns(e)) return;
    if (ev.target?.closest?.('input, textarea, select')) return;
    if (ev.key === 'Escape') { if (e.pending || e.tool !== 'select') { e.pending = null; e.tool = 'select'; draw(); ctx.renderLeft(); ev.preventDefault(); ev.stopPropagation(); } return; }
    if ((ev.key === 'f' || ev.key === 'F') && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { fitView(); ev.preventDefault(); ev.stopPropagation(); return; }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && e.sel) { deleteSelection(); ev.preventDefault(); ev.stopPropagation(); return; }
    if ((ev.key === 'r' || ev.key === 'R') && e.sel && !ev.ctrlKey && !ev.metaKey) { rotateSelection(); ev.preventDefault(); ev.stopPropagation(); }
  }

  /** The corner points of every wire on a symbol, routed again (after it moved or turned). */
  function reroute(s, symId) {
    for (const w of s.wires) if (w.a.sym === symId || w.b.sym === symId) { const a = pinAt(s, w.a); const b = pinAt(s, w.b); if (a && b) w.points = autoRoute(a, b); }
  }

  // ───────────────────────── editing

  function placeSymbol(kind, x, y) {
    let id = null;
    edit((s) => { id = ctx.newId('sym'); s.symbols.push({ id, kind, tag: nextTag(s, kind), x, y, rot: 0, ...(SYMBOLS[kind].variable ? { pins: 4 } : {}), ...(kind === 'supply' ? { value: '+24V' } : {}) }); });
    editing().sel = id; draw(); ctx.renderLeft();
    return id;
  }
  function addWire(a, b) {
    let id = null;
    edit((s) => { const A = pinAt(s, a); const B = pinAt(s, b); if (!A || !B) return; id = ctx.newId('wire'); s.wires.push({ id, a, b, points: autoRoute(A, B), number: '', color: '', gauge: '' }); });
    return id;
  }
  function deleteSelection() {
    const id = editing()?.sel; if (!id) return;
    edit((s) => { s.symbols = s.symbols.filter((x) => x.id !== id); s.wires = s.wires.filter((w) => w.id !== id && w.a.sym !== id && w.b.sym !== id); });
    editing().sel = null; draw(); ctx.renderLeft();
  }
  function rotateSelection() {
    const id = editing()?.sel;
    edit((s) => { const sym = s.symbols.find((x) => x.id === id); if (!sym) return; sym.rot = ((sym.rot ?? 0) + 90) % 360; reroute(s, id); });
  }

  // ───────────────────────── exports

  const base = () => ctx.fileSafe(sch()?.name ?? 'schematic');
  async function exportSvg() { if (!sch()) return undefined; return ctx.saveExport(`${base()}.svg`, 'svg', schematicSvg(sch(), { labels: { title: t('sch.title') } }), 'image/svg+xml'); }
  async function exportFromTo() { if (!sch()) return undefined; return ctx.saveExport(`${base()} - from-to.csv`, 'csv', fromToCsv(sch()), 'text/csv'); }
  async function exportBom() {
    if (!sch()) return undefined;
    const csv = ['Tag,Kind,Value,Pins', ...schematicBom(sch()).map((r) => [r.tag, t(`sch.kind.${r.kind}`), r.value, r.pins].map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(','))].join('\n') + '\n';
    return ctx.saveExport(`${base()} - parts.csv`, 'csv', csv, 'text/csv');
  }

  // ───────────────────────── PropertyManager

  function pm(e) {
    const { pmHead, pmGroup, pmButton, pmNum } = ctx.pm;
    const s = sch();
    const schRows = list().map((x) => `<div class="il-row ${x.id === e.sch ? 'active' : ''}"><button type="button" class="il-name" data-pm="sch.open:${escapeHtml(x.id)}">${icon('schematic', 'icon tiny')}<span>${escapeHtml(x.name)}</span></button><button type="button" class="icon-button" data-pm="sch.delete:${escapeHtml(x.id)}" title="${escapeHtml(t('il.delete'))}">${icon('trash', 'icon tiny')}</button></div>`).join('');
    const tool = (id, glyph, label) => `<button type="button" class="small-button ${e.tool === id ? 'primary' : ''}" data-pm="sch.tool:${id}" title="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span></button>`;
    const palette = KINDS.map((k) => tool(`place:${k}`, `sch_${k}`, t(`sch.kind.${k}`))).join('');
    let props = `<p class="pm-note">${escapeHtml(t('sch.pickHint'))}</p>`;
    const sym = s?.symbols.find((x) => x.id === e.sel); const wire = s?.wires.find((x) => x.id === e.sel);
    const text = (key, value, label) => `<label class="pm-field"><span class="pm-label">${escapeHtml(label)}</span><input type="text" class="pm-text" data-pm-field="${key}" value="${escapeHtml(value ?? '')}" spellcheck="false"/></label>`;
    if (sym) props = `<p class="pm-note">${escapeHtml(t(`sch.kind.${sym.kind}`))} · ${escapeHtml(symbolPins(sym).map((p) => p.id).join(', '))}</p>${text('schTag', sym.tag, t('sch.tag'))}${text('schValue', sym.value, t('sch.value'))}${SYMBOLS[sym.kind]?.variable ? pmNum('schPins', sym.pins ?? 4, t('sch.pins'), 'schematic') : ''}<div class="pm-row">${pmButton('sch.rotate', 'rotateComponent', t('sch.rotate'))}${pmButton('sch.delSel', 'trash', t('il.delete'))}</div>`;
    else if (wire) props = `${text('schWireNumber', wire.number, t('sch.wireNumber'))}${text('schWireColor', wire.color, t('sch.wireColor'))}${text('schWireGauge', wire.gauge, t('sch.wireGauge'))}<div class="pm-row">${pmButton('sch.delSel', 'trash', t('il.delete'))}</div>`;
    const issues = s ? checkSchematic(s) : [];
    const checks = issues.length ? `<ul class="mfg-results">${issues.slice(0, 12).map((i) => `<li class="error">${icon('warning', 'icon tiny')}<span>${escapeHtml(t(`sch.issue.${i.kind}`, i))}</span></li>`).join('')}</ul>` : `<p class="pm-note">${icon('check', 'icon tiny')} ${escapeHtml(t('sch.noIssues'))}</p>`;
    return [
      pmHead('schematic', t('cmd.schematic'), t('pm.help.schematic')),
      pmGroup('schematic', t('sch.sheets'), `<div class="il-list">${schRows}</div><div class="pm-row">${pmButton('sch.new', 'plus', t('sch.new'))}</div>${s ? text('schName', s.name, t('il.name')) : ''}`),
      pmGroup('schTools', t('sch.tools'), `<div class="pm-row">${tool('select', 'select', t('sch.select'))}${tool('wire', 'sch_wire', t('sch.wire'))}</div><div class="sch-palette">${palette}</div>${e.pending ? `<p class="pm-note">${escapeHtml(t('sch.wirePending'))}</p>` : ''}`),
      pmGroup('edit', t('il.selected'), props),
      pmGroup('schCheck', t('sch.check', { count: issues.length }), checks),
      pmGroup('schExport', t('il.export'), `<div class="pm-row">${pmButton('sch.svg', 'exportFile', 'SVG')}${pmButton('sch.fromto', 'inspCsv', t('sch.fromTo'))}${pmButton('sch.bom', 'inspCsv', t('sch.bom'))}</div>`),
    ].join('');
  }

  function field(key, raw) {
    const id = editing()?.sel; const v = String(raw ?? '').trim();
    const symOf = (s) => s.symbols.find((x) => x.id === id); const wireOf = (s) => s.wires.find((x) => x.id === id);
    switch (key) {
      case 'schName': if (v) edit((s) => { s.name = v; }); return undefined;
      case 'schTag': if (v) edit((s) => { const x = symOf(s); if (x) x.tag = v; }); return undefined;
      case 'schValue': edit((s) => { const x = symOf(s); if (x) x.value = v; }); return undefined;
      case 'schPins': { const n = Math.round(Number(raw)); if (n >= 1 && n <= 64) edit((s) => { const x = symOf(s); if (!x) return; x.pins = n; s.wires = s.wires.filter((w) => !((w.a.sym === id && Number(w.a.pin) > n) || (w.b.sym === id && Number(w.b.pin) > n))); reroute(s, id); }); return undefined; }
      case 'schWireNumber': edit((s) => { const x = wireOf(s); if (x) x.number = v; }); return undefined;
      case 'schWireColor': edit((s) => { const x = wireOf(s); if (x) x.color = v; }); return undefined;
      case 'schWireGauge': edit((s) => { const x = wireOf(s); if (x) x.gauge = v; }); return undefined;
      default: return undefined;
    }
  }

  const NAMES = new Set(['sch.open', 'sch.delete', 'sch.new', 'sch.tool', 'sch.rotate', 'sch.delSel', 'sch.svg', 'sch.fromto', 'sch.bom']);
  const handles = (name) => NAMES.has(name);
  async function command(name, arg) {
    const e = editing();
    switch (name) {
      case 'clear': return undefined;
      case 'sch.open': e.sch = arg; e.sel = null; e.pending = null; draw(); return ctx.renderLeft();
      case 'sch.delete': ctx.change('op.schematic', () => { const p = project(); p.schematics = (p.schematics ?? []).filter((x) => x.id !== arg); }); if (e.sch === arg) e.sch = list()[0]?.id ?? null; draw(); return ctx.renderLeft();
      case 'sch.new': newSchematic(); return undefined;
      case 'sch.tool': e.tool = arg; e.pending = null; draw(); return ctx.renderLeft();
      case 'sch.rotate': return rotateSelection();
      case 'sch.delSel': return deleteSelection();
      case 'sch.svg': return exportSvg();
      case 'sch.fromto': return exportFromTo();
      case 'sch.bom': return exportBom();
      default: return undefined;
    }
  }

  const commands = {
    schematic: { icon: 'schematic', label: 'cmd.schematic', enabled: () => Boolean(project()), checked: () => owns(editing()), run: () => (owns(editing()) ? finish() : begin()) },
    schFromTo: { icon: 'inspCsv', label: 'cmd.schFromTo', enabled: () => list().length > 0, run: () => { if (!owns(editing())) begin(); return exportFromTo(); } },
  };
  const api = { begin, newSchematic, placeSymbol, addWire, deleteSelection, rotateSelection, exportSvg, exportFromTo, exportBom, schematic: () => sch(), select: (id) => { editing().sel = id; draw(); ctx.renderLeft(); }, setTool: (tool) => command('sch.tool', tool), zoomAt, fitView, view: () => editing()?.view ?? null };
  /** After undo/redo: the sheet may be gone or its selection deleted; redraw from the restored project. */
  function afterHistory() {
    const e = editing(); if (!owns(e)) return;
    if (!list().some((x) => x.id === e.sch)) e.sch = list()[0]?.id ?? null;
    const s = sch();
    if (e.sel && !(s?.symbols.some((x) => x.id === e.sel) || s?.wires.some((x) => x.id === e.sel))) e.sel = null;
    e.pending = null; drag = null;
    draw(); ctx.renderLeft();
  }
  return { commands, owns, pm, pick: () => undefined, field, set: () => undefined, select: () => false, toggle: () => undefined, accept: () => finish(), handles, command, subject: () => t('cmd.schematic'), finish, cleanup: removeHost, afterHistory, api };
}
