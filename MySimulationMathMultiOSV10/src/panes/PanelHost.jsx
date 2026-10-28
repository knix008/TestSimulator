// The left and right side panels of a screen (the registry is panels.js).
//
//   <PanelSide side="left|right" setKey settings ctx />   one side: stacked panes with ratio splitters,
//                                                        a width splitter, or the PaneRail when collapsed
//   <PanePool ctx />                                     every pane component, mounted once
//
// Each pane component is rendered once (PanePool, through a portal into its
// own host element); the pane box of the current screen moves that element
// into place. So switching screens or moving a pane to the other side keeps
// the component (the Workspace does not refetch, the folder keeps its tree).
//
// Every pane head: pane chooser (icon + title, an IconSelect of the panes this
// side can show, plus 기본값으로), the pane's own buttons, add pane, fold,
// collapse the side (top pane), close. Right-click: the same as a menu.
import React, { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from '../components/Chrome';
import { Splitter } from '../components/Layout';
import { IconSelect } from '../views/common';
import { openMenu } from '../lib/menu';
import { patchSettings } from '../lib/settings';
import { PANES, PANEL_SETS, SIDE_CHOICES, SIDE_LIMITS, sideState, sideShown, sidePatch, resetPatch, swapPane, addPane, removePane, movePane, paneWeights, splitWeights, addablePanes } from './panels';
import { WorkspacePane } from './Workspace';
import { HistoryPane } from './CommandHistory';
import { CurrentFolderPane } from './CurrentFolder';
import { PlotGallery } from './PlotGallery';
import { FigureProps } from './FigureProps';
import { OutlinePane, DebugPane, DocPropsPane } from './EditorPanes';
import { VarPropsPane } from './VarProps';
import { GuideTocPane, FuncHelpPane } from './HelpPanes';
import { SimPaneGuard } from './Guarded';
import '../panels.css';

const DEFAULT_ID = '__default';
export const paneTitle = (id) => (PANES[id] ? t(PANES[id].title) : id);
const otherSide = (side) => (side === 'left' ? 'right' : 'left');

// ── Host elements (one per pane and window) ─────────────────────────
const hosts = new Map();
function hostEl(scope, id) {
  const key = `${scope}:${id}`;
  let el = hosts.get(key);
  if (!el) { el = document.createElement('div'); el.className = 'pane-host'; el.dataset.paneHost = id; hosts.set(key, el); }
  return el;
}
const mounted = new Map(); // scope → Set of pane ids ever shown

/** Where a pane's host element is shown. */
function PaneSlot({ scope, id, hidden }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = hostEl(scope, id);
    if (ref.current) ref.current.appendChild(el);
    return () => { if (el.parentNode === ref.current) el.remove(); };
  }, [scope, id]);
  return <div ref={ref} className="pane-slot" style={hidden ? { display: 'none' } : undefined} />;
}

/** Every pane component that was ever shown, kept mounted (portals into their host elements). */
export function PanePool({ scope = 'main', ctx, show }) {
  useLanguage();
  const set = mounted.get(scope) || new Set();
  mounted.set(scope, set);
  for (const id of show || []) set.add(id);
  return <>{[...set].map((id) => <Fragment key={id}>{createPortal(renderPane(id, ctx), hostEl(scope, id))}</Fragment>)}</>;
}

/** The component of a pane. */
function renderPane(id, c) {
  switch (id) {
    case 'folder':
      return <CurrentFolderPane cwd={c.cwd} refreshKey={c.folderKey} onChdir={c.changeFolder} onOpen={(p, o) => c.openFile(p, o)} onRun={c.runFilePath} onPathsChanged={c.pathsChanged} />;
    case 'workspace':
      return <WorkspacePane variables={c.variables} selected={c.selectedVar} selection={c.selectedVars} onSelect={c.onSelectVar} onOpen={c.openVariable} onAction={c.workspaceAction} engineReady={c.engineReady} />;
    case 'history':
      return <HistoryPane {...c.historyProps} />;
    case 'gallery':
      return <PlotGallery vars={c.selectedVarObjs} onPlot={(cmd) => c.runCode(cmd)} onFigures={c.showFigures} />;
    case 'figprops':
      return <FigureProps runCode={c.runQuiet} />;
    case 'outline':
      return <OutlinePane doc={c.activeFileDoc} editors={c.editors} />;
    case 'debug':
      return <DebugPane debug={c.debug} breakpoints={c.breakpoints} onOpen={c.openAt} onRemove={c.removeBreakpoint} onRemoveFile={c.removeFileBreakpoints} onReply={c.debugReply} />;
    case 'docprops':
      return <DocPropsPane doc={c.activeFileDoc} editors={c.editors} dirty={c.activeFileDoc ? !!c.docDirty[c.activeFileDoc.id] : false} editorSettings={c.settings.editor} onOptions={c.setDocOptions} />;
    case 'varprops':
      return <VarPropsPane engine={c.engine} name={c.varPropsName} refreshKey={c.varKey} onOpen={c.openVariable} />;
    case 'guidetoc':
      return <GuideTocPane />;
    case 'simlib':
      return <SimPaneGuard which="SimLibraryPane" docId={c.simDocId} lang={c.lang} />;
    case 'simtree':
      return <SimPaneGuard which="SimTreePane" docId={c.simDocId} lang={c.lang} noModelText={t('px_no_model')} />;
    case 'blockprops':
      return <SimPaneGuard which="BlockPropsPane" docId={c.simDocId} lang={c.lang} noModelText={t('px_no_model')} />;
    case 'funchelp':
      return <FuncHelpPane engine={c.engine} engineReady={c.engineReady} onInsert={c.insertToPrompt} />;
    default:
      return null;
  }
}

/** The pane's own head buttons. */
function headActions(id, c) {
  if (id === 'workspace') {
    return <button type="button" className="icon-btn" title={t('rb_clear_ws')} aria-label={t('rb_clear_ws')} disabled={!c.variables.length} onClick={c.clearWorkspace}><Icon name="clearWs" size={13} /></button>;
  }
  return null;
}

/** A collapsed side: a narrow strip with each pane's icon and vertical title; a click opens it again. */
export function PaneRail({ side, items, onOpen }) {
  useLanguage();
  return (
    <div className={`pane-rail ${side}`} data-pane-rail={side}>
      <button type="button" className="icon-btn pane-rail-toggle" title={t('pn_expand')} aria-label={t('pn_expand')} onClick={() => onOpen(null)}><Icon name={side === 'left' ? 'chevronRight' : 'chevronLeft'} size={13} /></button>
      {items.map((it) => (
        <button key={it.id} type="button" className="pane-rail-item" data-rail-pane={it.id} title={`${it.label} — ${t('pn_expand')}`} onClick={() => onOpen(it.id)}>
          <Icon name={it.icon} size={15} /><span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

/** The splitter between two stacked panes: drags the share of the two. */
function PaneSplitter({ a, b, weights, onLive, onCommit }) {
  const down = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const sp = e.currentTarget;
    const pa = sp.previousElementSibling;
    const pb = sp.nextElementSibling;
    if (!pa || !pb) return;
    const ra = pa.getBoundingClientRect();
    const rb = pb.getBoundingClientRect();
    const top = ra.top;
    const total = rb.bottom - ra.top;
    let last = weights;
    const move = (ev) => { last = splitWeights(weights, a, b, (ev.clientY - top) / Math.max(1, total)); onLive(last); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('resizing-y'); onCommit(last); };
    document.body.classList.add('resizing-y');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const key = (e) => {
    const d = e.key === 'ArrowUp' ? -0.05 : e.key === 'ArrowDown' ? 0.05 : 0;
    if (!d) return;
    e.preventDefault();
    const share = (weights[a] || 0) / Math.max(1e-9, (weights[a] || 0) + (weights[b] || 0));
    onCommit(splitWeights(weights, a, b, share + d));
  };
  return <div className="splitter splitter-y pane-splitter" role="separator" aria-orientation="horizontal" tabIndex={0} title={`${paneTitle(a)} / ${paneTitle(b)}`} onPointerDown={down} onKeyDown={key} />;
}

/**
 * One side of the current screen. setKey: panels.js panelKey(); ctx: the
 * data and callbacks the panes need (App builds it).
 */
export function PanelSide({ side, setKey, settings, scope = 'main', ctx }) {
  useLanguage();
  const s = sideState(settings, setKey, side);
  const [live, setLive] = useState(null); // { w } | { weights } while dragging
  const patch = (p) => patchSettings(sidePatch(settings, setKey, side, p));
  if (!sideShown(s)) return null;
  const items = s.panes.map((id) => ({ id, icon: PANES[id].icon, label: paneTitle(id) }));
  if (s.collapsed) {
    return <PaneRail side={side} items={items} onOpen={(id) => patch({ collapsed: false, fold: id ? { ...s.fold, [id]: false } : s.fold })} />;
  }
  const width = live && live.w != null ? live.w : s.w;
  const weights = (live && live.weights) || paneWeights(s);
  const other = sideState(settings, setKey, otherSide(side));

  // Adding a pane that the other side shows moves it here (one instance per pane).
  const takeFromOther = (id) => { if (other.panes.includes(id)) patchSettings(sidePatch(settings, setKey, otherSide(side), removePane(other, id))); };
  const choose = (from, to) => {
    if (to === DEFAULT_ID) { patchSettings(resetPatch(setKey)); return; }
    takeFromOther(to);
    patch(swapPane(s, from, to));
  };
  const add = (id, after) => { takeFromOther(id); patch(addPane(s, id, after)); };
  const close = (id) => patch(removePane(s, id));
  const fold = (id, v) => patch({ fold: { ...s.fold, [id]: v } });

  const addMenu = (e, after) => {
    const r = e.currentTarget.getBoundingClientRect();
    const list = addablePanes(s, side);
    openMenu(r, list.length ? list.map((id) => ({ id, label: paneTitle(id), icon: PANES[id].icon })) : [{ id: '__none', label: t('px_add'), icon: 'plus', disabled: true }], (id) => { if (PANES[id]) add(id, after); });
  };
  const headMenu = (e, id, i) => {
    e.preventDefault();
    const at = { x: e.clientX, y: e.clientY };
    openMenu(at, [
      { id: 'up', label: t('px_move_up'), icon: 'arrowUp', disabled: i === 0 },
      { id: 'down', label: t('px_move_down'), icon: 'chevronDown', disabled: i === s.panes.length - 1 },
      { id: 'fold', label: s.fold[id] ? t('px_unfold') : t('px_fold'), icon: s.fold[id] ? 'unfold' : 'fold' },
      { id: 'collapse', label: t('px_collapse_side'), icon: side === 'left' ? 'chevronLeft' : 'chevronRight' },
      { sep: true },
      ...SIDE_CHOICES[side].map((p) => ({ id: `pane:${p}`, label: paneTitle(p), icon: PANES[p].icon, on: s.panes.includes(p) })),
      { sep: true },
      { id: 'default', label: t('px_default'), icon: 'refresh' },
      { id: 'close', label: t('pn_close'), icon: 'close' },
    ], (pick) => {
      if (pick === 'up') patch(movePane(s, id, -1));
      else if (pick === 'down') patch(movePane(s, id, 1));
      else if (pick === 'fold') fold(id, !s.fold[id]);
      else if (pick === 'collapse') patch({ collapsed: true });
      else if (pick === 'default') patchSettings(resetPatch(setKey));
      else if (pick === 'close') close(id);
      else if (pick.startsWith('pane:')) { const p = pick.slice(5); if (s.panes.includes(p)) close(p); else add(p, id); }
    });
  };

  const options = (id) => [
    ...SIDE_CHOICES[side].map((p) => ({ value: p, label: paneTitle(p), icon: PANES[p].icon })),
    { value: DEFAULT_ID, label: t('px_default'), icon: 'refresh' },
  ];

  const boxes = [];
  s.panes.forEach((id, i) => {
    const folded = !!s.fold[id];
    const prev = s.panes[i - 1];
    if (i > 0 && !folded && prev && !s.fold[prev]) {
      boxes.push(<PaneSplitter key={`sp:${prev}:${id}`} a={prev} b={id} weights={weights}
        onLive={(w) => setLive({ weights: w })} onCommit={(w) => { setLive(null); patch({ ratio: { ...s.ratio, ...w } }); }} />);
    }
    boxes.push(
      <div key={id} className={`pane-box side-pane ${folded ? 'folded' : ''}`} data-pane={id} style={folded ? { flex: 'none' } : { flex: `${weights[id] || 1} 1 0px` }}>
        <div className="pane-head" onContextMenu={(e) => headMenu(e, id, i)} onDoubleClick={(e) => { if (e.target === e.currentTarget) fold(id, !folded); }}>
          <span className="pane-chooser" title={t('px_choose')}>
            <IconSelect value={id} options={options(id)} onChange={(to) => choose(id, to)} ariaLabel={`${paneTitle(id)} — ${t('px_choose')}`} title={t('px_choose')} />
          </span>
          <span className="spacer" />
          {!folded && headActions(id, ctx)}
          <button type="button" className="icon-btn" title={t('px_add')} aria-label={t('px_add')} onClick={(e) => addMenu(e, id)}><Icon name="plus" size={13} /></button>
          {s.panes.length > 1 && <button type="button" className="icon-btn" title={folded ? t('px_unfold') : t('px_fold')} aria-label={folded ? t('px_unfold') : t('px_fold')} onClick={() => fold(id, !folded)}><Icon name={folded ? 'chevronDown' : 'chevronUp'} size={13} /></button>}
          {i === 0 && <button type="button" className="icon-btn" title={t('pn_collapse')} aria-label={t('pn_collapse')} onClick={() => patch({ collapsed: true })}><Icon name={side === 'left' ? 'chevronLeft' : 'chevronRight'} size={13} /></button>}
          <button type="button" className="icon-btn close-x" title={t('pn_close')} aria-label={t('pn_close')} onClick={() => close(id)}><Icon name="close" size={12} /></button>
        </div>
        <PaneSlot scope={scope} id={id} hidden={folded} />
      </div>,
    );
  });
  // All folded: the last one takes the rest so the column is not empty below.
  const allFolded = s.panes.every((id) => s.fold[id]);

  const splitter = (
    <Splitter axis="x" dir={side === 'left' ? 1 : -1} value={width} min={SIDE_LIMITS[side][0]} max={SIDE_LIMITS[side][1]} label={items.map((x) => x.label).join(' · ')}
      onChange={(v) => setLive({ w: v })} onCommit={(v) => { setLive(null); patch({ w: v }); }} />
  );
  return (
    <>
      {side === 'right' && splitter}
      <div className={`side-col side-${side} ${allFolded ? 'all-folded' : ''}`} style={{ width }} data-side={side} data-panel-set={setKey}>
        {boxes}
      </div>
      {side === 'left' && splitter}
    </>
  );
}

/** The panes a side of a set shows (for titles and tooltips). */
export function sideNames(settings, setKey, side) {
  const s = sideState(settings, setKey, side);
  return s.panes.map(paneTitle).join(' · ');
}

/** Name of a screen (panel set) for tooltips. */
export const setTitle = (setKey) => { const set = PANEL_SETS[String(setKey).split(':').pop()]; return set ? t(set.title) : setKey; };
