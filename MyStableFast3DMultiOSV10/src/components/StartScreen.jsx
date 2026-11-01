import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconImage, IconCube, IconGuide, IconRecent, IconClose, IconWand, IconLayers, IconChip, IconExport, IconSparkles } from './Icons.jsx';
import EngineCard from './EngineCard.jsx';
import { IMPORT_FORMATS, EXPORT_FORMATS } from '../lib/formats.js';
import buildInfo from '../build-info.json';

// The start screen (V20's layout): a title card with the main actions, then
// cards for getting started, recent files, the engine and the models, and the
// supported formats. It covers the work area until a file is opened or the
// Home button is pressed again.
export default function StartScreen({
  settings, onSettings, health, connection, models, onOpenImage, onOpenModel, onOpenRecent, onRemoveRecent,
  onGuide, onRetry, onToken, onShowLog, onPickModel, onClose,
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('en') ? 'en' : 'ko';
  const recent = settings.recentFiles.slice(0, 8);

  return (
    <div className="start">
      <div className="start-bg start-bg-3d" aria-hidden="true">
        <div className="start-floor" />
      </div>
      <div className="start-scroll">
        <div className="start-inner">
          <div className="start-card start-hero">
            <img className="start-icon" src="./icon.svg" alt="" />
            <div className="start-hero-text">
              <h1>MyStableFast3D <small>v{buildInfo.version}</small></h1>
              <p>{t('start.tagline')}</p>
            </div>
            <div className="start-hero-actions">
              <button className="btn primary" onClick={onOpenImage}><IconImage size={16} /> {t('toolbar.openImage')}</button>
              <button className="btn" onClick={onOpenModel}><IconCube size={16} /> {t('toolbar.openModel')}</button>
              <button className="btn" onClick={onGuide}><IconGuide size={16} /> {t('start.guide')}</button>
            </div>
          </div>

          <div className="start-grid start-grid-4">
            <div className="start-card">
              <h2><IconSparkles size={16} /> {t('start.howTitle')}</h2>
              <ol className="start-steps">
                <li><strong>{t('start.step1')}</strong><span>{t('start.step1Text')}</span></li>
                <li><strong>{t('start.step2')}</strong><span>{t('start.step2Text')}</span></li>
                <li><strong>{t('start.step3')}</strong><span>{t('start.step3Text')}</span></li>
                <li><strong>{t('start.step4')}</strong><span>{t('start.step4Text')}</span></li>
              </ol>
              <label className="check start-check">
                <input type="checkbox" checked={settings.showStartPage} onChange={(e) => onSettings((s) => ({ ...s, showStartPage: e.target.checked }))} />
                <span>{t('start.showAtStart')}</span>
              </label>
            </div>

            <div className="start-card">
              <h2><IconRecent size={16} /> {t('recent.title')}</h2>
              {recent.length === 0 ? <p className="start-empty">{t('recent.empty')}</p> : (
                <div className="start-list">
                  {recent.map((f) => (
                    <div className="start-row" key={f.path || f.name}>
                      <button className="start-link" onClick={() => onOpenRecent(f)} title={f.path || f.name}>
                        {f.kind === 'model' ? <IconCube size={15} /> : <IconImage size={15} />}
                        <span className="name">{f.name}</span>
                        <span className="path">{f.dir || ''}</span>
                      </button>
                      <button className="icon-btn" onClick={() => onRemoveRecent(f.path || f.name)} title={t('recent.remove')}><IconClose size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="start-card">
              <h2><IconChip size={16} /> {t('start.engine')}</h2>
              <EngineCard health={health} connection={connection} onRetry={onRetry} onToken={onToken} onShowLog={onShowLog} onUseModel={onPickModel} compact />
              <h2><IconLayers size={16} /> {t('start.models')}</h2>
              <div className="start-list">
                {models.map((m) => (
                  <button
                    key={m.id}
                    className={`start-link model-link${settings.model === m.id ? ' on' : ''}`}
                    onClick={() => onPickModel(m.id)}
                    title={m.summary?.[lang] || m.name}
                  >
                    <IconWand size={15} />
                    <span className="name">{m.name}</span>
                    <span className="path">{t(`model.status.${m.status}`, m.status)} · {m.license}</span>
                  </button>
                ))}
                {models.length === 0 ? <p className="start-empty">{t('model.noEngine')}</p> : null}
              </div>
            </div>

            <div className="start-card">
              <h2><IconCube size={16} /> {t('start.formats')}</h2>
              <p className="start-formats-title">{t('start.canOpen')}</p>
              <p className="start-formats">{IMPORT_FORMATS.map((f) => f.ext.map((e) => `.${e}`).join(' ')).join('  ')}</p>
              <p className="start-formats-title"><IconExport size={13} /> {t('start.canSave')}</p>
              <p className="start-formats">{[...new Set(EXPORT_FORMATS.map((f) => `.${f.ext}`))].join('  ')}</p>
              <p className="start-formats-title"><IconImage size={13} /> {t('start.images')}</p>
              <p className="start-formats">.png .jpg .jpeg .webp .bmp .gif .tif</p>
            </div>
          </div>

          <div className="start-foot">
            <span>{t('start.poweredBy')}</span>
            <button className="linkish" onClick={onClose}>{t('start.close')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
