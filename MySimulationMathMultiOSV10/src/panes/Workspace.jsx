// 작업 공간 / Workspace: the variables of the base workspace (name, value,
// size, class), sortable; double-click opens the Variable Editor; the context
// menu opens, plots, renames, saves or clears a variable.
import React, { useMemo, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from '../components/Chrome';
import { openMenu } from '../lib/menu';
import { dimsText } from '../lib/valueFormat';

const COLS = [['name', 'ws_name'], ['summary', 'ws_value'], ['size', 'ws_size'], ['cls', 'ws_class']];

export function WorkspacePane({ variables, selected, onSelect, onOpen, onAction, engineReady }) {
  useLanguage();
  const [sort, setSort] = useState({ key: 'name', dir: 1 });
  const [filter, setFilter] = useState('');
  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = (variables || []).filter((v) => !f || v.name.toLowerCase().includes(f));
    const val = (v) => (sort.key === 'size' ? (v.dims || []).reduce((a, b) => a * b, 1) : sort.key === 'summary' ? String(v.summary || '') : String(v[sort.key] || ''));
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (typeof x === 'number' ? x - y : x.localeCompare(y)) * sort.dir;
    });
  }, [variables, sort, filter]);
  const menu = (e, v) => {
    e.preventDefault();
    onSelect(v.name);
    openMenu({ x: e.clientX, y: e.clientY }, [
      { id: 'open', label: t('ws_open'), icon: 'table', keys: 'Enter' },
      { id: 'plot', label: t('ws_plot'), icon: 'plotLine' },
      { id: 'copyName', label: t('ws_copy_name'), icon: 'copy' },
      { sep: true },
      { id: 'rename', label: t('ws_rename'), icon: 'edit', keys: 'F2' },
      { id: 'duplicate', label: t('ws_duplicate'), icon: 'copy' },
      { id: 'saveAs', label: t('ws_save_as'), icon: 'save' },
      { sep: true },
      { id: 'delete', label: t('ws_delete'), icon: 'trash', keys: 'Del' },
    ], (id) => onAction(id, v.name));
  };
  return (
    <div className="pane ws-pane">
      <div className="pane-tools">
        <span className="pane-filter"><Icon name="filter" size={13} /><input value={filter} placeholder={t('ws_filter')} aria-label={t('ws_filter')} onChange={(e) => setFilter(e.target.value)} /></span>
        <span className="small muted">{t('ws_count', { n: (variables || []).length })}</span>
      </div>
      <div className="pane-scroll" tabIndex={0} onKeyDown={(e) => {
        if (!selected) return;
        if (e.key === 'Enter') onOpen(selected);
        else if (e.key === 'Delete') onAction('delete', selected);
        else if (e.key === 'F2') onAction('rename', selected);
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const i = rows.findIndex((r) => r.name === selected);
          const n = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
          if (n) onSelect(n.name);
        }
      }}>
        <table className="ws-table">
          <thead>
            <tr>{COLS.map(([key, label]) => (
              <th key={key} className={sort.key === key ? 'sorted' : ''} onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}>
                {t(label)}{sort.key === key && <Icon name={sort.dir > 0 ? 'chevronUp' : 'chevronDown'} size={11} />}
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.name} className={selected === v.name ? 'sel' : ''} onClick={() => onSelect(v.name)} onDoubleClick={() => onOpen(v.name)} onContextMenu={(e) => menu(e, v)} title={v.global ? t('ws_global') : undefined}>
                <td className="ws-name"><Icon name="variable" size={13} />{v.name}{v.global ? <span className="small muted"> (global)</span> : null}</td>
                <td className="ws-value mono ellipsis" title={String(v.summary || '')}>{v.summary}</td>
                <td className="mono">{dimsText(v.dims)}</td>
                <td>{v.cls}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!(variables || []).length && <div className="pane-empty small muted">{engineReady ? t('ws_empty') : t('ws_no_engine')}</div>}
      </div>
    </div>
  );
}
