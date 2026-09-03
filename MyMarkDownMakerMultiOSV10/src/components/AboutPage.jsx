import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { isElectron, api } from '../lib/platform';
import buildInfo from '../build-info.json';
import { THEMES } from '../lib/themes';
import { IconInfo, IconX } from './Icons';

const THEME_IDS = THEMES.map((t) => t.id);

// Rendered as the whole document in the separate About window (#about route).
export default function AboutPage() {
  const { t } = useTranslation();
  const [info, setInfo] = useState(null);
  const [theme, setTheme] = useState(() => {
    const s = localStorage.getItem('mmm-theme');
    return THEME_IDS.includes(s) ? s : 'dark';
  });

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  useEffect(() => {
    const savedLang = localStorage.getItem('mmm-lang');
    if (savedLang && savedLang !== i18n.language) i18n.changeLanguage(savedLang);
    if (isElectron) {
      api.getInfo().then((i) => setInfo({ ...buildInfo, ...i })).catch(() => setInfo({ ...buildInfo }));
    } else {
      setInfo({ ...buildInfo, platform: 'web' });
    }
    const onStorage = (e) => {
      if (e.key === 'mmm-theme' && e.newValue && THEME_IDS.includes(e.newValue)) setTheme(e.newValue);
      else if (e.key === 'mmm-lang' && e.newValue) i18n.changeLanguage(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const platformLabel = info?.platform === 'web'
    ? t('about.web')
    : `${info?.platform || ''} ${info?.arch || ''}`.trim();
  const built = info?.buildTime ? new Date(info.buildTime).toLocaleString() : '';
  const commit = info?.gitCommit ? `${info.gitCommit}${info.gitBranch ? ` (${info.gitBranch})` : ''}` : '';
  const versions = [
    info?.electron && `Electron ${info.electron}`,
    info?.chrome && `Chromium ${info.chrome}`,
    (info?.node || buildInfo?.node) && `Node ${(info?.node || buildInfo?.node).replace(/^v/, '')}`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="settings-page">
      <div className="settings-page-head">
        <div className="modal-title">
          <span className="mh-icon about-head-icon"><IconInfo size={26} /></span>
          <h2>{t('about.info')}</h2>
        </div>
        <button className="iconbtn" onClick={() => window.close()} title={t('about.close')}><IconX /></button>
      </div>

      <div className="settings-page-body" style={{ textAlign: 'center' }}>
        <img className="about-logo" src="./icon.svg" alt="" onError={(e) => { e.target.style.display = 'none'; }} />
        <h3 style={{ margin: '4px 0 2px' }}>{info?.productName || 'MyMarkDownMaker'}</h3>
        <p className="about-desc">{t('about.desc')}</p>
        <dl className="about-grid" style={{ maxWidth: 420, margin: '0 auto' }}>
          <dt>{t('about.version')}</dt><dd>{info?.version || '—'}</dd>
          <dt>{t('about.platform')}</dt><dd>{platformLabel || '—'}</dd>
          {built && (<><dt>{t('about.built')}</dt><dd>{built}</dd></>)}
          {commit && (<><dt>{t('about.commit')}</dt><dd>{commit}</dd></>)}
          {versions && (<><dt>{t('about.runtime')}</dt><dd>{versions}</dd></>)}
          {info?.author?.name && (<><dt>{t('about.author')}</dt><dd>{info.author.name}</dd></>)}
          {info?.license && (<><dt>{t('about.license')}</dt><dd>{info.license}</dd></>)}
        </dl>
      </div>

      <div className="settings-page-foot">
        <button className="btn primary" onClick={() => window.close()}>{t('settings.ok')}</button>
      </div>
    </div>
  );
}
