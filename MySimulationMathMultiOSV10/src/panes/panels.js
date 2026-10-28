// Side panels per screen (pure, no React / DOM; tested in test/panels.test.mjs).
//
// A "panel set" is what the left and right sides show for one screen. The
// screen follows the ribbon tab and the active document:
//   home / apps      현재 폴더 | 작업 공간 + 명령 기록
//   plots            플롯 갤러리 | 작업 공간 + 그림 속성
//   editor           현재 폴더 + 문서 구조 | 디버그 + 문서 속성 + 작업 공간
//   variable         작업 공간 (navigator) | 변수 속성
//   help             사용 설명서 목차 | 함수 도움말
//   simulation       (extension point, see below)
// Left = tools (things you pick or apply), right = properties / state of the
// current selection or document.
//
// Settings: settings.panels[key] = { left: Side, right: Side } with
//   Side = { on, w, collapsed, panes: [ids in order], fold: { id: bool }, ratio: { id: weight } }
// key = panelKey(scope, set): 'home' … for the main window, '<scope>:<set>'
// for any other window (a document opened in a child window gets its own sets).
// Without a stored home entry the old global settings.layout is migrated.

/** Every pane: icon + title key (i18n) + one-line role. */
export const PANES = {
  folder: { icon: 'folder', title: 'cf_title' },
  workspace: { icon: 'table', title: 'ws_title' },
  history: { icon: 'history', title: 'hist_title' },
  gallery: { icon: 'chart', title: 'px_gallery' },
  figprops: { icon: 'palette', title: 'px_figprops' },
  outline: { icon: 'tree', title: 'px_outline' },
  debug: { icon: 'bug', title: 'px_debug' },
  docprops: { icon: 'info', title: 'px_docprops' },
  varprops: { icon: 'variable', title: 'px_varprops' },
  guidetoc: { icon: 'book', title: 'px_guidetoc' },
  funchelp: { icon: 'search', title: 'px_funchelp' },
};
export const PANE_IDS = Object.keys(PANES);

/** What the pane chooser offers on each side (tools left, properties / state right). */
export const SIDE_CHOICES = {
  left: ['folder', 'outline', 'gallery', 'guidetoc', 'workspace', 'history'],
  right: ['workspace', 'history', 'figprops', 'debug', 'docprops', 'varprops', 'funchelp', 'folder'],
};

const L_W = 250;
const R_W = 300;

/** The default panes of every screen. */
export const PANEL_SETS = {
  home: { icon: 'home', title: 'rb_home', left: ['folder'], right: ['workspace', 'history'], ratio: { right: { workspace: 0.58, history: 0.42 } } },
  plots: { icon: 'chart', title: 'rb_plots', left: ['gallery'], right: ['workspace', 'figprops'], ratio: { right: { workspace: 0.36, figprops: 0.64 } } },
  editor: { icon: 'script', title: 'rb_editor', left: ['folder', 'outline'], right: ['debug', 'docprops', 'workspace'], ratio: { left: { folder: 0.45, outline: 0.55 }, right: { debug: 0.34, docprops: 0.3, workspace: 0.36 } } },
  variable: { icon: 'variable', title: 've_title', left: ['workspace'], right: ['varprops'] },
  help: { icon: 'book', title: 'rb_help', left: ['guidetoc'], right: ['funchelp'] },
  // ── EXTENSION POINT: 시뮬레이션 ─────────────────────────────
  // For now the simulation screen keeps the home panes (src/sim is being
  // worked on elsewhere). Later: left = the block library (tool), right =
  // the model tree + the selected block's properties. Add those panes to
  // PANES / SIDE_CHOICES, render them in PanelHost.jsx renderPane(), and
  // change the two lists below.
  simulation: { icon: 'model', title: 'rb_simulation', left: ['folder'], right: ['workspace', 'history'], ratio: { right: { workspace: 0.58, history: 0.42 } } },
};
export const PANEL_SET_IDS = Object.keys(PANEL_SETS);

/** The ribbon tab a document kind belongs to (activating the document shows it). */
export function tabForDocKind(kind) {
  if (kind === 'file') return 'editor';
  if (kind === 'figures') return 'plots';
  if (kind === 'model') return 'simulation';
  return null;
}

/**
 * The panel set of the screen. tab: the ribbon tab; docKind: the active
 * document's kind; fromDoc: the screen was last chosen by activating a
 * document (true) or by picking a ribbon tab (false).
 */
export function panelSetFor(tab, docKind = null, fromDoc = false) {
  if (fromDoc && docKind === 'var') return 'variable';
  if (tab === 'apps' || !PANEL_SETS[tab]) return 'home';
  return tab;
}

/** The settings key of a panel set in a window ('main' or another window's scope). */
export function panelKey(scope, set) {
  return !scope || scope === 'main' ? set : `${scope}:${set}`;
}
const setOfKey = (key) => String(key).split(':').pop();

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const clampW = (w, side) => {
  const [lo, hi] = SIDE_LIMITS[side];
  const n = Number(w);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : (side === 'left' ? L_W : R_W);
};
export const SIDE_LIMITS = { left: [170, 520], right: [200, 560] };

/** The default state of one side of a set. */
export function defaultSide(set, side) {
  const def = PANEL_SETS[set] || PANEL_SETS.home;
  return { on: true, w: side === 'left' ? L_W : R_W, collapsed: false, panes: def[side].slice(), fold: {}, ratio: { ...((def.ratio && def.ratio[side]) || {}) } };
}

/** The home sides made from the old global layout (settings.layout). */
export function migrateLayout(layout) {
  const l = isObj(layout) ? layout : {};
  const folder = isObj(l.folder) ? l.folder : {};
  const ws = isObj(l.workspace) ? l.workspace : {};
  const hist = isObj(l.history) ? l.history : {};
  const left = defaultSide('home', 'left');
  const right = defaultSide('home', 'right');
  if (folder.on === false) left.on = false;
  if (folder.w != null) left.w = clampW(folder.w, 'left');
  if (folder.collapsed) left.collapsed = true;
  const panes = [];
  if (ws.on !== false) panes.push('workspace');
  if (hist.on !== false) panes.push('history');
  if (!panes.length) { right.on = false; } else right.panes = panes;
  if (l.rightW != null) right.w = clampW(l.rightW, 'right');
  if (l.rightCollapsed) right.collapsed = true;
  if (typeof l.wsRatio === 'number' && l.wsRatio > 0 && l.wsRatio < 1) right.ratio = { workspace: l.wsRatio, history: 1 - l.wsRatio };
  return { left, right };
}

/** One side of a panel set, resolved (defaults, migration, unknown panes dropped). */
export function sideState(settings, key, side) {
  const set = setOfKey(key);
  const stored = settings && isObj(settings.panels) && isObj(settings.panels[key]) ? settings.panels[key][side] : null;
  let base;
  if (isObj(stored)) base = { ...defaultSide(set, side), ...stored };
  else if (key === 'home') base = migrateLayout(settings && settings.layout)[side];
  else base = defaultSide(set, side);
  const seen = new Set();
  const panes = (Array.isArray(base.panes) ? base.panes : defaultSide(set, side).panes).filter((id) => PANES[id] && !seen.has(id) && seen.add(id));
  return {
    on: base.on !== false,
    w: clampW(base.w, side),
    collapsed: !!base.collapsed,
    panes,
    fold: isObj(base.fold) ? { ...base.fold } : {},
    ratio: isObj(base.ratio) ? { ...base.ratio } : {},
  };
}

/** Both sides of a set. */
export function panelsOf(settings, key) {
  return { left: sideState(settings, key, 'left'), right: sideState(settings, key, 'right') };
}

/** True when the side shows something (on, with at least one pane). */
export const sideShown = (s) => !!s && s.on && s.panes.length > 0;

/**
 * The settings patch that changes one side: the whole resolved side is
 * written (a partial write onto a migrated side would lose the rest).
 */
export function sidePatch(settings, key, side, patch) {
  const cur = sideState(settings, key, side);
  return { panels: { [key]: { [side]: storedSide({ ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) }) } } };
}

/**
 * A side as stored: fold and ratio list every pane (settings are deep-merged,
 * so a key left out would keep its old value).
 */
export function storedSide(s) {
  const fold = {};
  const ratio = {};
  for (const id of PANE_IDS) {
    fold[id] = !!(s.fold && s.fold[id]);
    ratio[id] = s.ratio && Number(s.ratio[id]) > 0 ? Number(s.ratio[id]) : 0;
  }
  return { on: s.on !== false, w: s.w, collapsed: !!s.collapsed, panes: (s.panes || []).slice(), fold, ratio };
}

/** The settings patch that puts a set back to its defaults. */
export function resetPatch(key) {
  const set = setOfKey(key);
  return { panels: { [key]: { left: storedSide(defaultSide(set, 'left')), right: storedSide(defaultSide(set, 'right')) } } };
}

// ── Pane list edits (pure: (side state, …) → partial side) ──────────
/** Replace pane `from` with `to` in place; when `to` is already shown the two swap places. */
export function swapPane(s, from, to) {
  if (from === to || !PANES[to]) return {};
  const panes = s.panes.slice();
  const i = panes.indexOf(from);
  const j = panes.indexOf(to);
  if (i < 0) return addPane(s, to);
  if (j >= 0) { panes[i] = to; panes[j] = from; } else panes[i] = to;
  const ratio = { ...s.ratio };
  if (j < 0 && ratio[from] != null) { ratio[to] = ratio[from]; delete ratio[from]; }
  return { panes, ratio, on: true };
}
/** Add a pane (after `after`, else at the end). */
export function addPane(s, id, after = null) {
  if (!PANES[id] || s.panes.includes(id)) return { on: true, collapsed: false, fold: { ...s.fold, [id]: false } };
  const panes = s.panes.slice();
  const i = after ? panes.indexOf(after) : -1;
  panes.splice(i >= 0 ? i + 1 : panes.length, 0, id);
  return { panes, on: true, collapsed: false, fold: { ...s.fold, [id]: false } };
}
/** Remove a pane (the side turns off when it was the last one). */
export function removePane(s, id) {
  const panes = s.panes.filter((x) => x !== id);
  return panes.length ? { panes } : { panes: s.panes, on: false };
}
/** Move a pane up (-1) or down (+1). */
export function movePane(s, id, delta) {
  const panes = s.panes.slice();
  const i = panes.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= panes.length) return {};
  [panes[i], panes[j]] = [panes[j], panes[i]];
  return { panes };
}
/** The panes of a side that are open (not folded) and their flex weights (sum 1). */
export function paneWeights(s) {
  const open = s.panes.filter((id) => !s.fold[id]);
  const raw = open.map((id) => (Number(s.ratio[id]) > 0 ? Number(s.ratio[id]) : 1 / Math.max(1, open.length)));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  const out = {};
  open.forEach((id, i) => { out[id] = raw[i] / sum; });
  return out;
}
/** New weights of two neighbouring panes after a drag: a gets `share` of their joint weight. */
export function splitWeights(weights, a, b, share) {
  const total = (weights[a] || 0) + (weights[b] || 0);
  const k = Math.max(0.1, Math.min(0.9, share));
  return { ...weights, [a]: total * k, [b]: total * (1 - k) };
}
/** Panes that would fit on a side of a set but are not shown. */
export function addablePanes(s, side) {
  return SIDE_CHOICES[side].filter((id) => !s.panes.includes(id));
}

// ── Plot gallery ────────────────────────────────────────────────────
/** [id, icon, template] — the Plots ribbon uses the same templates. */
export const PLOTS = [
  ['plot', 'plotLine', 'plot({v})'], ['area', 'plotArea', 'area({v})'], ['bar', 'plotBar', 'bar({v})'], ['barh', 'plotBarh', 'barh({v})'],
  ['stairs', 'plotStairs', 'stairs({v})'], ['stem', 'plotStem', 'stem({v})'], ['scatter', 'plotScatter', 'scatter(1:numel({v}), {v})'],
  ['histogram', 'plotHist', 'histogram({v})'], ['pie', 'plotPie', 'pie({v})'], ['polarplot', 'plotPolar', 'polarplot({v})'],
  ['semilogy', 'plotLog', 'semilogy({v})'], ['surf', 'plotSurf', 'surf({v})'], ['mesh', 'plotMesh', 'mesh({v})'],
  ['contour', 'plotContour', 'contour({v})'], ['imagesc', 'plotImage', 'imagesc({v})'],
];
export const GALLERY_GROUPS = [
  ['line', 'px_g_line', ['plot', 'area', 'stairs', 'stem', 'scatter', 'semilogy']],
  ['bar', 'px_g_bar', ['bar', 'barh']],
  ['dist', 'px_g_dist', ['histogram', 'pie']],
  ['3d', 'px_g_3d', ['surf', 'mesh']],
  ['contour', 'px_g_contour', ['contour']],
  ['polar', 'px_g_polar', ['polarplot']],
  ['image', 'px_g_image', ['imagesc']],
];
export const NUMERIC = new Set(['double', 'single', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64', 'logical']);
const MATRIX_KINDS = new Set(['surf', 'mesh', 'contour', 'imagesc']);
const VECTOR_KINDS = new Set(['pie', 'scatter', 'polarplot']);
const XY_KINDS = new Set(['plot', 'area', 'bar', 'barh', 'stairs', 'stem', 'scatter', 'semilogy', 'polarplot']);
const XYZ_KINDS = new Set(['surf', 'mesh', 'contour']);
const numel = (v) => (v.dims || []).reduce((a, b) => a * b, 1);
const isVec = (v) => (v.dims || []).length === 2 && (v.dims[0] === 1 || v.dims[1] === 1);
const isMat = (v) => (v.dims || []).length === 2 && v.dims[0] >= 2 && v.dims[1] >= 2;

/**
 * The command of a gallery card for the selected variables ([{ name, dims, cls }],
 * in selection order) → { cmd } or { error: i18n key }.
 *   1 variable: the ribbon template; 2: f(x, y); 3: f(X, Y, Z) for surfaces / contours.
 */
export function plotCommand(id, vars) {
  const entry = PLOTS.find((p) => p[0] === id);
  if (!entry) return { error: 'px_unknown' };
  const list = (vars || []).filter(Boolean);
  if (!list.length) return { error: 'px_need_var' };
  if (list.some((v) => !NUMERIC.has(v.cls))) return { error: 'px_need_numeric' };
  if (list.some((v) => numel(v) === 0)) return { error: 'px_empty' };
  if (list.length === 1) {
    const v = list[0];
    if (MATRIX_KINDS.has(id) && !isMat(v)) return { error: 'px_need_matrix' };
    if (VECTOR_KINDS.has(id) && !isVec(v)) return { error: 'px_need_vector' };
    return { cmd: entry[2].replaceAll('{v}', v.name) };
  }
  if (list.length === 2) {
    if (!XY_KINDS.has(id)) return { error: MATRIX_KINDS.has(id) ? 'px_need_xyz' : 'px_one_var' };
    const [x, y] = list;
    if (!isVec(x)) return { error: 'px_x_vector' };
    const fits = numel(x) === numel(y) || (!VECTOR_KINDS.has(id) && (y.dims[0] === numel(x) || y.dims[1] === numel(x)));
    if (!fits) return { error: 'px_xy_length' };
    return { cmd: `${id}(${x.name}, ${y.name})` };
  }
  if (list.length === 3) {
    if (!XYZ_KINDS.has(id)) return { error: 'px_too_many' };
    const [x, y, z] = list;
    if (!isMat(z)) return { error: 'px_need_matrix' };
    const same = (a) => a.dims.length === 2 && a.dims[0] === z.dims[0] && a.dims[1] === z.dims[1];
    const ok = (same(x) && same(y)) || (isVec(x) && isVec(y) && numel(x) === z.dims[1] && numel(y) === z.dims[0]);
    if (!ok) return { error: 'px_xyz_size' };
    return { cmd: `${id}(${x.name}, ${y.name}, ${z.name})` };
  }
  return { error: 'px_too_many' };
}

// ── Variable properties ─────────────────────────────────────────────
/** What 변수 속성 shows for an engine value (core/value.js shapes). */
export function variableStats(v) {
  if (!v) return null;
  const dims = Array.isArray(v.dims) ? v.dims : [];
  const out = { cls: v.cls, dims, numel: dims.reduce((a, b) => a * b, 1), kind: 'other' };
  if (NUMERIC.has(v.cls) && v.re && !v.sparse) {
    out.kind = 'numeric';
    out.complex = !!v.im;
    let min = Infinity; let max = -Infinity; let sum = 0; let sq = 0; let n = 0; let nan = 0; let nnz = 0;
    const re = v.re;
    for (let i = 0; i < re.length; i++) {
      const x = Number(re[i]);
      if (x !== 0 || (v.im && v.im[i])) nnz += 1;
      if (Number.isNaN(x)) { nan += 1; continue; }
      if (x < min) min = x;
      if (x > max) max = x;
      sum += x; sq += x * x; n += 1;
    }
    const mean = n ? sum / n : NaN;
    out.min = n ? min : NaN;
    out.max = n ? max : NaN;
    out.mean = mean;
    out.std = n > 1 ? Math.sqrt(Math.max(0, (sq - n * mean * mean) / (n - 1))) : (n === 1 ? 0 : NaN);
    out.nan = nan;
    out.nnz = nnz;
    return out;
  }
  if (v.cls === 'char') { out.kind = 'text'; out.length = v.re ? v.re.length : 0; return out; }
  if (v.cls === 'string') { out.kind = 'text'; out.length = Array.isArray(v.data) ? v.data.length : 0; return out; }
  if (v.cls === 'struct') {
    out.kind = 'struct';
    const first = Array.isArray(v.data) ? v.data[0] : null;
    out.fields = (v.fields || []).map((name) => {
      const f = first ? (first instanceof Map ? first.get(name) : first[name]) : null;
      return { name, cls: f ? f.cls : '', dims: f && f.dims ? f.dims : [] };
    });
    return out;
  }
  if ((v.cls === 'table' || v.cls === 'timetable') && v.props) {
    out.kind = 'table';
    out.rows = v.dims ? v.dims[0] : 0;
    out.columns = (v.props.names || []).map((name, i) => {
      const c = (v.props.vars || [])[i];
      return { name, cls: c ? c.cls : '', dims: c && c.dims ? c.dims : [] };
    });
    return out;
  }
  if (v.cls === 'cell') {
    out.kind = 'cell';
    const counts = {};
    for (const x of v.data || []) { const c = (x && x.cls) || 'double'; counts[c] = (counts[c] || 0) + 1; }
    out.classes = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([cls, n]) => ({ cls, n }));
    return out;
  }
  return out;
}

/** A nice step for −/+ on axis limits: 1, 2 or 5 × 10^k, about range / 50. */
export function limitStep(lo, hi) {
  const r = Math.abs(Number(hi) - Number(lo));
  if (!Number.isFinite(r) || r <= 0) return 0.1;
  const raw = r / 50;
  const k = Math.floor(Math.log10(raw));
  const base = raw / 10 ** k;
  const m = base < 1.5 ? 1 : base < 3.5 ? 2 : base < 7.5 ? 5 : 10;
  return Math.max(1e-6, Number((m * 10 ** k).toPrecision(1)));
}
