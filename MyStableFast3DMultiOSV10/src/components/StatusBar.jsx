import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconCheck, IconChip, IconLayers, IconCube, IconAlert } from './Icons.jsx';
import { engineSummary } from './EngineCard.jsx';

// Bottom status bar: what the app is doing, the engine and its device, the
// model in use and what is in the view. Each cell has a tooltip.
export default function StatusBar({ message, busy, health, connection, modelName, job, stats, onEngineClick }) {
  const { t } = useTranslation();
  const sum = engineSummary(health, connection, t);
  const pct = job && busy ? Math.round((job.progress || 0) * 100) : null;
  return (
    <footer className="statusbar">
      <span className="st-cell st-message" title={message || t('status.ready')}>
        {busy ? <span className="spinner" /> : <IconCheck size={14} />}
        {message || t('status.ready')}
      </span>
      {pct !== null ? (
        <>
          <span className="st-sep" />
          <span className="st-cell st-fixed st-progress" title={t(`stage.${job.stage}`, job.stage)}>
            <span className="st-bar"><span style={{ width: `${pct}%` }} /></span>
            {pct}%
          </span>
        </>
      ) : null}
      <span className="toolbar-spacer" />
      {stats ? (
        <>
          <span className="st-cell st-fixed" title={t('status.geometry')}>
            <IconCube size={14} />
            {t('status.counts', { v: (stats.vertices || 0).toLocaleString(), f: (stats.triangles || 0).toLocaleString() })}
          </span>
          <span className="st-sep" />
        </>
      ) : null}
      <span className="st-cell st-fixed" title={t('status.model')}>
        <IconLayers size={14} />
        {modelName}
      </span>
      <span className="st-sep" />
      <button className={`st-cell st-fixed st-engine k-${sum.kind}`} onClick={onEngineClick} title={`${t('status.engine')}: ${sum.text}`}>
        {sum.kind === 'error' ? <IconAlert size={14} /> : sum.kind === 'busy' ? <span className="spinner" /> : <IconChip size={14} />}
        {sum.text}
      </button>
    </footer>
  );
}
