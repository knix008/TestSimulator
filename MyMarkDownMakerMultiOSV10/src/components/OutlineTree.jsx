import React from 'react';
import { useTranslation } from 'react-i18next';

// Renders the merged document's structure: the generated pages it carries
// (cover, contents, figure index) as flat rows at the top, then its own heading
// hierarchy (H1–H6) as an indented tree. A page row carries `section` instead of
// a heading index — it is a place in the document, not a heading — so it is
// keyed and styled apart from the headings, and the count in the header stays
// the number of real headings.
function OutlineTree({ outline, headingCount, onSelect, onItemContextMenu }) {
  const { t } = useTranslation();

  if (!outline.length) {
    return <div className="empty"><p className="muted">{t('structure.none')}</p></div>;
  }

  return (
    <div className="outline">
      <div className="outline-head">{t('structure.headings', { count: headingCount ?? outline.length })}</div>
      <ul>
        {outline.map((h) => (
          <li
            key={h.section || h.index}
            className={`outline-item lvl-${h.level}${h.section ? ' is-page' : ''}`}
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

// Memoised: it can be hundreds of rows, and the document above it changes on
// every keystroke. Every handler it takes is identity-stable (see useEvent).
export default React.memo(OutlineTree);
