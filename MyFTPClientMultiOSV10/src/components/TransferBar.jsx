// The vertical bar between the two panels: the ← upload (green) and
// → download (blue) buttons, centred; dragging the bar resizes the panels
// (the original's panelSplitterBar).
import React, { useRef } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { FatArrow } from './Icons';

export function TransferBar({ onUpload, onDownload, canUpload, canDownload, onResizeStart }) {
  useLanguage();
  const dragging = useRef(false);
  return (
    <div className="transfer-bar" title={t('drag_resize')}
      onMouseDown={(e) => { if (e.button !== 0 || e.target.closest('button')) return; dragging.current = true; onResizeStart(e); }}>
      <div className="transfer-buttons">
        <button className="xfer-btn xfer-up" onClick={onUpload} disabled={!canUpload} title={t('upload_btn')} aria-label={t('upload_btn')}>
          <FatArrow left />
        </button>
        <button className="xfer-btn xfer-down" onClick={onDownload} disabled={!canDownload} title={t('download_btn')} aria-label={t('download_btn')}>
          <FatArrow left={false} />
        </button>
      </div>
    </div>
  );
}

export default TransferBar;
