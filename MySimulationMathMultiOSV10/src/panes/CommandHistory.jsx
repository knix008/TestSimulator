// 명령 기록 / Command History: every command run in the Command Window, with
// a %-- date --% line per session; double-click runs a command again.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from '../components/Chrome';
import { openMenu } from '../lib/menu';
import { copyText } from '../views/common';

const KEY = 'msm-history';
const MAX = 2000;

/** [{ c: command, s: session start (ms) }] from localStorage. */
export function loadHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((x) => x && typeof x.c === 'string') : [];
  } catch { return []; }
}

export function storeHistory(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch { /* storage full or blocked */ }
}

export const SESSION_START = Date.now();

function stamp(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function HistoryPane({ items, onRun, onCopyToPrompt, onDelete, onClearAll }) {
  useLanguage();
  const [sel, setSel] = useState(-1);
  const box = useRef(null);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [items.length]);
  const rows = [];
  let lastSession = null;
  items.forEach((it, i) => {
    if (it.s !== lastSession) { lastSession = it.s; rows.push(<div key={`s${i}`} className="hist-session small">%-- {stamp(it.s)} --%</div>); }
    rows.push(
      <div key={i} className={`hist-item mono ${sel === i ? 'sel' : ''}`} role="option" aria-selected={sel === i} title={it.c}
        onClick={() => setSel(i)} onDoubleClick={() => onRun(it.c)}
        onContextMenu={(e) => {
          e.preventDefault();
          setSel(i);
          openMenu({ x: e.clientX, y: e.clientY }, [
            { id: 'run', label: t('hist_run'), icon: 'play' },
            { id: 'prompt', label: t('hist_to_prompt'), icon: 'terminal' },
            { id: 'copy', label: t('copy'), icon: 'copy' },
            { sep: true },
            { id: 'delete', label: t('hist_delete_one'), icon: 'trash' },
            { id: 'clear', label: t('hist_clear_all'), icon: 'trash' },
          ], (id) => {
            if (id === 'run') onRun(it.c);
            else if (id === 'prompt') onCopyToPrompt(it.c);
            else if (id === 'copy') copyText(it.c);
            else if (id === 'delete') onDelete(i);
            else if (id === 'clear') onClearAll();
          });
        }}>
        {it.c.split('\n')[0]}{it.c.includes('\n') ? ' …' : ''}
      </div>,
    );
  });
  return (
    <div className="pane hist-pane">
      <div ref={box} className="pane-scroll" role="listbox" aria-label={t('hist_title')} tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(items.length - 1, i + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(0, i < 0 ? items.length - 1 : i - 1)); }
          else if (e.key === 'Enter' && items[sel]) onRun(items[sel].c);
          else if (e.key === 'Delete' && items[sel]) onDelete(sel);
        }}>
        {rows}
        {!items.length && <div className="pane-empty small muted"><Icon name="history" size={14} /> {t('hist_empty')}</div>}
      </div>
    </div>
  );
}
