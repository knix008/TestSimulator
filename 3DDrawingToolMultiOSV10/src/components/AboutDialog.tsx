import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';

const AUTHOR = 'SHKWON';
const EMAIL = 'knix008@naver.com';
const VERSION = '1.0.0';

export default function AboutDialog() {
  const { t } = useTranslation();
  const showAbout = useAppStore((s) => s.showAbout);
  const setShowAbout = useAppStore((s) => s.setShowAbout);

  if (!showAbout) return null;

  const openMail = async () => {
    const url = `mailto:${EMAIL}`;
    if (window.electronAPI?.openExternal) {
      await window.electronAPI.openExternal(url);
    } else {
      window.open(url);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => setShowAbout(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t('about.title')}</span>
          <button className="tb-btn" onClick={() => setShowAbout(false)}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="about-hero">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="logo" width={72} height={72} />
            <h2>{t('appName')}</h2>
            <p>{t('about.description')}</p>
          </div>
          <div className="about-meta">
            <div>
              <span>{t('about.version')}</span>
              <span>{VERSION}</span>
            </div>
            <div>
              <span>{t('about.author')}</span>
              <span>{AUTHOR}</span>
            </div>
            <div>
              <span>{t('about.email')}</span>
              <a href={`mailto:${EMAIL}`} onClick={(e) => { e.preventDefault(); openMail(); }}>
                {EMAIL}
              </a>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="primary-btn" onClick={() => setShowAbout(false)}>
            {t('about.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
