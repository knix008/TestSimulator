// Map tabs: click to activate, middle-click or × to close, drag to reorder,
// right-click for the tab menu. When the tabs do not all fit, "<" / ">" (side by
// side at the right end) bring the next hidden tab on that side into view — each is enabled
// only while tabs are hidden on its side (Ctrl+Shift+Tab / Ctrl+Tab switch tabs);
// "+" makes a new map. The active tab is kept in view, also when the window
// gets narrower; the mouse wheel scrolls the strip.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';
import { ContextMenu } from './ContextMenu';

export function TabBar({ docs, activeId, onActivate, onClose, onNew, onReorder, onAction, onContextItems }) {
  useLanguage();
  const stripRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [scroll, setScroll] = useState({ overflow: false, left: false, right: false });

  const measure = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth + 1;
    const left = el.scrollLeft > 0;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setScroll((s) => (s.overflow === overflow && s.left === left && s.right === right ? s : { overflow, left, right }));
  }, []);

  const ensureVisible = useCallback(() => {
    const strip = stripRef.current;
    const el = strip && strip.querySelector('.tab.active');
    if (!el) return;
    const left = el.offsetLeft, right = left + el.offsetWidth;
    if (left < strip.scrollLeft) strip.scrollLeft = left;
    else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
  }, []);

  useLayoutEffect(() => { ensureVisible(); measure(); }, [activeId, docs, scroll.overflow, ensureVisible, measure]);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return undefined;
    // a narrower strip: keep the active tab in view, then the arrows follow what is hidden
    const ro = new ResizeObserver(() => { ensureVisible(); measure(); });
    ro.observe(el);
    el.addEventListener('scroll', measure);
    return () => { ro.disconnect(); el.removeEventListener('scroll', measure); };
  }, [measure, ensureVisible]);

  // the next tab hidden (wholly or in part) on that side, scrolled just into view
  const step = (d) => {
    const strip = stripRef.current;
    if (!strip) return;
    const tabs = [...strip.querySelectorAll('.tab')];
    const from = strip.scrollLeft, to = from + strip.clientWidth;
    if (d < 0) { const tab = tabs.filter((x) => x.offsetLeft < from - 1).pop(); if (tab) strip.scrollLeft = tab.offsetLeft; }
    else { const tab = tabs.find((x) => x.offsetLeft + x.offsetWidth > to + 1); if (tab) strip.scrollLeft = tab.offsetLeft + tab.offsetWidth - strip.clientWidth; }
    measure();
  };
  const onWheel = (e) => { const el = stripRef.current; if (el && e.deltaY) el.scrollLeft += e.deltaY; };

  return (
    <div className="tabbar">
      <div className="tab-strip" ref={stripRef} onWheel={onWheel}>
        {docs.map((d) => (
          <div key={d.id} data-tab={d.id}
            className={`tab ${d.id === activeId ? 'active' : ''} ${d.dirty ? 'dirty' : ''} ${drag && drag.over === d.id && drag.id !== d.id ? 'drop-target' : ''}`}
            title={`${d.path || d.name}${d.dirty ? ` ${t('tab_modified')}` : ''}${d.readonly ? ` ${t('tab_readonly')}` : ''}`}
            draggable
            onDragStart={(e) => { setDrag({ id: d.id, over: null }); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('application/x-mybrainmap-tab', String(d.id)); } catch { /* ignore */ } }}
            onDragOver={(e) => { if (drag) { e.preventDefault(); if (drag.over !== d.id) setDrag({ ...drag, over: d.id }); } }}
            onDrop={(e) => { e.preventDefault(); if (drag && drag.id !== d.id) onReorder(drag.id, d.id); setDrag(null); }}
            onDragEnd={() => setDrag(null)}
            onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); onClose(d.id); } else if (e.button === 0) onActivate(d.id); }}
            onContextMenu={(e) => { e.preventDefault(); onActivate(d.id); setCtx({ id: d.id, x: e.clientX, y: e.clientY }); }}>
            <span className="tab-icon"><Icon name={d.kind === 'import' ? 'import' : 'mapView'} size={14} /></span>
            <span className="tab-name ellipsis">{d.name}</span>
            {d.readonly && <span className="tab-ro" title={t('tab_readonly')}><Icon name="eye" size={12} /></span>}
            <button className="tab-close" title={t('tip_tab_close')} aria-label={t('close')}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onClose(d.id); }}>
              {d.dirty ? <span className="dirty-dot" /> : <Icon name="close" size={12} />}
            </button>
          </div>
        ))}
      </div>
      <div className="tab-controls">
        <button className="tab-ctl tab-prev" data-cmd="tab-prev" title={t('tab_prev')} aria-label={t('tab_prev')} disabled={!scroll.left} onMouseDown={(e) => e.preventDefault()} onClick={() => step(-1)}><Icon name="chevronLeft" size={14} /></button>
        <button className="tab-ctl tab-next" data-cmd="tab-next" title={t('tab_next')} aria-label={t('tab_next')} disabled={!scroll.right} onMouseDown={(e) => e.preventDefault()} onClick={() => step(1)}><Icon name="chevronRight" size={14} /></button>
        <button className="tab-ctl" data-cmd="tab-new" title={t('tab_new')} aria-label={t('tab_new')} onMouseDown={(e) => e.preventDefault()} onClick={onNew}><Icon name="plus" size={14} /></button>
      </div>
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={onContextItems(ctx.id)} onClose={() => setCtx(null)}
          onPick={(id) => { setCtx(null); onAction(id, ctx.id); }} />
      )}
    </div>
  );
}

export default TabBar;
