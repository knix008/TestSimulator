import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isElectron, api } from '../lib/platform';
import { IconCheck, IconX, IconFolder, IconCopy } from './Icons';

// Popup dialog shown after an export — or after anything goes wrong. A failure
// shows the whole story (what was being done, the message, and the stack when
// there is one) and can be copied out in one click: an error you cannot quote
// is an error nobody can help you with.
export default function ExportResultDialog({ result, onClose }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  if (!result) return null;

  const ok = result.status === 'success';
  const canReveal = ok && isElectron && !!result.path;
  const report = [
    `${result.fmt || ''} — ${ok ? t('exportDlg.titleSuccess') : t('exportDlg.titleError')}`,
    ok ? result.path : result.message,
    result.detail || '',
  ].filter(Boolean).join("\n\n");

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report);
    } catch {
      // Clipboard permission can be refused; the textarea route always works.
      const ta = document.createElement('textarea');
      ta.value = report;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* nothing else to try */ }
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            <span className="mh-icon" style={{ color: ok ? 'var(--accent)' : 'var(--danger)' }}>
              {ok ? <IconCheck size={18} /> : <IconX size={18} />}
            </span>
            <h2>{ok ? t('exportDlg.titleSuccess') : t('exportDlg.titleError')}</h2>
          </div>
          <button className="iconbtn" onClick={onClose} title={t('about.close')}><IconX /></button>
        </div>

        <div className="modal-body" style={{ textAlign: 'left' }}>
          <dl className="about-grid">
            <dt>{t('exportDlg.format')}</dt><dd>{result.fmt}</dd>
            {ok
              ? (<><dt>{t('exportDlg.location')}</dt><dd className="export-path">{result.path}</dd></>)
              : (<><dt>{t('exportDlg.error')}</dt><dd className="export-path">{result.message}</dd></>)}
          </dl>
          {/* The stack, when there is one: selectable, scrollable, and included
              in what the copy button puts on the clipboard. */}
          {result.detail && <pre className="error-detail">{result.detail}</pre>}
          {result.note && <p className="muted" style={{ marginTop: 12 }}>{result.note}</p>}
        </div>

        <div className="modal-foot">
          {!ok && (
            <button className="btn" onClick={copyReport}>
              <IconCopy size={16} /> {copied ? t('exportDlg.copied') : t('exportDlg.copy')}
            </button>
          )}
          {canReveal && (
            <button className="btn" onClick={() => api.showItem(result.path)}>
              <IconFolder size={16} /> {t('exportDlg.openFolder')}
            </button>
          )}
          <button className="btn primary" onClick={onClose}>{t('settings.ok')}</button>
        </div>
      </div>
    </div>
  );
}
