import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';

export function formatErrorDetails(error: unknown): string {
  if (error instanceof Error) {
    return [error.name, error.message, error.stack].filter(Boolean).join('\n\n');
  }

  if (typeof error === 'string') return error;

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

export default function ErrorDialog() {
  const { t } = useTranslation();
  const error = useAppStore((s) => s.errorDialog);
  const clearError = useAppStore((s) => s.clearError);
  const [copied, setCopied] = useState(false);

  const copyText = useMemo(() => {
    if (!error) return '';
    return [error.title, error.message, error.details].filter(Boolean).join('\n\n');
  }, [error]);

  if (!error) return null;

  const copy = async () => {
    await navigator.clipboard.writeText(copyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="modal-backdrop" onClick={clearError}>
      <div className="modal error-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{error.title}</span>
          <button className="tb-btn" onClick={clearError}>
            x
          </button>
        </div>
        <div className="modal-body">
          <p className="error-message">{error.message}</p>
          <label className="error-details-label">{t('error.details')}</label>
          <textarea className="error-details" readOnly value={error.details || error.message} />
        </div>
        <div className="modal-footer" style={{ gap: 8 }}>
          <button className="tb-btn" onClick={copy}>
            {copied ? t('error.copied') : t('error.copy')}
          </button>
          <button className="primary-btn" onClick={clearError}>
            {t('error.close')}
          </button>
        </div>
      </div>
    </div>
  );
}