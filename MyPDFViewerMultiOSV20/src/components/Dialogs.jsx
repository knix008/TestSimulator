import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal.jsx';
import { IconAlert, IconCopy, IconCheck, IconDownload, IconUrl, IconText } from './Icons.jsx';
import { copyText, formatBytes } from '../lib/platform.js';
import { isHttpUrl } from '../lib/view.js';

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
    `MyPDFViewer — ${t('error.title')}`,
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

// ── Progress dialog ───────────────────────────────────────
// Shown for anything that can take a while: opening, saving, downloading,
// extracting, searching. Falls back to an indeterminate bar when the total is
// unknown.
export function ProgressDialog({ task, onCancel }) {
  const { t } = useTranslation();
  if (!task) return null;

  const { kind, name, done = 0, total = 0, indeterminate } = task;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const unknown = indeterminate || total <= 0;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t(`progress.${kind}`, kind)}>
      <div className="modal progress-modal" style={{ '--modal-width': '460px' }}>
        <div className="modal-head">
          <span className="modal-head-icon"><IconDownload size={17} /></span>
          <h2 className="modal-title">{t(`progress.${kind}`, kind)}</h2>
        </div>
        <div className="modal-body">
          {name ? <p className="prog-name" title={name}>{name}</p> : null}
          <div className={`progbar${unknown ? ' indeterminate' : ''}`}>
            <div className="progbar-fill" style={unknown ? undefined : { width: `${pct}%` }} />
          </div>
          <div className="prog-meta">
            <span>{unknown ? '' : `${pct}%`}</span>
            <span>
              {total > 0 ? t('progress.ofBytes', { done: formatBytes(done), total: formatBytes(total) }) : formatBytes(done)}
            </span>
          </div>
        </div>
        {onCancel ? (
          <div className="modal-foot">
            <div className="spacer" />
            <button className="btn" onClick={onCancel}>{t('progress.cancel')}</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Prompt dialog (URL / password) ────────────────────────
export function PromptDialog({ open, kind, error, onSubmit, onClose }) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => { if (open) { setValue(''); setLocalError(''); } }, [open, kind]);

  if (!open) return null;
  const isUrl = kind === 'url';
  const isComment = kind === 'comment';

  const submit = () => {
    const v = value.trim();
    if (isUrl && !isHttpUrl(v)) { setLocalError(t('url.invalid')); return; }
    if (!v) return;
    onSubmit(v);
  };

  const title = isUrl ? t('url.title') : isComment ? t('comment.title') : t('password.title');
  const label = isUrl ? t('url.label') : isComment ? t('comment.label') : t('password.label');
  const action = isUrl ? t('url.open') : isComment ? t('comment.ok') : t('password.ok');

  return (
    <Modal
      open
      title={title}
      icon={isUrl ? IconUrl : IconText}
      onClose={onClose}
      width={520}
      className="prompt-modal"
      closeLabel={t('common.cancel')}
      footer={(
        <>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" onClick={submit}>{action}</button>
        </>
      )}
    >
      <label className="field">
        <span className="field-label">{label}</span>
        {isComment ? (
          <textarea
            data-autofocus
            className="input"
            rows={4}
            value={value}
            placeholder={t('comment.placeholder')}
            onChange={(e) => { setValue(e.target.value); setLocalError(''); }}
          />
        ) : (
          <input
            data-autofocus
            className="input"
            type={isUrl ? 'url' : 'password'}
            value={value}
            placeholder={isUrl ? t('url.placeholder') : ''}
            onChange={(e) => { setValue(e.target.value); setLocalError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
        )}
      </label>
      {(localError || error) ? <p className="field-error">{localError || error}</p> : null}
    </Modal>
  );
}

// ── Document properties ───────────────────────────────────
export function PropertiesDialog({ open, doc, onClose }) {
  const { t } = useTranslation();
  if (!open || !doc) return null;

  const rows = [
    [t('props.file'), doc.name],
    [t('props.path'), doc.path || '—'],
    [t('props.pages'), doc.numPages],
    [t('props.fileSize'), formatBytes(doc.size)],
    [t('props.docTitle'), doc.info?.title],
    [t('props.author'), doc.info?.author],
    [t('props.subject'), doc.info?.subject],
    [t('props.keywords'), doc.info?.keywords],
    [t('props.creator'), doc.info?.creator],
    [t('props.producer'), doc.info?.producer],
    [t('props.created'), doc.info?.creationDate],
    [t('props.modified'), doc.info?.modDate],
    [t('props.pdfVersion'), doc.info?.version],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');

  return (
    <Modal open title={t('props.title')} icon={IconText} onClose={onClose} width={600} className="props-modal"
      closeLabel={t('common.ok')}
      footer={(<><div className="spacer" /><button className="btn primary" onClick={onClose} data-autofocus>{t('common.ok')}</button></>)}
    >
      <table className="kv">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}><th>{k}</th><td>{String(v)}</td></tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

// Asked before quitting (or replacing the open document) when bookmarks,
// comments or other workspace edits have not been written to a .pdfvw file.
export function UnsavedDialog({ open, onSave, onDiscard, onCancel }) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <Modal
      open
      title={t('unsaved.title')}
      icon={IconAlert}
      onClose={onCancel}
      width={480}
      className="unsaved-modal"
      closeOnBackdrop={false}
      closeLabel={t('common.cancel')}
      footer={(
        <>
          <button className="btn" type="button" onClick={onDiscard}>{t('unsaved.discard')}</button>
          <div className="spacer" />
          <button className="btn" type="button" onClick={onCancel}>{t('common.cancel')}</button>
          <button className="btn primary" type="button" onClick={onSave} data-autofocus>
            {t('common.save')}
          </button>
        </>
      )}
    >
      <p className="unsaved-message">{t('unsaved.message')}</p>
    </Modal>
  );
}
