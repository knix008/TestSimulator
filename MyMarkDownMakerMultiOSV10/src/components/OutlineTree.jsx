import React from 'react';
import { useTranslation } from 'react-i18next';

// Renders the merged document's heading hierarchy (H1–H6) as an indented tree.
export default function OutlineTree({ outline, onSelect, onItemContextMenu }) {
  const { t } = useTranslation();

  if (!outline.length) {
    return <div className="empty"><p className="muted">{t('structure.none')}</p></div>;
  }

  return (
    <div className="outline">
      <div className="outline-head">{t('structure.headings', { count: outline.length })}</div>
      <ul>
        {outline.map((h) => (
          <li
            key={h.index}
            className={`outline-item lvl-${h.level}`}
            style={{ paddingLeft: `${(h.level - 1) * 18 + 12}px` }}
            onClick={() => onSelect?.(h)}
            onContextMenu={(e) => onItemContextMenu?.(e, h)}
            title={h.text}
          >
            <span className="outline-marker" aria-hidden="true" />
            <span className="outline-text">{h.text || ' '}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
