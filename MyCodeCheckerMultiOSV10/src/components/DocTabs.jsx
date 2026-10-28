// Document tabs for the centre area: every view opened from the navigation or
// a menu gets a tab. The start page ('start', always first in the list) has no
// tab: the Start menu opens it, and closing the last tab returns to it. A tab
// shows an icon, a title and a close ×. Middle click closes, drag reorders,
// the context menu closes this / others / to the right / all. When the tabs overflow, the strip scrolls without a scrollbar
// and "<" ">" (click = one tab, hold = repeat) and "⌄" (list) appear.
import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dragGhost } from '../lib/dragGhost';
import { t, useLanguage } from '../lib/i18n';
import { Icon, CloseButton, NAV_GROUPS, menuIcon, menuColumnsNodes } from './Chrome';
import { menuSize } from '../lib/menuColumns';
import { usePopupWindows, openPopupWindow } from '../lib/popups';
import { getCustomThemesRaw } from '../themes';

/** True inside the active tab (inactive tabs stay mounted but hidden). */
export const TabActiveCtx = createContext(true);
export const useTabActive = () => useContext(TabActiveCtx);

const EXTRA = { start: ['tab_home', 'home'], approvals: ['nav_approvals', 'userCheck'] };
export function tabInfo(view) {
  if (EXTRA[view]) return { label: t(EXTRA[view][0]), icon: EXTRA[view][1] };
  for (const [, , , items] of NAV_GROUPS) {
    const hit = items.find(([key]) => key === view);
    if (hit) return { label: t(hit[1]), icon: hit[2] };
  }
  return { label: view, icon: 'file' };
}

export function DocTabs({ tabs, active, onActivate, onClose, onReorder, onMoveTo, suffix }) {
  useLanguage();
  const strip = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false, overflow: false });
  const [menu, setMenu] = useState(null);
  // Dragging a tab: { id, at } — at = the drop index among the other tabs.
  const [drag, setDrag] = useState(null);
  const dragId = drag && drag.id;
  const repeat = useRef(null);

  const measure = () => {
    const el = strip.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1, overflow: el.scrollWidth > el.clientWidth + 1 });
  };
  useEffect(() => {
    measure();
    const el = strip.current;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && el) ro.observe(el);
    return () => ro && ro.disconnect();
  }, [tabs.length]);
  // Keep the active tab in view.
  useEffect(() => {
    const el = strip.current && strip.current.querySelector(`[data-tab="${active}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    setTimeout(measure, 50);
  }, [active, tabs.length]);
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => { window.removeEventListener('click', close); window.removeEventListener('blur', close); };
  }, [menu]);

  // Pointer drag with a silhouette, a dashed slot where the tab will go and
  // the other tabs sliding aside (FLIP).
  const startTabDrag = (e, id) => {
    if (e.button !== 0 || id === 'start' || e.target.closest('button')) return;
    const el = e.currentTarget;
    const x0 = e.clientX;
    let g = null;
    let at = -1;
    const others = () => [...strip.current.querySelectorAll('.doc-tab:not(.dragging)')].filter((n) => n.dataset.tab !== id);
    const move = (ev) => {
      if (!g) {
        if (Math.abs(ev.clientX - x0) < 5) return;
        g = dragGhost(el, e, { lockY: true });
      }
      g.move(ev);
      const centre = g.topLeft().x + g.width / 2;
      const list = others();
      let k = list.findIndex((n) => { const r = n.getBoundingClientRect(); return centre < r.left + r.width / 2; });
      if (k < 0) k = list.length;
      k += 1; // the start page (no tab) stays first in the list
      if (k !== at) { at = k; setDrag({ id, at, w: el.offsetWidth }); }
      const s = strip.current;
      if (s) { const r = s.getBoundingClientRect(); if (ev.clientX > r.right - 24) s.scrollLeft += 10; else if (ev.clientX < r.left + 24) s.scrollLeft -= 10; }
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!g) return;
      g.destroy();
      setDrag(null);
      if (ev.type === 'pointerup' && at >= 0) {
        if (onMoveTo) onMoveTo(id, at);
        else {
          const list = tabs.filter((x) => x.id !== id);
          const to = list[Math.min(at, list.length - 1)];
          if (to) onReorder(id, to.id);
        }
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const tabRects = useRef(new Map());
  const orderKey = `${tabs.map((x) => x.id).join(',')}|${drag ? drag.at : ''}`;
  useLayoutEffect(() => {
    if (!strip.current) return;
    const now = new Map();
    for (const n of strip.current.querySelectorAll('.doc-tab')) {
      const r = n.getBoundingClientRect();
      now.set(n.dataset.tab, r);
      const old = tabRects.current.get(n.dataset.tab);
      if (old && n.animate && Math.abs(old.left - r.left) > 1) n.animate([{ transform: `translateX(${old.left - r.left}px)` }, { transform: 'translateX(0)' }], { duration: 160, easing: 'ease-out' });
    }
    tabRects.current = now;
  }, [orderKey]);

  // Tab edges in the strip's scroll coordinates (offsetLeft is relative to
  // <body>, not the strip, so it is off by the left panel's width).
  // While a smooth scroll runs, `goal` is where it is heading, so a held
  // button keeps stepping instead of measuring from a half-way position.
  const goal = useRef(null);
  const settle = useRef(null);
  const step = (dir) => {
    const el = strip.current;
    if (!el) return;
    const base = el.getBoundingClientRect().left - el.scrollLeft;
    const items = [...el.querySelectorAll('.doc-tab')].map((n) => { const r = n.getBoundingClientRect(); return { left: r.left - base, right: r.right - base }; });
    const max = el.scrollWidth - el.clientWidth;
    const left = goal.current == null ? el.scrollLeft : goal.current;
    let to;
    if (dir > 0) { const hit = items.find((n) => n.right > left + el.clientWidth + 1); to = hit ? hit.right - el.clientWidth : max; }
    else { const hit = [...items].reverse().find((n) => n.left < left - 1); to = hit ? hit.left : 0; }
    to = Math.max(0, Math.min(max, Math.round(to)));
    if (to === Math.round(el.scrollLeft) && goal.current == null) return;
    goal.current = to;
    el.scrollTo({ left: to, behavior: 'smooth' });
    clearTimeout(settle.current);
    settle.current = setTimeout(() => { goal.current = null; measure(); }, 300);
  };
  const hold = (dir) => {
    step(dir);
    clearInterval(repeat.current);
    repeat.current = setInterval(() => step(dir), 260);
  };
  const release = () => clearInterval(repeat.current);

  const contextItems = (id) => {
    const i = tabs.findIndex((x) => x.id === id);
    return [
      { id: `close:${id}`, label: t('tab_close'), icon: 'close', disabled: id === 'start' },
      { id: `others:${id}`, label: t('tab_close_others'), icon: 'minus', disabled: tabs.length <= 2 },
      { id: `right:${id}`, label: t('tab_close_right'), icon: 'chevronRight', disabled: i >= tabs.length - 1 },
      { id: 'all', label: t('tab_close_all'), icon: 'trash', disabled: tabs.length <= 1 },
    ];
  };
  const runMenu = (cmd) => {
    const [what, id] = cmd.split(':');
    const i = tabs.findIndex((x) => x.id === id);
    if (what === 'close') onClose([id]);
    else if (what === 'others') onClose(tabs.filter((x) => x.id !== id && x.id !== 'start').map((x) => x.id));
    else if (what === 'right') onClose(tabs.slice(i + 1).map((x) => x.id));
    else if (what === 'all') onClose(tabs.filter((x) => x.id !== 'start').map((x) => x.id));
    else if (what === 'go') onActivate(id);
  };
  const look = () => ({ theme: document.documentElement.dataset.theme, language: document.documentElement.lang, customThemes: getCustomThemesRaw() });
  const openMenuAt = (e, items) => {
    e.preventDefault();
    if (usePopupWindows()) {
      const r = { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY };
      const size = menuSize(items, 240);
      openPopupWindow({ kind: 'menu', anchor: r, width: size.width, height: size.height, payload: { ...look(), items }, onResult: (res) => res && res.id && runMenu(res.id) });
      return;
    }
    setMenu({ x: e.clientX, y: e.clientY, items });
  };
  const listItems = () => tabs.filter((tb) => tb.id !== 'start').map((tb) => { const info = tabInfo(tb.view); return { id: `go:${tb.id}`, label: `${info.label}${suffix && tb.view !== 'start' ? ` · ${suffix}` : ''}`, icon: info.icon, on: tb.id === active }; });

  return (
    <div className="doc-tabs" data-tour="doc-tabs" role="tablist" aria-label={t('tab_strip')}>
      <div className="doc-tab-strip" ref={strip} onScroll={measure} onWheel={(e) => { if (strip.current) strip.current.scrollLeft += e.deltaY; }}>
        {(() => {
          // The dashed slot goes before the at-th of the other tabs.
          const out = [];
          let k = 0;
          const slot = () => <span key="drop-slot" className="doc-tab-slot" aria-hidden="true" style={{ width: drag.w }} />;
          for (const tb of tabs) {
            if (drag && tb.id !== drag.id) { if (k === drag.at) out.push(slot()); k += 1; }
            if (tb.id !== 'start') out.push(tb);
          }
          if (drag && k <= drag.at) out.push(slot());
          return out;
        })().map((tb) => {
          if (!tb.id) return tb;
          const info = tabInfo(tb.view);
          const on = tb.id === active;
          return (
            <div key={tb.id} data-tab={tb.id} role="tab" aria-selected={on} tabIndex={on ? 0 : -1}
              className={`doc-tab ${on ? 'on' : ''} ${tb.id === 'start' ? 'pinned' : ''} ${dragId === tb.id ? 'dragging' : ''}`}
              title={`${info.label}${suffix && tb.view !== 'start' ? ` · ${suffix}` : ''}`}
              onClick={() => onActivate(tb.id)}
              onPointerDown={(e) => startTabDrag(e, tb.id)}
              onMouseDown={(e) => { if (e.button === 1 && tb.id !== 'start') { e.preventDefault(); onClose([tb.id]); } }}
              onContextMenu={(e) => openMenuAt(e, contextItems(tb.id))}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onActivate(tb.id); }}
              >
              <Icon name={info.icon} size={14} />
              <span className="doc-tab-label">{info.label}{suffix && tb.view !== 'start' ? <span className="doc-tab-suffix"> · {suffix}</span> : null}</span>
              {tb.id !== 'start' && (
                <CloseButton className="doc-tab-close" title={t('tab_close')} aria-label={t('tab_close')} onClick={(e) => { e.stopPropagation(); onClose([tb.id]); }} size={11} />
              )}
            </div>
          );
        })}
      </div>
      {edges.overflow && (
        <span className="doc-tab-nav" data-tour="doc-tab-nav">
          <button type="button" className="icon-btn" disabled={!edges.left} title={t('tab_prev')} aria-label={t('tab_prev')} onPointerDown={() => hold(-1)} onPointerUp={release} onPointerLeave={release}><Icon name="chevronLeft" size={14} /></button>
          <button type="button" className="icon-btn" disabled={!edges.right} title={t('tab_next')} aria-label={t('tab_next')} onPointerDown={() => hold(1)} onPointerUp={release} onPointerLeave={release}><Icon name="chevronRight" size={14} /></button>
        </span>
      )}
      <button type="button" className="icon-btn doc-tab-list" title={t('tab_list')} aria-label={t('tab_list')} onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); openMenuAt({ preventDefault() {}, clientX: r.left - 200, clientY: r.bottom }, listItems()); }}>
        <Icon name="chevronDown" size={14} />
      </button>
      {menu && (
        <div className="menu-pop doc-tab-menu" style={{ left: Math.max(4, Math.min(menu.x, window.innerWidth - menuSize(menu.items, 240).width - 10)), top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {menuColumnsNodes(menu.items, (it) => (
            <button key={it.id} type="button" className={`menu-item ${it.on ? 'on' : ''}`} disabled={!!it.disabled} onClick={() => { setMenu(null); runMenu(it.id); }}>
              <Icon name={menuIcon(it)} size={14} /><span className="menu-item-label">{it.label}</span>{it.keys && <span className="menu-keys">{it.keys}</span>}{it.on && <Icon name="check" size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
