import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal.jsx';
import { IconAlert, IconCopy, IconCheck } from './Icons.jsx';
import { copyText } from '../lib/platform.js';

// ── Error dialog ──────────────────────────────────────────
// Errors are never swallowed: the user sees what the app was doing, the exact
// message, and the full technical detail — all of it copyable in one click so
// it can be pasted into a bug report.
export function ErrorDialog({ error, onClose }) {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { setShowDetails(false); setCopied(false); }, [error]);

  if (!error) return null;

  const contextLabel = error.context ? t(`error.ctx.${error.context}`, error.context) : '';
  const report = [
    `MyStableFast3D — ${t('error.title')}`,
    contextLabel ? `${t('error.what')}: ${contextLabel}` : '',
    `${t('error.message')}: ${error.message}`,
    error.file ? `File: ${error.file}` : '',
    `Time: ${new Date(error.at || Date.now()).toISOString()}`,
    error.details ? `\n${t('error.details')}:\n${error.details}` : '',
  ].filter(Boolean).join('\n');

  const doCopy = async () => {
    try {
      await copyText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard denied — select the text so the user can copy it by hand.
      const el = document.getElementById('error-report-text');
      if (el) {
        el.hidden = false;
        el.focus();
        el.select();
      }
      setShowDetails(true);
    }
  };

  return (
    <Modal
      open
      title={t('error.title')}
      icon={IconAlert}
      onClose={onClose}
      width={620}
      className="error-modal"
      closeOnBackdrop={false}
      closeLabel={t('error.close')}
      footer={(
        <>
          <button className="btn" onClick={doCopy} title={t('error.copy')}>
            {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            {copied ? t('error.copied') : t('error.copy')}
          </button>
          <div className="spacer" />
          <button className="btn primary" onClick={onClose} data-autofocus>{t('error.close')}</button>
        </>
      )}
    >
      <div className="err-body">
        {contextLabel ? (
          <p className="err-context">{t('error.what')} <strong>{contextLabel}</strong></p>
        ) : null}
        <p className="err-message">{error.message}</p>
        {error.file ? <p className="err-file" title={error.file}>{error.file}</p> : null}

        {error.details ? (
          <>
            <button className="linkish" onClick={() => setShowDetails((v) => !v)}>
              {showDetails ? t('error.hideDetails') : t('error.showDetails')}
            </button>
            {showDetails ? <pre className="err-details">{error.details}</pre> : null}
          </>
        ) : null}

        {/* Fallback for environments where the clipboard API is unavailable. */}
        <textarea id="error-report-text" className="err-fallback" readOnly hidden value={report} />
      </div>
    </Modal>
  );
}
