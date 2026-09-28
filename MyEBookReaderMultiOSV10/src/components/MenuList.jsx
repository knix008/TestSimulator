import React from 'react';
import { iconByName } from './Icons.jsx';

// One menu, rendered from plain rows.
//
// The same component draws the menu inside its own popup window (MenuHost) and
// in the in-page fallback the web build uses, so a menu looks and behaves
// identically either way: one row per line, one column, every row carrying an
// icon and a label, with the shortcut — and, for a recent file, its folder —
// aligned on the right.
export default function MenuList({ rows, label = 'menu', onChoose, translate, columns = 1 }) {
  const text = (row) => (row.text != null ? row.text : translate(row.label));

  // More than one column: the rows are dealt out down the first column and on
  // to the next, so reading order is still top to bottom. The row count is what
  // the grid needs to know; the columns then size themselves to their content.
  const cols = Math.max(1, Math.min(4, Math.round(columns) || 1));
  const perColumn = Math.ceil(rows.length / cols) || 1;

  return (
    <ul
      className={cols > 1 ? `menu-list cols-${cols}` : 'menu-list'}
      style={cols > 1 ? { '--menu-rows': perColumn } : undefined}
      role="menu"
      aria-label={label}
    >
      {rows.map((row, i) => {
        if (row.separator) return <li key={`sep${i}`} className="menu-sep" role="separator" />;
        if (row.section) {
          return (
            <li key={`head${i}`} className="menu-head" role="presentation">
              {translate(row.section)}
            </li>
          );
        }
        if (row.empty) {
          return (
            <li key={`empty${i}`} className="menu-empty" role="presentation">
              {translate(row.empty)}
            </li>
          );
        }

        const Icon = iconByName(row.icon);
        return (
          <li key={row.id || i} className="menu-row">
            <button
              type="button"
              className={`menu-item${row.checked ? ' checked' : ''}`}
              role="menuitem"
              disabled={!!row.disabled}
              title={row.detail ? `${text(row)} — ${row.detail}` : text(row)}
              onClick={() => onChoose(row.id)}
            >
              <span className="menu-icon">
                {row.bars
                  ? <span className="theme-swatch small">{row.bars.map((color, n) => <i key={n} style={{ background: color }} />)}</span>
                  : <Icon size={16} />}
              </span>
              <span className="menu-label">{text(row)}</span>
              {row.detail ? <span className="menu-detail">{row.detail}</span> : null}
              {row.key ? <span className="menu-key">{row.key}</span> : null}
              {row.checked ? <span className="menu-check" aria-hidden="true">✓</span> : null}
            </button>
            {row.forget ? (
              <button
                type="button"
                className="menu-forget"
                title={translate('recent.remove')}
                aria-label={translate('recent.remove')}
                onClick={(e) => { e.stopPropagation(); onChoose(row.forget); }}
              >
                ✕
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
