// The block-diagram editor: library browser, canvas (pan / zoom / rulers /
// 5×5 grid / snap), blocks and orthogonal lines with branches, dialogs,
// subsystems, scope windows and the simulation toolbar. The model lives in
// the engine; the editor keeps a local copy for instant editing and its own
// Undo / Redo stack, and posts the whole model after each edit (sim.edit).
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  newModel, makeBlock, uniqueName, reassignIds, systemAt, connections, detachBlock, connect, portGeometry, systemBounds,
  modelNameOfPath, clone, newSystem, normalizeModel,
} from '../../core/sim/model.js';
import { getModelExts } from '../lib/files';
import { LIBRARY, blockDef, portsOf } from '../../core/sim/blocks/index.js';
import {
  RULER, GRID_BASE, drawGrid, drawRulers, drawBlock, drawLines, lineGeometry, distToPolyline, routeOrtho, routeFromPoint,
  themeColors, toModel, handlePoints, rateColor,
} from './render';
import { LibraryPanel, DND_TYPE } from './LibraryPanel';
import { ScopeWindow } from './ScopeWindow';
import { BlockDialog, SettingsDialog, MaskEditor, SimDialog, DialogVisible } from './dialogs';
import { SimIcon } from './icons';
import { ModelCodePane } from './ModelCodePane';
import { tr, lbl } from './i18n';
import { Stepper } from '../views/common';
import { stepZoom, removeSeg, withModelExt as withExt } from './logic.js';

const withModelExt = (p) => withExt(p, getModelExts());
import { openMenu } from '../lib/menu';
import { usePopupWindows } from '../lib/popups';
import { publishSimEditor, withdrawSimEditor } from './editorApi';
import './sim.css';

const SCOPE_TYPES = new Set(['Scope', 'FloatingScope', 'XYGraph']);
const MAX_SCOPE_POINTS = 200000;
let clipboard = null; // { blocks, lines } shared by all editors
let reqSeq = 0;

const VIEW_KEY = 'sim.view';
function loadToggles() {
  const d = { grid: true, snap: true, rulers: true, rates: false, library: true };
  try { return { ...d, ...(JSON.parse(localStorage.getItem(VIEW_KEY) || '{}')) }; } catch { return d; }
}
const snapTo = (v, on) => (on ? Math.round(v / GRID_BASE) * GRID_BASE : v);
const isTyping = (el) => !!(el && el.closest && el.closest('input, textarea, select, [contenteditable="true"], .sim-dialog'));

function fmtTime(t) {
  if (!Number.isFinite(t)) return '—';
  return Math.abs(t) >= 1e4 ? t.toExponential(3) : t.toFixed(Math.abs(t) < 10 ? 3 : 2);
}

// externalLibrary: the app shows the block library in its left side panel (the column here is hidden);
// onLibrary: the toolbar's 라이브러리 button then asks the app to show that panel.
export function ModelEditor({ engine, path, modelName, docId, defaults, lang = 'ko', active = true, onDirty, onTitle, onSaveAs, onPath, onNew, onOpen, externalLibrary = false, onLibrary, onOpenScript }) {
  const L = (k, v) => tr(lang, k, v);
  const rootRef = useRef(null);
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const coordRef = useRef(null);
  const modelRef = useRef(null);
  if (!modelRef.current) modelRef.current = newModel(modelName || modelNameOfPath(path || 'untitled'));
  const nameRef = useRef(modelRef.current.name);
  const pathRef = useRef(path || '');
  const [rev, setRev] = useState(0);
  const bump = useCallback(() => setRev((r) => r + 1), []);
  const [crumbs, setCrumbs] = useState([]);
  const [sel, setSel] = useState(() => new Set());
  const selSeg = useRef(null);
  const view = useRef({ zoom: 1, px: 80, py: 70, width: 800, height: 600 });
  const [zoomPct, setZoomPct] = useState(100);
  const [toggles, setToggles] = useState(loadToggles);
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const [dirty, setDirtyState] = useState(false);
  const [status, setStatus] = useState({ state: 'idle', time: 0, progress: 0 });
  const compiled = useRef(null);
  const values = useRef({ values: {}, displays: {} });
  const scopeStore = useRef(new Map());
  const [scopeTick, setScopeTick] = useState(0);
  const [openScopes, setOpenScopes] = useState([]);
  const [diags, setDiags] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null);
  const [tip, setTip] = useState(null);
  const [errorBlocks, setErrorBlocks] = useState(() => new Set());
  const mode = useRef(null);
  const cursor = useRef(null);
  const space = useRef(false);
  const hot = useRef(null); // { id, corner } of the resize handle under the pointer
  const geoRef = useRef([]);
  const drawPending = useRef(false);
  const scopePending = useRef(false);
  const openReq = useRef(null);
  const colors = useRef(null);

  const model = modelRef.current;
  const sys = () => systemAt(modelRef.current, crumbs) || modelRef.current.root;
  const byIdOf = (s) => new Map(s.blocks.map((b) => [b.id, b]));

  useEffect(() => { try { localStorage.setItem(VIEW_KEY, JSON.stringify(toggles)); } catch { /* storage blocked */ } }, [toggles]);

  // ---------------------------------------------------------------- engine link
  const post = useCallback((msg) => { if (engine && engine.post) engine.post(msg); }, [engine]);
  const setDirty = useCallback((d) => { setDirtyState(d); if (onDirty) onDirty(d); }, [onDirty]);
  const sendModel = useCallback(() => post({ type: 'sim.edit', name: nameRef.current, model: modelRef.current }), [post]);

  const handlers = useRef({});
  handlers.current = {
    model(msg) {
      if (msg.reqId && openReq.current && msg.reqId === openReq.current) {
        openReq.current = null;
        modelRef.current = normalizeModel(msg.model, msg.name);
        nameRef.current = msg.name;
        if (msg.path) pathRef.current = msg.path;
        const fresh = !path && !modelName && !msg.path && !modelRef.current.root.blocks.length && modelRef.current.settings;
        if (fresh && defaults) {
          if (defaults.solver) modelRef.current.settings.solver = String(defaults.solver);
          if (defaults.stopTime != null && defaults.stopTime !== '') modelRef.current.settings.stopTime = String(defaults.stopTime);
          post({ type: 'sim.edit', name: msg.name, model: modelRef.current });
        }
        undoStack.current = []; redoStack.current = [];
        setCrumbs([]); setSel(new Set());
        if (onTitle) onTitle(msg.name);
        // A model built by M code (new_system + add_block …) that was never saved has content but no
        // file: it counts as changed, so closing or quitting asks to save it.
        const r = modelRef.current.root || {};
        setDirty(!msg.path && ((r.blocks || []).length > 0 || (r.lines || []).length > 0));
        bump();
        requestAnimationFrame(() => fitRef.current());
        return;
      }
      if (msg.name !== nameRef.current || msg.reason === 'open') return;
      undoStack.current.push(JSON.stringify(modelRef.current));
      redoStack.current = [];
      modelRef.current = normalizeModel(msg.model, msg.name);
      if (!systemAt(modelRef.current, crumbs)) setCrumbs([]);
      setDirty(true);
      bump();
    },
    saved(msg) {
      const waiter = saveWaiters.current.get(msg.reqId);
      if (waiter) { saveWaiters.current.delete(msg.reqId); waiter(!!msg.ok); }
      if (msg.reqId !== handlersSaveReq.current) return;
      if (!msg.ok) { setDiags((d) => [...d, { level: 'error', message: L('saveFailed', { error: msg.error || '' }) }]); return; }
      if (msg.name && msg.name !== nameRef.current) { nameRef.current = msg.name; modelRef.current.name = msg.name; }
      pathRef.current = msg.path;
      if (onTitle) onTitle(nameRef.current);
      setDirty(false);
      setDiags((d) => [...d.filter((x) => x.level !== 'save'), { level: 'save', message: L('saved', { path: msg.path }) }]);
      bump();
    },
    status(msg) {
      if (msg.name !== nameRef.current) return;
      setStatus((s) => {
        if (msg.state === 'running' && s.state !== 'running' && s.state !== 'paused') autoOpenScopes();
        return { ...s, ...msg };
      });
      if (msg.state === 'compiling') setErrorBlocks(new Set());
    },
    scope(msg) {
      if (msg.name !== nameRef.current) return;
      let st = scopeStore.current.get(msg.block);
      if (!st || msg.reset) { st = { t: [], series: [] }; scopeStore.current.set(msg.block, st); }
      const t = msg.t || [];
      for (const x of t) st.t.push(x);
      for (const s of msg.series || []) {
        let dst = st.series[s.port - 1];
        if (!dst || dst.width !== s.width) { dst = { port: s.port, width: s.width, data: [] }; st.series[s.port - 1] = dst; }
        const d = s.data || [];
        for (let k = 0; k < d.length; k++) dst.data.push(d[k]);
      }
      if (st.t.length > MAX_SCOPE_POINTS) {
        const drop = st.t.length - MAX_SCOPE_POINTS;
        st.t.splice(0, drop);
        for (const s of st.series) if (s) s.data.splice(0, drop * s.width);
      }
      if (!scopePending.current) { scopePending.current = true; requestAnimationFrame(() => { scopePending.current = false; setScopeTick((n) => n + 1); }); }
    },
    values(msg) { if (msg.name !== nameRef.current) return; values.current = { values: msg.values || {}, displays: msg.displays || {} }; requestDraw(); },
    compiled(msg) {
      if (msg.name !== nameRef.current) return;
      compiled.current = msg;
      if (!msg.ok && msg.error) setDiags((d) => [...d, { level: 'error', message: msg.error, block: msg.block }]);
      requestDraw();
    },
    diagnostic(msg) {
      if (msg.name && msg.name !== nameRef.current) return;
      setDiags((d) => [...d.slice(-49), msg]);
      if (msg.level === 'error' && msg.block) setErrorBlocks((s) => new Set([...s, msg.block]));
    },
  };

  useEffect(() => {
    if (!engine || !engine.on) return undefined;
    const offs = [
      engine.on('sim.model', (m) => handlers.current.model(m)),
      engine.on('sim.saved', (m) => handlers.current.saved(m)),
      engine.on('sim.status', (m) => handlers.current.status(m)),
      engine.on('sim.scope', (m) => handlers.current.scope(m)),
      engine.on('sim.values', (m) => handlers.current.values(m)),
      engine.on('sim.compiled', (m) => handlers.current.compiled(m)),
      engine.on('sim.diagnostic', (m) => handlers.current.diagnostic(m)),
    ];
    return () => offs.forEach((f) => typeof f === 'function' && f());
  }, [engine]);
  // Load the model: a file / loaded model for a path, else a new untitled one (unique name).
  // A path that this editor just saved to (Save As renames the tab) is not loaded again.
  const opened = useRef(false);
  useEffect(() => {
    if (!engine || !engine.post) return;
    if (opened.current && (path || '') === (pathRef.current || '')) return; // StrictMode re-run, or our own Save As
    opened.current = true;
    openReq.current = `open${++reqSeq}`;
    if (path) engine.post({ type: 'sim.open', reqId: openReq.current, path, name: modelNameOfPath(path) });
    else if (modelName) engine.post({ type: 'sim.open', reqId: openReq.current, name: modelName }); // a model made by M code (open_system)
    else engine.post({ type: 'sim.new', reqId: openReq.current });
  }, [engine, path]);

  useEffect(() => { if (onTitle) onTitle(nameRef.current); }, []);

  // ---------------------------------------------------------------- edits and history
  const commit = useCallback((before) => {
    undoStack.current.push(before);
    if (undoStack.current.length > 200) undoStack.current.shift();
    redoStack.current = [];
    setDirty(true);
    sendModel();
    bump();
  }, [sendModel, setDirty, bump]);
  const change = (fn) => {
    const before = JSON.stringify(modelRef.current);
    const r = fn(modelRef.current, sys());
    if (r === false) return;
    commit(before);
  };
  const undo = () => {
    const s = undoStack.current.pop(); if (!s) return;
    redoStack.current.push(JSON.stringify(modelRef.current));
    modelRef.current = JSON.parse(s);
    if (!systemAt(modelRef.current, crumbs)) setCrumbs([]);
    setSel(new Set()); setDirty(true); sendModel(); bump();
  };
  const redo = () => {
    const s = redoStack.current.pop(); if (!s) return;
    undoStack.current.push(JSON.stringify(modelRef.current));
    modelRef.current = JSON.parse(s);
    if (!systemAt(modelRef.current, crumbs)) setCrumbs([]);
    setSel(new Set()); setDirty(true); sendModel(); bump();
  };

  // ---------------------------------------------------------------- drawing
  const requestDraw = useCallback(() => {
    if (drawPending.current) return;
    drawPending.current = true;
    requestAnimationFrame(() => { drawPending.current = false; draw(); });
  }, []);
  const drawRef = useRef(null);
  function draw() { if (drawRef.current) drawRef.current(); }
  drawRef.current = () => {
    const c = canvasRef.current; if (!c) return;
    const v = view.current;
    const dpr = window.devicePixelRatio || 1;
    const ctx = c.getContext('2d');
    if (!colors.current || colors.current._el !== rootRef.current) { colors.current = themeColors(rootRef.current); colors.current._el = rootRef.current; }
    const col = colors.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = col.canvas;
    ctx.fillRect(0, 0, v.width, v.height);
    if (toggles.grid) drawGrid(ctx, v, col);
    const s = sys();
    const byId = byIdOf(s);
    const m = mode.current;
    const extra = [];
    if (m && (m.kind === 'line' || m.kind === 'branch') && m.pts) extra.push({ line: { id: '__temp', src: { block: '' }, name: '' }, pts: m.pts, dst: m.target || { port: 0 }, depth: 1, temp: true });
    const geo = lineGeometry(s, byId);
    geoRef.current = geo;
    ctx.setTransform(dpr * v.zoom, 0, 0, dpr * v.zoom, dpr * v.px, dpr * v.py);
    const rates = toggles.rates && compiled.current && compiled.current.blocks ? new Map(Object.entries(compiled.current.blocks).map(([id, b]) => [id, b.rate])) : null;
    const wide = new Set();
    if (compiled.current && compiled.current.ports) for (const [k, p] of Object.entries(compiled.current.ports)) if (p && p.width > 1) wide.add(k);
    drawLines(ctx, [...geo, ...extra], { colors: col, selected: sel, rates, wide });
    for (const b of s.blocks) {
      drawBlock(ctx, b, { colors: col, selected: sel.has(b.id), zoom: v.zoom, rate: rates ? rates.get(b.id) : null, values: values.current.displays[b.id], error: errorBlocks.has(b.id), hotHandle: hot.current && hot.current.id === b.id ? hot.current.corner : -1 });
    }
    for (const n of s.notes || []) { ctx.fillStyle = col.muted; ctx.font = '12px "Segoe UI", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; String(n.text || '').split('\n').forEach((l, i) => ctx.fillText(l, n.x, n.y + i * 15)); }
    if (m && m.target && m.targetPt) {
      ctx.strokeStyle = col.accent; ctx.lineWidth = 2 / v.zoom;
      ctx.beginPath(); ctx.arc(m.targetPt.x, m.targetPt.y, 6 / v.zoom, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (m && m.kind === 'rubber' && m.cur) {
      const a = m.startScreen, b = m.cur;
      ctx.fillStyle = 'rgba(76,201,240,0.10)'; ctx.strokeStyle = col.accent; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      ctx.strokeRect(Math.min(a.x, b.x) + 0.5, Math.min(a.y, b.y) + 0.5, Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      ctx.setLineDash([]);
    }
    if (toggles.rulers) drawRulers(ctx, v, col, cursor.current);
  };
  useLayoutEffect(() => {
    draw();
    // read-only hook for automated GUI checks (screen ↔ model coordinates, current system)
    if (rootRef.current) rootRef.current.__sim = { view: view.current, model: modelRef.current, system: sys(), crumbs, scopes: scopeStore.current, values: values.current, status, sel: [...sel], undo: undoStack.current.length, redo: redoStack.current.length, dirty, geom: portGeometry };
    // the app's side panels (editorApi.js): read the model, act through change()
    publishSimEditor(docId, {
      docId, name: nameRef.current, model: modelRef.current, crumbs, selected: [...sel], status, running: status.state === 'running' || status.state === 'paused',
      addItem: (item) => addItem(item),
      openPath: (ids) => { if (systemAt(modelRef.current, ids)) { setCrumbs(ids); setSel(new Set()); } },
      select: (ids) => setSel(new Set(ids)),
      setBlock: (id, { params, name }) => change((mm, s) => {
        const b = s.blocks.find((x) => x.id === id); if (!b) return false;
        const want = name == null ? b.name : String(name).trim() || b.name;
        const nm = want !== b.name && s.blocks.some((x) => x !== b && x.name === want) ? uniqueName(s, want) : want;
        const ps = params || b.params;
        if (nm === b.name && JSON.stringify(ps) === JSON.stringify(b.params)) return false;
        b.params = ps; b.name = nm;
      }),
      setStyle: (ids, patch) => change((mm, s) => {
        const want = new Set(ids);
        let n = 0;
        const put = (o, k, v) => { if (v === undefined) return; if (v == null || v === '') { if (k in o) { delete o[k]; n++; } } else if (o[k] !== v) { o[k] = v; n++; } };
        for (const b of s.blocks) if (want.has(b.id)) { put(b, 'fg', patch.fg); put(b, 'bg', patch.bg); }
        for (const l of s.lines) if (want.has(l.id)) put(l, 'color', patch.color);
        if (!n) return false;
      }),
      tune: (id, params) => post({ type: 'sim.tune', name: nameRef.current, block: id, params }),
      setSettings: (patch) => change((mm) => { const next = { ...mm.settings, ...patch }; if (JSON.stringify(next) === JSON.stringify(mm.settings)) return false; mm.settings = next; }),
      openSettings: () => setDialog({ kind: 'settings' }),
      openBlock: (id) => { const b = sys().blocks.find((x) => x.id === id); if (b) setDialog({ kind: 'block', id }); },
    });
  });
  useEffect(() => () => withdrawSimEditor(docId), [docId]);

  // canvas size
  useEffect(() => {
    const wrap = wrapRef.current, c = canvasRef.current;
    if (!wrap || !c) return undefined;
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      view.current.width = Math.max(10, r.width); view.current.height = Math.max(10, r.height);
      c.width = Math.round(view.current.width * dpr); c.height = Math.round(view.current.height * dpr);
      c.style.width = `${view.current.width}px`; c.style.height = `${view.current.height}px`;
      // a fit asked for while the tab was hidden (no size yet) happens once it is shown
      if (needFit.current && r.width >= 120 && r.height >= 80) { needFit.current = false; fitRef.current(); return; }
      draw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);
  // theme changes
  useEffect(() => {
    const mo = new MutationObserver(() => { colors.current = null; requestDraw(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });
    return () => mo.disconnect();
  }, []);

  // ---------------------------------------------------------------- view
  const setZoom = (z, sx, sy) => {
    const v = view.current;
    z = Math.max(0.1, Math.min(8, z));
    if (sx == null) { sx = v.width / 2; sy = v.height / 2; }
    const m = toModel(v, sx, sy);
    v.zoom = z; v.px = sx - m.x * z; v.py = sy - m.y * z;
    setZoomPct(Math.round(z * 100));
    requestDraw();
  };
  const needFit = useRef(false);
  const fitRef = useRef(null);
  const fitView = () => {
    const v = view.current;
    if (v.width < 120 || v.height < 80 || !wrapRef.current || !wrapRef.current.offsetWidth) { needFit.current = true; return; }
    const b = systemBounds(sys());
    const inset = toggles.rulers ? RULER : 0;
    if (!b) { v.zoom = 1; v.px = inset + 40; v.py = inset + 40; setZoomPct(100); requestDraw(); return; }
    const W = v.width - inset - 60, H = v.height - inset - 60;
    const z = Math.max(0.1, Math.min(2, W / Math.max(b.w, 1), H / Math.max(b.h, 1)));
    v.zoom = z;
    v.px = inset + 30 + (W - b.w * z) / 2 - b.x * z;
    v.py = inset + 30 + (H - b.h * z) / 2 - b.y * z;
    setZoomPct(Math.round(z * 100));
    requestDraw();
  };
  fitRef.current = fitView;
  useEffect(() => { requestAnimationFrame(() => fitRef.current()); }, [crumbs.join('/')]);

  // ---------------------------------------------------------------- hit testing
  const hit = (mx, my) => {
    const s = sys();
    const z = view.current.zoom;
    const tol = 6 / z;
    for (const id of sel) {
      const b = s.blocks.find((x) => x.id === id);
      if (!b) continue;
      const hp = handlePoints(b);
      for (let k = 0; k < 4; k++) if (Math.abs(mx - hp[k][0]) < tol && Math.abs(my - hp[k][1]) < tol) return { kind: 'handle', block: b, corner: k };
    }
    for (let i = s.blocks.length - 1; i >= 0; i--) {
      const b = s.blocks[i];
      const g = portGeometry(b);
      // inside the block the port zone shrinks so thin blocks (Mux, bus bars) can still be grabbed
      const inside = mx > b.x && mx < b.x + b.w && my > b.y && my < b.y + b.h;
      const r = inside ? Math.min(tol * 1.4, 0.3 * Math.min(b.w, b.h)) : tol * 1.4;
      for (const p of g.out) if (Math.hypot(mx - p.x, my - p.y) < r) return { kind: 'out', block: b, port: p.port, pt: p };
      for (const p of [...g.in, ...g.special]) if (Math.hypot(mx - p.x, my - p.y) < r) return { kind: 'in', block: b, port: p.port, pt: p };
    }
    for (let i = s.blocks.length - 1; i >= 0; i--) {
      const b = s.blocks[i];
      if (mx >= b.x - 2 && mx <= b.x + b.w + 2 && my >= b.y - 2 && my <= b.y + b.h + 2) return { kind: 'block', block: b };
    }
    let best = null;
    for (const it of geoRef.current) {
      const r = distToPolyline(it.pts, mx, my);
      if (r.d < tol && (!best || r.d < best.d)) best = { kind: 'line', item: it, d: r.d, at: r.at, idx: r.idx };
    }
    if (best) return best;
    return { kind: 'none' };
  };
  const findPortTarget = (mx, my, wantKind) => {
    const s = sys();
    const tol = 10 / view.current.zoom;
    for (let i = s.blocks.length - 1; i >= 0; i--) {
      const b = s.blocks[i];
      const g = portGeometry(b);
      const list = wantKind === 'in' ? [...g.in, ...g.special] : g.out;
      for (const p of list) if (Math.hypot(mx - p.x, my - p.y) < tol) return { block: b, port: p.port, pt: p };
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        // dropping on a block: its first free input
        if (wantKind === 'in') {
          const used = new Set(connections(s).filter((c) => c.dst.block === b.id).map((c) => c.dst.port));
          const free = g.in.find((p) => !used.has(p.port));
          if (free) return { block: b, port: free.port, pt: free };
        } else if (g.out[0]) return { block: b, port: g.out[0].port, pt: g.out[0] };
      }
    }
    return null;
  };

  // ---------------------------------------------------------------- pointer
  // The pointer shows what a drag would do: resize on a handle, move on a block, draw a line on
  // a port, pan (grab) with Space or Ctrl held on empty canvas. Set on the canvas directly, so
  // moving the pointer does not re-render the editor.
  const HANDLE_CURSOR = ['nwse-resize', 'nesw-resize', 'nesw-resize', 'nwse-resize']; // handlePoints: TL, TR, BL, BR
  const cursorFor = (h, ctrl) => {
    if (space.current) return 'grab'; // Space + drag pans anywhere
    if (h.kind === 'handle') return HANDLE_CURSOR[h.corner];
    if (h.kind === 'out') return 'crosshair';
    if (h.kind === 'in') return connections(sys()).some((c) => c.dst.block === h.block.id && c.dst.port === h.port) ? 'move' : 'crosshair';
    if (h.kind === 'block') return 'move';
    if (h.kind === 'line') return 'pointer';
    return ctrl ? 'grab' : 'default'; // Ctrl + drag on empty canvas pans
  };
  const setCanvasCursor = (c) => { const el = canvasRef.current; if (el && el.style.cursor !== c) el.style.cursor = c; };
  const setHot = (h) => {
    const n = h && h.kind === 'handle' ? { id: h.block.id, corner: h.corner } : null;
    const o = hot.current;
    if ((o && o.id) !== (n && n.id) || (o && o.corner) !== (n && n.corner)) { hot.current = n; requestDraw(); }
  };
  const ctrlDown = useRef(false);
  const refreshCursor = () => {
    if (mode.current) return;
    const m = cursor.current;
    const panKey = space.current || ctrlDown.current;
    if (!m) { setCanvasCursor(panKey ? 'grab' : 'default'); return; }
    const h = hit(m.x, m.y);
    setHot(h);
    setCanvasCursor(cursorFor(h, ctrlDown.current));
  };
  const screenOf = (e) => { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const onPointerDown = (e) => {
    rootRef.current && rootRef.current.focus({ preventScroll: true });
    setMenu(null); setTip(null);
    const sp = screenOf(e);
    const m = toModel(view.current, sp.x, sp.y);
    canvasRef.current.setPointerCapture(e.pointerId);
    if (e.button === 1 || (e.button === 0 && space.current)) { e.preventDefault(); mode.current = { kind: 'pan', last: sp }; setCanvasCursor('grabbing'); return; }
    if (e.button === 2) return;
    if (e.button !== 0) return;
    const h = hit(m.x, m.y);
    const s = sys();
    // Ctrl + drag on empty canvas moves the view (Shift + drag still adds to the selection).
    if ((e.ctrlKey || e.metaKey) && h.kind === 'none') { e.preventDefault(); mode.current = { kind: 'pan', last: sp }; setCanvasCursor('grabbing'); return; }
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    if (h.kind === 'handle') {
      mode.current = { kind: 'resize', block: h.block, corner: h.corner, orig: { x: h.block.x, y: h.block.y, w: h.block.w, h: h.block.h }, start: m, before: JSON.stringify(modelRef.current) };
      return;
    }
    if (h.kind === 'out') { mode.current = { kind: 'line', from: { block: h.block.id, port: h.port }, fromPt: h.pt, start: m }; return; }
    if (h.kind === 'in') {
      const used = connections(s).some((c) => c.dst.block === h.block.id && c.dst.port === h.port);
      if (!used) { mode.current = { kind: 'line', to: { block: h.block.id, port: h.port }, toPt: h.pt, start: m }; return; }
    }
    if (h.kind === 'block' || h.kind === 'in') {
      const b = h.block;
      let ns = new Set(sel);
      if (additive) { if (ns.has(b.id)) ns.delete(b.id); else ns.add(b.id); }
      else if (!ns.has(b.id)) ns = new Set([b.id]);
      selSeg.current = null;
      setSel(ns);
      const moving = s.blocks.filter((x) => ns.has(x.id));
      mode.current = { kind: 'move', start: m, orig: new Map(moving.map((x) => [x.id, { x: x.x, y: x.y }])), primary: b, before: JSON.stringify(modelRef.current), moved: false, lineOrig: lineSnapshot(s, ns) };
      return;
    }
    if (h.kind === 'line') {
      const id = h.item.line.id;
      if (additive) { const ns = new Set(sel); if (ns.has(id)) ns.delete(id); else ns.add(id); setSel(ns); }
      else setSel(new Set([id]));
      selSeg.current = h.item.seg;
      mode.current = { kind: 'linepress', item: h.item, at: h.at, idx: h.idx, start: m, startScreen: sp };
      return;
    }
    if (!additive) { setSel(new Set()); selSeg.current = null; }
    mode.current = { kind: 'rubber', startScreen: sp, start: m, cur: sp, additive, base: new Set(additive ? sel : []) };
  };

  // explicit line points of lines whose ends all move with the selection
  function lineSnapshot(s, ids) {
    const out = [];
    for (const l of s.lines) {
      const ends = [l.src.block]; const rec = (g) => { if (g.dst) ends.push(g.dst.block); (g.branches || []).forEach(rec); }; rec(l);
      if (!ends.every((b) => ids.has(b))) continue;
      const segs = []; const rr = (g) => { segs.push({ g, pts: (g.points || []).map((p) => [...p]) }); (g.branches || []).forEach(rr); }; rr(l);
      out.push(...segs);
    }
    return out;
  }

  const onPointerMove = (e) => {
    const sp = screenOf(e);
    const v = view.current;
    const m = toModel(v, sp.x, sp.y);
    cursor.current = m;
    if (coordRef.current) coordRef.current.textContent = `x ${Math.round(m.x)}, y ${Math.round(m.y)}`;
    const md = mode.current;
    if (!md) {
      if (toggles.rulers) requestDraw();
      ctrlDown.current = e.ctrlKey || e.metaKey;
      { const h0 = hit(m.x, m.y); setHot(h0); setCanvasCursor(cursorFor(h0, ctrlDown.current)); }
      // hover value tooltip on lines
      const h = hit(m.x, m.y);
      if (h.kind === 'line') {
        const key = `${h.item.line.src.block}:${h.item.line.src.port}`;
        const val = values.current.values[key];
        const w = compiled.current && compiled.current.ports && compiled.current.ports[key];
        const name = h.item.line.name;
        if (val || name || w) setTip({ x: sp.x + 14, y: sp.y + 12, text: `${name ? `${name}: ` : ''}${val ? `[${val.slice(0, 8).map((x) => Number(x.toPrecision(5))).join(', ')}${val.length > 8 ? ', …' : ''}]` : ''}${w ? `  (${w.width})` : ''}` });
        else setTip(null);
      } else if (tip) setTip(null);
      return;
    }
    if (md.kind === 'pan') { v.px += sp.x - md.last.x; v.py += sp.y - md.last.y; md.last = sp; requestDraw(); return; }
    if (md.kind === 'move') {
      let dx = m.x - md.start.x, dy = m.y - md.start.y;
      if (!md.moved && Math.hypot(dx, dy) * v.zoom < 3) return;
      md.moved = true;
      const o = md.orig.get(md.primary.id);
      if (toggles.snap && o) { dx = snapTo(o.x + dx, true) - o.x; dy = snapTo(o.y + dy, true) - o.y; }
      for (const b of sys().blocks) { const p = md.orig.get(b.id); if (p) { b.x = p.x + dx; b.y = p.y + dy; } }
      for (const s of md.lineOrig) s.g.points = s.pts.map((p) => [p[0] + dx, p[1] + dy]);
      requestDraw();
      return;
    }
    if (md.kind === 'resize') {
      const b = md.block, o = md.orig;
      const dx = m.x - md.start.x, dy = m.y - md.start.y;
      let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
      if (md.corner === 0 || md.corner === 2) x0 += dx; else x1 += dx;
      if (md.corner === 0 || md.corner === 1) y0 += dy; else y1 += dy;
      x0 = snapTo(x0, toggles.snap); y0 = snapTo(y0, toggles.snap); x1 = snapTo(x1, toggles.snap); y1 = snapTo(y1, toggles.snap);
      b.x = Math.min(x0, x1 - 10); b.y = Math.min(y0, y1 - 10); b.w = Math.max(10, x1 - b.x); b.h = Math.max(10, y1 - b.y);
      requestDraw();
      return;
    }
    if (md.kind === 'line') {
      if (md.from) {
        const t = findPortTarget(m.x, m.y, 'in');
        md.target = t ? { block: t.block.id, port: t.port } : null; md.targetPt = t ? t.pt : null;
        md.pts = t ? routeOrtho(md.fromPt, md.fromPt.dir, t.pt, t.pt.dir) : routeOrtho(md.fromPt, md.fromPt.dir, m, m.x >= md.fromPt.x ? 'left' : 'right');
      } else {
        const t = findPortTarget(m.x, m.y, 'out');
        md.target = t ? { block: t.block.id, port: t.port } : null; md.targetPt = t ? t.pt : null;
        md.pts = t ? routeOrtho(t.pt, t.pt.dir, md.toPt, md.toPt.dir) : routeOrtho(m, m.x <= md.toPt.x ? 'right' : 'left', md.toPt, md.toPt.dir);
      }
      requestDraw();
      return;
    }
    if (md.kind === 'linepress') {
      if (Math.hypot(sp.x - md.startScreen.x, sp.y - md.startScreen.y) < 5) return;
      md.kind = 'branch';
    }
    if (md.kind === 'branch') {
      const t = findPortTarget(m.x, m.y, 'in');
      md.target = t ? { block: t.block.id, port: t.port } : null; md.targetPt = t ? t.pt : null;
      md.pts = t ? routeFromPoint(md.at, t.pt, t.pt.dir) : [md.at, [md.at[0], m.y], [m.x, m.y]];
      requestDraw();
      return;
    }
    if (md.kind === 'rubber') { md.cur = sp; requestDraw(); }
  };

  const onPointerUp = (e) => {
    const md = mode.current;
    mode.current = null;
    try { canvasRef.current.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    requestAnimationFrame(refreshCursor);
    if (!md) return;
    const sp = screenOf(e);
    const m = toModel(view.current, sp.x, sp.y);
    if (md.kind === 'move' || md.kind === 'resize') {
      if (md.kind === 'move' && !md.moved) return;
      commit(md.before);
      return;
    }
    if (md.kind === 'line' && md.target) {
      const src = md.from || md.target, dst = md.from ? md.target : md.to;
      if (src.block === dst.block && false) return;
      change((mm, s) => {
        detachBlock(s, dst.block, dst.port);
        const existing = s.lines.find((l) => l.src.block === src.block && l.src.port === src.port);
        const l = connect(mm, s, src, dst);
        if (existing && !(l.points && l.points.length)) {
          const b = s.blocks.find((x) => x.id === src.block);
          const p = b && portGeometry(b).out.find((q) => q.port === src.port);
          if (p) { const v = { right: [1, 0], left: [-1, 0], top: [0, -1], bottom: [0, 1] }[p.dir]; l.points = [[p.x + v[0] * 15, p.y + v[1] * 15]]; }
        }
      });
      requestDraw();
      return;
    }
    if (md.kind === 'branch' && md.target) {
      const it = md.item;
      change((mm, s) => {
        detachBlock(s, md.target.block, md.target.port);
        const line = s.lines.find((l) => l.id === it.line.id);
        if (!line) return false;
        // find the same segment object again in the (possibly unchanged) model
        const seg = findSegLike(line, it.seg) || line;
        const pts = it.pts;
        const idx = Math.max(0, md.idx);
        const P = [Math.round(md.at[0] * 2) / 2, Math.round(md.at[1] * 2) / 2];
        const tailEnd = seg.dst ? pts.length - 1 : pts.length;
        const child = { points: pts.slice(idx + 1, tailEnd).map((p) => [...p]), dst: seg.dst, branches: seg.branches || [] };
        seg.points = [...pts.slice(1, idx + 1).map((p) => [...p]), P];
        seg.dst = null;
        seg.branches = [child, { points: [], dst: { ...md.target }, branches: [] }];
        return true;
      });
      return;
    }
    if (md.kind === 'rubber') {
      const a = toModel(view.current, md.startScreen.x, md.startScreen.y);
      const x0 = Math.min(a.x, m.x), x1 = Math.max(a.x, m.x), y0 = Math.min(a.y, m.y), y1 = Math.max(a.y, m.y);
      if (x1 - x0 < 2 && y1 - y0 < 2) { requestDraw(); return; }
      const ns = new Set(md.base);
      for (const b of sys().blocks) if (b.x >= x0 && b.x + b.w <= x1 && b.y >= y0 && b.y + b.h <= y1) ns.add(b.id);
      for (const it of geoRef.current) if (it.pts.every((p) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1)) ns.add(it.line.id);
      setSel(ns);
      requestDraw();
    }
  };
  function findSegLike(line, seg) {
    let found = null;
    const rec = (g) => { if (found) return; if (g === seg) { found = g; return; } (g.branches || []).forEach(rec); };
    rec(line);
    return found;
  }

  const onWheel = (e) => {
    e.preventDefault();
    const sp = screenOf(e);
    if (e.ctrlKey || !e.shiftKey) setZoom(view.current.zoom * Math.pow(1.0015, -e.deltaY), sp.x, sp.y);
    else { view.current.px -= e.deltaY; requestDraw(); }
  };
  useEffect(() => {
    const c = canvasRef.current; if (!c) return undefined;
    const fn = (e) => onWheelRef.current(e);
    c.addEventListener('wheel', fn, { passive: false });
    return () => c.removeEventListener('wheel', fn);
  }, []);
  const onWheelRef = useRef(onWheel);
  onWheelRef.current = onWheel;

  const onDoubleClick = (e) => {
    const sp = screenOf(e);
    const m = toModel(view.current, sp.x, sp.y);
    const h = hit(m.x, m.y);
    if (h.kind === 'block' || h.kind === 'in' || h.kind === 'out') openBlock(h.block, e.ctrlKey);
    else if (h.kind === 'line') setDialog({ kind: 'rename', lineId: h.item.line.id, value: h.item.line.name || '' });
  };
  const openBlock = (b, underMask = false) => {
    if (b.system && (!b.mask || underMask || !(b.mask.params || []).length)) { setCrumbs([...crumbs, b.id]); setSel(new Set()); return; }
    if (b.type === 'ManualSwitch') {
      const nv = String(b.params.sw || '1') === '1' ? '2' : '1';
      change((mm, s) => { const x = s.blocks.find((q) => q.id === b.id); x.params.sw = nv; });
      if (status.state === 'running' || status.state === 'paused') post({ type: 'sim.tune', name: nameRef.current, block: b.id, params: { sw: nv } });
      return;
    }
    if (SCOPE_TYPES.has(b.type)) { setOpenScopes((o) => (o.includes(b.id) ? o : [...o, b.id])); return; }
    setDialog({ kind: 'block', id: b.id });
  };
  const autoOpenScopes = () => {
    const ids = [];
    const rec = (s) => { for (const b of s.blocks) { if (SCOPE_TYPES.has(b.type)) ids.push(b.id); if (b.system) rec(b.system); } };
    rec(sys());
    setOpenScopes((o) => (o.length ? o : ids.slice(0, 4)));
  };

  // ---------------------------------------------------------------- drop from the library
  const onDragOver = (e) => { if ([...e.dataTransfer.types].includes(DND_TYPE) || [...e.dataTransfer.types].includes('text/plain')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } };
  const addItem = (item, at) => {
    change((mm, s) => {
      const b = makeBlock(mm, item.type, { variant: item.variant, params: item.params }, s);
      const p = at || toModel(view.current, view.current.width / 2, view.current.height / 2);
      b.x = snapTo(p.x - b.w / 2, toggles.snap); b.y = snapTo(p.y - b.h / 2, toggles.snap);
      s.blocks.push(b);
      setSel(new Set([b.id]));
    });
  };
  const onDrop = (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData(DND_TYPE) || e.dataTransfer.getData('text/plain');
    const item = LIBRARY.find((i) => i.id === id);
    if (!item) return;
    const sp = screenOf(e);
    addItem(item, toModel(view.current, sp.x, sp.y));
    rootRef.current && rootRef.current.focus({ preventScroll: true });
  };

  // ---------------------------------------------------------------- commands
  const selectedBlocks = () => sys().blocks.filter((b) => sel.has(b.id));
  const del = () => {
    if (!sel.size) return;
    change((mm, s) => {
      const ids = new Set(sel);
      const seg = selSeg.current;
      for (const b of s.blocks) if (ids.has(b.id)) detachBlock(s, b.id);
      s.blocks = s.blocks.filter((b) => !ids.has(b.id));
      s.lines = s.lines.filter((l) => {
        if (!ids.has(l.id)) return true;
        if (seg && seg !== l && ids.size === 1) return removeSeg(l, findSegLike(l, seg) || l);
        return false;
      });
    });
    setSel(new Set()); selSeg.current = null;
  };
  const copySel = () => {
    const s = sys();
    const blocks = selectedBlocks();
    if (!blocks.length) return false;
    const ids = new Set(blocks.map((b) => b.id));
    const lines = [];
    for (const l of s.lines) {
      if (!ids.has(l.src.block)) continue;
      const c = clone(l);
      const keep = removeOutside(c, ids);
      if (keep) lines.push(c);
    }
    clipboard = JSON.stringify({ blocks, lines });
    return true;
  };
  function removeOutside(line, ids) {
    const rec = (g) => {
      if (g.dst && !ids.has(g.dst.block)) g.dst = null;
      g.branches = (g.branches || []).filter((b) => { rec(b); return b.dst || b.branches.length; });
      if (!g.dst && g.branches.length === 1) { const b = g.branches[0]; g.points = [...(g.points || []), ...(b.points || [])]; g.dst = b.dst; g.branches = b.branches; }
    };
    rec(line);
    return !!(line.dst || line.branches.length);
  }
  const paste = (offset = 20) => {
    if (!clipboard) return;
    const data = JSON.parse(clipboard);
    change((mm, s) => {
      const tmp = { blocks: data.blocks, lines: data.lines, notes: [] };
      reassignIds(mm, tmp);
      const shift = (g) => { g.points = (g.points || []).map((p) => [p[0] + offset, p[1] + offset]); (g.branches || []).forEach(shift); };
      for (const b of tmp.blocks) { b.x += offset; b.y += offset; b.name = uniqueName(s, b.name); s.blocks.push(b); }
      for (const l of tmp.lines) { shift(l); s.lines.push(l); }
      setSel(new Set(tmp.blocks.map((b) => b.id)));
    });
    clipboard = JSON.stringify({ blocks: data.blocks.map((b) => ({ ...b, x: b.x + offset, y: b.y + offset })), lines: data.lines });
  };
  const duplicate = () => { const keep = clipboard; if (copySel()) paste(20); clipboard = keep; };
  const rotate = () => change((mm, s) => {
    const bs = s.blocks.filter((b) => sel.has(b.id)); if (!bs.length) return false;
    for (const b of bs) { const cx = b.x + b.w / 2, cy = b.y + b.h / 2; b.rot = ((b.rot || 0) + 90) % 360; [b.w, b.h] = [b.h, b.w]; b.x = snapTo(cx - b.w / 2, toggles.snap); b.y = snapTo(cy - b.h / 2, toggles.snap); }
  });
  const flip = () => change((mm, s) => { const bs = s.blocks.filter((b) => sel.has(b.id)); if (!bs.length) return false; for (const b of bs) b.flip = !b.flip; });
  const nudge = (dx, dy) => change((mm, s) => { const bs = s.blocks.filter((b) => sel.has(b.id)); if (!bs.length) return false; for (const b of bs) { b.x += dx; b.y += dy; } });
  const selectAll = () => { const s = sys(); setSel(new Set([...s.blocks.map((b) => b.id), ...s.lines.map((l) => l.id)])); };

  const makeSubsystem = () => {
    const ids = new Set(selectedBlocks().map((b) => b.id));
    if (!ids.size) return;
    change((mm, s) => {
      const inside = s.blocks.filter((b) => ids.has(b.id));
      const conns = connections(s).map((c) => ({ src: { ...c.src }, dst: { ...c.dst }, name: c.name }));
      const x0 = Math.min(...inside.map((b) => b.x)), y0 = Math.min(...inside.map((b) => b.y));
      const x1 = Math.max(...inside.map((b) => b.x + b.w)), y1 = Math.max(...inside.map((b) => b.y + b.h));
      const sub = makeBlock(mm, 'Subsystem', {}, s);
      sub.system = newSystem();
      for (const b of inside) detachBlock(s, b.id);
      s.blocks = s.blocks.filter((b) => !ids.has(b.id));
      sub.system.blocks.push(...inside);
      const inner = sub.system;
      const inMap = new Map(), outMap = new Map();
      let nin = 0, nout = 0;
      for (const c of conns) {
        const si = ids.has(c.src.block), di = ids.has(c.dst.block);
        if (si && di) connect(mm, inner, c.src, c.dst);
        else if (!si && di) {
          const key = `${c.src.block}:${c.src.port}`;
          let ip = inMap.get(key);
          if (!ip) { nin++; ip = makeBlock(mm, 'Inport', { params: { Port: String(nin) } }, inner); ip.name = uniqueName(inner, `In${nin}`); const db = inside.find((q) => q.id === c.dst.block); const dp = db && portGeometry(db).in.find((q) => q.port === c.dst.port); ip.x = snapTo(x0 - 90, true); ip.y = dp ? dp.y - ip.h / 2 : y0 + (nin - 1) * 50; inner.blocks.push(ip); inMap.set(key, { blk: ip, n: nin, src: c.src }); ip = inMap.get(key); }
          connect(mm, inner, { block: ip.blk.id, port: 1 }, c.dst);
        } else if (si && !di) {
          const key = `${c.src.block}:${c.src.port}`;
          let op = outMap.get(key);
          if (!op) { nout++; const ob = makeBlock(mm, 'Outport', { params: { Port: String(nout) } }, inner); ob.name = uniqueName(inner, `Out${nout}`); const sb = inside.find((q) => q.id === c.src.block); const sp = sb && portGeometry(sb).out.find((q) => q.port === c.src.port); ob.x = snapTo(x1 + 60, true); ob.y = sp ? sp.y - ob.h / 2 : y0 + (nout - 1) * 50; inner.blocks.push(ob); op = { blk: ob, n: nout, dsts: [] }; outMap.set(key, op); connect(mm, inner, c.src, { block: ob.id, port: 1 }); }
          op.dsts.push(c.dst);
        }
      }
      const h = Math.max(50, Math.max(nin, nout) * 25 + 10);
      sub.w = 90; sub.h = h;
      sub.x = snapTo((x0 + x1) / 2 - sub.w / 2, true); sub.y = snapTo((y0 + y1) / 2 - h / 2, true);
      s.blocks.push(sub);
      for (const v of inMap.values()) connect(mm, s, v.src, { block: sub.id, port: v.n });
      for (const v of outMap.values()) for (const d of v.dsts) connect(mm, s, { block: sub.id, port: v.n }, d);
      setSel(new Set([sub.id]));
    });
  };

  const save = async (as = false) => {
    let p = pathRef.current;
    const hasDir = /[\\/]/.test(p || '');
    if (as || !hasDir) {
      if (onSaveAs) {
        p = await onSaveAs(nameRef.current); if (!p) return false;
        p = withModelExt(p);
        // The editor's own path first, then the tab's: the tab's new path must not make the
        // editor load that file (it does not exist yet, so the model would come back empty).
        pathRef.current = p;
        if (onPath) onPath(p);
      }
      else { setDialog({ kind: 'saveas', value: p && hasDir ? p : `${nameRef.current}.smdl` }); return false; }
    }
    return doSave(p);
  };
  const doSave = (p) => {
    const reqId = `save${++reqSeq}`;
    handlersSaveReq.current = reqId;
    // resolves with the engine's answer (sim.saved), so closing a tab can wait for it
    const done = new Promise((resolve) => { saveWaiters.current.set(reqId, resolve); });
    post({ type: 'sim.save', reqId, name: nameRef.current, path: p, model: modelRef.current });
    return done;
  };
  const saveWaiters = useRef(new Map());
  const handlersSaveReq = useRef(null);

  const running = status.state === 'running' || status.state === 'paused' || status.state === 'compiling';
  const run = () => {
    if (status.state === 'paused') { post({ type: 'sim.continue', name: nameRef.current }); return; }
    if (running) return;
    setDiags((d) => d.filter((x) => x.level === 'save'));
    for (const id of openScopes) scopeStore.current.delete(id);
    post({ type: 'sim.run', name: nameRef.current, model: modelRef.current });
  };
  const pause = () => post({ type: status.state === 'paused' ? 'sim.continue' : 'sim.pause', name: nameRef.current });
  const step = () => post({ type: 'sim.step', name: nameRef.current, model: running ? undefined : modelRef.current });
  const stop = () => post({ type: 'sim.stop', name: nameRef.current });
  const compile = () => post({ type: 'sim.compile', name: nameRef.current, model: modelRef.current, reqId: `c${++reqSeq}` });
  const toggle = (k) => setToggles((t) => ({ ...t, [k]: !t[k] }));

  // ribbon / app commands (App.jsx: 'msm-model-command' {id, command}, 'msm-sim-library')
  const cmdRef = useRef(null);
  cmdRef.current = { run, stop, pause, step, status, save, active, docId, showLibrary: () => setToggles((t) => (t.library ? t : { ...t, library: true })) };
  useEffect(() => {
    const onCmd = (e) => {
      const c = cmdRef.current; const d = e.detail || {};
      if (c.docId ? d.id !== c.docId : !c.active) return;
      if (d.command === 'run') c.run();
      else if (d.command === 'stop') c.stop();
      else if (d.command === 'pause') { if (c.status.state === 'running' || c.status.state === 'paused') c.pause(); }
      else if (d.command === 'step') { if (c.status.state !== 'running') c.step(); }
      else if (d.command === 'save' || d.command === 'saveAs') {
        d.handled = true;
        const r = c.save(d.command === 'saveAs');
        if (d.done) Promise.resolve(r).then((ok) => d.done(!!ok), () => d.done(false));
      }
    };
    const onLib = () => { if (cmdRef.current.active) cmdRef.current.showLibrary(); };
    window.addEventListener('msm-model-command', onCmd);
    window.addEventListener('msm-sim-library', onLib);
    return () => { window.removeEventListener('msm-model-command', onCmd); window.removeEventListener('msm-sim-library', onLib); };
  }, []);

  // ---------------------------------------------------------------- keyboard
  const onKeyDown = (e) => {
    if (isTyping(e.target)) return;
    const k = e.key;
    if (k === 'Control' || k === 'Meta') { ctrlDown.current = true; refreshCursor(); }
    const ctrl = e.ctrlKey || e.metaKey;
    if (k === ' ') { space.current = true; e.preventDefault(); refreshCursor(); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); del(); return; }
    if (k === 'Escape') { setSel(new Set()); setMenu(null); mode.current = null; requestDraw(); return; }
    if (!ctrl && k.startsWith('Arrow')) {
      e.preventDefault();
      const d = e.shiftKey ? 1 : GRID_BASE;
      nudge(k === 'ArrowLeft' ? -d : k === 'ArrowRight' ? d : 0, k === 'ArrowUp' ? -d : k === 'ArrowDown' ? d : 0);
      return;
    }
    if (!ctrl) return;
    const key = k.toLowerCase();
    const act = {
      c: () => copySel(), x: () => { if (copySel()) del(); }, v: () => paste(), d: () => (e.shiftKey ? compile() : duplicate()), a: selectAll,
      z: () => (e.shiftKey ? redo() : undo()), y: redo, s: () => save(e.shiftKey), r: rotate, i: flip, g: makeSubsystem,
      m: () => { const b = selectedBlocks()[0]; if (b) setDialog({ kind: 'mask', id: b.id }); }, e: () => setDialog({ kind: 'settings' }),
      t: run, 0: fitView, '=': () => setZoom(view.current.zoom * 1.25), '+': () => setZoom(view.current.zoom * 1.25), '-': () => setZoom(view.current.zoom / 1.25),
      u: () => { const b = selectedBlocks()[0]; if (b && b.system) { setCrumbs([...crumbs, b.id]); setSel(new Set()); } },
    }[key];
    if (act) { e.preventDefault(); act(); }
  };
  const onKeyUp = (e) => { if (e.key === ' ') space.current = false; if (e.key === 'Control' || e.key === 'Meta') ctrlDown.current = false; refreshCursor(); };

  // ---------------------------------------------------------------- context menu
  // Menu items run the newest commands: the right-click selects the block first, and the
  // functions of that older render would still see the previous selection.
  const cmds = useRef({});
  cmds.current = { del, rotate, flip, duplicate, makeSubsystem, copySel, paste, fitView };
  const onContextMenu = (e) => {
    e.preventDefault();
    const sp = screenOf(e);
    const m = toModel(view.current, sp.x, sp.y);
    const h = hit(m.x, m.y);
    let items;
    if (h.kind === 'block' || h.kind === 'in' || h.kind === 'out') {
      if (!sel.has(h.block.id)) setSel(new Set([h.block.id]));
      const b = h.block;
      items = [
        { icon: 'settings', label: b.system ? L('openBlock') : L('blockParams'), run: () => openBlock(b) },
        b.system && b.mask ? { icon: 'settings', label: L('blockParams'), run: () => setDialog({ kind: 'block', id: b.id }) } : null,
        { icon: 'mask', label: L('mask'), keys: 'Ctrl+M', run: () => setDialog({ kind: 'mask', id: b.id }) },
        { icon: 'info', label: L('showName'), run: () => change((mm, s) => { const x = s.blocks.find((q) => q.id === b.id); x.showName = x.showName === false; }) },
        { sep: true },
        { icon: 'copy', label: L('copy'), keys: 'Ctrl+C', run: () => { setSel(new Set([b.id])); setTimeout(() => cmds.current.copySel()); } },
        { icon: 'duplicate', label: L('duplicate'), keys: 'Ctrl+D', run: () => cmds.current.duplicate() },
        { sep: true },
        { icon: 'rotate', label: L('rotate'), keys: 'Ctrl+R', run: () => cmds.current.rotate() },
        { icon: 'flip', label: L('flip'), keys: 'Ctrl+I', run: () => cmds.current.flip() },
        { icon: 'subsystem', label: L('makeSubsystem'), keys: 'Ctrl+G', run: () => cmds.current.makeSubsystem() },
        { sep: true },
        { icon: 'trash', label: L('delete'), keys: 'Del', run: () => cmds.current.del() },
      ].filter(Boolean);
    } else if (h.kind === 'line') {
      const id = h.item.line.id;
      setSel(new Set([id])); selSeg.current = h.item.seg;
      items = [
        { icon: 'settings', label: L('rename'), run: () => setDialog({ kind: 'rename', lineId: id, value: h.item.line.name || '' }) },
        { icon: 'workspace', label: `${L('logSignal')}${h.item.line.log ? ' ✓' : ''}`, run: () => change((mm, s) => { const l = s.lines.find((q) => q.id === id); l.log = !l.log; }) },
        ...sys().blocks.filter((b) => b.type === 'FloatingScope').map((fs) => ({
          icon: 'scope', label: `${L('addScope')}: ${fs.name}`,
          run: () => change((mm, s) => {
            const b = s.blocks.find((q) => q.id === fs.id); if (!b) return false;
            const key = `${h.item.line.src.block}:${h.item.line.src.port}`;
            const list = String(b.params.Signals || '').split(',').map((x) => x.trim()).filter(Boolean);
            if (list.includes(key)) return false;
            b.params.Signals = [...list, key].join(',');
          }),
        })),
        { icon: 'trash', label: L('delete'), keys: 'Del', run: () => cmds.current.del() },
      ];
    } else {
      items = [
        { icon: 'paste', label: L('paste'), keys: 'Ctrl+V', run: () => cmds.current.paste() },
        { icon: 'fit', label: L('fit'), keys: 'Ctrl+0', run: () => cmds.current.fitView() },
        { icon: 'settings', label: L('modelSettings'), keys: 'Ctrl+E', run: () => setDialog({ kind: 'settings' }) },
      ];
    }
    // Desktop: a child window like every other context menu (it can go past the window's edge).
    if (usePopupWindows()) {
      const list = items.map((it, i) => (it.sep ? { sep: true } : { id: String(i), label: it.label, icon: it.icon, keys: it.keys }));
      openMenu({ x: e.clientX, y: e.clientY }, list, (id) => { const it = items[Number(id)]; if (it && it.run) it.run(); }, { width: 230 });
      return;
    }
    const r = wrapRef.current.getBoundingClientRect();
    setMenu({ x: Math.min(sp.x, r.width - 230), y: Math.min(sp.y, r.height - items.length * 28 - 10), items });
  };

  // ---------------------------------------------------------------- render
  const curSys = sys();
  const crumbBlocks = [];
  { let s = modelRef.current.root; for (const id of crumbs) { const b = s.blocks.find((x) => x.id === id); if (!b) break; crumbBlocks.push(b); s = b.system; } }
  const dlgBlock = dialog && (dialog.kind === 'block' || dialog.kind === 'mask') ? curSys.blocks.find((b) => b.id === dialog.id) : null;
  const st = model.settings || {};
  const progress = Math.max(0, Math.min(1, status.progress || 0));
  const stateKey = `state_${status.state || 'idle'}`;
  const scopeBlocks = openScopes.map((id) => { let f = null; const rec = (s) => { for (const b of s.blocks) { if (b.id === id) f = b; if (b.system) rec(b.system); } }; rec(model.root); return f; }).filter(Boolean);

  const TB = ({ icon, label, onClick, disabled, on, title, primary, minor }) => (
    <button type="button" className={`sim-tb ${on ? 'on' : ''} ${primary ? 'primary' : ''} ${minor ? 'minor' : ''}`} onClick={onClick} disabled={disabled} title={title || label} aria-pressed={on === undefined ? undefined : !!on}>
      <SimIcon name={icon} size={15} /><span className="sim-tb-label">{label}</span>
    </button>
  );

  return (
    <div ref={rootRef} className={`sim-editor ${active ? '' : 'inactive'}`} tabIndex={0} onKeyDown={onKeyDown} onKeyUp={onKeyUp} data-model={nameRef.current}>
      <div className="sim-toolbar" role="toolbar">
        {onNew && <TB icon="new" label={L('new')} onClick={onNew} />}
        {onOpen && <TB icon="open" label={L('open')} onClick={onOpen} />}
        <TB icon="save" label={L('save')} title={`${L('save')} (Ctrl+S)`} onClick={() => save(false)} />
        <TB icon="save" minor label={L('saveAs')} title={`${L('saveAs')} (Ctrl+Shift+S)`} onClick={() => save(true)} />
        <span className="sim-sep" />
        <TB icon="undo" minor label={L('undo')} title={`${L('undo')} (Ctrl+Z)`} onClick={undo} disabled={!undoStack.current.length} />
        <TB icon="redo" minor label={L('redo')} title={`${L('redo')} (Ctrl+Y)`} onClick={redo} disabled={!redoStack.current.length} />
        <span className="sim-sep" />
        <TB icon="run" label={status.state === 'paused' ? L('cont') : L('run')} title={L('run_tip')} onClick={run} disabled={status.state === 'running' || status.state === 'compiling'} primary />
        <TB icon="pause" label={L('pause')} title={L('pause_tip')} onClick={pause} disabled={!(status.state === 'running' || status.state === 'paused')} on={status.state === 'paused'} />
        <TB icon="step" label={L('step')} title={L('step_tip')} onClick={step} disabled={status.state === 'running'} />
        <TB icon="stop" label={L('stop')} title={L('stop_tip')} onClick={stop} disabled={!running} />
        <span className="sim-time" title={L('time')}>
          <span className="sim-time-val">{L('time')} {fmtTime(Number(status.time) || 0)}</span>
          <span className="sim-progress"><span style={{ width: `${progress * 100}%` }} /></span>
        </span>
        <label className="sim-stoptime" title={L('stopTime')}>
          <span>{L('stopTime')}</span>
          <StopTimeField value={st.stopTime} onCommit={(v) => change((mm) => { if (mm.settings.stopTime === v) return false; mm.settings.stopTime = v; })} />
        </label>
        <TB icon="update" label={L('update')} title={L('update_tip')} onClick={compile} />
        <span className="sim-sep" />
        <TB icon="fit" minor label={L('fit')} title={L('fit_tip')} onClick={fitView} />
        {/* 축소 · ratio · 확대 in one control: the stepper's − / + carry the zoom icons. */}
        <span className="sim-zoom" title={L('zoom')}>
          <Stepper value={zoomPct} min={10} max={800} step={1} width={50} unit="%" ariaLabel={L('zoom')} decIcon="zoomOut" incIcon="zoomIn" decTitle={L('zoomOut')} incTitle={L('zoomIn')} onChange={(v) => setZoom(stepZoom(zoomPct, v) / 100)} />
        </span>
        <span className="sim-sep" />
        <TB icon="grid" label={L('grid')} title={L('grid_tip')} on={toggles.grid} onClick={() => toggle('grid')} />
        <TB icon="snap" label={L('snap')} title={L('snap_tip')} on={toggles.snap} onClick={() => toggle('snap')} />
        <TB icon="rulers" label={L('rulers')} title={L('rulers_tip')} on={toggles.rulers} onClick={() => toggle('rulers')} />
        <TB icon="colors" label={L('stColors')} title={L('st_tip')} on={toggles.rates} onClick={() => { toggle('rates'); if (!toggles.rates) compile(); }} />
        <TB icon="library" label={L('library')} title={L('lib_tip')} on={externalLibrary || toggles.library} onClick={() => (externalLibrary && onLibrary ? onLibrary() : toggle('library'))} />
        <TB icon="function" label={L('code')} title={L('code_tip')} on={!!toggles.code} onClick={() => toggle('code')} />
        <span className="sim-sep" />
        <TB icon="settings" label={L('settings')} title={L('settings_tip')} onClick={() => setDialog({ kind: 'settings' })} />
      </div>
      <div className="sim-body">
        {toggles.library && !externalLibrary && <MemoLibrary lang={lang} onAdd={(it) => addItem(it)} width={232} />}
        <div className="sim-main">
          <div className="sim-crumbs">
            {/* The model's name as the canvas title: tag, name, and the file it lives in (or 저장 안 됨). */}
            <button type="button" className={`sim-crumb sim-crumb-model ${crumbs.length ? '' : 'on'}`} onClick={() => setCrumbs([])} title={pathRef.current || L('crumb_unsaved')}>
              <SimIcon name="diag" size={16} /><span className="sim-crumb-tag">{L('crumb_model')}</span><span className="sim-crumb-name">{nameRef.current}</span>
              {dirty && <span className="sim-crumb-dirty" title={L('crumb_dirty')}>●</span>}
              <span className="sim-crumb-file">{pathRef.current ? pathRef.current.replace(/^.*[\\/]/, '') : L('crumb_unsaved')}</span>
            </button>
            {crumbBlocks.map((b, i) => (
              <React.Fragment key={b.id}><SimIcon name="chevronRight" size={12} />
                <button type="button" className={`sim-crumb ${i === crumbBlocks.length - 1 ? 'on' : ''}`} onClick={() => setCrumbs(crumbs.slice(0, i + 1))}><SimIcon name="subsystem" size={13} /><span>{b.name}</span></button>
              </React.Fragment>
            ))}
          </div>
          <div ref={wrapRef} className="sim-canvas-wrap" onDragOver={onDragOver} onDrop={onDrop}>
            <canvas ref={canvasRef} className="sim-canvas" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
              onPointerLeave={() => { cursor.current = null; setTip(null); setHot(null); requestDraw(); }} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu} />
            {tip && <div className="sim-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
            {menu && (
              <div className="sim-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
                {menu.items.map((it, i) => (it.sep ? <div key={i} className="sim-menu-sep" /> : (
                  <button key={i} type="button" className="sim-menu-item" onClick={() => { setMenu(null); it.run(); }}>
                    <SimIcon name={it.icon} size={14} /><span className="spacer-text">{it.label}</span>{it.keys && <span className="sim-menu-keys">{it.keys}</span>}
                  </button>
                )))}
              </div>
            )}
            {scopeBlocks.map((b, i) => (
              <ScopeWindow key={b.id} block={b} index={i} lang={lang} store={scopeStore.current.get(b.id)} tick={scopeTick} status={{ start: Number(st.startTime), stop: Number(status.stop ?? st.stopTime) }}
                onClose={() => setOpenScopes((o) => o.filter((x) => x !== b.id))} />
            ))}
            <DialogVisible.Provider value={!!active}>
            {dialog && dialog.kind === 'block' && dlgBlock && (
              <BlockDialog block={dlgBlock} lang={lang} running={running} onClose={() => setDialog(null)}
                onTune={(params) => post({ type: 'sim.tune', name: nameRef.current, block: dlgBlock.id, params })}
                onApply={({ params, name }) => change((mm, s) => {
                  const b = s.blocks.find((x) => x.id === dlgBlock.id); if (!b) return false;
                  const nm = name !== b.name && s.blocks.some((x) => x !== b && x.name === name) ? uniqueName(s, name) : name;
                  if (nm === b.name && JSON.stringify(params) === JSON.stringify(b.params)) return false;
                  b.params = params; b.name = nm;
                })} />
            )}
            {dialog && dialog.kind === 'mask' && dlgBlock && (
              <MaskEditor block={dlgBlock} lang={lang} onClose={() => setDialog(null)}
                onApply={(mask) => change((mm, s) => {
                  const b = s.blocks.find((x) => x.id === dlgBlock.id); if (!b) return false;
                  if (!mask) { delete b.mask; return; }
                  b.mask = mask;
                  for (const p of mask.params) if (b.params[p.name] == null) b.params[p.name] = p.type === 'popup' ? String(p.options || '').split('|')[0] || '' : (p.value ?? '');
                })} />
            )}
            {dialog && dialog.kind === 'settings' && (
              <SettingsDialog model={model} lang={lang} onClose={() => setDialog(null)}
                onApply={(settings, workspace) => change((mm) => { mm.settings = { ...mm.settings, ...settings }; mm.workspace = workspace; })} />
            )}
            {dialog && dialog.kind === 'rename' && (
              <TextDialog lang={lang} title={L('rename')} icon="settings" value={dialog.value} onClose={() => setDialog(null)}
                onOk={(v) => change((mm, s) => { const l = s.lines.find((x) => x.id === dialog.lineId); if (!l || l.name === v) return false; l.name = v; })} />
            )}
            {dialog && dialog.kind === 'saveas' && (
              <TextDialog lang={lang} title={L('savePath')} icon="save" value={dialog.value} wide onClose={() => setDialog(null)} onOk={(v) => { if (v.trim()) doSave(withModelExt(v)); }} />
            )}
            </DialogVisible.Provider>
          </div>
          {diags.length > 0 && (
            <div className="sim-diags">
              <div className="sim-diags-head"><SimIcon name="diag" size={14} /><span>{L('diag')}</span><span className="spacer" />
                <button type="button" className="sim-mini" onClick={() => { setDiags([]); setErrorBlocks(new Set()); }}><SimIcon name="trash" size={12} /><span>{L('clear')}</span></button></div>
              <div className="sim-diags-list selectable">
                {diags.slice(-6).map((d, i) => (
                  <div key={i} className={`sim-diag ${d.level}`} onClick={() => d.block && setSel(new Set([d.block]))}>
                    <SimIcon name={d.level === 'error' ? 'alert' : 'info'} size={13} /><span>{d.path ? `${d.path}: ` : ''}{d.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {toggles.code && (
          <ModelCodePane engine={engine} model={modelRef.current} rev={rev} name={nameRef.current} lang={lang} running={status.state === 'running' || status.state === 'paused'}
            onOpenScript={onOpenScript} onClose={() => toggle('code')} />
        )}
      </div>
      <div className="sim-status">
        <span className="sim-sitem"><SimIcon name="zoomIn" size={12} />{L('zoom')} {zoomPct}%</span>
        <span className="sim-sitem" ref={coordRef}>x —, y —</span>
        <span className="sim-sitem"><SimIcon name="settings" size={12} />{L('solver')} {st.solver || 'auto'} ({st.solverType === 'fixed' || /^(ode[1-58]|ode14x)$/.test(String(st.solver || '')) ? L('fixed') : L('variable')})</span>
        <span className="sim-sitem"><SimIcon name="block" size={12} />{curSys.blocks.length} {L('blocks')}</span>
        <span className={`sim-sitem sim-state ${status.state}`}>{L(stateKey)}{status.message ? ` — ${status.message}` : ''}</span>
        <span className="spacer" />
        <span className="sim-sitem muted">{L('help_keys')}</span>
        {dirty && <span className="sim-sitem">● {L('dirty')}</span>}
      </div>
    </div>
  );
}

const MemoLibrary = React.memo(LibraryPanel, (a, b) => a.lang === b.lang && a.width === b.width);

function StopTimeField({ value, onCommit }) {
  const [text, setText] = useState(null);
  return (
    <input type="text" className="sim-stop-input" value={text != null ? text : String(value ?? '')} spellCheck={false}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { if (text != null) { onCommit(text.trim() || '10'); setText(null); } }}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setText(null); }} />
  );
}

function TextDialog({ lang, title, icon, value, onOk, onClose, wide }) {
  const [v, setV] = useState(value);
  const ref = useRef(null);
  useEffect(() => { ref.current && ref.current.focus(); ref.current && ref.current.select(); }, []);
  return (
    <SimDialog title={title} icon={icon} onClose={onClose} width={wide ? 520 : 340}
      footer={<>
        <button type="button" className="vbtn" onClick={onClose}><SimIcon name="close" size={14} /><span>{tr(lang, 'cancel')}</span></button>
        <button type="button" className="vbtn vbtn-primary" onClick={() => { onOk(v); onClose(); }}><SimIcon name="run" size={14} /><span>{tr(lang, 'ok')}</span></button>
      </>}>
      <input ref={ref} type="text" className="sim-text" value={v} onChange={(e) => setV(e.target.value)} spellCheck={false}
        onKeyDown={(e) => { if (e.key === 'Enter') { onOk(v); onClose(); } }} />
      <span className="muted small">{tr(lang, 'renameHint')}</span>
    </SimDialog>
  );
}

export default ModelEditor;
