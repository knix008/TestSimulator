import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconClose, IconPrev, IconNext } from './Icons.jsx';
import { tabRevealScroll, tabScrollOverflow, tabScrollStep } from '../lib/tabs.js';

// Document tabs sit on the viewer, to the right of the left panel. Each open book keeps its own place,
// reading state and undo stack; clicking a tab switches without unloading the rest.
// When the strip overflows, < > on the right scroll the hidden tabs into view.
export default function TabBar({ tabs, activeId, onSelect, onClose }) {
  const { t } = useTranslation();
  const scrollerRef = useRef(null);
  const [overflow, setOverflow] = useState({ overflowing: false, left: false, right: false });

  const measure = () => {
    setOverflow(tabScrollOverflow(scrollerRef.current));
  };

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    measure();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [tabs?.length]);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || !activeId) return;
    const tab = root.querySelector('.doctab.active');
    if (!tab) return;
    const next = tabRevealScroll(root, tab);
    if (next != null) root.scrollTo({ left: next });
  }, [activeId, tabs?.length]);

  const slide = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: tabScrollStep(el, dir), behavior: 'smooth' });
  };

  if (!tabs?.length) return null;

  return (
    <div className="tabbar" role="tablist" aria-label={t('tabs.list')}>
      <div className="tabbar-scroll" ref={scrollerRef}>
        {tabs.map((tab) => {
          const on = tab.id === activeId;
          return (
            <div
              key={tab.id}
              className={`doctab${on ? ' active' : ''}${tab.dirty ? ' dirty' : ''}`}
              role="tab"
              aria-selected={on}
              title={tab.path || tab.name}
              onClick={() => onSelect?.(tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onClose?.(tab.id);
                }
              }}
            >
              <span className="doctab-name">
                {tab.dirty ? <span className="doctab-dot" aria-hidden="true">•</span> : null}
                {tab.name}
              </span>
              <button
                className="doctab-close"
                type="button"
                title={t('tip.closeTab')}
                aria-label={t('tip.closeTab')}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose?.(tab.id);
                }}
              >
                <IconClose size={11} />
              </button>
            </div>
          );
        })}
      </div>
      {overflow.overflowing ? (
        <div className="tabbar-nav">
          <button
            type="button"
            className="tabbar-nav-btn"
            title={t('tabs.prev')}
            aria-label={t('tabs.prev')}
            disabled={!overflow.left}
            onClick={() => slide(-1)}
          >
            <IconPrev size={13} />
          </button>
          <button
            type="button"
            className="tabbar-nav-btn"
            title={t('tabs.next')}
            aria-label={t('tabs.next')}
            disabled={!overflow.right}
            onClick={() => slide(1)}
          >
            <IconNext size={13} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
