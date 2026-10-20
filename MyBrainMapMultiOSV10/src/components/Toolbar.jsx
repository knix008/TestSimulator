// Icon toolbar under the menu bar: file · undo · topics (sub / sibling /
// parent / callout / floating / relationship / boundary) · topic content
// (markers, notes, link, picture, task — they open the task pane on that
// tab) · layout and map style pickers · expand / collapse / focus · zoom ·
// the three views and the presentation · the side panes. The app controls
// (theme, language, settings, info) sit at the right end. Hidden with
// 보기 › 도구 모음.
import React, { useLayoutEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { syncWindowMinWidth } from '../lib/backend';
import { Icon } from './Icons';
import { ContextMenu } from './ContextMenu';
import { AppControls } from './MenuBar';
import { Widest } from './Widest';

export const LAYOUT_ICONS = { map: 'layoutMap', right: 'layoutRight', left: 'layoutLeft', orgDown: 'layoutOrgDown', orgUp: 'layoutOrgUp', treeRight: 'layoutTreeRight', treeLeft: 'layoutTreeLeft', timeline: 'layoutTimeline', fishbone: 'layoutFishbone' };

const GROUPS = [
  [
    { id: 'new', icon: 'filePlus', tip: 'tip_new' },
    { id: 'open', icon: 'fileOpen', tip: 'tip_open' },
    { id: 'save', icon: 'fileSave', tip: 'tip_save', needs: 'dirty' },
    { id: 'export', icon: 'export', tip: 'tip_export', needs: 'hasDoc' },
    { id: 'print', icon: 'print', tip: 'tip_print', needs: 'hasDoc' },
  ],
  [
    { id: 'undo', icon: 'undo', tip: 'tip_undo', needs: 'canUndo' },
    { id: 'redo', icon: 'redo', tip: 'tip_redo', needs: 'canRedo' },
  ],
  [
    { id: 'addChild', icon: 'subtopic', tip: 'tip_add_child', needs: 'canEdit' },
    { id: 'addSibling', icon: 'sibling', tip: 'tip_add_sibling', needs: 'canEdit' },
    { id: 'addParent', icon: 'parentTopic', tip: 'tip_add_parent', needs: 'canParent' },
    { id: 'addCallout', icon: 'callout', tip: 'tip_add_callout', needs: 'canEdit' },
    { id: 'addFloating', icon: 'floating', tip: 'tip_add_floating', needs: 'hasDoc' },
    { id: 'relationship', icon: 'relationship', tip: 'tip_relationship', needs: 'canEdit', on: (st) => st.linking },
    { id: 'boundary', icon: 'boundary', tip: 'tip_boundary', needs: 'canEdit', on: (st) => st.hasBoundary },
    { id: 'summary', icon: 'summary', tip: 'tip_summary', needs: 'canEdit', on: (st) => st.hasSummary },
  ],
  [
    { id: 'pane:markers', icon: 'marker', tip: 'tip_markers', needs: 'hasDoc', on: (st, s) => s.panelVisible && s.panelTab === 'markers' },
    { id: 'pane:notes', icon: 'notes', tip: 'tip_notes', needs: 'hasDoc', on: (st, s) => s.panelVisible && s.panelTab === 'notes' },
    { id: 'pane:links', icon: 'link', tip: 'tip_links', needs: 'hasDoc', on: (st, s) => s.panelVisible && s.panelTab === 'links' },
    { id: 'pane:task', icon: 'task', tip: 'tip_task', needs: 'hasDoc', on: (st, s) => s.panelVisible && s.panelTab === 'task' },
  ],
  [
    { widget: 'layout' },
    { widget: 'style' },
  ],
  [
    { id: 'redraw:orgDown', icon: 'layoutOrgDown', tip: 'tip_redraw_down', needs: 'hasDoc', on: (st) => st.layout === 'orgDown' },
    { id: 'redraw:right', icon: 'layoutRight', tip: 'tip_redraw_right', needs: 'hasDoc', on: (st) => st.layout === 'right' },
    { id: 'redraw:left', icon: 'layoutLeft', tip: 'tip_redraw_left', needs: 'hasDoc', on: (st) => st.layout === 'left' },
    { id: 'redraw:map', icon: 'layoutMap', tip: 'tip_redraw_map', needs: 'hasDoc', on: (st) => st.layout === 'map' },
    { id: 'arrange', icon: 'arrange', tip: 'tip_arrange', needs: 'hasDoc' },
  ],
  [
    { id: 'expandAll', icon: 'expandAll', tip: 'tip_expand_all', needs: 'hasDoc' },
    { id: 'collapseAll', icon: 'collapseAll', tip: 'tip_collapse_all', needs: 'hasDoc' },
    { id: 'focusBranch', icon: 'focus', tip: 'tip_focus', needs: 'hasDoc', on: (st) => st.focused },
  ],
  [
    { id: 'zoomOut', icon: 'zoomOut', tip: 'tip_zoom_out', needs: 'isMap' },
    { widget: 'zoom' },
    { id: 'zoomIn', icon: 'zoomIn', tip: 'tip_zoom_in', needs: 'isMap' },
    { id: 'fit', icon: 'fit', tip: 'tip_fit', needs: 'isMap' },
    { id: 'centerMap', icon: 'center', tip: 'tip_center_map', needs: 'isMap' },
  ],
  [
    { id: 'view:map', icon: 'mapView', tip: 'tip_view_map', needs: 'hasDoc', on: (st, s) => s.view === 'map' },
    { id: 'view:outline', icon: 'outlineView', tip: 'tip_view_outline', needs: 'hasDoc', on: (st, s) => s.view === 'outline' },
    { id: 'view:gantt', icon: 'gantt', tip: 'tip_view_gantt', needs: 'hasDoc', on: (st, s) => s.view === 'gantt' },
    { id: 'view:kanban', icon: 'kanban', tip: 'tip_view_kanban', needs: 'hasDoc', on: (st, s) => s.view === 'kanban' },
    { id: 'presentation', icon: 'presentation', tip: 'tip_presentation', needs: 'hasDoc' },
  ],
  [
    { id: 'toggle:showGrid', icon: 'grid', tip: 'tip_grid', toggle: 'showGrid' },
    { id: 'toggle:showRulers', icon: 'ruler', tip: 'tip_rulers', toggle: 'showRulers' },
    { id: 'toggle:overviewVisible', icon: 'minimap', tip: 'tip_overview', toggle: 'overviewVisible' },
  ],
  [
    { id: 'toggle:sidebarVisible', icon: 'sidebar', tip: 'tip_sidebar_toggle', toggle: 'sidebarVisible' },
    { id: 'toggle:panelVisible', icon: 'panelRight', tip: 'tip_panel_toggle', toggle: 'panelVisible' },
  ],
];

export function Toolbar({ onAction, settings, state }) {
  useLanguage();
  useLayoutEffect(() => { syncWindowMinWidth(); });
  const [menu, setMenu] = useState(null);   // { kind, el }
  const open = (kind) => (e) => setMenu(menu && menu.kind === kind ? null : { kind, el: e.currentTarget });
  const widgets = {
    layout: () => (
      <button key="layout" data-cmd="layoutMenu" className="tool-btn tb-doc" disabled={!state.hasDoc} title={t('tip_layout')} onMouseDown={(e) => e.preventDefault()} onClick={open('layout')}>
        <Icon name={LAYOUT_ICONS[state.layout] || 'layoutMap'} size={17} /><Icon name="chevronDown" size={11} className="muted" />
      </button>
    ),
    style: () => (
      <button key="style" data-cmd="styleMenu" className="tool-btn tb-doc" disabled={!state.hasDoc} title={t('tip_map_style')} onMouseDown={(e) => e.preventDefault()} onClick={open('style')}>
        <Icon name="mapStyle" size={17} /><Icon name="chevronDown" size={11} className="muted" />
      </button>
    ),
    zoom: () => (
      <button key="zoom" className="tool-btn tb-label tb-zoom" disabled={!state.isMap} title={t('tip_zoom_reset')} onMouseDown={(e) => e.preventDefault()} onClick={() => onAction('zoom100')}>
        <Widest texts={[`${state.zoom}%`, '400%']} />
      </button>
    ),
  };
  const items = menu ? (menu.kind === 'layout' ? state.layoutItems() : state.styleItems()) : null;
  return (
    <div className="icon-toolbar">
      {GROUPS.map((g, gi) => (
        <span key={gi} className="tb-group">
          {gi > 0 && <span className="tb-sep" />}
          {g.map((b) => (b.widget ? widgets[b.widget]() : (
            <button key={b.id} data-cmd={b.id} className={`tool-btn ${(b.on ? b.on(state, settings) : b.toggle && settings[b.toggle]) ? 'on' : ''}`} title={t(b.tip)} aria-label={t(b.tip)}
              disabled={b.needs ? !state[b.needs] : false}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onAction(b.id)}>
              <Icon name={b.icon} size={17} />
            </button>
          )))}
        </span>
      ))}
      <span className="tb-spacer" />
      <AppControls onAction={onAction} theme={settings.theme} compact />
      {menu && items && (
        <ContextMenu anchorEl={menu.el} x={0} y={0} items={items} className={menu.kind === 'style' ? 'style-menu' : 'st-menu'} onClose={() => setMenu(null)}
          onPick={(id) => { setMenu(null); onAction(id); }} />
      )}
    </div>
  );
}

export default Toolbar;
