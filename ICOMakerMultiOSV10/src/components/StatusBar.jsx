import React from 'react';
import { useTranslation } from 'react-i18next';

// Bottom status bar: current tool, selection, zoom and program status.
export default function StatusBar({ tool, sel, zoom, exporting, statusMsg }) {
  const { t } = useTranslation();

  const selName = !sel
    ? t('status.none')
    : sel.type === 'text' ? `“${sel.text}”`
      : sel.type === 'shape' ? t(`tools.${sel.shape}`)
        : t(`tools.${sel.type}`);

  const status = exporting ? t('export.exporting') : (statusMsg || t('status.ready'));

  return (
    <footer className="statusbar">
      <div className="sb-left">
        <span className="sb-dot" data-busy={exporting ? '1' : '0'} />
        <span>{status}</span>
      </div>
      <div className="sb-right">
        <span><em>{t('status.tool')}:</em> {t(`tools.${tool}`)}</span>
        <span className="sb-sep" />
        <span><em>{t('status.selected')}:</em> {selName}</span>
        <span className="sb-sep" />
        <span><em>{t('status.zoom')}:</em> {Math.round(zoom * 100)}%</span>
      </div>
    </footer>
  );
}
