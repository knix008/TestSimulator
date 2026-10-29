// HIS metrics (C/C++), architecture dependency graph and the exception
// approval queue.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t, textOf, useLanguage, getLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon } from '../components/Chrome';
import { Inspector } from '../components/Layout';
import { Btn, BtnGroup, Toggle, ViewHeader, Empty, NoProject, Stat, SevBadge, TypeBadge, fmtDate, errorText, emitAction, Glossary, openCodeRow, useRowWindow } from './common';
import { useFocus, FocusStat, FocusAll } from '../components/FocusStats';

function useLoad(method, args, deps, enabled) {
  const [state, setState] = useState({ data: null, error: '', loading: false });
  const load = async (fresh) => {
    if (!enabled) return;
    setState((s) => ({ ...s, loading: true, error: '' }));
    try { setState({ data: await call(method, fresh === true ? { ...args, fresh: true } : args), error: '', loading: false }); } catch (err) { setState({ data: null, error: errorText(err), loading: false, code: err.code }); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, deps);
  return { ...state, reload: () => load(true) };
}

// ── HIS metrics ───────────────────────────────────────────
const HIS = ['COMF', 'PATH', 'GOTO', 'VG', 'CALLING', 'CALLS', 'PARAM', 'STMT', 'LEVEL', 'RETURN', 'VOCF', 'ap_cg_cycle'];

function violates(meta, v) {
  if (!meta || typeof v !== 'number' || meta.limit == null) return false;
  return meta.kind === 'min' ? v <= meta.limit : v > meta.limit;
}
function fmtNum(v) {
  if (v == null) return '—';
  if (typeof v === 'number' && !Number.isInteger(v)) return String(Math.round(v * 100) / 100);
  return String(v);
}

export function HisView({ project, stamp, onOpenAt }) {
  useLanguage();
  const pid = project && project.id;
  const res = useLoad('metrics.his', { projectId: pid }, [pid, stamp], !!project);
  const [sort, setSort] = useState({ key: 'VG', dir: -1 });
  // A summary tile shows its functions alone: 'violating' or one metric ('m:VG').
  const [focus, toggleFocus, clearFocus] = useFocus('his', pid || '');
  const onlyBad = focus === 'violating';
  const metricFocus = focus && focus.startsWith('m:') ? focus.slice(2) : null;
  const data = res.data;
  const metrics = (data && data.summary && data.summary.metrics) || {};
  const cols = HIS.filter((m) => metrics[m] || (data && data.rows.some((r) => r[m] != null)));
  const rows = useMemo(() => {
    if (!data) return [];
    const bad = (r) => cols.some((m) => violates(metrics[m], r[m]));
    const list = metricFocus ? data.rows.filter((r) => violates(metrics[metricFocus], r[metricFocus])) : onlyBad ? data.rows.filter(bad) : [...data.rows];
    const val = (r) => (sort.key === 'function' ? `${r.file}:${r.function}` : r[sort.key]);
    return list.sort((a, b) => {
      const x = val(a); const y = val(b);
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * sort.dir;
      return String(x ?? '').localeCompare(String(y ?? '')) * sort.dir;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sort, onlyBad, metricFocus]);
  const { rows: shown, footer } = useRowWindow(rows);
  // The analyzer's own name and explanation of each metric (core/his) as the tooltip.
  const tipOf = (id) => { const m = metrics[id] || {}; const lang = getLanguage(); return { 'data-tip-title': `${id} · ${(m.label && (m.label[lang] || m.label.en)) || t(`his_${id}`)}`, 'data-tip-text': `${(m.why && (m.why[lang] || m.why.en)) || t(`his_${id}`)} ${t('gl_his_limit', { limit: limitText(m) })}`.trim() }; };
  const head = (key, label) => (
    <th key={key} className={`num sortable ${sort.key === key ? 'sorted' : ''}`} onClick={() => setSort({ key, dir: sort.key === key ? -sort.dir : -1 })}>
      <span {...tipOf(key)}>{label}</span>{sort.key === key && <Icon name={sort.dir > 0 ? 'chevronUp' : 'chevronDown'} size={11} />}
    </th>
  );
  const limitText = (m) => (m.limit == null ? '' : m.kind === 'min' ? `> ${m.limit}` : `≤ ${m.limit}`);
  return (
    <div className={`view ${data && data.rows.length > 0 ? 'view-list' : ''}`}>
      <ViewHeader icon="cpu" title={t('nav_his')} hint={t('vh_his')}>
        <Toggle checked={onlyBad} icon="alert" label={t('his_only_bad')} onChange={(v) => (v ? toggleFocus('violating') : clearFocus())} />
        <FocusAll focus={metricFocus ? focus : null} onClear={clearFocus} />
        <Btn icon="refresh" label={t('pf_refresh')} disabled={!project || res.loading} onClick={res.reload} />
      </ViewHeader>
      {!project && <NoProject />}
      {res.loading && !data && <Empty icon="hourglass" text={t('loading')} />}
      {res.error && <Empty icon="alert" text={res.error} />}
      {data && data.rows.length === 0 && <Empty icon="cpu" text={t('his_empty')} hint={t('his_empty_hint')} />}
      {data && data.rows.length > 0 && (
        <>
          <div className="card-grid compact">
            <Stat icon="code" label={t('his_functions')} value={data.summary.functions} />
            <FocusStat id="violating" focus={focus} onToggle={toggleFocus} icon="alert" label={t('his_violating')} value={data.summary.violatingFunctions} tone={data.summary.violatingFunctions ? 'bad' : 'ok'}
              sub={data.summary.functions ? `${Math.round((data.summary.violatingFunctions / data.summary.functions) * 100)}%` : ''} />
          </div>
          <Glossary id="his" terms={cols.map((id) => { const m = metrics[id] || {}; const lang = getLanguage(); return [id, (m.label && (m.label[lang] || m.label.en)) || t(`his_${id}`), `${(m.why && (m.why[lang] || m.why.en)) || ''} ${t('gl_his_limit', { limit: limitText(m) })}`.trim()]; })} />
          <div className="his-grid">
            {cols.map((id) => {
              const m = metrics[id] || {};
              return (
                <button key={id} type="button" className={`card his-card focus-stat ${m.violations ? 'bad' : ''} ${focus === `m:${id}` ? 'on' : ''}`} aria-pressed={focus === `m:${id}`} data-focus={`m:${id}`}
                  title={focus === `m:${id}` ? t('fs_show_all_tip') : t('his_focus_tip', { id })}
                  onClick={() => { if (focus !== `m:${id}`) setSort({ key: id, dir: m.kind === 'min' ? 1 : -1 }); toggleFocus(`m:${id}`); }}>
                  <div className="k"><span className="mono" {...tipOf(id)}>{id}</span><span className="his-limit">{limitText(m)}</span></div>
                  <div className={`v ${m.violations ? 'bad' : 'ok'}`}>{m.violations || 0}</div>
                  <div className="small">{t('his_avg_max', { avg: fmtNum(m.avg), max: fmtNum(m.max) })}</div>
                </button>
              );
            })}
          </div>
          <div className="panel tpanel list-grow">
            <div className="table-wrap tall">
              <table className="his-table">
                <thead>
                  <tr>
                    <th className={`sortable ${sort.key === 'function' ? 'sorted' : ''}`} onClick={() => setSort({ key: 'function', dir: sort.key === 'function' ? -sort.dir : 1 })}>{t('his_function')}</th>
                    {cols.map((id) => head(id, id))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={`${r.file}:${r.line}:${r.function}`} className="click" title={t('his_open')} onClick={() => onOpenAt(r.file, r.line)}>
                      <td className="wrap"><span className="mono">{r.function}</span><div className="small">{r.file}:{r.line}</div></td>
                      {cols.map((id) => <td key={id} className={`num ${violates(metrics[id], r[id]) ? 'cell-bad' : ''}`}>{fmtNum(r[id])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {footer}
              {rows.length === 0 && <Empty icon="checkCircle" text={t('his_no_violations')} />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Architecture ──────────────────────────────────────────
// Tarjan strongly connected components; returns component index per node.
function sccOf(ids, out) {
  let index = 0;
  const idx = new Map(); const low = new Map(); const on = new Set(); const stack = []; const comp = new Map(); const comps = [];
  const visit = (v) => {
    idx.set(v, index); low.set(v, index); index++; stack.push(v); on.add(v);
    for (const w of out.get(v) || []) {
      if (!idx.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); } else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const c = [];
      let w;
      do { w = stack.pop(); on.delete(w); comp.set(w, comps.length); c.push(w); } while (w !== v);
      comps.push(c);
    }
  };
  for (const v of ids) if (!idx.has(v)) visit(v);
  return { comp, comps };
}

function layout(nodes, edges) {
  const ids = nodes.map((n) => n.id);
  const out = new Map(ids.map((id) => [id, []]));
  for (const e of edges) if (out.has(e.from) && out.has(e.to) && e.from !== e.to) out.get(e.from).push(e.to);
  const { comp, comps } = sccOf(ids, out);
  // Longest path from the top (modules nothing depends on) over the condensed DAG.
  const cOut = comps.map(() => new Set());
  const indeg = comps.map(() => 0);
  for (const [v, ws] of out) for (const w of ws) { const a = comp.get(v); const b = comp.get(w); if (a !== b && !cOut[a].has(b)) { cOut[a].add(b); indeg[b]++; } }
  const level = comps.map(() => 0);
  const queue = comps.map((_, i) => i).filter((i) => indeg[i] === 0);
  while (queue.length) {
    const a = queue.shift();
    for (const b of cOut[a]) { level[b] = Math.max(level[b], level[a] + 1); if (--indeg[b] === 0) queue.push(b); }
  }
  const levels = new Map();
  for (const n of nodes) { const l = level[comp.get(n.id)]; if (!levels.has(l)) levels.set(l, []); levels.get(l).push(n); }
  // A wide level wraps into several rows so labels stay readable.
  const maxPerRow = Math.max(4, Math.ceil(Math.sqrt(nodes.length) * 1.6));
  const rows = new Map();
  let r = 0;
  for (const l of [...levels.keys()].sort((a, b) => a - b)) {
    const list = levels.get(l).sort((a, b) => comp.get(a.id) - comp.get(b.id) || a.id.localeCompare(b.id));
    for (let i = 0; i < list.length; i += maxPerRow) rows.set(r++, list.slice(i, i + maxPerRow));
  }
  const W = 150; const H = 34; const GX = 26; const GY = 70;
  const widest = Math.max(1, ...[...rows.values()].map((r) => r.length));
  const pos = new Map();
  for (const [l, list] of rows) {
    const offset = ((widest - list.length) * (W + GX)) / 2;
    list.forEach((n, i) => pos.set(n.id, { x: offset + i * (W + GX), y: l * (H + GY), w: W, h: H }));
  }
  const cycles = comps.filter((c) => c.length > 1 || (out.get(c[0]) || []).includes(c[0]));
  const selfLoops = new Set(edges.filter((e) => e.from === e.to).map((e) => e.from));
  const inCycle = (e) => (e.from === e.to ? true : comp.get(e.from) === comp.get(e.to) && comps[comp.get(e.from)].length > 1);
  const width = widest * (W + GX) - GX;
  const height = (Math.max(0, ...rows.keys()) + 1) * (H + GY) - GY;
  return { pos, cycles: [...cycles, ...[...selfLoops].filter((id) => !cycles.some((c) => c.includes(id))).map((id) => [id])], inCycle, width: Math.max(width, W), height: Math.max(height, H) };
}

function instabilityColor(i) {
  const v = Math.max(0, Math.min(1, Number(i) || 0));
  return `hsl(${Math.round(200 - 170 * v)} 75% 50%)`;
}

function shortName(id) {
  const parts = String(id).split(/[\\/]/).filter(Boolean);
  const s = parts.slice(-2).join('/');
  return s.length > 20 ? `…${s.slice(-19)}` : s;
}

function Graph({ nodes, edges, lay, selected, onSelect }) {
  useLanguage();
  const box = useRef(null);
  const pad = 20;
  // Small graphs are not blown up: the view is at least 900 x 380 units, centred.
  const fit = () => {
    const w = Math.max(lay.width + pad * 2, 900);
    const h = Math.max(lay.height + pad * 2, 380);
    return { x: -pad - (w - lay.width - pad * 2) / 2, y: -pad - (h - lay.height - pad * 2) / 2, w, h };
  };
  const [vb, setVb] = useState(fit);
  const drag = useRef(null);
  useEffect(() => { setVb(fit()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [lay]);
  const zoom = (factor, cx, cy) => setVb((v) => {
    const w = Math.max(80, Math.min(v.w * factor, (lay.width + pad * 2) * 6));
    const h = (w / v.w) * v.h;
    const px = cx == null ? v.x + v.w / 2 : cx; const py = cy == null ? v.y + v.h / 2 : cy;
    return { x: px - ((px - v.x) * w) / v.w, y: py - ((py - v.y) * h) / v.h, w, h };
  });
  const toSvg = (e) => {
    const r = box.current.getBoundingClientRect();
    const s = Math.max(vb.w / r.width, vb.h / r.height);
    const ox = (r.width * s - vb.w) / 2; const oy = (r.height * s - vb.h) / 2;
    return { x: vb.x - ox + (e.clientX - r.left) * s, y: vb.y - oy + (e.clientY - r.top) * s, s };
  };
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const onWheel = (e) => { e.preventDefault(); const p = toSvg(e); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, p.x, p.y); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });
  const near = selected ? new Set(edges.filter((e) => e.from === selected || e.to === selected).flatMap((e) => [e.from, e.to])) : null;
  return (
    <div className="graph-wrap">
      <div className="graph-tools">
        <BtnGroup>
          <Btn icon="plus" label={t('ag_zoom_in')} onClick={() => zoom(1 / 1.25)} />
          <Btn icon="minus" label={t('ag_zoom_out')} onClick={() => zoom(1.25)} />
          <Btn icon="grid" label={t('ag_fit')} onClick={() => setVb(fit())} />
        </BtnGroup>
        <span className="legend">
          <span className="legend-item"><span className="swatch" style={{ background: instabilityColor(0) }} />{t('ag_stable')}</span>
          <span className="legend-item"><span className="swatch" style={{ background: instabilityColor(0.5) }} />I = 0.5</span>
          <span className="legend-item"><span className="swatch" style={{ background: instabilityColor(1) }} />{t('ag_unstable')}</span>
          <span className="legend-item"><span className="swatch" style={{ background: 'var(--danger)' }} />{t('ag_cycle_edge')}</span>
        </span>
      </div>
      <svg ref={box} className="arch-graph" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="img" aria-label={t('nav_arch')}
        onMouseDown={(e) => { if (e.button === 0) drag.current = { cx: e.clientX, cy: e.clientY, s: toSvg(e).s, vb }; }}
        onMouseMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setVb({ ...d.vb, x: d.vb.x - (e.clientX - d.cx) * d.s, y: d.vb.y - (e.clientY - d.cy) * d.s });
        }}
        onMouseUp={() => { drag.current = null; }} onMouseLeave={() => { drag.current = null; }}>
        <defs>
          <marker id="ag-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" className="ag-arrow" /></marker>
          <marker id="ag-arrow-bad" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" className="ag-arrow bad" /></marker>
        </defs>
        {edges.map((e, i) => {
          const a = lay.pos.get(e.from); const b = lay.pos.get(e.to);
          if (!a || !b || e.from === e.to) return null;
          const bad = lay.inCycle(e);
          const dim = near && !(e.from === selected || e.to === selected);
          const x1 = a.x + a.w / 2; const x2 = b.x + b.w / 2;
          const same = Math.abs(a.y - b.y) < 1;
          const down = b.y >= a.y + a.h;
          const y1 = same ? a.y : down ? a.y + a.h : a.y;
          const y2 = same ? b.y : down ? b.y : b.y + b.h;
          const c1 = same ? y1 - 46 : (y1 + y2) / 2;
          const c2 = same ? y2 - 46 : (y1 + y2) / 2;
          return (
            <path key={i} d={`M${x1} ${y1} C${x1} ${c1} ${x2} ${c2} ${x2} ${y2}`} className={`ag-edge ${bad ? 'bad' : ''} ${dim ? 'dim' : ''}`}
              strokeWidth={Math.min(4, 1 + Math.log2(e.count || 1))} markerEnd={`url(#${bad ? 'ag-arrow-bad' : 'ag-arrow'})`}>
              <title>{`${e.from} → ${e.to}${e.count ? ` (${e.count})` : ''}`}</title>
            </path>
          );
        })}
        {nodes.map((n) => {
          const p = lay.pos.get(n.id);
          if (!p) return null;
          const dim = near && !near.has(n.id) && n.id !== selected;
          return (
            <g key={n.id} className={`ag-node ${selected === n.id ? 'on' : ''} ${dim ? 'dim' : ''}`} transform={`translate(${p.x} ${p.y})`}
              onMouseDown={(e) => e.stopPropagation()} onClick={() => onSelect(selected === n.id ? null : n.id)}>
              <title>{`${n.id}\nCa ${n.ca} · Ce ${n.ce} · I ${fmtNum(n.instability)}`}</title>
              <rect width={p.w} height={p.h} rx="7" style={{ stroke: instabilityColor(n.instability) }} />
              <rect width="6" height={p.h} rx="3" style={{ fill: instabilityColor(n.instability) }} />
              <text x="14" y={p.h / 2 + 4}>{shortName(n.id)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// The four summary tiles of the architecture view; each shows its kind alone.
const ARCH_FOCUS = ['modules', 'deps', 'cycles', 'issues'];

// The modules an architecture finding names, from its English message:
// "'a' depends on 'b'", "'a' depends on 12 modules", "Dependency cycle: a -> b -> a".
function issueEnds(issue) {
  const m = issue && issue.message;
  const en = String(m && typeof m === 'object' ? m.en || '' : m || '');
  const dep = /'([^']+)'(?: \(instability [^)]*\))? depends on (?:the less stable )?'([^']+)'/.exec(en);
  if (dep) return { from: dep[1], to: dep[2] };
  const many = /^'([^']+)' depends on \d+ modules/.exec(en);
  if (many) return { from: many[1], to: '' };
  const cyc = /^Dependency cycle: (.+?)(?: \(\d+ modules.*)?\.$/.exec(en);
  if (cyc) { const p = cyc[1].split(' -> '); return { from: p[0] || '', to: p[1] || '' }; }
  return { from: '', to: '' };
}

// One loop through a cycle group, in order: the shortest way from its first
// module back to itself (a self loop is [a, a]).
function cyclePath(members, out) {
  const set = new Set(members);
  const start = [...members].sort()[0];
  if (members.length === 1) return [start, start];
  const prev = new Map();
  const queue = [start];
  for (let k = 0; k < queue.length; k++) {
    const v = queue[k];
    for (const w of out.get(v) || []) {
      if (!set.has(w)) continue;
      if (w === start) {
        const back = [];
        for (let x = v; x !== start; x = prev.get(x)) back.push(x);
        return [start, ...back.reverse(), start];
      }
      if (!prev.has(w)) { prev.set(w, v); queue.push(w); }
    }
  }
  return [...members, start];
}

function sortRows(list, sort) {
  const { key, dir } = sort;
  return [...list].sort((a, b) => {
    const x = a[key]; const y = b[key];
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir || String(a.id).localeCompare(String(b.id));
    return String(x ?? '').localeCompare(String(y ?? '')) * dir;
  });
}

// A sortable table of one focused kind, one page of rows at a time.
function FocusTable({ list, cols, sort, onSort, rowKey, onRow, selected, empty }) {
  useLanguage();
  const { rows, footer } = useRowWindow(list);
  return (
    <div className="panel tpanel list-grow">
      <div className="table-wrap tall">
        <table className="arch-focus-table" data-testid="arch-focus-table" data-rows={list.length}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={`${c.num ? 'num' : ''} ${c.nosort ? '' : 'sortable'} ${sort.key === c.key ? 'sorted' : ''}`}
                  onClick={c.nosort ? undefined : () => onSort({ key: c.key, dir: sort.key === c.key ? -sort.dir : c.num ? -1 : 1 })}>
                  <span data-term={c.term}>{c.label}</span>{sort.key === c.key && <Icon name={sort.dir > 0 ? 'chevronUp' : 'chevronDown'} size={11} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} className={`click ${selected != null && selected === rowKey(r) ? 'sel' : ''}`} onClick={() => onRow(r)}>
                {cols.map((c) => <td key={c.key} className={c.num ? 'num' : c.cls || 'wrap'}>{c.render ? c.render(r) : r[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {footer}
        {list.length === 0 && empty}
      </div>
    </div>
  );
}

export function ArchView({ project, stamp, issues, onOpenAt }) {
  useLanguage();
  const pid = project && project.id;
  const res = useLoad('arch.graph', { projectId: pid }, [pid, stamp], !!project);
  const [selected, setSelected] = useState(null);
  const [sort, setSort] = useState({ key: 'instability', dir: -1 });
  const [focus, toggleFocus, clearFocus] = useFocus('arch', pid || '', ARCH_FOCUS);
  const [q, setQ] = useState('');
  const [fSort, setFSort] = useState({});
  const [pickCycle, setPickCycle] = useState(0);
  const data = res.data;
  const lay = useMemo(() => (data ? layout(data.nodes, data.edges) : null), [data]);
  const archIssues = useMemo(() => (issues || []).filter((i) => String(i.rule || '').startsWith('arch:')), [issues]);
  const modules = useMemo(() => {
    if (!data) return [];
    return [...data.nodes].sort((a, b) => {
      const x = a[sort.key]; const y = b[sort.key];
      return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [data, sort]);

  // ── Focused lists (computed once per graph, filtered and sorted per view) ──
  const base = useMemo(() => {
    if (!data || !lay) return null;
    const out = new Map();
    const edgeOf = new Map();
    for (const e of data.edges) {
      if (!out.has(e.from)) out.set(e.from, []);
      out.get(e.from).push(e.to);
      edgeOf.set(`${e.from}\u0000${e.to}`, e);
    }
    const perFile = new Map();
    for (const i of issues || []) if (i.file) perFile.set(i.file, (perFile.get(i.file) || 0) + 1);
    const violated = new Map();
    const ends = archIssues.map((i) => ({ issue: i, ...issueEnds(i) }));
    for (const x of ends) {
      if (!x.from || !x.to || x.issue.rule === 'arch:cycle') continue;
      const k = `${x.from}\u0000${x.to}`;
      if (!violated.has(k)) violated.set(k, new Set());
      violated.get(k).add(x.issue.rule);
    }
    const mods = data.nodes.map((n) => {
      const files = Array.isArray(n.files) ? n.files : [n.file];
      return { id: n.id, files: files.length, lines: Number(n.lines) || 0, ca: n.ca, ce: n.ce, instability: n.instability,
        issues: files.reduce((s, f) => s + (perFile.get(f) || 0), 0), file: n.file };
    });
    const deps = data.edges.map((e) => {
      const rules = new Set(violated.get(`${e.from}\u0000${e.to}`) || []);
      if (lay.inCycle(e)) rules.add('arch:cycle');
      return { id: `${e.from}\u0000${e.to}`, from: e.from, to: e.to, count: e.count || 1, file: e.file, line: e.line, rules: [...rules].sort(), violation: rules.size };
    });
    const cycles = lay.cycles.map((members) => {
      const set = new Set(members);
      const path = cyclePath(members, out);
      const steps = [];
      for (let i = 0; i + 1 < path.length; i++) steps.push(edgeOf.get(`${path[i]}\u0000${path[i + 1]}`) || { from: path[i], to: path[i + 1] });
      const inner = data.edges.filter((e) => set.has(e.from) && set.has(e.to));
      return { id: path[0], members, size: members.length, path, steps, inner };
    }).sort((a, b) => b.size - a.size || a.id.localeCompare(b.id));
    const findings = ends.map((x) => ({ id: x.issue.key, rule: x.issue.rule, from: x.from, to: x.to, message: textOf(x.issue.message), severity: x.issue.severity,
      file: x.issue.file, line: x.issue.line, where: `${x.issue.file || ''}:${x.issue.line || ''}` }));
    return { mods, deps, cycles, findings };
  }, [data, lay, issues, archIssues]);

  const needle = q.trim().toLowerCase();
  const has = (s) => String(s || '').toLowerCase().includes(needle);
  const sortOf = (kind, fallback) => fSort[kind] || fallback;
  const setSortOf = (kind) => (s) => setFSort((m) => ({ ...m, [kind]: s }));
  const focusList = useMemo(() => {
    if (!base || !focus) return [];
    if (focus === 'modules') return sortRows(needle ? base.mods.filter((m) => has(m.id)) : base.mods, sortOf('modules', { key: 'issues', dir: -1 }));
    if (focus === 'deps') return sortRows(needle ? base.deps.filter((e) => has(e.from) || has(e.to)) : base.deps, sortOf('deps', { key: 'count', dir: -1 }));
    if (focus === 'cycles') return needle ? base.cycles.filter((c) => c.members.some(has)) : base.cycles;
    return sortRows(needle ? base.findings.filter((f) => has(f.from) || has(f.to) || has(f.where) || has(f.message)) : base.findings, sortOf('issues', { key: 'rule', dir: 1 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, focus, needle, fSort]);
  useEffect(() => { setPickCycle(0); }, [focus, needle, base]);
  const cycle = focus === 'cycles' ? focusList[Math.min(pickCycle, focusList.length - 1)] : null;
  const cycleGraph = useMemo(() => {
    if (!cycle) return null;
    const members = new Set(cycle.members);
    const nodes = data.nodes.filter((n) => members.has(n.id));
    return { nodes, edges: cycle.inner, lay: layout(nodes, cycle.inner) };
  }, [cycle, data]);

  const th = (key, label, term) => <th className={`${key === 'id' ? '' : 'num'} sortable ${sort.key === key ? 'sorted' : ''}`} onClick={() => setSort({ key, dir: sort.key === key ? -sort.dir : -1 })}><span data-term={term}>{label}</span>{sort.key === key && <Icon name={sort.dir > 0 ? 'chevronUp' : 'chevronDown'} size={11} />}</th>;
  const sel = selected && data ? data.nodes.find((n) => n.id === selected) : null;
  const noMatch = <Empty icon="search" text={t('fs_no_match')} />;
  const ruleChips = (rules) => (rules.length ? <span className="chips">{rules.map((r) => <span key={r} className="status-pill tone-bad">{r}</span>)}</span> : <span className="muted">—</span>);
  const openAt = (file, line) => { if (file) onOpenAt(file, line || 1); };
  return (
    <div className={`view ${focus && data && data.nodes.length > 0 ? 'view-list' : ''}`}>
      <ViewHeader icon="flow" title={t('nav_arch')} hint={t('vh_arch')}>
        <FocusAll focus={data && data.nodes.length > 0 ? focus : null} onClear={clearFocus} />
        <Btn icon="settings" label={t('ar_settings')} onClick={() => emitAction('adminSettings')} title={t('ar_settings_tip')} />
        <Btn icon="refresh" label={t('pf_refresh')} disabled={!project || res.loading} onClick={res.reload} />
      </ViewHeader>
      {!project && <NoProject />}
      {res.loading && !data && <Empty icon="hourglass" text={t('loading')} />}
      {res.error && <Empty icon="alert" text={res.error} />}
      {data && data.nodes.length === 0 && <Empty icon="flow" text={t('ag_empty')} hint={t('ag_empty_hint')} />}
      {data && data.nodes.length > 0 && (
        <>
          <div className="card-grid compact" role="group" aria-label={t('fs_group')}>
            <FocusStat id="modules" focus={focus} onToggle={toggleFocus} icon="grid" label={t('ag_modules')} value={data.nodes.length} />
            <FocusStat id="deps" focus={focus} onToggle={toggleFocus} icon="link" label={t('ag_dependencies')} value={data.edges.length} />
            <FocusStat id="cycles" focus={focus} onToggle={toggleFocus} icon="refresh" term="cycle" label={t('ag_cycles')} value={lay.cycles.length} tone={lay.cycles.length ? 'bad' : 'ok'} />
            <FocusStat id="issues" focus={focus} onToggle={toggleFocus} icon="alert" label={t('ag_arch_issues')} value={archIssues.length} tone={archIssues.length ? 'bad' : 'ok'} />
          </div>
          {focus && (
            <div className="view-toolbar">
              <span className="search-box"><Icon name="search" size={14} /><input className="search" value={q} placeholder={t('ag_filter_ph')} aria-label={t('ag_filter_ph')} onChange={(e) => setQ(e.target.value)} /></span>
              <span className="small muted" data-testid="arch-focus-count">{t('fs_count', { n: focusList.length.toLocaleString() })}</span>
            </div>
          )}
          {focus === 'modules' && (
            <FocusTable list={focusList} sort={sortOf('modules', { key: 'issues', dir: -1 })} onSort={setSortOf('modules')} rowKey={(r) => r.id}
              onRow={(r) => openAt(r.file, 1)} empty={needle ? noMatch : <Empty icon="grid" text={t('ag_empty')} />}
              cols={[
                { key: 'id', label: t('ag_module'), cls: 'wrap mono' },
                { key: 'files', label: t('files'), num: true },
                { key: 'lines', label: t('ag_lines'), num: true },
                { key: 'ca', label: t('ag_incoming'), num: true, term: 'ca' },
                { key: 'ce', label: t('ag_outgoing'), num: true, term: 'ce' },
                { key: 'instability', label: 'I', num: true, term: 'instability', render: (r) => fmtNum(r.instability) },
                { key: 'issues', label: t('nav_issues'), num: true },
              ]} />
          )}
          {focus === 'deps' && (
            <FocusTable list={focusList} sort={sortOf('deps', { key: 'count', dir: -1 })} onSort={setSortOf('deps')} rowKey={(r) => r.id}
              onRow={(r) => openAt(r.file, r.line)} empty={needle ? noMatch : <Empty icon="link" text={t('ag_no_deps')} />}
              cols={[
                { key: 'from', label: t('ag_from'), cls: 'wrap mono' },
                { key: 'to', label: t('ag_to'), cls: 'wrap mono' },
                { key: 'count', label: t('ag_count'), num: true },
                { key: 'violation', label: t('ag_violation'), num: true, render: (r) => ruleChips(r.rules) },
                { key: 'file', label: t('location'), cls: 'small wrap loc', render: (r) => (r.file ? `${r.file}:${r.line}` : '—') },
              ]} />
          )}
          {focus === 'issues' && (
            <FocusTable list={focusList} sort={sortOf('issues', { key: 'rule', dir: 1 })} onSort={setSortOf('issues')} rowKey={(r) => r.id}
              onRow={(r) => openAt(r.file, r.line)} empty={needle ? noMatch : <Empty icon="checkCircle" text={t('ag_no_arch_issues')} />}
              cols={[
                { key: 'rule', label: t('rule'), cls: 'nowrap', render: (r) => <><SevBadge sev={r.severity} /> <span className="mono small">{r.rule}</span></> },
                { key: 'from', label: t('ag_from'), cls: 'wrap mono' },
                { key: 'to', label: t('ag_to'), cls: 'wrap mono', render: (r) => r.to || '—' },
                { key: 'message', label: t('message') },
                { key: 'where', label: t('location'), cls: 'small wrap loc' },
              ]} />
          )}
          {focus === 'cycles' && (
            <div className="split-2 list-grow arch-cycles">
              <FocusTable list={focusList} sort={{ key: 'size', dir: -1 }} onSort={() => {}} rowKey={(r) => r.id}
                selected={cycle ? cycle.id : null} onRow={(r) => setPickCycle(focusList.indexOf(r))}
                empty={needle ? noMatch : <Empty icon="checkCircle" text={t('ag_no_cycles')} />}
                cols={[
                  { key: 'size', label: t('ag_modules'), num: true, nosort: true, render: (r) => <span className="status-pill tone-bad"><Icon name="refresh" size={12} />{r.size}</span> },
                  { key: 'path', label: t('ag_cycle_path'), nosort: true, render: (r) => <span className="mono small">{r.path.map(shortName).join(' → ')}</span> },
                  { key: 'inner', label: t('ag_cycle_inner'), num: true, nosort: true, render: (r) => r.inner.length },
                ]} />
              <div className="panel tpanel arch-cycle-detail">
                {cycle ? (
                  <>
                    <h3 className="sub-title pad"><Icon name="refresh" size={15} />{t('ag_cycle_steps', { n: cycle.size })}</h3>
                    {cycleGraph && <Graph nodes={cycleGraph.nodes} edges={cycleGraph.edges} lay={cycleGraph.lay} selected={null} onSelect={() => {}} />}
                    <div className="table-wrap">
                      <table>
                        <tbody>
                          {cycle.steps.map((e, i) => (
                            <tr key={i} className="click" onClick={() => openAt(e.file, e.line)}>
                              <td className="wrap mono small">{e.from} → {e.to}{i === cycle.steps.length - 1 && <span className="status-pill tone-bad">{t('ag_closes')}</span>}</td>
                              <td className="small wrap loc">{e.file ? `${e.file}:${e.line}` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : <Empty icon="refresh" text={t('ag_cycle_pick')} />}
              </div>
            </div>
          )}
          {!focus && (
            <>
              <Glossary id="arch" terms={[
                ['Ca', t('gl_ca_name'), t('gl_ca')],
                ['Ce', t('gl_ce_name'), t('gl_ce')],
                ['I', t('gl_i_name'), t('gl_i')],
                [t('ag_cycles'), t('gl_cycle_name'), t('gl_cycle')],
                [t('ag_module'), '', t('gl_module')],
              ]} />
              <Graph nodes={data.nodes} edges={data.edges} lay={lay} selected={selected} onSelect={setSelected} />
              {sel && (
                <Inspector revealKey={sel.id}>
                  <div className="chips"><span className="chip"><Icon name="grid" size={11} />{t('ag_module')}</span><span className="chip">{sel.lang}</span><span className="chip">{sel.kind}</span></div>
                  <h3 className="mono wrap">{sel.id}</h3>
                  <div className="card-grid compact">
                    <Stat icon="link" term="ca" label="Ca" value={sel.ca} sub={t('gl_ca_name')} />
                    <Stat icon="flow" term="ce" label="Ce" value={sel.ce} sub={t('gl_ce_name')} />
                    <Stat icon="gauge" term="instability" label="I" value={fmtNum(sel.instability)} sub={t('gl_i_name')} />
                  </div>
                  <h3 className="sub-title"><Icon name="chevronRight" size={15} />{t('ag_uses')}</h3>
                  <p className="small mono wrap">{data.edges.filter((e) => e.from === sel.id).map((e) => e.to).join(', ') || '—'}</p>
                  <h3 className="sub-title"><Icon name="chevronLeft" size={15} />{t('ag_used_by')}</h3>
                  <p className="small mono wrap">{data.edges.filter((e) => e.to === sel.id).map((e) => e.from).join(', ') || '—'}</p>
                  {(Array.isArray(sel.files) ? sel.files : []).length > 0 && <><h3 className="sub-title"><Icon name="file" size={15} />{t('files')}</h3>
                    {sel.files.slice(0, 40).map((f) => <button key={f} type="button" className="insp-row" onClick={() => onOpenAt(f, 1)}><Icon name="file" size={12} /><span className="insp-row-text mono">{f}</span></button>)}</>}
                </Inspector>
              )}
              <div className="split-2" style={{ marginTop: 12 }}>
                <div className="panel tpanel">
                  <h3 className="sub-title pad"><Icon name="grid" size={15} />{t('ag_modules')}</h3>
                  <div className="table-wrap short">
                    <table>
                      <thead><tr>{th('id', t('ag_module'))}{th('ca', 'Ca', 'ca')}{th('ce', 'Ce', 'ce')}{th('instability', 'I', 'instability')}</tr></thead>
                      <tbody>
                        {modules.map((n) => (
                          <tr key={n.id} className={`click ${selected === n.id ? 'sel' : ''}`} onClick={() => setSelected(n.id)}>
                            <td className="wrap mono">{n.id}</td>
                            <td className="num">{n.ca}</td>
                            <td className="num">{n.ce}</td>
                            <td className="num"><span className="i-bar"><span style={{ width: `${Math.round((Number(n.instability) || 0) * 100)}%`, background: instabilityColor(n.instability) }} /></span>{fmtNum(n.instability)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="panel tpanel">
                  <h3 className="sub-title pad"><Icon name="refresh" size={15} />{t('ag_cycles')}</h3>
                  <div className="table-wrap short">
                    {lay.cycles.length === 0 && <Empty icon="checkCircle" text={t('ag_no_cycles')} />}
                    {lay.cycles.length > 0 && (
                      <table>
                        <tbody>
                          {lay.cycles.map((c, i) => (
                            <tr key={i}><td className="wrap"><span className="status-pill tone-bad"><Icon name="refresh" size={12} />{c.length}</span> <span className="mono small">{c.map(shortName).join(' → ')}{c.length > 1 ? ` → ${shortName(c[0])}` : ''}</span></td></tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {archIssues.length > 0 && (
                      <table>
                        <thead><tr><th>{t('ag_arch_issues')}</th></tr></thead>
                        <tbody>
                          {archIssues.map((i) => (
                            <tr key={i.key} className="click" onClick={() => onOpenAt(i.file, i.line)}>
                              <td className="wrap"><SevBadge sev={i.severity} /> {textOf(i.message)}<div className="small">{i.rule} · {i.file}:{i.line}</div></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Exception approval queue ──────────────────────────────
export function ApprovalsView({ project, stamp, onChanged }) {
  useLanguage();
  const pid = project && project.id;
  const res = useLoad('issue.reviews', { projectId: pid, state: 'REQUESTED' }, [pid, stamp], !!project);
  const [checked, setChecked] = useState([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const list = res.data || [];
  useEffect(() => { setChecked((c) => c.filter((k) => list.some((i) => i.key === k))); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [res.data]);
  const act = async (keys, action) => {
    setError('');
    setNote('');
    if (action === 'reject' && !reason.trim()) { setError(t('ap_reason_required')); return; }
    try {
      await call('issue.review', { projectId: pid, keys, action, reason: reason.trim() || undefined });
      setNote(action === 'approve' ? t('ap_approved', { n: keys.length }) : t('ap_rejected', { n: keys.length }));
      setReason('');
      setChecked([]);
      await res.reload();
      if (onChanged) onChanged();
    } catch (err) { setError(errorText(err)); }
  };
  const all = list.length > 0 && checked.length === list.length;
  return (
    <div className={`view ${list.length > 0 ? 'view-list' : ''}`}>
      <ViewHeader icon="userCheck" title={t('nav_approvals')} hint={t('vh_approvals')}>
        <Btn icon="refresh" label={t('pf_refresh')} disabled={!project || res.loading} onClick={res.reload} />
      </ViewHeader>
      {!project && <NoProject />}
      {res.error && <Empty icon="alert" text={res.error} />}
      {project && res.data && list.length === 0 && <Empty icon="checkCircle" text={t('ap_empty')} hint={t('ap_empty_hint')} />}
      {list.length > 0 && (
        <>
          <div className="panel approve-bar">
            <span className="sub-title" style={{ margin: 0 }}><Icon name="check" size={15} />{checked.length ? t('ap_selected', { n: checked.length }) : t('ap_pick')}</span>
            <input value={reason} placeholder={t('ap_reason_ph')} aria-label={t('ap_reason_ph')} onChange={(e) => setReason(e.target.value)} />
            <BtnGroup>
              <Btn icon="thumbsUp" label={t('rv_approve')} primary disabled={!checked.length} onClick={() => act(checked, 'approve')} />
              <Btn icon="xCircle" label={t('rv_reject')} disabled={!checked.length || !reason.trim()} title={reason.trim() ? t('rv_reject') : t('rv_need_reason')} onClick={() => act(checked, 'reject')} />
            </BtnGroup>
          </div>
          {error && <p className="small bad">{error}</p>}
          {note && <p className="small ok"><Icon name="checkCircle" size={13} /> {note}</p>}
          <div className="panel tpanel list-grow">
            <div className="table-wrap tall">
              <table>
                <thead>
                  <tr>
                    <th><input type="checkbox" aria-label={t('ib_select')} checked={all} onChange={() => setChecked(all ? [] : list.map((i) => i.key))} /></th>
                    <th>{t('severity')}</th><th>{t('message')}</th><th>{t('ap_request')}</th><th>{t('ap_by')}</th><th className="act" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((i) => {
                    const r = i.review || {};
                    return (
                      <tr key={i.key} className={i.file ? 'click' : ''} {...openCodeRow(i.file, i.line)}>
                        <td><input type="checkbox" aria-label={t('ib_select')} checked={checked.includes(i.key)} onChange={() => setChecked(checked.includes(i.key) ? checked.filter((k) => k !== i.key) : [...checked, i.key])} /></td>
                        <td className="nowrap"><SevBadge sev={i.severity} /></td>
                        <td className="wrap"><div className="msg-line"><TypeBadge type={i.type} short />{textOf(i.message)}</div><div className="small">{i.rule} · {i.file}:{i.line}</div></td>
                        <td className="wrap"><span className={`status-pill tone-${r.resolution === 'WONTFIX' ? 'info' : 'muted'}`}><Icon name={r.resolution === 'WONTFIX' ? 'thumbsUp' : 'xCircle'} size={12} />{r.resolution === 'WONTFIX' ? t('accept') : t('false_positive')}</span><div className="small">{r.reason}</div></td>
                        <td className="small nowrap"><Icon name="user" size={12} /> {r.requestedBy || '—'}<div>{r.requestedAt ? fmtDate(r.requestedAt) : ''}</div></td>
                        <td className="act">
                          <BtnGroup>
                            <Btn icon="thumbsUp" label={t('rv_approve')} onClick={() => act([i.key], 'approve')} />
                            <Btn icon="xCircle" label={t('rv_reject')} disabled={!reason.trim()} title={reason.trim() ? t('rv_reject') : t('rv_need_reason')} onClick={() => act([i.key], 'reject')} />
                          </BtnGroup>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
