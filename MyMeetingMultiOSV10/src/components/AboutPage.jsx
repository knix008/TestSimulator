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
    const s = localStorage.getItem('mtg-theme');
    return THEME_IDS.includes(s) ? s : 'dark';
  });

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  useEffect(() => {
    const savedLang = localStorage.getItem('mtg-lang');
    if (savedLang && savedLang !== i18n.language) i18n.changeLanguage(savedLang);
    if (isElectron) {
      api.getInfo().then((i) => setInfo({ ...buildInfo, ...i })).catch(() => setInfo({ ...buildInfo }));
    } else {
      setInfo({ ...buildInfo, platform: 'web' });
    }
    const onStorage = (e) => {
      if (e.key === 'mtg-theme' && e.newValue && THEME_IDS.includes(e.newValue)) setTheme(e.newValue);
      else if (e.key === 'mtg-lang' && e.newValue) i18n.changeLanguage(e.newValue);
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
    info?.v8 && `V8 ${info.v8}`,
  ].filter(Boolean).join(' · ');
  // Build-specific details.
  const buildNumber = info?.gitCommitCount || buildInfo?.gitCommitCount || '';
  const buildType = info?.platform === 'web'
    ? t('about.web')
    : (info?.packaged === false ? t('about.dev') : (info?.packaged ? t('about.release') : ''));
  const buildTool = [
    info?.buildHost || buildInfo?.buildHost,
    (info?.electronBuilder || buildInfo?.electronBuilder) && `electron-builder ${info?.electronBuilder || buildInfo?.electronBuilder}`,
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

      <div className="settings-page-body">
        <div className="about-top">
          <img className="about-logo" src="./icon.svg" alt="" onError={(e) => { e.target.style.display = 'none'; }} />
          <div className="about-top-text">
            <h3 className="about-name">{info?.productName || 'MyMeeting'}</h3>
            <p className="about-desc">{t('about.desc')}</p>
          </div>
        </div>
        <dl className="about-grid" style={{ maxWidth: 440, margin: '0 auto' }}>
          <dt>{t('about.version')}</dt>
          <dd>{info?.version || '—'}{buildNumber ? ` (build ${buildNumber})` : ''}</dd>
          {info?.author?.name && (<><dt>{t('about.author')}</dt><dd>{info.author.name}{info?.author?.email ? ` · ${info.author.email}` : ''}</dd></>)}
          {info?.license && (<><dt>{t('about.license')}</dt><dd>{info.license}</dd></>)}

          <dt className="about-section" style={{ gridColumn: '1 / -1' }}>{t('about.buildInfo')}</dt>
          {built && (<><dt>{t('about.built')}</dt><dd>{built}</dd></>)}
          {commit && (<><dt>{t('about.commit')}</dt><dd>{commit}</dd></>)}
          {buildType && (<><dt>{t('about.buildType')}</dt><dd>{buildType}</dd></>)}
          <dt>{t('about.platform')}</dt><dd>{platformLabel || '—'}</dd>
          {buildTool && (<><dt>{t('about.buildTool')}</dt><dd className="export-path">{buildTool}</dd></>)}
          {versions && (<><dt>{t('about.runtime')}</dt><dd className="export-path">{versions}</dd></>)}
        </dl>
      </div>

      <div className="settings-page-foot">
        <button className="btn primary" onClick={() => window.close()}>{t('settings.ok')}</button>
      </div>
    </div>
  );
}
