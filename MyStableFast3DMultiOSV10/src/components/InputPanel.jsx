import React from 'react';
import { useTranslation } from 'react-i18next';
import Panel from './Panel.jsx';
import { Section } from './Form.jsx';
import { IconImage, IconCube, IconTrash, IconExport, IconOpen, IconWand, IconClose } from './Icons.jsx';
import { formatBytes, formatDuration, isDesktop } from '../lib/platform.js';

// A small "clear all" for a section heading.
function ClearAll({ label, onClick }) {
  return (
    <button className="clear-all" onClick={onClick} title={label} aria-label={label}>
      <IconTrash size={13} /> {label}
    </button>
  );
}

// The left panel: the image to convert (as picked, and as the model saw it
// after background removal), this session's results to go back to, and the
// recent files.
export default function InputPanel({
  settings, onSettings, image, prepared, history, currentId, onOpenImage, onConvert, busy,
  onShowHistory, onSaveHistory, onRemoveHistory, onClearHistory, onImageMenu, onHistoryMenu,
  onOpenRecent, onRemoveRecent, onClearRecent,
}) {
  const { t } = useTranslation();
  const recent = settings.recentFiles.slice(0, 10);
  return (
    <Panel
      side="left"
      open={settings.leftPanel}
      width={settings.leftPanelWidth}
      onResize={(w) => onSettings((s) => ({ ...s, leftPanelWidth: w }))}
      onOpen={() => onSettings((s) => ({ ...s, leftPanel: true }))}
      onClose={() => onSettings((s) => ({ ...s, leftPanel: false }))}
      icon={IconImage}
      title={t('left.title')}
      expandLabel={t('left.expand')}
      collapseLabel={t('left.collapse')}
    >
      <div className="panel-scroll">
        <div className="info-body">
          <Section title={t('left.input')}>
            {image ? (
              <figure className="input-figure" onContextMenu={(e) => { e.preventDefault(); onImageMenu?.(e.clientX, e.clientY); }}>
                <img src={image.url} alt={image.name} className="checker" />
                <figcaption title={image.path || image.name}>
                  <strong>{image.name}</strong>
                  <span>{image.width && image.height ? `${image.width} × ${image.height} px · ` : ''}{formatBytes(image.size || 0)}</span>
                </figcaption>
              </figure>
            ) : (
              <button className="input-empty" onClick={onOpenImage} title={t('tip.openImage')} onContextMenu={(e) => { e.preventDefault(); onImageMenu?.(e.clientX, e.clientY); }}>
                <IconImage size={34} />
                <span>{t('left.noImage')}</span>
                <small>{t('left.dropHint')}</small>
              </button>
            )}
            <div className="row">
              <button className="btn small" onClick={onOpenImage}><IconOpen size={14} /> {t('left.choose')}</button>
              <button className="btn small primary" onClick={onConvert} disabled={!image || busy}><IconWand size={14} /> {t('toolbar.convert')}</button>
            </div>
          </Section>

          {prepared ? (
            <Section title={t('left.prepared')}>
              <figure className="input-figure">
                <img src={prepared} alt={t('left.prepared')} className="checker" />
                <figcaption><span>{t('left.preparedNote')}</span></figcaption>
              </figure>
            </Section>
          ) : null}

          <Section
            title={t('left.history', { n: history.length })}
            actions={history.length ? <ClearAll label={t('left.clearHistory')} onClick={onClearHistory} /> : null}
          >
            {history.length === 0 ? <p className="panel-note">{t('left.historyEmpty')}</p> : (
              <ul className="history-list">
                {history.map((h) => (
                  <li key={h.id} className={h.id === currentId ? 'active' : ''} onContextMenu={(e) => { e.preventDefault(); onHistoryMenu?.(e.clientX, e.clientY, h); }}>
                    <button className="history-item" onClick={() => onShowHistory(h)} title={h.name}>
                      {h.thumb ? <img src={h.thumb} alt="" /> : <span className="history-icon">{h.kind === 'model' ? <IconCube size={22} /> : <IconWand size={22} />}</span>}
                      <span className="history-text">
                        <span className="history-name">{h.name}</span>
                        <span className="history-meta">
                          {h.kind === 'model' ? (h.format || '').toUpperCase() : h.modelName}
                          {h.elapsed ? ` · ${formatDuration(h.elapsed)}` : ''}
                          {h.device ? ` · ${h.device}` : ''}
                        </span>
                      </span>
                    </button>
                    <button className="icon-btn" onClick={() => onSaveHistory(h)} title={t('left.saveItem')} aria-label={t('left.saveItem')}>
                      <IconExport size={14} />
                    </button>
                    <button className="icon-btn" onClick={() => onRemoveHistory(h)} title={t('left.removeItem')} aria-label={t('left.removeItem')}>
                      <IconTrash size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Paths only mean something on the desktop. */}
          {isDesktop ? (
            <Section
              title={t('recent.title')}
              actions={recent.length ? <ClearAll label={t('recent.clear')} onClick={onClearRecent} /> : null}
            >
              {recent.length === 0 ? <p className="panel-note">{t('recent.empty')}</p> : (
                <ul className="recent-list">
                  {recent.map((f) => (
                    <li key={f.path || f.name}>
                      <button className="recent-item" onClick={() => onOpenRecent(f)} title={f.path || f.name}>
                        {f.kind === 'model' ? <IconCube size={14} /> : <IconImage size={14} />}
                        <span className="recent-name">{f.name}</span>
                      </button>
                      <button className="icon-btn" onClick={() => onRemoveRecent(f.path || f.name)} title={t('recent.remove')} aria-label={t('recent.remove')}>
                        <IconClose size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
