// The row of open schemas under the toolbar.
//
// Each tab is one document. The dot marks unsaved changes, the same way the
// window title does, so the two never tell different stories.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SchemaDocument } from '../hooks/useAppState';
import { documentLabel } from '../hooks/useAppState';
import { areEquivalent } from '../core/serializer';
import { useT } from '../i18n';
import { Icons } from './Icons';

interface Props {
  documents: SchemaDocument[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

/** How far one press of an arrow moves the strip. */
const SCROLL_STEP = 180;

export function DocumentTabs({ documents, activeId, onSelect, onClose, onNew }: Props) {
  const t = useT();
  const stripRef = useRef<HTMLDivElement>(null);
  /** Tabs hidden off each end — what the arrows report and enable on. */
  const [hidden, setHidden] = useState({ left: 0, right: 0 });

  /**
   * Count the tabs that are not in view. A count says more than a bare "there
   * is more": it tells you whether it is worth going to look.
   */
  const measure = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const view = strip.getBoundingClientRect();
    let left = 0;
    let right = 0;
    for (const child of Array.from(strip.children) as HTMLElement[]) {
      const box = child.getBoundingClientRect();
      if (box.right <= view.left + 1) left++;
      else if (box.left >= view.right - 1) right++;
    }
    setHidden((current) =>
      current.left === left && current.right === right ? current : { left, right },
    );
  }, []);

  useLayoutEffect(measure, [measure, documents.length]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    strip.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    return () => {
      strip.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure]);

  // Switching tabs from a menu or a shortcut has to bring the tab into view, or
  // the selection looks as though it went nowhere.
  useEffect(() => {
    const strip = stripRef.current;
    const tab = strip?.querySelector<HTMLElement>(`[data-doc-id="${activeId}"]`);
    if (strip && tab) {
      // Scrolled by hand rather than with `scrollIntoView`: that walks every
      // scrollable ancestor, and when the window is narrower than the app's
      // minimum width the *document* scrolls sideways, carrying the left end of
      // this very bar — arrows and all — off the screen.
      const view = strip.getBoundingClientRect();
      const box = tab.getBoundingClientRect();
      if (box.left < view.left) strip.scrollLeft -= view.left - box.left;
      else if (box.right > view.right) strip.scrollLeft += box.right - view.right;
    }
    measure();
  }, [activeId, documents.length, measure]);

  const scrollBy = (amount: number) => {
    stripRef.current?.scrollBy({ left: amount, behavior: 'smooth' });
  };

  return (
    <div className="doc-tabs">
      <button
        className={`doc-tab-scroll ${hidden.left === 0 ? 'idle' : ''}`}
        disabled={hidden.left === 0}
        title={hidden.left > 0 ? t('TtTabsMoreLeft', hidden.left) : t('TtTabsScrollLeft')}
        aria-label={t('TtTabsScrollLeft')}
        onClick={() => scrollBy(-SCROLL_STEP)}
      >
        <span className="doc-tab-arrow">‹</span>
        {hidden.left > 0 && <span className="doc-tab-more">{hidden.left}</span>}
      </button>

      {/* The tabs scroll; the arrows and the new-tab button do not, so they are
          siblings of the scrolling strip rather than things inside it. */}
      <div className="doc-tab-strip" role="tablist" ref={stripRef}>
        {documents.map((document) => {
          const dirty = !areEquivalent(document.saved, document.schema);
          const label = documentLabel(document);
          const active = document.id === activeId;
          return (
            <div
              key={document.id}
              className={`doc-tab ${active ? 'active' : ''}`}
              role="tab"
              aria-selected={active}
              title={document.path ?? label}
              data-doc-id={document.id}
              onMouseDown={(e) => {
                // Middle click closes, as it does in a browser.
                if (e.button === 1) {
                  e.preventDefault();
                  onClose(document.id);
                }
              }}
              onClick={() => onSelect(document.id)}
            >
              <span className="doc-tab-icon">
                <Icons.Doc />
              </span>
              <span className="doc-tab-label">{label}</span>
              {dirty && (
                <span className="doc-tab-dirty" aria-label={t('UnsavedMarker')}>
                  ●
                </span>
              )}
              <button
                className="doc-tab-close"
                title={t('TtCloseTab')}
                aria-label={t('TtCloseTab')}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(document.id);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {/* Immediately after the tabs but outside the strip. The strip is only as
          wide as it needs to be, so this sits against the last tab while there
          is room — and stays on screen once the tabs start scrolling, which is
          exactly when a way to open another one is easiest to lose. */}
      <button className="doc-tab doc-tab-new" title={t('TtNewTab')} onClick={onNew}>
        <span className="doc-tab-label">{t('TabNew')}</span>
        <span className="doc-tab-plus">+</span>
      </button>

      <button
        className={`doc-tab-scroll ${hidden.right === 0 ? 'idle' : ''}`}
        disabled={hidden.right === 0}
        title={hidden.right > 0 ? t('TtTabsMoreRight', hidden.right) : t('TtTabsScrollRight')}
        aria-label={t('TtTabsScrollRight')}
        onClick={() => scrollBy(SCROLL_STEP)}
      >
        <span className="doc-tab-arrow">›</span>
        {hidden.right > 0 && <span className="doc-tab-more">{hidden.right}</span>}
      </button>

    </div>
  );
}
