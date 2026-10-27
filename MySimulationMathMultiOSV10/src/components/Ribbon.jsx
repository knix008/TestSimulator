// The ribbon row under the title bar: icon + label buttons of the selected
// tab, separators between groups, on/off toggles (aria-pressed) and custom
// nodes (steppers, dropdowns). Labels hide when the row is too narrow; the
// icons stay (each keeps its tooltip and accessible name).
import React, { useLayoutEffect, useRef, useState } from 'react';
import { useLanguage } from '../lib/i18n';
import { Icon } from './Chrome';

export function Ribbon({ items, tabId }) {
  const lang = useLanguage();
  const row = useRef(null);
  const [compact, setCompact] = useState(false);
  const full = useRef(0);
  useLayoutEffect(() => { full.current = 0; setCompact(false); }, [tabId, lang]);
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return undefined;
    const check = () => {
      const over = el.scrollWidth > el.clientWidth + 1;
      if (!compact) { if (over) { full.current = el.scrollWidth; setCompact(true); } }
      else if (el.clientWidth >= full.current) setCompact(false);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  });
  return (
    <div ref={row} className={`icon-toolbar ribbon ${compact ? 'compact' : ''}`} role="toolbar" data-ribbon={tabId}>
      {items.filter(Boolean).map((it, i) => {
        if (it.sep) return <span key={`sep${i}`} className="tb-sep" />;
        if (it.spacer) return <span key={`sp${i}`} className="tb-spacer" />;
        if (it.node) return <span key={it.id || `n${i}`} className="rb-node" title={it.tip}>{it.icon && <Icon name={it.icon} size={14} />}{it.label && <span className="tool-label">{it.label}</span>}{it.node}</span>;
        const toggle = it.on !== undefined;
        return (
          <button key={it.id} type="button" data-act={it.id} className={`tool-btn ${it.primary ? 'tool-primary' : ''} ${toggle && it.on ? 'on' : ''} ${toggle ? 'tool-toggle' : ''}`}
            aria-pressed={toggle ? !!it.on : undefined} title={it.keys ? `${it.tip || it.label} (${it.keys})` : (it.tip || it.label)} aria-label={it.label}
            disabled={!!it.disabled} onClick={it.run}>
            <Icon name={it.icon} size={18} /><span className="tool-label">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
