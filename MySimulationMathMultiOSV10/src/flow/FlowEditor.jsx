// 그래픽 편집기: a document (.mflow) where constants, variables, operators,
// formulas and functions are blocks, wired output → input, and the M code is
// generated live next to the canvas (src/flow/flow.js). The flow is saved in
// its own file; the code is run, opened as a script or exported as an .m file.
//
// Canvas: drag the background to pan, the wheel zooms at the pointer, drag a
// block to move it, drag from an output port (right) to an input port (left)
// to connect (dragging a connected input picks its wire up again). Delete
// removes the selection, Ctrl+Z / Ctrl+Y undo / redo, Ctrl+A selects all.
// The block list and the properties / code column can be hidden from the toolbar.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { Icon } from '../components/Chrome';
import { Stepper } from '../views/common';
import { fsApi } from '../lib/backend';
import { useEditorDirty } from '../lib/dirty';
import {
  emptyFlow, parseFlow, serializeFlow, makeNode, connect, removeItems, pruneLinks, generateCode, portsOf, applySyntax,
  isVarName, OPS,
} from './flow';
import './flow.css';

const W = 190;      // block width
const HEAD = 26;    // header height
const ROW = 24;     // row height (body, inputs, outputs)
const DND = 'application/x-msm-flow';
const ZOOMS = [0.25, 2.5];
const PANES_KEY = 'msm.flow.panes';
function loadPanes() {
  try { return { palette: true, side: true, ...JSON.parse(localStorage.getItem(PANES_KEY) || '{}') }; } catch { return { palette: true, side: true }; }
}
const ICON = { const: 'hash', var: 'variable', op: 'plus', expr: 'edit', func: 'code', disp: 'eye' };

const bodyRows = (n) => (n.type === 'const' || n.type === 'expr' || n.type === 'op' ? 1 : 0);
function geom(n) {
  const p = portsOf(n);
  const b = bodyRows(n);
  return {
    ports: p,
    inY: (i) => HEAD + (b + i) * ROW + ROW / 2,
    outY: (j) => HEAD + (b + p.inputs.length + j) * ROW + ROW / 2,
    h: HEAD + (b + p.inputs.length + p.outputs.length) * ROW + 6,
  };
}
const wire = (x1, y1, x2, y2) => { const d = Math.max(40, Math.abs(x2 - x1) * 0.5); return `M${x1},${y1} C${x1 + d},${y1} ${x2 - d},${y2} ${x2},${y2}`; };
const titleOf = (n) => {
  switch (n.type) {
    case 'const': return t('fl_const');
    case 'var': return t('fl_var');
    case 'op': return `${t('fl_op')}  ${n.op}`;
    case 'expr': return t('fl_expr');
    case 'disp': return t('fl_disp');
    default: return n.fn;
  }
};
const sameContent = (a, b) => JSON.stringify([a.nodes, a.links]) === JSON.stringify([b.nodes, b.links]);

export function FlowEditor({ doc, active, engine, engineReady, variables, register, onDirty, actions }) {
  useLanguage();
  const ko = getLanguage() !== 'en';
  const [flow, setFlowState] = useState(emptyFlow);
  const [state, setState] = useState(doc.path ? 'loading' : 'ready');
  const [error, setError] = useState('');
  const [sel, setSel] = useState([]);           // node / link ids
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [helpOf, setHelpOf] = useState({});     // fn → help
  const [drag, setDrag] = useState(null);       // { kind: 'wire', from, x, y } while connecting
  const [panes, setPanes] = useState(loadPanes); // { palette, side } shown
  const togglePane = (k) => setPanes((p) => { const next = { ...p, [k]: !p[k] }; try { localStorage.setItem(PANES_KEY, JSON.stringify(next)); } catch { /* ignore */ } return next; });
  const [, setSavedTick] = useState(0);
  const flowRef = useRef(flow);
  flowRef.current = flow;
  const saved = useRef(emptyFlow());
  const undo = useRef([]);
  const redo = useRef([]);
  const lastKey = useRef({ key: null, at: 0 });
  const canvas = useRef(null);
  const pathRef = useRef(doc.path);
  pathRef.current = doc.path;

  // ── history ──
  /** Sets the flow and records an undo step (key: typing in the same field within 1 s is one step). */
  const commit = useCallback((next, key = null) => {
    const prev = flowRef.current;
    if (next === prev) return;
    const now = Date.now();
    if (!(key && lastKey.current.key === key && now - lastKey.current.at < 1000)) { undo.current.push(prev); if (undo.current.length > 200) undo.current.shift(); }
    lastKey.current = { key, at: now };
    redo.current = [];
    flowRef.current = next;
    setFlowState(next);
  }, []);
  const setView = (view) => { const next = { ...flowRef.current, view }; flowRef.current = next; setFlowState(next); };
  const doUndo = () => { const p = undo.current.pop(); if (!p) return; redo.current.push(flowRef.current); lastKey.current = { key: null, at: 0 }; flowRef.current = { ...p, view: flowRef.current.view }; setFlowState(flowRef.current); };
  const doRedo = () => { const p = redo.current.pop(); if (!p) return; undo.current.push(flowRef.current); lastKey.current = { key: null, at: 0 }; flowRef.current = { ...p, view: flowRef.current.view }; setFlowState(flowRef.current); };

  // ── load / save ──
  useEffect(() => {
    if (!doc.path) return undefined;
    let alive = true;
    fsApi.readText(doc.path).then((text) => {
      if (!alive) return;
      try { const f = parseFlow(text); saved.current = f; flowRef.current = f; setFlowState(f); setState('ready'); } catch (e) { setError(e.message); setState('error'); }
    }, (e) => { if (alive) { setError(e.message); setState('error'); } });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const gen = useMemo(() => generateCode(flow, { title: t('fl_header', { name: doc.title }) }), [flow, doc.title]);
  const dirty = state === 'ready' && !sameContent(flow, saved.current);
  const save = async (path) => {
    const target = path || pathRef.current;
    if (!target) return false;
    await fsApi.writeText(target, serializeFlow(flowRef.current));
    saved.current = flowRef.current;
    setSavedTick((k) => k + 1);
    return target;
  };
  useEffect(() => {
    register(doc.id, { save, isDirty: () => !sameContent(flowRef.current, saved.current), code: () => generateCode(flowRef.current).code, kind: 'flow' });
    return () => register(doc.id, null);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onDirty(doc.id, dirty); }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEditorDirty(`doc:${doc.id}`, dirty, { label: doc.title, save: () => (pathRef.current ? save() : actions.saveAs(doc.id)) });

  // ── catalog for the palette ──
  useEffect(() => {
    if (!engineReady) return undefined;
    let alive = true;
    engine.catalog().then((c) => { if (alive) setCatalog(Array.isArray(c) ? c : []); });
    return () => { alive = false; };
  }, [engine, engineReady]);
  const loadHelp = useCallback(async (fn) => {
    if (helpOf[fn] !== undefined) return helpOf[fn];
    const h = await engine.help(fn);
    setHelpOf((m) => ({ ...m, [fn]: h || null }));
    return h;
  }, [engine, helpOf]);

  // ── coordinates ──
  const view = flow.view || { x: 0, y: 0, zoom: 1 };
  const toWorld = (cx, cy) => {
    const r = canvas.current.getBoundingClientRect();
    const v = flowRef.current.view;
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom };
  };
  const centerWorld = () => {
    const r = canvas.current.getBoundingClientRect();
    const c = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    const k = flowRef.current.nodes.length % 6;
    return { x: c.x - W / 2 + k * 18, y: c.y - 40 + k * 18 };
  };

  // ── adding blocks ──
  const addBlock = async (spec, at) => {
    const f = flowRef.current;
    const p = at || centerWorld();
    let node;
    if (spec.type === 'func') {
      const h = await loadHelp(spec.fn);
      const syntax = (h && h.syntax && h.syntax[0]) || `${spec.fn}()`;
      node = makeNode(flowRef.current, 'func', p.x, p.y, { fn: spec.fn, syntax });
    } else node = makeNode(f, spec.type, p.x, p.y, spec);
    commit({ ...flowRef.current, nodes: [...flowRef.current.nodes, node] });
    setSel([node.id]);
  };
  const onDragStartItem = (e, spec) => { e.dataTransfer.setData(DND, JSON.stringify(spec)); e.dataTransfer.effectAllowed = 'copy'; };
  const onDrop = (e) => {
    const raw = e.dataTransfer.getData(DND);
    if (!raw) return;
    e.preventDefault();
    const w = toWorld(e.clientX, e.clientY);
    addBlock(JSON.parse(raw), { x: w.x - 20, y: w.y - HEAD / 2 });
  };

  // ── editing ──
  const patchNode = (id, patch, key) => {
    const f = flowRef.current;
    commit(pruneLinks({ ...f, nodes: f.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }), key ? `${id}:${key}` : null);
  };
  const removeSel = () => { if (sel.length) { commit(removeItems(flowRef.current, sel)); setSel([]); } };
  const fit = () => {
    const ns = flowRef.current.nodes;
    const r = canvas.current.getBoundingClientRect();
    if (!ns.length) { setView({ x: 0, y: 0, zoom: 1 }); return; }
    const x0 = Math.min(...ns.map((n) => n.x)), y0 = Math.min(...ns.map((n) => n.y));
    const x1 = Math.max(...ns.map((n) => n.x + W)), y1 = Math.max(...ns.map((n) => n.y + geom(n).h));
    const z = Math.max(ZOOMS[0], Math.min(1.5, Math.min((r.width - 60) / (x1 - x0), (r.height - 60) / (y1 - y0))));
    setView({ zoom: z, x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: (r.height - (y1 - y0) * z) / 2 - y0 * z });
  };
  const zoomAt = (z, cx, cy) => {
    const v = flowRef.current.view;
    const nz = Math.max(ZOOMS[0], Math.min(ZOOMS[1], z));
    const r = canvas.current.getBoundingClientRect();
    const px = cx == null ? r.width / 2 : cx - r.left, py = cy == null ? r.height / 2 : cy - r.top;
    setView({ zoom: nz, x: px - (px - v.x) * (nz / v.zoom), y: py - (py - v.y) * (nz / v.zoom) });
  };

  // ── pointer: pan / move / wire ──
  const gesture = useRef(null);
  const onPointerDown = (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    const el = e.target;
    if (el.closest('input, textarea, button.fl-chip')) return;
    canvas.current.focus({ preventScroll: true });
    const out = el.closest('[data-out]');
    const inp = el.closest('[data-in]');
    const nodeEl = el.closest('[data-node]');
    const linkEl = el.closest('[data-link]');
    if (out && e.button === 0) {
      const [node, port] = out.dataset.out.split(':');
      gesture.current = { kind: 'wire', from: { node, port: Number(port) } };
      const w = toWorld(e.clientX, e.clientY);
      setDrag({ from: { node, port: Number(port) }, x: w.x, y: w.y });
    } else if (inp && e.button === 0) {
      // pick a connected input's wire up again
      const [node, port] = inp.dataset.in.split(':');
      const l = flowRef.current.links.find((x) => x.to.node === node && x.to.port === Number(port));
      if (!l) return;
      commit(removeItems(flowRef.current, [l.id]));
      gesture.current = { kind: 'wire', from: { ...l.from } };
      const w = toWorld(e.clientX, e.clientY);
      setDrag({ from: { ...l.from }, x: w.x, y: w.y });
    } else if (nodeEl && e.button === 0) {
      const id = nodeEl.dataset.node;
      const multi = e.ctrlKey || e.metaKey || e.shiftKey;
      let ids = sel;
      if (multi) ids = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
      else if (!sel.includes(id)) ids = [id];
      setSel(ids);
      const start = new Map(flowRef.current.nodes.filter((n) => ids.includes(n.id)).map((n) => [n.id, { x: n.x, y: n.y }]));
      gesture.current = { kind: 'move', sx: e.clientX, sy: e.clientY, start, before: flowRef.current, moved: false };
    } else if (linkEl && e.button === 0) {
      setSel([linkEl.dataset.link]);
      return;
    } else {
      if (e.button === 0 && !(e.ctrlKey || e.metaKey)) setSel([]);
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, v: { ...flowRef.current.view } };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pan') { setView({ ...g.v, x: g.v.x + e.clientX - g.sx, y: g.v.y + e.clientY - g.sy }); return; }
    if (g.kind === 'move') {
      const z = flowRef.current.view.zoom;
      const dx = (e.clientX - g.sx) / z, dy = (e.clientY - g.sy) / z;
      if (Math.abs(dx) + Math.abs(dy) > 1) g.moved = true;
      const next = { ...flowRef.current, nodes: flowRef.current.nodes.map((n) => (g.start.has(n.id) ? { ...n, x: Math.round(g.start.get(n.id).x + dx), y: Math.round(g.start.get(n.id).y + dy) } : n)) };
      flowRef.current = next;
      setFlowState(next);
      return;
    }
    if (g.kind === 'wire') { const w = toWorld(e.clientX, e.clientY); setDrag((d) => (d ? { ...d, x: w.x, y: w.y } : d)); }
  };
  const onPointerUp = (e) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === 'move' && g.moved) {
      // one undo step for the whole move
      const moved = flowRef.current;
      flowRef.current = g.before;
      commit(moved);
    }
    if (g.kind === 'wire') {
      setDrag(null);
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const inp = target && target.closest('[data-in]');
      if (inp) {
        const [node, port] = inp.dataset.in.split(':');
        const next = connect(flowRef.current, g.from, { node, port: Number(port) });
        if (next !== flowRef.current) commit(next);
      }
    }
  };
  useEffect(() => {
    const el = canvas.current;
    if (!el) return undefined;
    const onWheel = (e) => { e.preventDefault(); zoomAt(flowRef.current.view.zoom * Math.exp(-Math.max(-3, Math.min(3, e.deltaY / 100)) * 0.15), e.clientX, e.clientY); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });
  const onKeyDown = (e) => {
    if (e.target.closest('input, textarea')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSel(); }
    else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
    else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); doRedo(); }
    else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSel(flowRef.current.nodes.map((n) => n.id)); }
    else if (e.key === 'Escape') setSel([]);
  };

  // ── palette ──
  const q = query.trim().toLowerCase();
  const basics = [
    { type: 'const', icon: 'hash', label: t('fl_const'), tip: t('fl_const_tip') },
    { type: 'op', icon: 'plus', label: t('fl_op'), tip: t('fl_op_tip') },
    { type: 'expr', icon: 'edit', label: t('fl_expr'), tip: t('fl_expr_tip') },
    { type: 'disp', icon: 'eye', label: t('fl_disp'), tip: t('fl_disp_tip') },
  ].filter((b) => !q || b.label.toLowerCase().includes(q));
  const vars = (variables || []).filter((v) => !q || v.name.toLowerCase().includes(q));
  const funcs = useMemo(() => {
    const list = catalog.filter((c) => !q || c.name.toLowerCase().includes(q) || `${c.en} ${c.ko}`.toLowerCase().includes(q));
    if (q) list.sort((a, b) => (a.name.toLowerCase().startsWith(q) ? 0 : 1) - (b.name.toLowerCase().startsWith(q) ? 0 : 1));
    return list.slice(0, 150);
  }, [catalog, q]);

  // ── selection details ──
  const selNode = sel.length === 1 ? flow.nodes.find((n) => n.id === sel[0]) : null;
  useEffect(() => { if (selNode && selNode.type === 'func') loadHelp(selNode.fn); }, [selNode && selNode.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const problemsOf = useMemo(() => { const m = new Map(); for (const p of gen.problems) m.set(p.node, [...(m.get(p.node) || []), p]); return m; }, [gen]);
  const problemText = (p) => { const k = `fl_p_${p.code}`; const s = t(k, { name: p.name || '' }); return s === k ? p.message : s; };

  const byId = useMemo(() => new Map(flow.nodes.map((n) => [n.id, n])), [flow.nodes]);
  const connected = useMemo(() => new Set(flow.links.map((l) => `${l.to.node}:${l.to.port}`)), [flow.links]);

  if (state === 'error') return <div className="empty"><Icon name="alert" size={22} /><strong>{t('fl_open_failed')}</strong><span className="small muted">{error}</span></div>;
  if (state === 'loading') return <div className="empty small muted">{t('loading')}</div>;

  const hasCode = flow.nodes.length > 0;
  const stem = (doc.title || 'flow').replace(/\.mflow$/i, '');
  return (
    <div className="fl-doc" data-flow={doc.id}>
      <div className="fl-toolbar" role="toolbar">
        <Tb icon="play" label={t('fl_run')} title={t('fl_run_tip')} primary disabled={!hasCode || !engineReady} onClick={() => actions.run(gen.code)} />
        <Tb icon="script" label={t('fl_open_script')} title={t('fl_open_script_tip')} disabled={!hasCode} onClick={() => actions.openAsScript(gen.code)} />
        <Tb icon="download" label={t('fl_export')} title={t('fl_export_tip')} disabled={!hasCode} onClick={() => actions.exportM(gen.code, `${stem}.m`)} />
        <span className="fl-sep" />
        <Tb icon="undo" label={t('tb_undo')} title={`${t('tb_undo')} (Ctrl+Z)`} disabled={!undo.current.length} onClick={doUndo} />
        <Tb icon="redo" label={t('tb_redo')} title={`${t('tb_redo')} (Ctrl+Y)`} disabled={!redo.current.length} onClick={doRedo} />
        <Tb icon="trash" label={t('remove')} title={`${t('remove')} (Delete)`} disabled={!sel.length} onClick={removeSel} />
        <span className="fl-sep" />
        <Tb icon="panelLeft" label={t('fl_palette')} title={t('fl_palette_tip')} on={panes.palette} onClick={() => togglePane('palette')} />
        <Tb icon="panelRight" label={t('fl_side')} title={t('fl_side_tip')} on={panes.side} onClick={() => togglePane('side')} />
        <span className="fl-sep" />
        <Tb icon="fit" label={t('fl_fit')} title={t('fl_fit_tip')} onClick={fit} />
        <Stepper value={Math.round(view.zoom * 100)} min={ZOOMS[0] * 100} max={ZOOMS[1] * 100} step={10} width={54} unit="%" ariaLabel={t('fl_zoom')}
          decIcon="minus" incIcon="plus" decTitle={t('fl_zoom_out')} incTitle={t('fl_zoom_in')} onChange={(v) => zoomAt(v / 100)} />
      </div>
      <div className="fl-main">
        <div className="fl-palette" style={panes.palette ? undefined : { display: 'none' }}>
          <div className="pane-tools">
            <span className="pane-filter"><Icon name="search" size={13} /><input value={query} placeholder={t('fl_search')} aria-label={t('fl_search')} onChange={(e) => setQuery(e.target.value)} /></span>
          </div>
          <div className="pane-scroll">
            {basics.length > 0 && <div className="fp-section small">{t('fl_basics')}</div>}
            {basics.map((b) => <PaletteItem onAdd={addBlock} onDragStart={onDragStartItem} key={b.type} spec={{ type: b.type }} icon={b.icon} label={b.label} tip={b.tip} />)}
            <div className="fp-section small">{t('bh_variables')}</div>
            {!vars.length && <div className="pane-empty small muted">{t('fl_no_vars')}</div>}
            {vars.map((v) => <PaletteItem onAdd={addBlock} onDragStart={onDragStartItem} key={v.name} spec={{ type: 'var', name: v.name }} icon="variable" label={v.name} tip={`${v.cls} ${(v.dims || []).join('×')}`} mono />)}
            <div className="fp-section small">{t('bh_functions')} · {t('bh_constants')}</div>
            {!engineReady && <div className="pane-empty small muted">{t('ws_no_engine')}</div>}
            {funcs.map((c) => <PaletteItem onAdd={addBlock} onDragStart={onDragStartItem} key={c.name} spec={{ type: 'func', fn: c.name }} icon={c.kind === 'constant' ? 'hash' : 'code'} label={c.name} tip={(ko && c.ko) || c.en} mono />)}
          </div>
        </div>
        <div ref={canvas} className={`fl-canvas ${drag ? 'wiring' : ''}`} tabIndex={0} onKeyDown={onKeyDown}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { gesture.current = null; setDrag(null); }}
          onDragOver={(e) => { if (e.dataTransfer.types.includes(DND)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }} onDrop={onDrop}
          style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${20 * view.zoom}px ${20 * view.zoom}px` }}>
          {!flow.nodes.length && (
            <div className="fl-hint">
              <Icon name="flow" size={28} />
              <strong>{t('fl_empty')}</strong>
              <span className="small muted">{t('fl_empty_hint')}</span>
            </div>
          )}
          <div className="fl-layer" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
            <svg className="fl-wires" width="1" height="1">
              {flow.links.map((l) => {
                const a = byId.get(l.from.node), b = byId.get(l.to.node);
                if (!a || !b) return null;
                const d = wire(a.x + W, a.y + geom(a).outY(l.from.port), b.x, b.y + geom(b).inY(l.to.port));
                return (
                  <g key={l.id} data-link={l.id} className={`fl-wire ${sel.includes(l.id) ? 'on' : ''}`}>
                    <path d={d} className="fl-wire-hit" />
                    <path d={d} className="fl-wire-line" />
                  </g>
                );
              })}
              {drag && (() => { const a = byId.get(drag.from.node); return a ? <path className="fl-wire-line fl-wire-temp" d={wire(a.x + W, a.y + geom(a).outY(drag.from.port), drag.x, drag.y)} /> : null; })()}
            </svg>
            {flow.nodes.map((n) => {
              const g = geom(n);
              const probs = problemsOf.get(n.id);
              return (
                <div key={n.id} data-node={n.id} className={`fl-node fl-${n.type} ${sel.includes(n.id) ? 'on' : ''} ${probs ? 'bad' : ''}`}
                  style={{ left: n.x, top: n.y, width: W, height: g.h }} title={probs ? probs.map(problemText).join('\n') : undefined}>
                  <div className="fl-head" style={{ height: HEAD }}>
                    <Icon name={ICON[n.type]} size={13} /><span className={`ellipsis ${n.type === 'func' ? 'mono' : ''}`}>{titleOf(n)}</span>
                    {probs && <Icon name="alert" size={12} className="fl-warn" />}
                  </div>
                  {n.type === 'const' && (
                    <div className="fl-row" style={{ height: ROW }}>
                      <input className="mono" value={n.value} aria-label={t('fl_value')} title={t('fl_value')} onChange={(e) => patchNode(n.id, { value: e.target.value }, 'value')} />
                    </div>
                  )}
                  {n.type === 'expr' && (
                    <div className="fl-row" style={{ height: ROW }}>
                      <input className="mono" value={n.expr} aria-label={t('fl_formula')} title={t('fl_formula')} onChange={(e) => patchNode(n.id, { expr: e.target.value }, 'expr')} />
                    </div>
                  )}
                  {n.type === 'op' && <div className="fl-row fl-op-sym mono" style={{ height: ROW }}>a {n.op} b</div>}
                  {g.ports.inputs.map((label, i) => {
                    const linked = connected.has(`${n.id}:${i}`);
                    const lit = n.type === 'func' && n.inputs[i] ? n.inputs[i].value : null;
                    return (
                      <div key={`i${i}`} className="fl-row fl-in" style={{ height: ROW }}>
                        <span className={`fl-port in ${linked ? 'linked' : ''}`} data-in={`${n.id}:${i}`} title={label} />
                        <span className="fl-plabel mono ellipsis">{label}</span>
                        {n.type === 'func' && !linked && (
                          <input className="mono fl-lit" value={lit || ''} placeholder={t('fl_optional')} aria-label={`${label} ${t('fl_value')}`}
                            onChange={(e) => patchNode(n.id, { inputs: n.inputs.map((p, k) => (k === i ? { ...p, value: e.target.value } : p)) }, `in${i}`)} />
                        )}
                      </div>
                    );
                  })}
                  {g.ports.outputs.map((label, j) => (
                    <div key={`o${j}`} className="fl-row fl-out" style={{ height: ROW }}>
                      <span className="fl-plabel mono ellipsis">{label}</span>
                      <span className="fl-port out" data-out={`${n.id}:${j}`} title={label} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        <div className="fl-side" style={panes.side ? undefined : { display: 'none' }}>
          <div className="fl-props pane-scroll">
            <div className="fp-section small"><Icon name="settings" size={12} />{t('fl_props')}</div>
            {!selNode && <div className="pane-empty small muted">{sel.length > 1 ? t('fl_multi', { n: sel.length }) : t('fl_pick')}</div>}
            {selNode && <NodeProps node={selNode} help={selNode.type === 'func' ? helpOf[selNode.fn] : null} ko={ko} variables={variables}
              patch={(p, key) => patchNode(selNode.id, p, key)} reshape={(syntax) => { const f = flowRef.current; commit(pruneLinks({ ...f, nodes: f.nodes.map((n) => (n.id === selNode.id ? applySyntax(f, n, syntax) : n)) })); }} />}
          </div>
          <div className="fl-code">
            <div className="fp-section small">
              <Icon name="code" size={12} />{t('fl_code')}<span className="spacer" />
              {gen.problems.length > 0 ? <span className="fl-badge bad">{t('fl_problems', { n: gen.problems.length })}</span> : hasCode && <span className="fl-badge ok"><Icon name="checkCircle" size={11} /></span>}
              <button type="button" className="icon-btn" title={t('copy')} aria-label={t('copy')} disabled={!hasCode} onClick={() => navigator.clipboard && navigator.clipboard.writeText(gen.code)}><Icon name="copy" size={12} /></button>
            </div>
            {gen.problems.map((p, i) => (
              <button key={`${p.node}:${p.code}:${i}`} type="button" className="fl-problem" onClick={() => setSel([p.node])}><Icon name="alert" size={12} /><span>{titleOf(byId.get(p.node) || {})}: {problemText(p)}</span></button>
            ))}
            <pre className="fl-pre mono" data-code="">{hasCode ? gen.code : t('fl_no_code')}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tb({ icon, label, title, onClick, disabled, primary, on }) {
  return <button type="button" className={`fl-tb ${primary ? 'fl-run' : ''} ${on ? 'on' : ''}`} title={title || label} onClick={onClick} disabled={disabled} aria-pressed={on === undefined ? undefined : !!on}><Icon name={icon} size={15} /><span>{label}</span></button>;
}
function PaletteItem({ spec, icon, label, tip, mono, onAdd, onDragStart }) {
  return (
    <button type="button" className="fl-pitem" draggable title={tip || label} onClick={() => onAdd(spec)} onDragStart={(e) => onDragStart(e, spec)}>
      <Icon name={icon} size={13} /><span className={`ellipsis ${mono ? 'mono' : ''}`}>{label}</span>
    </button>
  );
}
function Field({ label, children }) {
  return <label className="fl-field"><span className="small muted">{label}</span>{children}</label>;
}
function NameInput({ value, onChange, label }) {
  return <Field label={label || t('fl_out_name')}><input className={`mono ${isVarName(value) ? '' : 'invalid'}`} value={value || ''} onChange={(e) => onChange(e.target.value)} /></Field>;
}

/** The selected block's settings (names, values, operator, syntax, formula inputs). */
function NodeProps({ node: n, help, ko, variables, patch, reshape }) {
  const nameOk = (v) => isVarName(v);
  const note = <Field label={t('fl_note')}><input value={n.note || ''} placeholder={t('fl_note_ph')} onChange={(e) => patch({ note: e.target.value }, 'note')} /></Field>;
  switch (n.type) {
    case 'const':
      return (
        <div className="fl-propbox">
          <NameInput value={n.name} onChange={(v) => patch({ name: v }, 'name')} label={t('fl_name')} />
          <Field label={t('fl_value')}><textarea className="mono" rows={3} value={n.value} onChange={(e) => patch({ value: e.target.value }, 'value')} /></Field>
          <span className="small muted">{t('fl_value_hint')}</span>
          {note}
        </div>
      );
    case 'var':
      return (
        <div className="fl-propbox">
          <NameInput value={n.name} onChange={(v) => patch({ name: v }, 'name')} label={t('fl_name')} />
          <div className="fl-chips">{(variables || []).map((v) => <button key={v.name} type="button" className={`fl-chip mono ${v.name === n.name ? 'on' : ''}`} onClick={() => patch({ name: v.name })}>{v.name}</button>)}</div>
          <span className="small muted">{t('fl_var_hint')}</span>
        </div>
      );
    case 'op':
      return (
        <div className="fl-propbox">
          <Field label={t('fl_operator')}><span /></Field>
          <div className="fl-chips">{OPS.map((o) => <button key={o.op} type="button" className={`fl-chip mono ${o.op === n.op ? 'on' : ''}`} title={o.label} onClick={() => patch({ op: o.op })}>{o.op}</button>)}</div>
          <NameInput value={n.name} onChange={(v) => patch({ name: v }, 'name')} />
          {note}
        </div>
      );
    case 'expr':
      return (
        <div className="fl-propbox">
          <Field label={t('fl_formula')}><input className="mono" value={n.expr} onChange={(e) => patch({ expr: e.target.value }, 'expr')} /></Field>
          <Field label={t('fl_inputs')}>
            <div className="fl-chips">
              {(n.inputs || []).map((p, i) => (
                <span key={i} className="fl-inname">
                  <input className={`mono ${nameOk(p.label) ? '' : 'invalid'}`} value={p.label} size={4} onChange={(e) => patch({ inputs: n.inputs.map((x, k) => (k === i ? { label: e.target.value } : x)) }, `in${i}`)} />
                </span>
              ))}
              <button type="button" className="icon-btn" title={t('fl_add_input')} aria-label={t('fl_add_input')} onClick={() => patch({ inputs: [...n.inputs, { label: String.fromCharCode(97 + n.inputs.length) }] })}><Icon name="plus" size={12} /></button>
              <button type="button" className="icon-btn" title={t('fl_remove_input')} aria-label={t('fl_remove_input')} disabled={n.inputs.length <= 1} onClick={() => patch({ inputs: n.inputs.slice(0, -1) })}><Icon name="minus" size={12} /></button>
            </div>
          </Field>
          <NameInput value={n.name} onChange={(v) => patch({ name: v }, 'name')} />
          {note}
        </div>
      );
    case 'disp':
      return (
        <div className="fl-propbox">
          <Field label={t('fl_label')}><input value={n.label || ''} placeholder={t('fl_label_ph')} onChange={(e) => patch({ label: e.target.value }, 'label')} /></Field>
        </div>
      );
    case 'func': {
      const desc = help ? (ko && help.ko) || help.en || '' : '';
      return (
        <div className="fl-propbox">
          <div className="fl-fn"><strong className="mono">{n.fn}</strong>{desc && <span className="small">{desc}</span>}</div>
          {help && help.syntax && help.syntax.length > 0 && (
            <Field label={t('fl_syntax')}>
              <div className="fl-syntaxes">
                {help.syntax.map((s) => <button key={s} type="button" className={`fl-chip mono ${s === n.syntax ? 'on' : ''}`} onClick={() => reshape(s)}>{s}</button>)}
              </div>
            </Field>
          )}
          {(n.inputs || []).map((p, i) => (
            <Field key={i} label={`${t('fl_input')} ${p.label}`}>
              <input className="mono" value={p.value || ''} placeholder={t('fl_optional')} onChange={(e) => patch({ inputs: n.inputs.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)) }, `in${i}`)} />
            </Field>
          ))}
          {(n.names || []).map((nm, i) => (
            <NameInput key={i} value={nm} label={`${t('fl_out_name')} (${n.outputs[i]})`} onChange={(v) => patch({ names: n.names.map((x, k) => (k === i ? v : x)) }, `out${i}`)} />
          ))}
          {note}
        </div>
      );
    }
    default: return null;
  }
}

