import React from 'react';
import { useTranslation } from 'react-i18next';
import { imageDisplaySrc } from '../lib/images';

// Every image in the merged document, as a numbered thumbnail list. This is
// what makes figures visible while editing: the Edit tab holds the raw Markdown
// (image links, not pictures), so the panel shows the actual picture next to its
// "Figure N" label, highlights the one the caret sits on, and jumps to it.
export default function FigureList({ figures, activeIndex, onSelect, onResize, onItemContextMenu }) {
  const { t } = useTranslation();

  if (!figures.length) {
    return <div className="empty"><p className="muted">{t('figures.none')}</p></div>;
  }

  return (
    <div className="figlist">
      <div className="figlist-head">{t('figures.count', { count: figures.length })}</div>
      <ul>
        {figures.map((f) => {
          const src = imageDisplaySrc(f.src);
          const label = `${t('figure.label')} ${f.index + 1}`;
          return (
            <li
              key={f.index}
              className={`figrow${activeIndex === f.index ? ' active' : ''}`}
              onClick={() => onSelect?.(f)}
              onContextMenu={(e) => onItemContextMenu?.(e, f)}
              title={f.caption ? `${label}. ${f.caption}` : label}
            >
              <span className="fig-thumb">
                {src
                  // The thumbnail shrinks with the figure's display width, so the
                  // panel shows roughly how big the picture will print.
                  ? <img src={src} alt={f.alt || ''} loading="lazy"
                      style={f.width ? { maxWidth: `${f.width}%` } : undefined} />
                  : <span className="fig-missing">{t('figures.missing')}</span>}
              </span>
              <span className="fig-meta">
                <span className="fig-no">{label}</span>
                <span className="fig-cap">{f.caption || t('figures.untitled')}</span>
                {onResize && (
                  // Display width, in 10% steps of the page width. Clicks must not
                  // bubble into the row's "jump to this figure" handler.
                  <span className="fig-size" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="range" min="10" max="100" step="5"
                      value={f.width || 100}
                      title={t('figures.size')}
                      onChange={(e) => onResize(f, Number(e.target.value))}
                    />
                    <span className="fig-size-val">{f.width ? `${f.width}%` : t('figures.sizeFull')}</span>
                    <button
                      type="button" className="link" disabled={!f.width}
                      onClick={() => onResize(f, 0)}
                    >{t('figures.sizeReset')}</button>
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
