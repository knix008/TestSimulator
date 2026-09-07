import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconFolder, IconText, IconCheck, IconAlert, IconClip } from './Icons.jsx';
import { formatBytes } from '../lib/platform.js';

// Bottom status bar: what is open, where you are in it, and what the app is
// doing right now. Each cell has a tooltip explaining the value it shows.
export default function StatusBar({ file, doc, pageNumber, scale, selectionChars, dirty, history, message, busy }) {
  const { t } = useTranslation();

  return (
    <footer className="statusbar">
      <span className="st-cell st-message" title={message || t('status.ready')}>
        {busy ? <span className="spinner" /> : <IconCheck size={14} />}
        {message || t('status.ready')}
      </span>

      <span className="st-sep" />

      <span className="st-cell st-file" title={file?.path || file?.name || t('status.noDoc')}>
        <IconText size={14} />
        <span className="st-ellipsis">{file?.name || t('status.noDoc')}</span>
      </span>

      {file?.dir ? (
        <span className="st-cell st-folder" title={`${t('status.dir')}: ${file.dir}`}>
          <IconFolder size={14} />
          <span className="st-dir">{file.dir}</span>
        </span>
      ) : null}

      <span className="toolbar-spacer" />

      {doc ? (
        <>
          <span className="st-cell st-fixed" title={`${t('status.page')} ${pageNumber} ${t('status.of')} ${doc.numPages}`}>
            {t('status.page')} {pageNumber} / {doc.numPages}
          </span>
          <span className="st-sep" />
          <span className="st-cell st-fixed" title={t('status.zoom')}>
            {t('status.zoom')} {Math.round(scale * 100)}%
          </span>
          <span className="st-sep" />
          <span className="st-cell st-fixed" title={t('status.size')}>
            {formatBytes(file?.size || 0)}
          </span>
          <span className="st-sep" />
          <span className="st-cell st-fixed" title={t('status.selection')}>
            <IconClip size={14} />
            {selectionChars > 0 ? t('status.chars', { n: selectionChars }) : t('status.noSelection')}
          </span>
          <span className="st-sep" />
          <span className="st-cell st-fixed" title={t('status.history', { n: history.depth })}>
            {t('status.history', { n: history.depth })}
          </span>
          <span className="st-sep" />
          <span className={`st-cell st-fixed${dirty ? ' warn' : ''}`} title={dirty ? t('status.modified') : t('status.clean')}>
            {dirty ? <IconAlert size={14} /> : <IconCheck size={14} />}
            {dirty ? t('status.modified') : t('status.clean')}
          </span>
        </>
      ) : null}
    </footer>
  );
}
