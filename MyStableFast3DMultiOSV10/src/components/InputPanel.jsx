import React from 'react';
import { useTranslation } from 'react-i18next';
import Panel from './Panel.jsx';
import { Section } from './Form.jsx';
import { IconImage, IconCube, IconTrash, IconExport, IconOpen, IconWand } from './Icons.jsx';
import { formatBytes, formatDuration } from '../lib/platform.js';

// The left panel: the image to convert (as picked, and as the model saw it
// after background removal), and this session's results to go back to.
export default function InputPanel({
  settings, onSettings, image, prepared, history, currentId, onOpenImage, onConvert, busy,
  onShowHistory, onSaveHistory, onRemoveHistory,
}) {
  const { t } = useTranslation();
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
              <figure className="input-figure">
                <img src={image.url} alt={image.name} className="checker" />
                <figcaption title={image.path || image.name}>
                  <strong>{image.name}</strong>
                  <span>{image.width && image.height ? `${image.width} × ${image.height} px · ` : ''}{formatBytes(image.size || 0)}</span>
                </figcaption>
              </figure>
            ) : (
              <button className="input-empty" onClick={onOpenImage} title={t('tip.openImage')}>
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

          <Section title={t('left.history', { n: history.length })}>
            {history.length === 0 ? <p className="panel-note">{t('left.historyEmpty')}</p> : (
              <ul className="history-list">
                {history.map((h) => (
                  <li key={h.id} className={h.id === currentId ? 'active' : ''}>
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
        </div>
      </div>
    </Panel>
  );
}
