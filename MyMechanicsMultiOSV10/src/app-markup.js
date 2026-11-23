// Markup (Tools › Markup): notes drawn over the graphics area of a part or assembly — pen, highlighter, line, arrow,
// rectangle, ellipse, revision cloud and text — saved in the document as named markups with the view they were
// drawn on, author, date, a review status and a comment thread; reopened (the camera goes back to that view), edited
// (select, move, erase, delete), and exported as a PNG picture or one HTML review document of all markups.
// The drawing data and SVG are in cad/markup.js; this file is the PropertyManager, the overlay and the pointer input.
import { escapeHtml } from './ui/dom.js';
import { icon } from './icons.js';
import { markupsOf, normaliseItem, createMarkup, addComment, simplifyStroke, hitItem, moveItem, markupSvg, markupReportHtml, COLOURS } from './cad/markup.js';

const TOOLS = [['view', 'mkView'], ['select', 'mkSelect'], ['pen', 'mkPen'], ['highlight', 'mkHighlight'], ['line', 'mkLine'], ['arrow', 'mkArrow'], ['rect', 'mkRect'], ['ellipse', 'mkEllipse'], ['cloud', 'mkCloud'], ['text', 'mkText'], ['erase', 'mkErase']];

export function createMarkupTools(ctx) {
  const { state, t } = ctx;
  const notify = (...a) => ctx.notify(...a);
  const editing = () => state.editing;
  const owns = (e) => e?.mode === 'markup';
  const docOf = () => ctx.activePart() ?? ctx.activeAssembly();
  const list = () => markupsOf(docOf()) ?? [];
  const selected = () => list().find((m) => m.id === editing()?.sel) ?? null;
  const edit = (label, mutate) => ctx.change(label, () => { const d = docOf(); if (d) mutate(markupsOf(d, { create: true }), d); });
  const patchSel = (label, mutate) => { const id = editing()?.sel; if (!id) return; edit(label, (ms) => { const m = ms.find((x) => x.id === id); if (m) mutate(m); }); draw(); };

  // ───────────────────────── overlay

  let svg = null, timer = null, drag = null, camKey = '', moved = false;
  const host = () => ctx.viewport()?.canvas?.parentElement ?? null;
  const size = () => { const h = host(); return h ? [Math.max(1, h.clientWidth), Math.max(1, h.clientHeight)] : [1000, 1000]; };
  const keyOf = (c) => (c ? JSON.stringify([c.target, c.dir, c.up, c.distance, c.ortho].flat().map((v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v))) : '');

  function ensureOverlay() {
    const h = host(); if (!h) return null;
    if (svg && svg.parentElement === h) return svg;
    svg?.remove();
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'mk-overlay');
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', () => { drag = null; draw(); });
    svg.addEventListener('dblclick', onDouble);
    svg.addEventListener('wheel', (ev) => { ev.preventDefault(); ctx.viewport()?.canvas.dispatchEvent(new WheelEvent('wheel', ev)); }, { passive: false });
    h.append(svg);
    window.addEventListener('keydown', onKey, true);
    timer = setInterval(watchCamera, 250);
    return svg;
  }
  function removeOverlay() {
    svg?.remove(); svg = null; drag = null;
    if (timer) clearInterval(timer); timer = null;
    window.removeEventListener('keydown', onKey, true);
  }

  /** The overlay hides the markup while the view is not the one it was drawn on (orbiting in the view tool). */
  function watchCamera() {
    const e = editing(); const m = selected();
    if (!owns(e)) { removeOverlay(); return; }
    const now = keyOf(ctx.viewport()?.cameraState());
    const was = moved;
    moved = Boolean(m?.items.length && m.camera && now !== camKey);
    if (moved !== was) { draw(); ctx.renderLeft(); }
  }

  function draw() {
    const e = editing(); if (!owns(e)) return;
    const el = ensureOverlay(); if (!el) return;
    const [w, h] = size();
    el.setAttribute('width', w); el.setAttribute('height', h); el.setAttribute('viewBox', `0 0 ${w} ${h}`);
    el.classList.toggle('mk-passive', e.tool === 'view');
    el.classList.toggle('mk-moved', moved);
    el.dataset.tool = e.tool;
    const m = selected();
    const shown = m ? { ...m, items: drag?.move ? m.items.map((x) => (x.id === drag.move ? moveItem(x, drag.dx, drag.dy) : x)).filter((x) => !drag?.erased?.has(x.id)) : m.items.filter((x) => !drag?.erased?.has(x.id)) } : { size: [w, h], items: [] };
    const draft = drag?.item ? normaliseItem({ ...drag.item, pts: drag.item.pts }) : null;
    if (draft) shown.items = [...shown.items, draft];
    el.innerHTML = moved ? '' : markupSvg(shown, w, h, { selected: e.item }).replace(/^<svg[^>]*>|<\/svg>$/g, '');
  }

  /** Shows a markup: its camera back, then the drawing over it. */
  function show(m) {
    const vp = ctx.viewport();
    if (m?.camera && vp) vp.setCameraState(m.camera);
    camKey = keyOf(vp?.cameraState());
    moved = false;
    draw();
  }

  const at = (ev) => { const r = svg.getBoundingClientRect(); return [(ev.clientX - r.left) / Math.max(1, r.width), (ev.clientY - r.top) / Math.max(1, r.height)]; };
  const aspect = () => { const [w, h] = size(); return w / h; };
  const refH = (m) => m?.size?.[1] ?? size()[1];

  /** The markup to draw into: the selected one, or a new one from the current view. */
  function target() {
    let m = selected();
    if (m && moved) { show(m); notify('info', t('mk.viewRestored')); }
    if (!m) { m = newMarkup({ quiet: true }); }
    return m;
  }

  function onDown(ev) {
    const e = editing(); if (!owns(e) || ev.button !== 0 || e.tool === 'view') return;
    ev.preventDefault(); ev.stopPropagation();
    try { svg.setPointerCapture(ev.pointerId); } catch { /* a synthetic pointer */ }
    const m = target(); if (!m) return;
    const p = at(ev);
    if (e.tool === 'select') {
      const hit = [...m.items].reverse().find((x) => hitItem(x, p, 0.012, aspect(), refH(m)));
      e.item = hit?.id ?? null;
      drag = hit ? { move: hit.id, from: p, dx: 0, dy: 0 } : null;
      draw(); ctx.renderLeft();
      return;
    }
    if (e.tool === 'erase') { drag = { erased: new Set() }; eraseAt(m, p); return; }
    if (e.tool === 'text') { addText(p); return; }
    const k = e.tool;
    drag = { item: { id: ctx.newId('mki'), kind: k, pts: [p, p], color: e.color, width: k === 'highlight' ? Math.max(12, e.width * 4) : e.width } };
    draw();
  }
  /** Erases what the eraser touches between its last position and p (sampled, so a fast drag skips nothing). */
  function eraseAt(m, p) {
    const a = drag.last ?? p; drag.last = p;
    const n = Math.max(1, Math.ceil(Math.hypot((p[0] - a[0]) * aspect(), p[1] - a[1]) / 0.005));
    for (let k = 0; k <= n; k++) {
      const q = [a[0] + ((p[0] - a[0]) * k) / n, a[1] + ((p[1] - a[1]) * k) / n];
      for (const x of m.items) if (!drag.erased.has(x.id) && hitItem(x, q, 0.012, aspect(), refH(m))) drag.erased.add(x.id);
    }
    draw();
  }
  function onMove(ev) {
    if (!drag) return;
    const p = at(ev); const m = selected();
    if (drag.move) { drag.dx = p[0] - drag.from[0]; drag.dy = p[1] - drag.from[1]; draw(); return; }
    if (drag.erased) { if (m) eraseAt(m, p); return; }
    const it = drag.item;
    if (it.kind === 'pen' || it.kind === 'highlight') { const last = it.pts.at(-1); if (Math.hypot((p[0] - last[0]) * aspect(), p[1] - last[1]) > 0.002) it.pts.push(p); }
    else it.pts = [it.pts[0], ev.shiftKey && (it.kind === 'line' || it.kind === 'arrow') ? snap45(it.pts[0], p) : p];
    draw();
  }
  function onUp() {
    const d = drag; drag = null;
    if (!d) return;
    if (d.move) {
      if (Math.abs(d.dx) + Math.abs(d.dy) > 1e-4) patchSel('op.markupEdit', (m) => { m.items = m.items.map((x) => (x.id === d.move ? moveItem(x, d.dx, d.dy) : x)); });
      else draw();
      return;
    }
    if (d.erased) { if (d.erased.size) patchSel('op.markupErase', (m) => { m.items = m.items.filter((x) => !d.erased.has(x.id)); if (d.erased.has(editing().item)) editing().item = null; }); else draw(); return; }
    const it = d.item;
    if (it.kind === 'pen' || it.kind === 'highlight') it.pts = simplifyStroke(it.pts, 0.0015);
    const [a, b] = [it.pts[0], it.pts.at(-1)];
    const tiny = it.pts.length < 2 || (it.kind !== 'pen' && it.kind !== 'highlight' && Math.hypot((b[0] - a[0]) * aspect(), b[1] - a[1]) < 0.004);
    if (tiny) { draw(); return; }
    addItem(it);
  }
  const snap45 = (a, p) => { const as = aspect(); const dx = (p[0] - a[0]) * as, dy = p[1] - a[1]; const L = Math.hypot(dx, dy); const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4); return [a[0] + (L * Math.cos(ang)) / as, a[1] + L * Math.sin(ang)]; };

  async function onDouble(ev) {
    const e = editing(); const m = selected(); if (!owns(e) || !m || e.tool !== 'select') return;
    const p = at(ev);
    const hit = [...m.items].reverse().find((x) => x.kind === 'text' && hitItem(x, p, 0.012, aspect(), refH(m)));
    if (!hit) return;
    const text = await ctx.askText(hit.text);
    if (text == null) return;
    if (!text.trim()) return deleteItem(hit.id);
    patchSel('op.markupEdit', (mm) => { const x = mm.items.find((y) => y.id === hit.id); if (x) x.text = text.slice(0, 2000); });
  }
  function onKey(ev) {
    const e = editing(); if (!owns(e) || !e.item) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); ev.stopPropagation(); deleteItem(e.item); }
  }

  // ───────────────────────── markups and items

  function newMarkup({ quiet = false } = {}) {
    const d = docOf(); const vp = ctx.viewport();
    if (!d || !vp) { notify('info', t('mk.needModel')); return null; }
    const n = list().length + 1;
    const id = ctx.newId('mk');
    const name = t('mk.defaultName', { n });
    edit('op.markupNew', (ms) => { ms.push(createMarkup({ id, name, author: ctx.author(), camera: vp.cameraState(), size: size() })); });
    if (owns(editing())) { editing().sel = id; editing().item = null; }
    show(selected());
    ctx.renderLeft();
    if (!quiet) notify('success', t('mk.created', { name }));
    return selected();
  }
  function addItem(raw) {
    const it = normaliseItem({ id: raw.id ?? ctx.newId('mki'), ...raw });
    if (!it) { draw(); return null; }
    const m = selected() ?? newMarkup({ quiet: true });
    if (!m) return null;
    // The first item of a markup fixes its view: the camera and the window size it is drawn on.
    const first = !m.items.length;
    const vp = ctx.viewport();
    patchSel('op.markupDraw', (mm) => { if (first && vp) { mm.camera = vp.cameraState(); mm.size = size(); } mm.items.push(it); });
    if (first) camKey = keyOf(vp?.cameraState());
    ctx.renderLeft();
    return it;
  }
  async function addText(p) {
    const e = editing();
    const text = await ctx.askText('');
    if (!text?.trim()) return null;
    return addItem({ kind: 'text', pts: [p], text, color: e.color, size: e.size, width: 1 });
  }
  function deleteItem(id) { patchSel('op.markupErase', (m) => { m.items = m.items.filter((x) => x.id !== id); }); if (editing()?.item === id) editing().item = null; ctx.renderLeft(); }
  function select(id) { const e = editing(); if (!owns(e)) begin(); editing().sel = id; editing().item = null; show(selected()); ctx.renderLeft(); }
  function deleteMarkup(id) {
    edit('op.markupDelete', (ms) => { const i = ms.findIndex((x) => x.id === id); if (i >= 0) ms.splice(i, 1); });
    const e = editing(); if (e?.sel === id) { e.sel = list()[0]?.id ?? null; e.item = null; if (selected()) show(selected()); else draw(); }
    ctx.renderLeft();
  }
  function comment() {
    const e = editing(); const m = selected();
    if (!m) { notify('info', t('mk.pickMarkup')); return null; }
    const text = String(e.comment ?? '').trim();
    if (!text) { notify('info', t('mk.emptyComment')); return null; }
    const id = ctx.newId('mkc');
    patchSel('op.markupComment', (mm) => { addComment(mm, { id, author: ctx.author(), text }); });
    e.comment = '';
    ctx.renderLeft();
    return id;
  }

  // ───────────────────────── exports

  /** A PNG of a markup: the view rendered at its camera (twice the window size) with the drawing on top. */
  async function pictureOf(m, scale = 2) {
    const vp = ctx.viewport(); if (!vp) return null;
    const keep = vp.cameraState();
    if (m.camera) vp.setCameraState(m.camera);
    const [w0, h0] = m.size ?? size();
    const k = Math.min(scale, 4096 / Math.max(w0, h0));
    const w = Math.round(w0 * k), h = Math.round(h0 * k);
    const canvas = vp.capture(w, h);
    vp.setCameraState(keep);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markupSvg(m, w, h))}`;
    try { await img.decode(); canvas.getContext('2d').drawImage(img, 0, 0, w, h); } catch { /* the picture without the drawing */ }
    return canvas;
  }
  async function exportPng() {
    const m = selected(); if (!m) { notify('info', t('mk.pickMarkup')); return undefined; }
    const canvas = await pictureOf(m);
    if (!canvas) return undefined;
    show(m);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return ctx.saveExport(`${ctx.fileSafe(`${docOf().name} - ${m.name}`)}.png`, 'png', blob, 'image/png');
  }
  async function exportReport() {
    const ms = list(); if (!ms.length) { notify('info', t('mk.none')); return undefined; }
    const entries = [];
    for (const m of ms) { const c = await pictureOf(m, 1); entries.push({ ...m, png: c?.toDataURL('image/png') ?? null }); }
    if (selected()) show(selected());
    const labels = { author: t('mk.author'), date: t('mk.date'), status: t('mk.status'), open: t('mk.status.open'), resolved: t('mk.status.resolved'), comments: t('mk.comments'), none: t('mk.noComments') };
    const html = markupReportHtml(`${docOf().name} — ${t('cmd.markup')}`, entries, labels);
    return ctx.saveExport(`${ctx.fileSafe(`${docOf().name} - ${t('cmd.markup')}`)}.html`, 'html', html, 'text/html');
  }

  // ───────────────────────── mode

  function begin() {
    if (!docOf()) { notify('info', t('mk.needModel')); return; }
    if (editing() && !owns(editing())) ctx.cancelEditing({ quiet: true });
    state.editing = { mode: 'markup', sel: list().at(-1)?.id ?? null, item: null, tool: 'pen', color: COLOURS[0], width: 3, size: 16, comment: '' };
    ctx.renderAll();
    if (selected()) show(selected()); else draw();
  }
  function finish() { removeOverlay(); ctx.cancelEditing({ quiet: true }); }

  /** After undo/redo: the markup or item may be gone; redraw from the restored document. */
  function afterHistory() {
    const e = editing(); if (!owns(e)) return;
    if (!list().some((x) => x.id === e.sel)) e.sel = list().at(-1)?.id ?? null;
    if (e.item && !selected()?.items.some((x) => x.id === e.item)) e.item = null;
    drag = null; draw(); ctx.renderLeft();
  }

  // ───────────────────────── PropertyManager

  const day = (d) => (d ? String(d).replace('T', ' ').slice(0, 16) : '');
  function pm(e) {
    const { pmHead, pmGroup, pmButton, pmNum, pmSeg } = ctx.pm;
    if (!docOf()) return pmHead('markup', t('cmd.markup'), t('mk.needModel'));
    const tools = `<div class="mk-tools">${TOOLS.map(([k, g]) => `<button type="button" class="icon-button mk-tool ${e.tool === k ? 'active' : ''}" data-pm="mk.tool:${k}" title="${escapeHtml(t(`mk.tool.${k}`))}" aria-pressed="${e.tool === k}">${icon(g)}</button>`).join('')}</div><p class="pm-note">${escapeHtml(t(`mk.toolHint.${e.tool}`))}</p>`;
    const colours = `<div class="mk-colours">${COLOURS.map((c) => `<button type="button" class="mk-colour ${e.color === c ? 'active' : ''}" data-pm="mk.color:${c}" style="--mk:${c}" title="${c}" aria-pressed="${e.color === c}"></button>`).join('')}</div>`;
    const style = `${colours}${pmNum('mkWidth', e.width, t('mk.width'), 'mkLine', 'px')}${pmNum('mkSize', e.size, t('mk.textSize'), 'mkText', 'px')}`;
    const rows = list().map((m) => `<div class="mk-row ${m.id === e.sel ? 'active' : ''}"><button type="button" class="mk-name" data-pm="mk.sel:${escapeHtml(m.id)}" title="${escapeHtml(t('mk.show'))}">${icon(m.status === 'resolved' ? 'check' : 'markup', 'icon tiny')}<span>${escapeHtml(m.name)}</span><small>${escapeHtml(`${m.items.length} · ${m.comments.length}`)}</small></button><button type="button" class="icon-button" data-pm="mk.delete:${escapeHtml(m.id)}" title="${escapeHtml(t('mk.delete'))}">${icon('trash', 'icon tiny')}</button></div>`).join('');
    const m = selected();
    const restore = moved && m ? `<p class="pm-note warn">${escapeHtml(t('mk.viewMoved'))}</p><div class="pm-row">${pmButton('mk.restore', 'mkView', t('mk.restore'), 'primary')}</div>` : '';
    const detail = m ? [
      `<label class="pm-field"><span class="pm-label">${escapeHtml(t('mk.name'))}</span><input type="text" class="pm-text" data-pm-field="mkName" value="${escapeHtml(m.name)}" spellcheck="false"/></label>`,
      `<p class="pm-note">${escapeHtml(`${t('mk.author')}: ${m.author || '—'} · ${day(m.date)}`)}</p>`,
      pmSeg('mkStatus', [['open', t('mk.status.open'), 'markup'], ['resolved', t('mk.status.resolved'), 'check']], m.status),
      restore,
      `<div class="pm-row">${pmButton('mk.deleteItem', 'trash', t('mk.deleteItem'), e.item ? '' : 'disabled')}${pmButton('mk.clear', 'eraser', t('mk.clear'))}</div>`,
    ].join('') : `<p class="pm-note">${escapeHtml(t('mk.drawToStart'))}</p>`;
    const comments = m ? `<ul class="mk-comments">${m.comments.map((c) => `<li><b>${escapeHtml(c.author || '—')}</b> <small>${escapeHtml(day(c.date))}</small><p>${escapeHtml(c.text)}</p></li>`).join('') || `<li class="muted">${escapeHtml(t('mk.noComments'))}</li>`}</ul><textarea class="pm-text mk-comment" data-pm-field="mkComment" rows="3" placeholder="${escapeHtml(t('mk.commentHint'))}">${escapeHtml(e.comment ?? '')}</textarea><div class="pm-row">${pmButton('mk.comment', 'mkComment', t('mk.addComment'), 'primary')}</div>` : '';
    return [
      pmHead('markup', t('cmd.markup'), t('pm.help.markup')),
      pmGroup('mkPen', t('mk.tools'), tools),
      pmGroup('appearance', t('mk.style'), style),
      pmGroup('markup', t('mk.markups'), `<div class="mk-list">${rows || `<p class="pm-note">${escapeHtml(t('mk.none'))}</p>`}</div><div class="pm-row">${pmButton('mk.new', 'plus', t('mk.new'), 'primary')}</div>`),
      pmGroup('edit', t('mk.selected'), detail),
      m ? pmGroup('mkComment', t('mk.comments'), comments) : '',
      pmGroup('exportFile', t('mk.export'), `<div class="pm-row">${pmButton('mk.png', 'exportImage', t('mk.exportPng'))}${pmButton('mk.report', 'exportFile', t('mk.exportReport'))}</div>`),
    ].join('');
  }

  function field(key, raw) {
    const e = editing();
    if (key === 'mkName') { const name = String(raw ?? '').trim(); if (name) patchSel('op.markupEdit', (m) => { m.name = name.slice(0, 120); }); ctx.renderLeft(); return true; }
    if (key === 'mkComment') { e.comment = String(raw ?? ''); return true; }
    if (key === 'mkWidth') { const v = Number(raw); if (v > 0) e.width = Math.min(40, Math.max(1, v)); ctx.renderLeft(); return true; }
    if (key === 'mkSize') { const v = Number(raw); if (v > 0) e.size = Math.min(96, Math.max(8, v)); ctx.renderLeft(); return true; }
    return false;
  }
  function set(key, value) {
    if (key === 'mkStatus') { patchSel('op.markupEdit', (m) => { m.status = value === 'resolved' ? 'resolved' : 'open'; }); ctx.renderLeft(); return true; }
    return false;
  }

  const NAMES = new Set(['mk.tool', 'mk.color', 'mk.sel', 'mk.delete', 'mk.new', 'mk.restore', 'mk.deleteItem', 'mk.clear', 'mk.comment', 'mk.png', 'mk.report']);
  const handles = (name) => NAMES.has(name);
  async function command(name, arg) {
    const e = editing();
    switch (name) {
      case 'mk.tool': if (TOOLS.some(([k]) => k === arg)) { e.tool = arg; if (arg !== 'select') e.item = null; draw(); ctx.renderLeft(); } return undefined;
      case 'mk.color': if (COLOURS.includes(arg)) { e.color = arg; if (e.item) patchSel('op.markupEdit', (m) => { const x = m.items.find((y) => y.id === e.item); if (x) x.color = arg; }); ctx.renderLeft(); } return undefined;
      case 'mk.sel': return select(arg);
      case 'mk.delete': return deleteMarkup(arg);
      case 'mk.new': return newMarkup();
      case 'mk.restore': show(selected()); return ctx.renderLeft();
      case 'mk.deleteItem': return e.item ? deleteItem(e.item) : undefined;
      case 'mk.clear': if (selected()?.items.length) { patchSel('op.markupErase', (m) => { m.items = []; }); e.item = null; ctx.renderLeft(); } return undefined;
      case 'mk.comment': return comment();
      case 'mk.png': return exportPng();
      case 'mk.report': return exportReport();
      default: return undefined;
    }
  }

  const enabled = () => Boolean(docOf());
  const commands = {
    markup: { icon: 'markup', label: 'cmd.markup', enabled, checked: () => owns(editing()), run: () => (owns(editing()) ? finish() : begin()) },
    markupReport: { icon: 'exportFile', label: 'cmd.markupReport', enabled: () => list().length > 0, run: () => exportReport() },
  };
  const api = { begin, newMarkup, addItem, select, list, selected, comment, exportPng, exportReport, pictureOf, overlay: () => svg, moved: () => moved, command };
  return { commands, owns, pm, pick: () => undefined, field, set, select: () => false, toggle: () => undefined, accept: () => finish(), handles, command, subject: () => t('cmd.markup'), finish, cleanup: removeOverlay, afterHistory, api };
}
