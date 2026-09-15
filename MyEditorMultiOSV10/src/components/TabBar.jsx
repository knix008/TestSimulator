// Document tabs: click to activate, middle-click or × to close, drag to
// reorder, right-click for the tab menu. The fixed group on the right holds
// "+" (new document) and — only when the tabs overflow the width — "<" / ">"
// buttons that scroll the strip (there is no scrollbar). The active tab is
// always scrolled into view; the mouse wheel scrolls the strip as well.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';
import { ContextMenu } from './ContextMenu';

const SCROLL_STEP = 180;

export function TabBar({ docs, activeId, onActivate, onClose, onNew, onReorder, onAction, onContextItems }) {
  useLanguage();
  const stripRef = useRef(null);
  const [drag, setDrag] = useState(null);        // { id, over }
  const [ctx, setCtx] = useState(null);          // { id, x, y }
  const [scroll, setScroll] = useState({ overflow: false, left: false, right: false });

  // Overflow state → whether the arrows are shown / enabled.
  const measure = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth + 1;
    const left = el.scrollLeft > 0;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setScroll((s) => (s.overflow === overflow && s.left === left && s.right === right ? s : { overflow, left, right }));
  }, []);

  // Keeps the active tab fully visible (also after the arrows appear and
  // narrow the strip). `.tab-strip` is the offsetParent of the tabs.
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
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener('scroll', measure);
    return () => { ro.disconnect(); el.removeEventListener('scroll', measure); };
  }, [measure]);

  const scrollBy = (dx) => { const el = stripRef.current; if (el) el.scrollBy({ left: dx, behavior: 'smooth' }); };
  const onWheel = (e) => { const el = stripRef.current; if (el && e.deltaY) el.scrollLeft += e.deltaY; };

  return (
    <div className="tabbar">
      <div className="tab-strip" ref={stripRef} onWheel={onWheel}>
        {docs.map((d) => (
          <div key={d.id}
            className={`tab ${d.id === activeId ? 'active' : ''} ${d.dirty ? 'dirty' : ''} ${drag && drag.over === d.id && drag.id !== d.id ? 'drop-target' : ''}`}
            title={`${d.path || d.name}${d.dirty ? ` ${t('tab_modified')}` : ''}${d.readonly ? ` ${t('tab_readonly')}` : ''}`}
            draggable
            onDragStart={(e) => { setDrag({ id: d.id, over: null }); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(d.id)); } catch { /* ie */ } }}
            onDragOver={(e) => { if (drag) { e.preventDefault(); if (drag.over !== d.id) setDrag({ ...drag, over: d.id }); } }}
            onDrop={(e) => { e.preventDefault(); if (drag && drag.id !== d.id) onReorder(drag.id, d.id); setDrag(null); }}
            onDragEnd={() => setDrag(null)}
            onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); onClose(d.id); } else if (e.button === 0) onActivate(d.id); }}
            onContextMenu={(e) => { e.preventDefault(); onActivate(d.id); setCtx({ id: d.id, x: e.clientX, y: e.clientY }); }}>
            <span className="tab-icon"><Icon name={d.path ? (d.langName ? 'fileCode' : 'fileText') : 'file'} size={14} /></span>
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
        <button className="tab-ctl" title={t('tab_new')} aria-label={t('tab_new')} onMouseDown={(e) => e.preventDefault()} onClick={onNew}><Icon name="plus" size={14} /></button>
        {scroll.overflow && (
          <>
            <button className="tab-ctl" title={t('tab_scroll_left')} aria-label={t('tab_scroll_left')} disabled={!scroll.left} onMouseDown={(e) => e.preventDefault()} onClick={() => scrollBy(-SCROLL_STEP)}><Icon name="chevronLeft" size={14} /></button>
            <button className="tab-ctl" title={t('tab_scroll_right')} aria-label={t('tab_scroll_right')} disabled={!scroll.right} onMouseDown={(e) => e.preventDefault()} onClick={() => scrollBy(SCROLL_STEP)}><Icon name="chevronRight" size={14} /></button>
          </>
        )}
      </div>
      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={onContextItems(ctx.id)} onClose={() => setCtx(null)}
          onPick={(id) => { setCtx(null); onAction(id, ctx.id); }} />
      )}
    </div>
  );
}

export default TabBar;
