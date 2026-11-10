import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal.jsx';
import { IconAlert, IconCopy, IconCheck } from './Icons.jsx';
import { copyText, openExternal } from '../lib/platform.js';

// ── License check ─────────────────────────────────────────
// A model whose license limits where it may be used (Hunyuan3D) is installed
// only after the user has read this and ticked the box. `model` is the
// engine's description of it (name, license, licenseUrl, licenseNote, …).
export function LicenseDialog({ model, onAccept, onCancel }) {
  const { t, i18n } = useTranslation();
  const [ok, setOk] = useState(false);
  useEffect(() => { setOk(false); }, [model]);
  if (!model) return null;
  const lang = i18n.language?.startsWith('en') ? 'en' : 'ko';
  const name = model.familyName || model.name;
  return (
    <Modal
      open
      title={t('license.title', { name })}
      icon={IconAlert}
      onClose={onCancel}
      width={560}
      className="license-modal"
      closeLabel={t('license.cancel')}
      footer={(
        <>
          <button className="btn" onClick={onCancel}>{t('license.cancel')}</button>
          <div className="spacer" />
          <button className="btn primary" onClick={() => onAccept(model)} disabled={!ok} data-license-accept>
            <IconCheck size={16} /> {t('license.accept')}
          </button>
        </>
      )}
    >
      <div className="license-body">
        <p>{t('license.intro', { name })}</p>
        <p className="license-note">{model.licenseNote?.[lang] || model.licenseNote?.en}</p>
        <dl className="info-dl">
          <div className="info-row"><dt>{t('right.license')}</dt><dd>{model.license}</dd></div>
          <div className="info-row"><dt>{t('right.size')}</dt><dd>{model.size}</dd></div>
        </dl>
        <p className="panel-note">{t('license.noTexture')}</p>
        <p className="license-links">
          {model.licenseUrl ? <button className="linkish" onClick={() => openExternal(model.licenseUrl)}>{t('license.readFull')}</button> : null}
          {model.page ? <button className="linkish" onClick={() => openExternal(model.page)}>{t('license.page')}</button> : null}
        </p>
        <label className="check license-check">
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} data-license-check />
          <span>{t('license.confirm')}</span>
        </label>
      </div>
    </Modal>
  );
}

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
    `My3DObjects — ${t('error.title')}`,
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
          <p className="err-context">{t('error.what')}: <strong>{contextLabel}</strong></p>
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
