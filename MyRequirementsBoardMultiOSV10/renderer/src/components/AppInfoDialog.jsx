import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../api/client.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const appIconUrl = `${import.meta.env.BASE_URL}icon.png`;

function formatBuildDate(iso, language) {
  const locale = language === 'en' ? 'en-US' : 'ko-KR';
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="app-info-dialog__row">
      <span className="app-info-dialog__label">{label}</span>
      <span className="app-info-dialog__value">{value}</span>
    </div>
  );
}

export default function AppInfoDialog({ open, onClose }) {
  const { t, language } = useLanguage();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    setError('');
    api.appInfo()
      .then(setInfo)
      .catch((e) => setError(e.message));
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const build = info?.build;

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-dialog app-info-dialog"
        role="dialog"
        aria-labelledby="app-info-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="app-info-dialog__header">
          <div className="app-info-dialog__brand">
            <img
              src={appIconUrl}
              alt=""
              className="app-info-dialog__icon"
              width={48}
              height={48}
            />
            <h2 id="app-info-title">
              {t('appInfo.title', { productName: info?.productName || 'MyRequirementsBoard' })}
            </h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} strokeWidth={2} />
          </button>
        </header>

        {error && <p className="error">{error}</p>}

        {info && (
          <div className="app-info-dialog__body">
            <p className="app-info-dialog__description">{info.description}</p>

            <section className="app-info-dialog__section">
              <h3>{t('appInfo.version')}</h3>
              <InfoRow label={t('appInfo.programVersion')} value={info.version} />
              {build?.development ? (
                <InfoRow label={t('appInfo.build')} value={t('appInfo.devBuild')} />
              ) : (
                <InfoRow label={t('appInfo.buildDate')} value={build?.buildDate ? formatBuildDate(build.buildDate, language) : null} />
              )}
              <InfoRow
                label={t('appInfo.commit')}
                value={build?.commit ? `${build.commit}${build.branch ? ` (${build.branch})` : ''}` : null}
              />
              <InfoRow
                label={t('appInfo.buildPlatform')}
                value={build ? `${info.platformLabel} ${build.builtOnArch}` : null}
              />
              <InfoRow label={t('appInfo.runMode')} value={build?.runMode === 'electron' ? t('appInfo.electron') : t('appInfo.web')} />
              <InfoRow label={t('appInfo.electron')} value={build?.electronVersion || null} />
            </section>

            <section className="app-info-dialog__section">
              <h3>{t('appInfo.copyright')}</h3>
              <p className="app-info-dialog__copyright">{info.copyright}</p>
              <p className="app-info-dialog__author">{info.author}</p>
            </section>
          </div>
        )}

        <footer className="app-info-dialog__footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>{t('common.confirm')}</button>
        </footer>
      </div>
    </div>
  );
}
