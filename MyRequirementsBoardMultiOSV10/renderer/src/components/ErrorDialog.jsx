import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Copy, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function ErrorDialog({ message, onClose }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!message) return undefined;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [message, onClose]);

  if (!message) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="modal-overlay import-result-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-dialog error-dialog"
        role="alertdialog"
        aria-labelledby="error-dialog-title"
        aria-describedby="error-dialog-body"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="excel-result-dialog__header">
          <div className="excel-result-dialog__title-wrap">
            <AlertCircle size={22} strokeWidth={2} aria-hidden="true" className="excel-result-dialog__icon error-dialog__icon" />
            <h2 id="error-dialog-title">{t('common.errorTitle')}</h2>
          </div>
          <button ref={closeRef} type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} strokeWidth={2} />
          </button>
        </header>

        <div className="excel-result-dialog__body error-dialog__body" id="error-dialog-body">
          <p className="error-dialog__message">{message}</p>
        </div>

        <footer className="excel-result-dialog__footer ai-refine-confirm-dialog__footer">
          <button type="button" className="btn btn-secondary error-dialog__copy" onClick={handleCopy}>
            <Copy size={14} strokeWidth={2} aria-hidden="true" />
            {copied ? t('common.copied') : t('common.copy')}
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
            {t('common.close')}
          </button>
        </footer>
      </div>
    </div>
  );
}
