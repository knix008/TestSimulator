// Summary tiles that focus their view: clicking a tile shows only that kind
// of content below it, clicking it again (or "All") returns to the full view.
// The choice is kept per view and project on this computer (localStorage).
import React, { useEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Chrome';

const keyOf = (view) => `mcc.${view}Focus`;

function readFocus(view, scope, allowed) {
  try {
    const all = JSON.parse(localStorage.getItem(keyOf(view)) || '{}');
    const v = all && typeof all === 'object' ? all[scope || '-'] : null;
    if (typeof v !== 'string' || !v) return null;
    return !allowed || allowed.includes(v) ? v : null;
  } catch {
    return null;
  }
}

function writeFocus(view, scope, value) {
  try {
    const all = JSON.parse(localStorage.getItem(keyOf(view)) || '{}') || {};
    if (value) all[scope || '-'] = value; else delete all[scope || '-'];
    localStorage.setItem(keyOf(view), JSON.stringify(all));
  } catch { /* per-viewer convenience only */ }
}

/**
 * The focused item of a view: [focus, toggle, clear, set]. view names the view
 * ('arch', 'his'…), scope the project (or report) it applies to, allowed the
 * item ids that may come back from storage. toggle(id) focuses id or, when it
 * is already focused, returns to the full view.
 */
export function useFocus(view, scope, allowed) {
  const [focus, setFocus] = useState(() => readFocus(view, scope, allowed));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setFocus(readFocus(view, scope, allowed)); }, [view, scope]);
  const set = (v) => { setFocus(v || null); writeFocus(view, scope, v || null); };
  const toggle = (id) => set(focus === id ? null : id);
  return [focus, toggle, () => set(null), set];
}

/** One summary tile that is also a toggle button for its focused view. */
export function FocusStat({ id, focus, onToggle, label, value, sub, tone, icon, kind, term, title, disabled }) {
  useLanguage();
  const on = focus === id;
  return (
    <button type="button" className={`card stat-card click-card focus-stat ${on ? 'on' : ''} ${kind ? `kind-${kind}` : ''}`}
      aria-pressed={on} disabled={disabled} data-focus={id} title={title || (on ? t('fs_show_all_tip') : t('fs_only_tip', { name: label }))}
      onClick={() => onToggle(id)}>
      <div className="k">{icon && <Icon name={icon} size={14} />}<span data-term={term}>{label}</span>{on && <Icon name="filter" size={12} />}</div>
      <div className={`v ${tone || ''}`}>{value == null ? '—' : value}</div>
      {sub != null && sub !== '' && <div className="small">{sub}</div>}
    </button>
  );
}

/** "All" button next to focus tiles: shown while one is focused. */
export function FocusAll({ focus, onClear }) {
  useLanguage();
  if (!focus) return null;
  return (
    <button type="button" className="vbtn focus-all" data-focus="all" title={t('fs_show_all_tip')} onClick={onClear}>
      <Icon name="list" size={15} /><span>{t('fs_show_all')}</span>
    </button>
  );
}
