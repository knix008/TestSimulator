import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CloseIcon, CopyIcon } from './Icons.jsx';

export default function ErrorDialog({ error, onClose }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  if (!error) return null;

  const detail = [
    error.message || String(error),
    error.stack ? `\n${error.stack}` : '',
  ].join('');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(detail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal error-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head error-head">
          <span>⚠ {t('error.title')}</span>
          <button className="icon-btn" onClick={onClose}><CloseIcon size={18} /></button>
        </div>
        <div className="modal-body">
          <p className="error-summary">{error.message || String(error)}</p>
          <label className="ctrl-label" style={{ marginTop: 8 }}>{t('error.details')}</label>
          <textarea className="error-detail" readOnly value={detail} />
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={copy}>
            <CopyIcon size={16} /> {copied ? t('error.copied') : t('error.copy')}
          </button>
          <button className="btn btn-primary" onClick={onClose}>{t('error.close')}</button>
        </div>
      </div>
    </div>
  );
}
