import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconX, IconCopy, IconCheck } from './Icons';

// Detailed, copyable error popup. `error` is either null (hidden) or
//   { title?, message, detail? }
// The full text is shown in a read-only, selectable textarea and can be copied
// to the clipboard with one click so the user can paste it elsewhere.
export default function ErrorDialog({ error, onClose }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  if (!error) return null;

  const heading = error.title || t('error.title');
  const message = error.message || '';
  const detail = error.detail || '';
  const fullText = [heading, message, detail].filter(Boolean).join('\n\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullText);
    } catch {
      // Fallback for insecure/older contexts: select + execCommand.
      try {
        const ta = document.getElementById('error-detail-area');
        if (ta) { ta.focus(); ta.select(); document.execCommand('copy'); }
      } catch { /* ignore */ }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal error-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            <span className="mh-icon" style={{ color: 'var(--danger)' }}><IconX size={18} /></span>
            <h2>{heading}</h2>
          </div>
          <button className="iconbtn" onClick={onClose} title={t('error.close')}><IconX /></button>
        </div>

        <div className="modal-body" style={{ textAlign: 'left' }}>
          {message && <p className="error-message">{message}</p>}
          <label className="error-detail-label">{t('error.detail')}</label>
          <textarea
            id="error-detail-area"
            className="error-detail"
            readOnly
            value={fullText}
            onFocus={(e) => e.target.select()}
            spellCheck={false}
          />
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={copy}>
            {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}{' '}
            {copied ? t('error.copied') : t('error.copy')}
          </button>
          <button className="btn primary" onClick={onClose}>{t('error.close')}</button>
        </div>
      </div>
    </div>
  );
}
